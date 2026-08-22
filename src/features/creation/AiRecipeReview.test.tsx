import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RecipeDraft } from "@/domain/recipe";
import { AiRecipeReview } from "./AiRecipeReview";
import {
  readAiReviewSession,
  readCompletionReceipt,
  saveAiReviewSession,
} from "./creation-session";

const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const recipeApi = vi.hoisted(() => ({ saveRecipe: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/components/AuthGate", () => ({ AuthGate: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/contexts/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "user-1" } }) }));
vi.mock("@/contexts/RecipeProvider", () => ({ useRecipes: () => recipeApi }));

function draft(): RecipeDraft {
  return {
    title: "豚肉の生姜焼き",
    category: "main",
    servings: 2,
    ingredients: [{ id: "ingredient-1", name: "豚肉", amountText: "300", numericAmount: 300, unit: "g", note: "" }],
    seasonings: [{ id: "seasoning-1", name: "しょうが", amountText: "適量", numericAmount: null, unit: "", note: "" }],
    steps: [{ id: "step-1", order: 1, text: "豚肉を炒める。", ingredientRefs: [], timers: [] }],
    tips: [],
    memo: "",
    tags: [],
    source: { type: "text", url: null },
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
  navigation.push.mockReset();
  navigation.replace.mockReset();
  recipeApi.saveRecipe.mockReset().mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("AiRecipeReview", () => {
  it("shows AI confirmation items separately from the recipe and follows the Figma section order", async () => {
    saveAiReviewSession({
      draft: draft(),
      warnings: ["しょうがの具体的な分量が記載されていません。"],
      needsServingsConfirmation: false,
      detectedServings: 2,
    });
    render(<AiRecipeReview />);

    expect(await screen.findByRole("heading", { name: "AIからの確認事項" })).toBeInTheDocument();
    expect(screen.getByText("しょうがの具体的な分量が記載されていません。")).toBeInTheDocument();
    expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "レシピを確認", "AIからの確認事項", "豚肉の生姜焼き", "材料", "調味料", "作り方",
    ]);
    expect(screen.getByText("適量", { exact: true })).toBeInTheDocument();
  });

  it("uses a small success status instead of an empty confirmation card", async () => {
    saveAiReviewSession({ draft: draft(), warnings: [], needsServingsConfirmation: false, detectedServings: 2 });
    render(<AiRecipeReview />);

    expect(await screen.findByText("確認が必要な項目はありません", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "AIからの確認事項" })).not.toBeInTheDocument();
    expect(document.querySelector(".ai-review-notes")).not.toBeInTheDocument();
  });

  it("moves to completion only after saving succeeds and keeps warnings out of stored recipe data", async () => {
    saveAiReviewSession({
      draft: draft(),
      warnings: ["確認してください。"],
      needsServingsConfirmation: false,
      detectedServings: 2,
    });
    render(<AiRecipeReview />);
    fireEvent.click(await screen.findByRole("button", { name: "このレシピを保存" }));

    await waitFor(() => expect(recipeApi.saveRecipe).toHaveBeenCalledTimes(1));
    const savedRecipe = recipeApi.saveRecipe.mock.calls[0][0];
    expect(savedRecipe).not.toHaveProperty("warnings");
    expect(savedRecipe).not.toHaveProperty("confirmationItems");
    expect(readAiReviewSession()).toBeNull();
    expect(readCompletionReceipt()?.recipeTitle).toBe("豚肉の生姜焼き");
    expect(navigation.replace).toHaveBeenCalledWith("/create/complete");
  });

  it("does not show completion when Firestore saving fails", async () => {
    recipeApi.saveRecipe.mockRejectedValueOnce(new Error("クラウド保存に失敗しました。"));
    saveAiReviewSession({ draft: draft(), warnings: [], needsServingsConfirmation: false, detectedServings: 2 });
    render(<AiRecipeReview />);
    fireEvent.click(await screen.findByRole("button", { name: "このレシピを保存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("クラウド保存に失敗しました。");
    expect(navigation.replace).not.toHaveBeenCalled();
    expect(readAiReviewSession()).not.toBeNull();
    expect(readCompletionReceipt()).toBeNull();
  });

  it("saves an AI draft with unresolved servings and no ingredients or steps", async () => {
    saveAiReviewSession({
      draft: { ...draft(), servings: null, ingredients: [], seasonings: [], steps: [] },
      warnings: ["人数と作り方を確認できませんでした。"],
      needsServingsConfirmation: true,
      detectedServings: null,
    });
    render(<AiRecipeReview />);

    expect(await screen.findByRole("heading", { name: "豚肉の生姜焼き" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "材料" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "作り方" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "このレシピを保存" }));

    await waitFor(() => expect(recipeApi.saveRecipe).toHaveBeenCalledTimes(1));
    expect(recipeApi.saveRecipe.mock.calls[0][0]).toMatchObject({
      servings: null,
      ingredients: [],
      seasonings: [],
      steps: [],
    });
    expect(navigation.replace).toHaveBeenCalledWith("/create/complete");
  });
});
