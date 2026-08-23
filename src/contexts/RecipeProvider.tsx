"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "@/contexts/AuthProvider";
import { createDemoRecipes } from "@/domain/demo-recipes";
import { recipeSchema, type Recipe } from "@/domain/recipe";
import { getFirebaseClient } from "@/lib/firebase-client";
import { DEMO_RECIPES_STORAGE_KEY } from "@/lib/demo-local";
import {
  isRecipeConflictError,
  readRecipe,
  removeRecipe,
  restoreRecipesAtomically,
  subscribeRecipes,
  writeRecipe,
  type RecipeWriteOptions,
} from "@/lib/recipe-repository";

export { RecipeConflictError, isRecipeConflictError } from "@/lib/recipe-repository";

export type RecipeContextValue = {
  recipes: Recipe[];
  loading: boolean;
  error: string | null;
  getRecipe: (recipeId: string) => Promise<Recipe | null>;
  getLatestRecipe: (recipeId: string) => Promise<Recipe | null>;
  saveRecipe: (recipe: Recipe, options?: RecipeWriteOptions) => Promise<void>;
  saveRecipeAsCopy: (recipe: Recipe) => Promise<Recipe>;
  deleteRecipe: (recipeId: string) => Promise<void>;
  restoreRecipes: (recipes: Recipe[]) => Promise<void>;
};

interface PendingRecipeWrite {
  recipe: Recipe;
  expectedUpdatedAt?: string | null;
}

function pendingRecipeWrite(value: unknown): PendingRecipeWrite | null {
  if (value && typeof value === "object" && "recipe" in value) {
    const envelope = value as { recipe?: unknown; expectedUpdatedAt?: unknown };
    const parsed = recipeSchema.safeParse(envelope.recipe);
    if (!parsed.success) return null;
    const expected = envelope.expectedUpdatedAt;
    if (expected !== undefined && expected !== null && typeof expected !== "string") return null;
    return { recipe: parsed.data, expectedUpdatedAt: expected };
  }
  // Backward compatibility for writes queued before conflict metadata existed.
  const legacy = recipeSchema.safeParse(value);
  return legacy.success ? { recipe: legacy.data } : null;
}

