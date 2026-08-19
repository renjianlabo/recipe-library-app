import { describe, expect, it } from "vitest";

import { normalizeAiDraft } from "./normalizeAiDraft";

describe("normalizeAiDraft", () => {
  it("不正なIDと工程順を修復し、材料参照を追従させる", () => {
    const result = normalizeAiDraft({
      title: "テスト",
      category: "main",
      servings: null,
      ingredients: [{ id: "材料 1", name: "油", amountText: "1", numericAmount: 999, unit: "大さじ", note: "" }],
      steps: [{
        id: "工程 1",
        order: 0,
        text: "油を入れる",
        ingredientRefs: [{ ingredientId: "材料 1", usage: "all" }],
        timers: [],
      }],
      tips: [""],
      memo: "",
      tags: [""],
      source: { type: "text", url: "https://example.com/should-not-remain" },
    });

    expect(result.servings).toBeNull();
    expect(result.ingredients[0]).toMatchObject({ id: "ingredient-1", name: "オリーブオイル", numericAmount: 1 });
    expect(result.steps[0]).toMatchObject({ id: "step-1", order: 1 });
    expect(result.steps[0].ingredientRefs[0].ingredientId).toBe("ingredient-1");
    expect(result.source.url).toBeNull();
  });
});
