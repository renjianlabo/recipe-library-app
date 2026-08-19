import { describe, expect, it } from "vitest";

import type { Recipe } from "./recipe";
import { deriveStepIngredients } from "./step-ingredients";

function recipe(): Recipe {
  return {
    id: "recipe-amounts",
    userId: "user-1",
    isFavorite: false,
    title: "分量表示",
    category: "other",
    servings: 2,
    ingredients: [
      { id: "flour", name: "小麦粉", amountText: "75", numericAmount: 75, unit: "g", note: "" },
      { id: "egg", name: "卵", amountText: "1", numericAmount: 1, unit: "個", note: "" },
      { id: "oil", name: "油", amountText: "1", numericAmount: 1, unit: "大さじ", note: "" },
      { id: "water", name: "水", amountText: "0.334", numericAmount: 0.334, unit: "カップ", note: "" },
    ],
    seasonings: [
      { id: "salt", name: "塩", amountText: "少々", numericAmount: null, unit: "", note: "" },
    ],
    steps: [{
      id: "step-1",
      order: 1,
      text: "混ぜる。",
      ingredientRefs: [
        { ingredientId: "flour", usage: "all" },
        { ingredientId: "egg", usage: "all" },
        { ingredientId: "oil", usage: "all" },
        { ingredientId: "water", usage: "all" },
        { ingredientId: "salt", usage: "all" },
      ],
      timers: [],
    }, {
      id: "step-2",
      order: 2,
      text: "仕上げる。",
      ingredientRefs: [
        { ingredientId: "egg", usage: "remaining" },
        { ingredientId: "flour", usage: "custom", customAmountText: "50g" },
      ],
      timers: [],
    }],
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
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
  };
}

describe("deriveStepIngredients", () => {
  it("produces the shared detail/cooking display for continuous, countable, and measuring units", () => {
    const source = recipe();
    expect(deriveStepIngredients(source, source.steps[0], 1).map((item) => item.displayAmount)).toEqual([
      "37.5g",
      "1/2個",
      "大さじ1/2",
      "1/6カップ",
      "少々",
    ]);
  });

  it("preserves remaining semantics and scales a custom amount with its own unit", () => {
    const source = recipe();
    expect(deriveStepIngredients(source, source.steps[1], 1).map((item) => item.displayAmount)).toEqual([
      "残り",
      "25g",
    ]);
  });
});
