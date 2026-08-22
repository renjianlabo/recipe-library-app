import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyRecipeDraft, finalizeRecipeDraft } from "@/domain/recipe";
import { RecipeEditor } from "./RecipeEditor";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
const recipeApi = vi.hoisted(() => ({
  saveRecipe: vi.fn(),
  saveRecipeAsCopy: vi.fn(),
  getLatestRecipe: vi.fn(),
}));
const autosave = vi.hoisted(() => ({
  clearSavedDraft: vi.fn(),
  discardRecoveredDraft: vi.fn(),
  restoreDraft: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/components/AuthGate", () => ({ AuthGate: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/contexts/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "user-1" } }) }));
vi.mock("@/contexts/RecipeProvider", () => ({ useRecipes: () => recipeApi }));
vi.mock("./RecipeFieldsEditor", () => ({ RecipeFieldsEditor: () => <div>レシピ入力欄</div> }));
vi.mock("./useDraftAutosave", () => ({
  useDraftAutosave: () => ({
    ...autosave,
    saveError: null,
    recoveryState: "ready",
  }),
}));

const initialDraft = {
  ...createEmptyRecipeDraft(),
  title: "テストレシピ",
};

beforeEach(() => {
  navigation.replace.mockReset();
  recipeApi.saveRecipe.mockReset().mockResolvedValue(undefined);
  recipeApi.saveRecipeAsCopy.mockReset();
  recipeApi.getLatestRecipe.mockReset();
  autosave.clearSavedDraft.mockReset().mockResolvedValue(undefined);
  autosave.discardRecoveredDraft.mockReset();
  autosave.restoreDraft.mockReset();
});

afterEach(cleanup);

describe("RecipeEditor save action", () => {
  it("shows one new-recipe save button and keeps the existing save handler", async () => {
    render(<RecipeEditor initialDraft={initialDraft} draftKey="new" heading="レシピを作成" description="説明" />);

    const buttons = screen.getAllByRole("button", { name: "レシピを保存" });
    expect(buttons).toHaveLength(1);
    expect(buttons[0].closest("footer")).toHaveClass("manual-save");
    fireEvent.click(buttons[0]);

    await waitFor(() => expect(recipeApi.saveRecipe).toHaveBeenCalledTimes(1));
  });

  it("shows one edit save button", () => {
    const existingRecipe = finalizeRecipeDraft(initialDraft, {
      id: "recipe-1",
      userId: "user-1",
      isFavorite: false,
      createdAt: "2026-08-23T00:00:00.000Z",
      updatedAt: "2026-08-23T00:00:00.000Z",
    });
    render(
      <RecipeEditor
        initialDraft={initialDraft}
        existingRecipe={existingRecipe}
        draftKey="edit-recipe-1"
        heading="レシピを編集"
        description="説明"
      />,
    );

    expect(screen.getAllByRole("button", { name: "変更を保存" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "レシピを保存" })).not.toBeInTheDocument();
  });
});