function withRecipe(recipes: readonly Recipe[], recipe: Recipe): Recipe[] {
  return [recipe, ...recipes.filter((item) => item.id !== recipe.id)]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export const RecipeContext = createContext<RecipeContextValue | null>(null);
const EMPTY_RECIPES: Recipe[] = [];
export function readDemoRecipes(): Recipe[] {
  try {
    const stored = window.localStorage.getItem(DEMO_RECIPES_STORAGE_KEY);
    if (!stored) return createDemoRecipes();
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return createDemoRecipes();
    const recipes = parsed.flatMap((value) => {
      const result = recipeSchema.safeParse(value);
      return result.success && result.data.userId === "demo-user" ? [result.data] : [];
    });
    return recipes;
  } catch {
    return createDemoRecipes();
  }
}

function writeDemoRecipes(recipes: readonly Recipe[]): void {
  window.localStorage.setItem(DEMO_RECIPES_STORAGE_KEY, JSON.stringify(recipes));
}

type RecipeStore = {
  uid: string | null;
  recipes: Recipe[];
  loading: boolean;
  error: string | null;
};

export function RecipeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [store, setStore] = useState<RecipeStore>({
    uid: null,
    recipes: [],
    loading: false,
    error: null,
  });
  const recipes = user && store.uid === user.uid ? store.recipes : EMPTY_RECIPES;
  const loading = Boolean(user) && (store.uid !== user?.uid || store.loading);
  const error = user && store.uid === user.uid ? store.error : null;

  useEffect(() => {
    if (user?.isDemo) {
      setStore({ uid: user.uid, recipes: readDemoRecipes(), loading: false, error: null });
      return;
    }
    const client = getFirebaseClient();
    if (!client || !user) return;
    return subscribeRecipes(
      client.db,
      user.uid,
      (nextRecipes) => {
        setStore({ uid: user.uid, recipes: nextRecipes, loading: false, error: null });
      },
      () => {
        setStore((current) => ({
          uid: user.uid,
          recipes: current.uid === user.uid ? current.recipes : [],
          loading: false,
          error: "レシピ帳を読み込めませんでした。オフラインキャッシュがあれば引き続き表示します。",
        }));
      },
    );
  }, [user]);

  useEffect(() => {
    const client = getFirebaseClient();
    if (!client || !user || user.isDemo) return;
    let active = true;
    let flushing = false;
    const flushPending = async () => {
      if (flushing || !navigator.onLine) return;
      flushing = true;
      try {
        const { deletePendingWrite, listPendingWrites } = await import("@/lib/indexed-db");
        const pendingWrites = await listPendingWrites<unknown>(user.uid);
        for (const item of pendingWrites) {
          if (!active) return;
          const pendingWrite = pendingRecipeWrite(item.value);
          if (!pendingWrite) continue;
          await writeRecipe(client.db, user.uid, pendingWrite.recipe, {
            expectedUpdatedAt: pendingWrite.expectedUpdatedAt,
          });
          await deletePendingWrite(user.uid, item.key);
        }
      } catch (cause) {
        if (active) {
          setStore((current) => ({
            uid: user.uid,
            recipes: current.uid === user.uid ? current.recipes : [],
            loading: false,
            error: isRecipeConflictError(cause)
              ? "端末内の保留変更より新しいレシピがクラウドにあります。編集画面で内容を確認してください。"
              : "端末内に保存した変更をクラウドへ再送できませんでした。オンライン復帰時に再試行します。",
          }));
        }
      } finally {
        flushing = false;
      }
    };
    void flushPending();
    window.addEventListener("online", flushPending);
    return () => {
      active = false;
      window.removeEventListener("online", flushPending);
    };
  }, [user]);

  const getRecipe = useCallback(
    async (recipeId: string) => {
      const inMemory = recipes.find((recipe) => recipe.id === recipeId);
      if (inMemory) return inMemory;
      if (user?.isDemo) return null;
      const client = getFirebaseClient();
      if (!client || !user) return null;
      return readRecipe(client.db, user.uid, recipeId);
    },
    [recipes, user],
  );

  const getLatestRecipe = useCallback(
    async (recipeId: string) => {
      if (user?.isDemo) return recipes.find((recipe) => recipe.id === recipeId) ?? null;
      const client = getFirebaseClient();
      if (!client || !user) return null;
      const latest = await readRecipe(client.db, user.uid, recipeId);
      setStore((current) => current.uid === user.uid
        ? {
            ...current,
            recipes: latest
              ? withRecipe(current.recipes, latest)
              : current.recipes.filter((recipe) => recipe.id !== recipeId),
            error: null,
          }
        : current);
      return latest;
    },
    [recipes, user],
  );

  const saveRecipe = useCallback(
    async (recipe: Recipe, options: RecipeWriteOptions = {}) => {
      if (user?.isDemo) {
        const valid = recipeSchema.parse({ ...recipe, userId: user.uid });
        const next = withRecipe(recipes, valid);
        writeDemoRecipes(next);
        setStore({ uid: user.uid, recipes: next, loading: false, error: null });
        return;
      }
      const client = getFirebaseClient();
      if (!client || !user) throw new Error("ログインが必要です。");
      const hasExplicitVersion = Object.prototype.hasOwnProperty.call(options, "expectedUpdatedAt");
      const expectedUpdatedAt = hasExplicitVersion
        ? options.expectedUpdatedAt
        : recipes.find((item) => item.id === recipe.id)?.updatedAt ?? null;
      try {
        await writeRecipe(client.db, user.uid, recipe, { expectedUpdatedAt });
        setStore((current) => ({
          uid: user.uid,
          recipes: withRecipe(current.uid === user.uid ? current.recipes : [], recipe),
          loading: false,
          error: null,
        }));
      } catch (cause) {
        if (isRecipeConflictError(cause)) throw cause;
        const { savePendingWrite } = await import("@/lib/indexed-db");
        await savePendingWrite(user.uid, recipe.id, { recipe, expectedUpdatedAt });
        setStore((current) => ({
          uid: user.uid,
          recipes: withRecipe(current.uid === user.uid ? current.recipes : [], recipe),
          loading: false,
          error: "クラウド保存に失敗しました。端末内に保留し、編集内容は保持しています。",
        }));
        throw cause;
      }
    },
    [recipes, user],
  );

  const saveRecipeAsCopy = useCallback(
    async (recipe: Recipe) => {
      const timestamp = new Date().toISOString();
      const copy = recipeSchema.parse({
        ...recipe,
        id: crypto.randomUUID(),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await saveRecipe(copy, { expectedUpdatedAt: null });
      return copy;
    },
    [saveRecipe],
  );

  const deleteRecipe = useCallback(
    async (recipeId: string) => {
      if (user?.isDemo) {
        const next = recipes.filter((recipe) => recipe.id !== recipeId);
        writeDemoRecipes(next);
        setStore({ uid: user.uid, recipes: next, loading: false, error: null });
        return;
      }
      const client = getFirebaseClient();
      if (!client || !user) throw new Error("ログインが必要です。");
      await removeRecipe(client.db, user.uid, recipeId);
      setStore((current) => current.uid === user.uid
        ? { ...current, recipes: current.recipes.filter((recipe) => recipe.id !== recipeId) }
        : current);
    },
    [recipes, user],
  );

  const restoreRecipes = useCallback(
    async (nextRecipes: Recipe[]) => {
      if (user?.isDemo) {
        const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
        nextRecipes.forEach((recipe) => {
          const valid = recipeSchema.parse({ ...recipe, userId: user.uid });
          byId.set(valid.id, valid);
        });
        const restored = [...byId.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        writeDemoRecipes(restored);
        setStore({ uid: user.uid, recipes: restored, loading: false, error: null });
        return;
      }
      const client = getFirebaseClient();
      if (!client || !user) throw new Error("ログインが必要です。");
      await restoreRecipesAtomically(client.db, user.uid, nextRecipes);
    },
    [recipes, user],
  );

  const value = useMemo<RecipeContextValue>(
    () => ({
      recipes,
      loading,
      error,
      getRecipe,
      getLatestRecipe,
      saveRecipe,
      saveRecipeAsCopy,
      deleteRecipe,
      restoreRecipes,
    }),
    [
      recipes,
      loading,
      error,
      getRecipe,
      getLatestRecipe,
      saveRecipe,
      saveRecipeAsCopy,
      deleteRecipe,
      restoreRecipes,
    ],
  );

  return <RecipeContext.Provider value={value}>{children}</RecipeContext.Provider>;
}

export function useRecipes(): RecipeContextValue {
  const value = useContext(RecipeContext);
  if (!value) throw new Error("useRecipes must be used inside RecipeProvider");
  return value;
}
