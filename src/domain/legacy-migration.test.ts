import { describe, expect, it } from "vitest";

import { migrateLegacyRecipesDocument } from "./legacy-migration";

const options = {
  userId: "user-1",
  importedAt: "2026-07-31T00:00:00.000Z",
};

function legacyDocument() {
  return {
    recipes: [
      {
        id: "r_1",
        title: "野菜炒め",
        group: "main",
        servings: 2,
        ingredients: [
          { name: "サラダ油", amount: 1, unit: "大さじ" },
          { name: "玉ねぎ", amount: 0.5, unit: "個" },
        ],
        steps: [
          "サラダ油を熱する。",
          {
            id: "legacy-step",
            order: 99,
            title: "玉ねぎを炒める",
            text: "玉ねぎを加えて炒める。",
            ingredients: [{ name: "玉ねぎ", amount: "残り", unit: "" }],
            suggestedTimers: [
              { label: "炒める", seconds: 120 },
              { label: "無効", seconds: 0 },
            ],
          },
        ],
        tags: ["炒め物", "炒め物"],
        memo: "",
        source: "claude",
        created_at: "2026-07-21T19:31:02.647+09:00",
      },
      {
        id: "r_2",
        title: "塩味炒め",
        group: "main",
        servings: 2,
        ingredients: [{ name: "こしょう", amount: 0.1, unit: "少々" }],
        steps: [{
          title: "味付け",
          text: "こしょうで味を調える。",
          ingredients: [{ name: "こしょう", amount: 0.1, unit: "少々" }],
          suggestedTimers: [],
        }],
        tags: [],
        memo: "",
        source: "manual",
        created_at: "2026-07-22T00:00:00.000Z",
        updated_at: "2026-07-22T01:00:00.000Z",
      },
    ],
  };
}

describe("legacy recipe migration", () => {
  it("dry-runs string and structured steps with deterministic IDs and no step titles", () => {
    const result = migrateLegacyRecipesDocument(legacyDocument(), options);
    expect(result).toMatchObject({ dryRun: true, total: 2, convertedCount: 2, skippedCount: 0 });

    const recipe = result.recipes[0];
    expect(recipe.ingredients.map((ingredient) => ingredient.id)).toEqual(["ingredient-1", "ingredient-2"]);
    expect(recipe.ingredients[0].name).toBe("オリーブオイル");
    expect(recipe.steps.map((step) => step.order)).toEqual([1, 2]);
    expect(recipe.steps[0]).toMatchObject({
      id: "step-1",
      text: "オリーブオイルを熱する。",
      ingredientRefs: [{ ingredientId: "ingredient-1", usage: "all" }],
    });
    expect("title" in recipe.steps[1]).toBe(false);
    expect(recipe.steps[1].ingredientRefs).toEqual([{ ingredientId: "ingredient-2", usage: "remaining" }]);
    expect(recipe.steps[1].timers).toEqual([{ id: "legacy-step-timer-1", label: "炒める", seconds: 120 }]);
    expect(recipe.source).toEqual({ type: "manual", url: null });
    expect(recipe.isFavorite).toBe(false);
    expect(recipe.updatedAt).toBe(recipe.createdAt);
    expect(result.warnings.map((item) => item.code)).toEqual(expect.arrayContaining([
      "step_title_dropped",
      "invalid_timer",
      "claude_source_mapped_manual",
    ]));
  });

  it("turns legacy numeric qualitative units into unscaled qualitative amounts", () => {
    const result = migrateLegacyRecipesDocument(legacyDocument(), options);
    const recipe = result.recipes[1];
    expect(recipe.ingredients[0]).toMatchObject({
      amountText: "少々",
      numericAmount: null,
      unit: "",
    });
    expect(recipe.steps[0].ingredientRefs).toEqual([{ ingredientId: "ingredient-1", usage: "all" }]);
  });

  it("produces identical output for repeated dry-runs with the same options", () => {
    const first = migrateLegacyRecipesDocument(legacyDocument(), options);
    const second = migrateLegacyRecipesDocument(legacyDocument(), options);
    expect(second).toEqual(first);
  });

  it("does not infer a short ingredient from inside another ingredient name", () => {
    const input = {
      recipes: [{
        id: "r_boundary",
        title: "境界確認",
        group: "side",
        servings: 1,
        ingredients: [{ name: "ねぎ", amount: 1, unit: "本" }],
        steps: ["玉ねぎを切る。"],
        tags: [],
        memo: "",
        source: "manual",
        created_at: "2026-07-31T00:00:00.000Z",
      }],
    };
    const result = migrateLegacyRecipesDocument(input, options);
    expect(result.recipes[0].steps[0].ingredientRefs).toEqual([]);
  });

  it("maps half, custom, and legacy hidden usage without duplicating top-level amounts", () => {
    const input = {
      recipes: [{
        id: "r_usage",
        title: "使用量確認",
        group: "side",
        servings: 2,
        ingredients: [
          { name: "材料A", amount: 2, unit: "個" },
          { name: "材料B", amount: 2, unit: "個" },
          { name: "材料C", amount: 2, unit: "個" },
        ],
        steps: [{
          text: "材料を使う。",
          ingredients: [
            { name: "材料A", amount: 1, unit: "個" },
            { name: "材料B", amount: 0.5, unit: "個" },
            { name: "材料C", amountMode: "hidden" },
          ],
          suggestedTimers: [],
        }],
        tags: [],
        memo: "",
        source: "manual",
        created_at: "2026-07-31T00:00:00.000Z",
      }],
    };
    const references = migrateLegacyRecipesDocument(input, options).recipes[0].steps[0].ingredientRefs;
    expect(references).toEqual([
      { ingredientId: "ingredient-1", usage: "half" },
      { ingredientId: "ingredient-2", usage: "custom", customAmountText: "1/2" },
      { ingredientId: "ingredient-3", usage: "custom" },
    ]);
  });

  it("keeps an unsupported serving count as an unresolved candidate without rounding", () => {
    const input = {
      recipes: [
        {
          ...legacyDocument().recipes[0],
          id: "bad-serving",
          servings: 3.5,
          memo: "人数以外は保持する",
        },
        { ...legacyDocument().recipes[0], id: "bad-ingredient", ingredients: [{ name: "玉ねぎ", amount: "約1個", unit: "個" }] },
      ],
    };
    const result = migrateLegacyRecipesDocument(input, options);
    expect(result).toMatchObject({
      total: 2,
      convertedCount: 0,
      candidateCount: 1,
      skippedCount: 1,
      recipes: [],
    });
    expect(result.candidates[0]).toMatchObject({
      id: "bad-serving",
      isFavorite: false,
      reason: "servings_requires_confirmation",
      draft: {
        title: "野菜炒め",
        servings: null,
        memo: "人数以外は保持する",
      },
    });
    expect(result.candidates[0].draft.ingredients).toHaveLength(2);
    expect(result.candidates[0].draft.steps).toHaveLength(2);
    expect(result.skipped[0].reasons.join(" ")).toContain("分量を解析できません");
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "servings_requires_confirmation" }),
    ]));
  });

  it("reports an invalid document without producing replacement data", () => {
    const result = migrateLegacyRecipesDocument({ recipes: "invalid" }, options);
    expect(result.recipes).toEqual([]);
    expect(result.documentErrors).toHaveLength(1);
  });
});
