"use client";

import type { User } from "firebase/auth";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { AuthContext, type AuthContextValue } from "@/contexts/AuthProvider";
import { RecipeContext, type RecipeContextValue } from "@/contexts/RecipeProvider";
import { recipeSchema, type Recipe } from "@/domain/recipe";
import { RecipeConflictError, type RecipeWriteOptions } from "@/lib/recipe-repository";

export const E2E_RECIPE_STORAGE_KEY = "recipe-library-e2e-recipes-v1";
const E2E_UID = "e2e-user";

const e2eUser = {
  uid: E2E_UID,
  displayName: "E2Eユーザー",
  email: "e2e@example.test",
  emailVerified: true,
  getIdToken: async () => "e2e-test-token",
} as User;

function sortRecipes(recipes: readonly Recipe[]): Recipe[] {
  return [...recipes].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function readStoredRecipes(): Recipe[] {
  try {
    const value = window.localStorage.getItem(E2E_RECIPE_STORAGE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return sortRecipes(parsed.flatMap((entry) => {
      const result = recipeSchema.safeParse(entry);
      return result.success && result.data.userId === E2E_UID ? [result.data] : [];
    }));
  } catch {
    return [];
  }
}

function E2eAuthProvider({ children }: { children: ReactNode }) {
  const value = useMemo<AuthContextValue>(() => ({
    user: e2eUser,
    loading: false,
    configured: true,
    accessError: null,
    signIn: async () => undefined,
    signInWithEmail: async () => undefined,
    signUpWithEmail: async () => undefined,
    resendVerification: async () => undefined,
    resetPassword: async () => undefined,
    startDemo: () => undefined,
    signOutUser: async () => undefined,
    getIdToken: () => e2eUser.getIdToken(),
  }), []);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function E2eRecipeProvider({ children }: { children: ReactNode }) {
  const [recipes, setRecipes] = useState<Recipe[]>(readStoredRecipes);
  const recipesRef = useRef<Recipe[]>(recipes);

  const commit = useCallback((next: Recipe[]) => {
    const sorted = sortRecipes(next);
    recipesRef.current = sorted;
    window.localStorage.setItem(E2E_RECIPE_STORAGE_KEY, JSON.stringify(sorted));
    setRecipes(sorted);
  }, []);

  const getRecipe = useCallback(async (recipeId: string) => {
    const current = recipesRef.current.length ? recipesRef.current : readStoredRecipes();
    if (!recipesRef.current.length && current.length) recipesRef.current = current;
    return current.find((recipe) => recipe.id === recipeId) ?? null;
  }, []);

  const saveRecipe = useCallback(async (recipe: Recipe, options: RecipeWriteOptions = {}) => {
    const valid = recipeSchema.parse(recipe);
    if (valid.userId !== E2E_UID) throw new Error("別のユーザーのレシピは保存できません。");
    const current = recipesRef.current.find((item) => item.id === valid.id) ?? null;
    if (Object.prototype.hasOwnProperty.call(options, "expectedUpdatedAt")) {
      if (options.expectedUpdatedAt === null && current) {
        throw new RecipeConflictError(valid.id, null, current);
      }
      if (typeof options.expectedUpdatedAt === "string"
        && current?.updatedAt !== options.expectedUpdatedAt) {
        throw new RecipeConflictError(valid.id, options.expectedUpdatedAt, current);
      }
    }
    commit([valid, ...recipesRef.current.filter((item) => item.id !== valid.id)]);
  }, [commit]);

  const saveRecipeAsCopy = useCallback(async (recipe: Recipe) => {
    const timestamp = new Date().toISOString();
    const copy = recipeSchema.parse({
      ...recipe,
      id: crypto.randomUUID(),
      userId: E2E_UID,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await saveRecipe(copy, { expectedUpdatedAt: null });
    return copy;
  }, [saveRecipe]);

  const deleteRecipe = useCallback(async (recipeId: string) => {
    commit(recipesRef.current.filter((recipe) => recipe.id !== recipeId));
  }, [commit]);

  const restoreRecipes = useCallback(async (incoming: Recipe[]) => {
    const byId = new Map(recipesRef.current.map((recipe) => [recipe.id, recipe]));
    incoming.forEach((recipe) => {
      const valid = recipeSchema.parse({ ...recipe, userId: E2E_UID });
      byId.set(valid.id, valid);
    });
    commit([...byId.values()]);
  }, [commit]);

  const value = useMemo<RecipeContextValue>(() => ({
    recipes,
    loading: false,
    error: null,
    getRecipe,
    getLatestRecipe: getRecipe,
    saveRecipe,
    saveRecipeAsCopy,
    deleteRecipe,
    restoreRecipes,
  }), [
    deleteRecipe,
    getRecipe,
    recipes,
    restoreRecipes,
    saveRecipe,
    saveRecipeAsCopy,
  ]);

  return <RecipeContext.Provider value={value}>{children}</RecipeContext.Provider>;
}

function subscribeToClientReady() {
  return () => undefined;
}

export function E2eAppProviders({ children }: { children: ReactNode }) {
  const clientReady = useSyncExternalStore(
    subscribeToClientReady,
    () => true,
    () => false,
  );
  if (!clientReady) {
    return <main className="center-screen" aria-busy="true">E2Eテストを準備しています…</main>;
  }
  return (
    <E2eAuthProvider>
      <E2eRecipeProvider>{children}</E2eRecipeProvider>
    </E2eAuthProvider>
  );
}
