import type { AiModelOutput, RecipeDraft } from "../ai-schema";

export function recipeDraft(overrides: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    title: "親子丼",
    category: "main",
    servings: 2,
    ingredients: [{
      id: "ingredient-1",
      name: "卵",
      amountText: "2",
      numericAmount: 2,
      unit: "個",
      note: "",
    }],
    steps: [{
      id: "step-1",
      order: 1,
      text: "卵を加えて加熱する。",
      ingredientRefs: [{ ingredientId: "ingredient-1", usage: "all" }],
      timers: [],
    }],
    tips: [],
    memo: "",
    tags: ["丼"],
    source: { type: "text", url: null },
    ...overrides,
  };
}

export function modelOutput(overrides: Partial<AiModelOutput> = {}): AiModelOutput {
  return {
    draft: recipeDraft(),
    warnings: [],
    detectedServings: 2,
    ...overrides,
  };
}
