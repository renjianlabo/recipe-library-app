import { describe, expect, it } from "vitest";

import { findIngredientRemovalImpacts } from "./ingredient-impact";
import { diffRecipes } from "./recipe-diff";
import { searchRecipes } from "./recipe-search";
import type { RecipeDraft } from "./recipe";

function draft(): RecipeDraft {
  return {
    title: "にんにく香る野菜炒め",
    category: "main",
    servings: 2,
    ingredients: [
      { id: "garlic", name: "にんにく", amountText: "1", numericAmount: 1, unit: "片", note: "" },
      { id: "oil", name: "オリーブオイル", amountText: "1", numericAmount: 1, unit: "大さじ", note: "" },
    ],
    steps: [
      {
        id: "step-1",
        order: 1,
        text: "にんにくをオリーブオイルで炒める。",
        ingredientRefs: [{ ingredientId: "garlic", usage: "all" }],
        timers: [],
      },
      {
        id: "step-2",
        order: 2,
        text: "最後ににんにくを加える。",
        ingredientRefs: [],
        timers: [],
      },
    ],
    tips: ["にんにくは焦がさない"],
    memo: "にんにく抜きにもできる",
    tags: ["炒め物", "時短"],
    source: { type: "manual", url: null },
  };
}

describe("recipe diff", () => {
  it("reports local field changes and reordering by stable IDs", () => {
    const before = draft();
    const after: RecipeDraft = {
      ...draft(),
      title: "香味野菜炒め",
      servings: 3,
      ingredients: [
        { ...before.ingredients[1] },
        { ...before.ingredients[0], amountText: "2", numericAmount: 2 },
      ],
    };
    const result = diffRecipes(before, after);
    expect(result.hasChanges).toBe(true);
    expect(result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "title", before: before.title, after: after.title }),
      expect.objectContaining({ path: "servings", before: 2, after: 3 }),
      expect.objectContaining({ path: "ingredients.garlic.amountText", after: "2" }),
      expect.objectContaining({ kind: "reordered", path: "ingredients.order" }),
    ]));
    expect(diffRecipes(before, before)).toEqual({ hasChanges: false, changes: [] });
  });
});

describe("ingredient removal impact", () => {
  it("finds references and plain-text mentions in steps, tips, and memo", () => {
    const impacts = findIngredientRemovalImpacts(draft(), "garlic");
    expect(impacts).toHaveLength(4);
    expect(impacts[0]).toMatchObject({ section: "step", id: "step-1", matches: ["reference", "text"] });
    expect(impacts[1]).toMatchObject({ section: "step", id: "step-2", matches: ["text"] });
    expect(impacts[2]).toMatchObject({ section: "tip" });
    expect(impacts[3]).toMatchObject({ section: "memo" });
    expect(findIngredientRemovalImpacts(draft(), "unknown")).toEqual([]);
  });

  it("does not report ねぎ merely because 玉ねぎ appears", () => {
    const value = draft();
    value.ingredients = [{ id: "green-onion", name: "ねぎ", amountText: "1", numericAmount: 1, unit: "本", note: "" }];
    value.steps = [{ id: "step-1", order: 1, text: "玉ねぎを切る。", ingredientRefs: [], timers: [] }];
    value.tips = [];
    value.memo = "";
    expect(findIngredientRemovalImpacts(value, "green-onion")).toEqual([]);
  });
});

describe("recipe list search", () => {
  const recipes = [
    draft(),
    {
      ...draft(),
      title: "ニンジンと豆腐のみそ汁",
      category: "soup" as const,
      ingredients: [{ id: "tofu", name: "豆腐", amountText: "1", numericAmount: 1, unit: "丁", note: "" }],
      tags: ["和食"],
      isFavorite: true,
    },
  ];

  it("searches title, ingredient, and tags with kana folding and multi-word AND", () => {
    expect(searchRecipes(recipes, { query: "にんにく 時短" })).toEqual([recipes[0]]);
    expect(searchRecipes(recipes, { query: "みそ汁", category: "soup" })).toEqual([recipes[1]]);
    expect(searchRecipes(recipes, { query: "にんじん 和食" })).toEqual([recipes[1]]);
    expect(searchRecipes(recipes, { ingredient: "ｵﾘｰﾌﾞｵｲﾙ" })).toEqual([recipes[0]]);
    expect(searchRecipes(recipes, { tags: ["和食"] })).toEqual([recipes[1]]);
    expect(searchRecipes(recipes, { favoriteOnly: true })).toEqual([recipes[1]]);
    expect(searchRecipes(recipes, { query: "汁物" })).toEqual([]);
  });
});
