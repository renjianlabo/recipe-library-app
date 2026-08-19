import type { Firestore } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Recipe } from "@/domain/recipe";

const mocks = vi.hoisted(() => ({
  runTransaction: vi.fn(),
  transactionGet: vi.fn(),
  transactionSet: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  runTransaction: mocks.runTransaction,
  writeBatch: vi.fn(),
}));

import {
  RecipeConflictError,
  recipeCollectionPath,
  recipeDocumentPath,
  writeRecipe,
} from "./recipe-repository";

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "recipe-1",
    userId: "user-a",
    title: "トースト",
    category: "staple",
    servings: 1,
    ingredients: [{ id: "bread", name: "食パン", amountText: "1", numericAmount: 1, unit: "枚", note: "" }],
    steps: [{ id: "step-1", order: 1, text: "焼く。", ingredientRefs: [], timers: [] }],
    tips: [],
    memo: "",
    tags: [],
    source: { type: "manual", url: null },
    nutrition: {
      calories: null,
      carbohydrates: null,
      protein: null,
      fat: null,
      fiber: null,
      salt: null,
      calculatedAt: null,
    },
    isFavorite: false,
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

function currentSnapshot(current: Recipe | null) {
  return {
    exists: () => current !== null,
    data: () => current,
  };
}

describe("Firestore user isolation paths", () => {
  it("always scopes recipes under the authenticated uid", () => {
    expect(recipeCollectionPath("user-a")).toBe("users/user-a/recipes");
    expect(recipeDocumentPath("user-b", "recipe-1")).toBe("users/user-b/recipes/recipe-1");
  });

  it("rejects path traversal segments", () => {
    expect(() => recipeCollectionPath("user/a")).toThrow();
    expect(() => recipeDocumentPath("user-a", "../other")).toThrow();
  });
});

describe("Firestore recipe conflict detection", () => {
  beforeEach(() => {
    mocks.runTransaction.mockReset().mockImplementation(async (
      _db: unknown,
      update: (transaction: { get: typeof mocks.transactionGet; set: typeof mocks.transactionSet }) => Promise<unknown>,
    ) => update({ get: mocks.transactionGet, set: mocks.transactionSet }));
    mocks.transactionGet.mockReset();
    mocks.transactionSet.mockReset();
  });

  it("writes in a transaction when the opened updatedAt still matches", async () => {
    const current = recipe();
    const edited = recipe({
      title: "チーズトースト",
      updatedAt: "2026-07-31T01:00:00.000Z",
    });
    mocks.transactionGet.mockResolvedValue(currentSnapshot(current));

    await writeRecipe({} as Firestore, "user-a", edited, {
      expectedUpdatedAt: current.updatedAt,
    });

    expect(mocks.transactionSet).toHaveBeenCalledWith(
      expect.objectContaining({ path: "users/user-a/recipes/recipe-1" }),
      edited,
      { merge: false },
    );
  });

  it("returns a typed conflict with the latest recipe and never overwrites it", async () => {
    const openedAt = "2026-07-31T00:00:00.000Z";
    const latest = recipe({ title: "別端末の変更", updatedAt: "2026-07-31T01:00:00.000Z" });
    const staleEdit = recipe({ title: "古い編集", updatedAt: "2026-07-31T02:00:00.000Z" });
    mocks.transactionGet.mockResolvedValue(currentSnapshot(latest));

    const failure = await writeRecipe({} as Firestore, "user-a", staleEdit, {
      expectedUpdatedAt: openedAt,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RecipeConflictError);
    expect(failure).toMatchObject({
      code: "RECIPE_CONFLICT",
      recipeId: "recipe-1",
      expectedUpdatedAt: openedAt,
      latestRecipe: latest,
    });
    expect(mocks.transactionSet).not.toHaveBeenCalled();
  });

  it("treats null as create-only and rejects a colliding ID", async () => {
    const latest = recipe();
    mocks.transactionGet.mockResolvedValue(currentSnapshot(latest));
    await expect(writeRecipe({} as Firestore, "user-a", recipe(), {
      expectedUpdatedAt: null,
    })).resolves.toBeUndefined();

    const different = recipe({ title: "同じIDの新規レシピ" });
    await expect(writeRecipe({} as Firestore, "user-a", different, {
      expectedUpdatedAt: null,
    })).rejects.toBeInstanceOf(RecipeConflictError);
  });
});
