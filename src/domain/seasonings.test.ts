import { describe, expect, it } from "vitest";

import { finalizeRecipeDraft, type RecipeDraft } from "./recipe";
import { canMakeWithPantry } from "./seasonings";

function recipeDraft(): RecipeDraft {
  return {
    title: "調味料テスト",
    category: "main",
    servings: 2,
    ingredients: [{
      id: "ingredient-1",
      name: "鶏肉",
      amountText: "300",
      numericAmount: 300,
      unit: "g",
      note: "",
    }],
    seasonings: [{
      id: "seasoning-1",
      name: "自家製たれ",
      amountText: "適量",
      numericAmount: null,
      unit: "",
      note: "",
    }],
    steps: [{
      id: "step-1",
      order: 1,
      text: "鶏肉に自家製たれを絡める。",
      ingredientRefs: [
        { ingredientId: "ingredient-1", usage: "all" },
        { ingredientId: "seasoning-1", usage: "all" },
      ],
      timers: [],
    }],
    tips: [],
    memo: "",
    tags: [],
    source: { type: "manual", url: null },
  };
}

describe("canMakeWithPantry", () => {
  it("uses explicit seasonings while preserving legacy ingredient-based checks", () => {
    const recipe = finalizeRecipeDraft(recipeDraft(), {
      id: "recipe-1",
      userId: "user-1",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    });
    expect(canMakeWithPantry(recipe, new Set(["自家製たれ"]), ["自家製たれ"])).toBe(true);
    expect(canMakeWithPantry(recipe, new Set(), ["自家製たれ"])).toBe(false);

    const legacy = { ...recipe, seasonings: undefined, ingredients: [
      ...recipe.ingredients,
      { id: "legacy-salt", name: "塩", amountText: "少々", numericAmount: null, unit: "", note: "" },
    ] };
    expect(canMakeWithPantry(legacy, new Set(["塩"]))).toBe(true);
    expect(canMakeWithPantry(legacy, new Set())).toBe(false);
  });
});
