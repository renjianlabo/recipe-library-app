import "@testing-library/jest-dom/vitest";

import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Recipe } from "@/domain/recipe";

import { RecipeBook } from "./RecipeBook";

const recipes: Recipe[] = [
  {
    id: "carrot",
    userId: "user-1",
    title: "ニンジンサラダ",
    category: "side",
    servings: 2,
    ingredients: [{ id: "carrot-i", name: "ニンジン", amountText: "1", numericAmount: 1, unit: "本", note: "" }],
    steps: [{ id: "carrot-s", order: 1, text: "切る。", ingredientRefs: [], timers: [] }],
    tips: [],
    memo: "",
    tags: ["和食", "時短"],
    source: { type: "manual", url: null },
    nutrition: { calories: null, carbohydrates: null, protein: null, fat: null, fiber: null, salt: null, calculatedAt: null },
    isFavorite: true,
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
  },
  {
    id: "garlic",
    userId: "user-1",
    title: "ガーリックトースト",
    category: "staple",
    servings: 1,
    ingredients: [{ id: "garlic-i", name: "塩", amountText: "少々", numericAmount: null, unit: "", note: "" }],
    steps: [{ id: "garlic-s", order: 1, text: "焼く。", ingredientRefs: [], timers: [] }],
    tips: [],
    memo: "",
    tags: ["洋食"],
    source: { type: "manual", url: null },
    nutrition: { calories: null, carbohydrates: null, protein: null, fat: null, fiber: null, salt: null, calculatedAt: null },
    isFavorite: false,
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
  },
];

vi.mock("@/components/AuthGate", () => ({ AuthGate: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/RecipeCard", () => ({ RecipeCard: ({ recipe }: { recipe: Recipe }) => <p>{recipe.title}</p> }));
vi.mock("@/contexts/RecipeProvider", () => ({
  useRecipes: () => ({ recipes, loading: false, error: null }),
}));
afterEach(cleanup);

describe("RecipeBook search controls", () => {
  it("uses kana-folded multi-word AND search from the domain implementation", () => {
    render(<RecipeBook />);
    fireEvent.change(screen.getByPlaceholderText("料理名・食材で検索"), { target: { value: "にんじん 和食" } });
    expect(screen.getByText("ニンジンサラダ")).toBeInTheDocument();
    expect(screen.queryByText("ガーリックトースト")).not.toBeInTheDocument();
  });

  it("uses category buttons and has no seasoning filter", () => {
    render(<RecipeBook />);
    expect(screen.queryByRole("button", { name: "調味料" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /カテゴリー/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "主食" }));
    expect(screen.queryByText("ニンジンサラダ")).not.toBeInTheDocument();
    expect(screen.getByText("ガーリックトースト")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "主食" })).toHaveAttribute("aria-pressed", "true");
  });
});
