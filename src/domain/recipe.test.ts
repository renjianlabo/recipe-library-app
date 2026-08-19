import { describe, expect, it } from "vitest";

import {
  createEmptyRecipeDraft,
  finalizeRecipeDraft,
  normalizeRecipeDraft,
  recipeDraftSchema,
  recipeSchema,
  type RecipeDraft,
} from "./recipe";

function validDraft(overrides: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    title: "野菜炒め",
    category: "main",
    servings: 2,
    ingredients: [{
      id: "ingredient-1",
      name: "サラダ油",
      amountText: "1",
      numericAmount: 1,
      unit: "大さじ",
      note: "",
    }],
    steps: [{
      id: "step-1",
      order: 1,
      text: "サラダ油を熱して炒める。",
      ingredientRefs: [{ ingredientId: "ingredient-1", usage: "all" }],
      timers: [{ id: "timer-1", label: "炒める", seconds: 180 }],
    }],
    tips: ["強火で仕上げる"],
    memo: "",
    tags: ["時短"],
    source: { type: "manual", url: null },
    ...overrides,
  };
}

const metadata = {
  id: "recipe-1",
  userId: "user-1",
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z",
};

describe("recipe schemas", () => {
  it("provides an editor-safe empty draft and permits an unresolved AI serving count", () => {
    expect(recipeDraftSchema.safeParse(createEmptyRecipeDraft()).success).toBe(true);
    expect(recipeDraftSchema.safeParse(validDraft({ servings: null })).success).toBe(true);
    expect(recipeDraftSchema.safeParse(validDraft({
      tags: [""],
      tips: [""],
      steps: [{
        ...validDraft().steps[0],
        ingredientRefs: [{ ingredientId: "ingredient-1", usage: "custom", customAmountText: "50g" }],
        timers: [{ id: "timer-1", label: "", seconds: 0 }],
      }],
    })).success).toBe(true);
    expect(recipeDraftSchema.safeParse(validDraft({
      steps: [{
        ...validDraft().steps[0],
        ingredientRefs: [{ ingredientId: "ingredient-1", usage: "custom", customAmountText: "   " }],
      }],
    })).success).toBe(false);
  });

  it("normalizes a draft and finalizes a strict saved recipe", () => {
    const normalized = normalizeRecipeDraft(validDraft({ tags: [" 時短 ", "時短"] }));
    expect(normalized.ingredients[0].name).toBe("オリーブオイル");
    expect(normalized.steps[0].text).toContain("オリーブオイル");
    expect(normalized.tags).toEqual(["時短"]);

    const recipe = finalizeRecipeDraft(normalized, metadata);
    expect(recipeSchema.parse(recipe)).toEqual(recipe);
    expect(recipe.isFavorite).toBe(false);
    expect(recipeSchema.parse({ ...recipe, isFavorite: true }).isFavorite).toBe(true);
    expect(recipe.nutrition).toEqual({
      calories: null,
      carbohydrates: null,
      protein: null,
      fat: null,
      fiber: null,
      salt: null,
      calculatedAt: null,
    });
  });

  it("fills isFavorite for existing stored recipes that predate the field", () => {
    const current = finalizeRecipeDraft(validDraft(), metadata);
    const legacyStoredRecipe: Record<string, unknown> = { ...current };
    delete legacyStoredRecipe.isFavorite;
    delete legacyStoredRecipe.seasonings;
    expect(recipeSchema.parse(legacyStoredRecipe).isFavorite).toBe(false);
    expect(recipeSchema.parse(legacyStoredRecipe).seasonings).toBeUndefined();
  });

  it("rejects unresolved or unsupported servings at finalization", () => {
    expect(() => finalizeRecipeDraft(validDraft({ servings: null }), metadata)).toThrow();
    expect(recipeDraftSchema.safeParse({ ...validDraft(), servings: 3.5 }).success).toBe(false);
  });

  it("enforces source URL rules", () => {
    expect(recipeDraftSchema.safeParse(validDraft({
      source: { type: "manual", url: "https://example.com" },
    })).success).toBe(false);
    expect(recipeDraftSchema.safeParse(validDraft({
      source: { type: "youtube", url: null },
    })).success).toBe(false);
    expect(recipeDraftSchema.safeParse(validDraft({
      source: { type: "website", url: "ftp://example.com/recipe" },
    })).success).toBe(false);
    expect(recipeDraftSchema.safeParse(validDraft({
      source: { type: "youtube", url: "https://www.youtube.com/watch?v=abc" },
    })).success).toBe(true);
  });

  it("is strict and never accepts an old step title", () => {
    const recipe = finalizeRecipeDraft(validDraft(), metadata);
    expect(recipeSchema.safeParse({ ...recipe, unexpected: true }).success).toBe(false);
    expect(recipeSchema.safeParse({
      ...recipe,
      steps: [{ ...recipe.steps[0], title: "旧タイトル" }],
    }).success).toBe(false);
  });

  it("checks order, unique IDs, valid references, and timer limits", () => {
    const missingReference = validDraft({
      steps: [{
        ...validDraft().steps[0],
        ingredientRefs: [{ ingredientId: "missing", usage: "all" }],
      }],
    });
    expect(recipeDraftSchema.safeParse(missingReference).success).toBe(false);

    const badOrder = validDraft({ steps: [{ ...validDraft().steps[0], order: 2 }] });
    expect(recipeDraftSchema.safeParse(badOrder).success).toBe(false);

    const badTimer = validDraft({
      steps: [{ ...validDraft().steps[0], timers: [{ id: "timer-1", label: "長すぎ", seconds: 86_401 }] }],
    });
    expect(recipeDraftSchema.safeParse(badTimer).success).toBe(false);

    const duplicateIngredients = validDraft({
      ingredients: [validDraft().ingredients[0], { ...validDraft().ingredients[0] }],
    });
    expect(recipeDraftSchema.safeParse(duplicateIngredients).success).toBe(false);
  });

  it("requires qualitative amount text to remain non-numeric", () => {
    const invalid = validDraft({
      ingredients: [{
        ...validDraft().ingredients[0],
        amountText: "少々",
        numericAmount: 0.1,
        unit: "",
      }],
    });
    expect(recipeDraftSchema.safeParse(invalid).success).toBe(false);

    const normalized = normalizeRecipeDraft(validDraft({
      ingredients: [{
        ...validDraft().ingredients[0],
        amountText: "0.1",
        numericAmount: 0.1,
        unit: "少々",
      }],
    }));
    expect(normalized.ingredients[0]).toMatchObject({
      amountText: "少々",
      numericAmount: null,
      unit: "",
    });
  });

  it("accepts string amounts and keeps qualitative values unchanged", () => {
    for (const amountText of ["300", "0.5", "1/2", "少々", "適量", "適宜", "ひとつまみ"]) {
      const numericAmount = ["300", "0.5", "1/2"].includes(amountText)
        ? Number(amountText === "1/2" ? 0.5 : amountText)
        : null;
      const draft = validDraft({
        ingredients: [{ ...validDraft().ingredients[0], amountText, numericAmount }],
      });
      expect(recipeDraftSchema.safeParse(draft).success).toBe(true);
      expect(normalizeRecipeDraft(draft).ingredients[0].amountText).toBe(amountText);
    }
  });

  it("adds seasonings without reclassifying legacy ingredients and allows step references to both", () => {
    const draft = validDraft({
      seasonings: [{
        id: "seasoning-1",
        name: "しょうゆ",
        amountText: "適量",
        numericAmount: null,
        unit: "",
        note: "仕上げ用",
      }],
      steps: [{
        ...validDraft().steps[0],
        ingredientRefs: [
          { ingredientId: "ingredient-1", usage: "all" },
          { ingredientId: "seasoning-1", usage: "all" },
        ],
      }],
    });
    const normalized = normalizeRecipeDraft(draft);
    expect(normalized.ingredients.map((item) => item.id)).toEqual(["ingredient-1"]);
    expect(normalized.seasonings?.map((item) => item.id)).toEqual(["seasoning-1"]);
    expect(recipeDraftSchema.safeParse(normalized).success).toBe(true);
  });
});
