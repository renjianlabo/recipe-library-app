"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";

import { recipeSchema, type Recipe } from "@/domain/recipe";

const MAX_ATOMIC_RESTORE_RECIPES = 400;

export interface RecipeWriteOptions {
  /** null means create-only; a string is the version that was opened for editing. */
  expectedUpdatedAt?: string | null;
}

export class RecipeConflictError extends Error {
  readonly code = "RECIPE_CONFLICT" as const;

  constructor(
    readonly recipeId: string,
    readonly expectedUpdatedAt: string | null | undefined,
    readonly latestRecipe: Recipe | null,
  ) {
    super("他の端末でこのレシピが更新されています。");
    this.name = "RecipeConflictError";
  }
}

export function isRecipeConflictError(error: unknown): error is RecipeConflictError {
  return error instanceof RecipeConflictError;
}

function safeSegment(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("/")) throw new Error(`${label}が不正です。`);
  return trimmed;
}

export function recipeCollectionPath(uid: string): string {
  return `users/${safeSegment(uid, "ユーザーID")}/recipes`;
}

export function recipeDocumentPath(uid: string, recipeId: string): string {
  return `${recipeCollectionPath(uid)}/${safeSegment(recipeId, "レシピID")}`;
}

function assertOwnedRecipe(recipe: Recipe, uid: string): Recipe {
  const parsed = recipeSchema.parse(recipe);
  if (parsed.userId !== uid) throw new Error("別のユーザーのレシピは保存できません。");
  return parsed;
}

export function subscribeRecipes(
  db: Firestore,
  uid: string,
  onValue: (recipes: Recipe[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const recipesQuery = query(collection(db, recipeCollectionPath(uid)), orderBy("updatedAt", "desc"));
  return onSnapshot(
    recipesQuery,
    { includeMetadataChanges: true },
    (snapshot) => {
      const valid: Recipe[] = [];
      snapshot.docs.forEach((entry) => {
        const parsed = recipeSchema.safeParse(entry.data());
        if (parsed.success && parsed.data.id === entry.id && parsed.data.userId === uid) {
          valid.push(parsed.data);
        }
      });
      onValue(valid);
    },
    (error) => onError(error),
  );
}

export async function readRecipe(db: Firestore, uid: string, recipeId: string): Promise<Recipe | null> {
  const snapshot = await getDoc(doc(db, recipeDocumentPath(uid, recipeId)));
  if (!snapshot.exists()) return null;
  const parsed = recipeSchema.safeParse(snapshot.data());
  if (!parsed.success || parsed.data.userId !== uid || parsed.data.id !== recipeId) {
    throw new Error("保存データの形式が不正です。");
  }
  return parsed.data;
}

export async function writeRecipe(
  db: Firestore,
  uid: string,
  recipe: Recipe,
  options: RecipeWriteOptions = {},
): Promise<void> {
  const valid = assertOwnedRecipe(recipe, uid);
  const recipeRef = doc(db, recipeDocumentPath(uid, valid.id));
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(recipeRef);
    if (!snapshot.exists()) {
      if (typeof options.expectedUpdatedAt === "string") {
        throw new RecipeConflictError(valid.id, options.expectedUpdatedAt, null);
      }
      transaction.set(recipeRef, valid, { merge: false });
      return;
    }

    const latest = recipeSchema.safeParse(snapshot.data());
    if (!latest.success || latest.data.id !== valid.id || latest.data.userId !== uid) {
      throw new Error("保存データの形式が不正です。");
    }

    // A retry after a successful-but-unacknowledged transaction is harmless.
    if (JSON.stringify(latest.data) === JSON.stringify(valid)) return;

    if (
      typeof options.expectedUpdatedAt !== "string"
      || latest.data.updatedAt !== options.expectedUpdatedAt
    ) {
      throw new RecipeConflictError(valid.id, options.expectedUpdatedAt, latest.data);
    }
    transaction.set(recipeRef, valid, { merge: false });
  });
}

export async function removeRecipe(db: Firestore, uid: string, recipeId: string): Promise<void> {
  await deleteDoc(doc(db, recipeDocumentPath(uid, recipeId)));
}

export async function restoreRecipesAtomically(
  db: Firestore,
  uid: string,
  recipes: Recipe[],
): Promise<void> {
  if (recipes.length > MAX_ATOMIC_RESTORE_RECIPES) {
    throw new Error(`一度に復元できるレシピは${MAX_ATOMIC_RESTORE_RECIPES}件までです。`);
  }
  const valid = recipes.map((recipe) => assertOwnedRecipe({ ...recipe, userId: uid }, uid));
  const ids = new Set(valid.map((recipe) => recipe.id));
  if (ids.size !== valid.length) throw new Error("レシピIDが重複しています。");

  const batch = writeBatch(db);
  valid.forEach((recipe) => {
    batch.set(doc(db, recipeDocumentPath(uid, recipe.id)), recipe, { merge: false });
  });
  await batch.commit();
}
