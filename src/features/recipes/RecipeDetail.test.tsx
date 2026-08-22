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
  it("keeps the edit and cooking links together in one floating action bar", () => {
    render(<RecipeDetail recipeId="recipe-1" />);

    const editLink = screen.getByRole("link", { name: "編集する" });
    const cookingLink = screen.getByRole("link", { name: /料理モードを開始/ });
    const actionBar = editLink.closest("footer");
    expect(actionBar).toHaveClass("detail-actions", "floating-action-bar");
    expect(actionBar).toContainElement(cookingLink);
    expect(editLink).toHaveAttribute("href", "/recipes/recipe-1/edit");
    expect(cookingLink).toHaveAttribute("href", "/cook/recipe-1?servings=2");
  });

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

  it("hides empty sections, serving controls, and cooking mode for a minimal recipe", () => {
    const minimal = { ...recipe(), servings: null, ingredients: [], seasonings: [], steps: [] };
    recipeApi.recipes = [minimal];
    recipeApi.getRecipe.mockResolvedValue(minimal);
    render(<RecipeDetail recipeId="recipe-1" />);

    expect(screen.queryByRole("combobox", { name: "人数" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "材料" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "調味料" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "作り方" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /料理モードを開始/ })).not.toBeInTheDocument();
    const editLink = screen.getByRole("link", { name: "編集する" });
    expect(editLink.closest("footer")).toHaveClass("detail-actions", "detail-actions--single", "floating-action-bar");
    expect(editLink).toHaveAttribute("href", "/recipes/recipe-1/edit");
  });
});
