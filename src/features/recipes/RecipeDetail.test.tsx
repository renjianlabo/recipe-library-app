import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Recipe } from "@/domain/recipe";
import { RecipeDetail } from "./RecipeDetail";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
const authState = vi.hoisted(() => ({ user: { uid: "user-1" } as { uid: string } | null }));
const recipeApi = vi.hoisted(() => ({
  recipes: [] as Recipe[],
  getRecipe: vi.fn(),
  deleteRecipe: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/components/AuthGate", () => ({ AuthGate: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/contexts/AuthProvider", () => ({ useAuth: () => authState }));
vi.mock("@/contexts/RecipeProvider", () => ({ useRecipes: () => recipeApi }));

function recipe(userId = "user-1"): Recipe {
  return {
    id: "recipe-1",
    userId,
    title: "豚肉の生姜焼き",
    category: "main",
    servings: 2,
    ingredients: [{ id: "ingredient-1", name: "豚肉", amountText: "300", numericAmount: 300, unit: "g", note: "" }],
    seasonings: [{ id: "seasoning-1", name: "しょうゆ", amountText: "1.5", numericAmount: 1.5, unit: "大さじ", note: "" }],
    steps: [{ id: "step-1", order: 1, text: "豚肉を炒める。", ingredientRefs: [], timers: [] }],
    tips: [],
    memo: "",
    tags: [],
    source: { type: "manual", url: null },
    nutrition: { calories: null, carbohydrates: null, protein: null, fat: null, fiber: null, salt: null, calculatedAt: null },
    isFavorite: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

beforeEach(() => {
  const ownedRecipe = recipe();
  authState.user = { uid: "user-1" };
  recipeApi.recipes = [ownedRecipe];
  recipeApi.getRecipe.mockReset().mockResolvedValue(ownedRecipe);
  recipeApi.deleteRecipe.mockReset().mockResolvedValue(undefined);
  navigation.replace.mockReset();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RecipeDetail deletion", () => {
  it("deletes the signed-in user's recipe and returns only after success", async () => {
    render(<RecipeDetail recipeId="recipe-1" />);
    fireEvent.click(screen.getByRole("button", { name: "レシピを削除" }));

    await waitFor(() => expect(recipeApi.deleteRecipe).toHaveBeenCalledWith("recipe-1"));
    expect(navigation.replace).toHaveBeenCalledWith("/recipes");
  });

  it("does not navigate when deletion fails", async () => {
    recipeApi.deleteRecipe.mockRejectedValueOnce(new Error("failed"));
    render(<RecipeDetail recipeId="recipe-1" />);
    fireEvent.click(screen.getByRole("button", { name: "レシピを削除" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("レシピを削除できませんでした");
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("refuses a recipe whose owner differs from the signed-in user", async () => {
    const foreignRecipe = recipe("user-2");
    recipeApi.recipes = [foreignRecipe];
    recipeApi.getRecipe.mockResolvedValue(foreignRecipe);
    render(<RecipeDetail recipeId="recipe-1" />);
    fireEvent.click(screen.getByRole("button", { name: "レシピを削除" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("削除する権限がありません");
    expect(recipeApi.deleteRecipe).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
