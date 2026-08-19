import { describe, expect, it } from "vitest";

import { createRecipeBackup, validateRecipeBackup } from "./backup";
import { finalizeRecipeDraft, type RecipeDraft } from "./recipe";
import {
  MAX_SCREENSHOT_FILE_BYTES,
  MAX_SCREENSHOT_FILES,
  MAX_SCREENSHOT_TOTAL_BYTES,
  validateScreenshotFiles,
} from "./screenshot-validation";

function savedRecipe() {
  const draft: RecipeDraft = {
    title: "トースト",
    category: "staple",
    servings: 1,
    ingredients: [{ id: "bread", name: "食パン", amountText: "1", numericAmount: 1, unit: "枚", note: "" }],
    steps: [{ id: "step-1", order: 1, text: "焼く。", ingredientRefs: [{ ingredientId: "bread", usage: "all" }], timers: [] }],
    tips: [],
    memo: "",
    tags: [],
    source: { type: "manual", url: null },
  };
  return finalizeRecipeDraft(draft, {
    id: "recipe-1",
    userId: "user-1",
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
  });
}

describe("backup validation", () => {
  it("validates every recipe before returning restorable data", () => {
    const valid = createRecipeBackup([savedRecipe()], { theme: "system" }, "2026-07-31T01:00:00.000Z");
    expect(validateRecipeBackup(valid, "user-1")).toEqual({ success: true, backup: valid });

    const legacyRecipe: Record<string, unknown> = { ...valid.recipes[0] };
    delete legacyRecipe.isFavorite;
    const legacyResult = validateRecipeBackup({ ...valid, recipes: [legacyRecipe] }, "user-1");
    expect(legacyResult.success).toBe(true);
    if (legacyResult.success) expect(legacyResult.backup.recipes[0].isFavorite).toBe(false);

    const invalid = {
      ...valid,
      recipes: [valid.recipes[0], { ...valid.recipes[0], servings: 3.5 }],
    };
    const result = validateRecipeBackup(invalid, "user-1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some((issue) => issue.path.startsWith("recipes.1"))).toBe(true);
  });

  it("rejects unknown top-level fields and another user's data", () => {
    const valid = createRecipeBackup([savedRecipe()], {}, "2026-07-31T01:00:00.000Z");
    expect(validateRecipeBackup({ ...valid, extra: true }).success).toBe(false);
    expect(validateRecipeBackup(valid, "user-2")).toEqual({
      success: false,
      issues: [{ path: "recipes.0.userId", message: "別のユーザーのレシピは復元できません" }],
    });
  });
});

describe("screenshot limits", () => {
  const image = (overrides = {}) => ({ name: "recipe.png", type: "image/png", size: 1000, ...overrides });

  it("accepts supported images within count and size limits", () => {
    expect(validateScreenshotFiles([image(), image({ type: "image/jpeg" })])).toEqual({
      valid: true,
      totalBytes: 2000,
    });
  });

  it("reports count, type, per-file, and total-size violations", () => {
    expect(validateScreenshotFiles([])).toMatchObject({ valid: false, errors: [{ code: "empty" }] });
    const tooMany = validateScreenshotFiles(Array.from({ length: MAX_SCREENSHOT_FILES + 1 }, () => image()));
    expect(tooMany).toMatchObject({ valid: false });
    if (!tooMany.valid) expect(tooMany.errors.some((error) => error.code === "too_many_files")).toBe(true);

    const invalid = validateScreenshotFiles([
      image({ type: "image/svg+xml", size: MAX_SCREENSHOT_FILE_BYTES + 1 }),
      image({ size: MAX_SCREENSHOT_TOTAL_BYTES }),
    ]);
    expect(invalid.valid).toBe(false);
    if (!invalid.valid) {
      expect(invalid.errors.map((error) => error.code)).toEqual(expect.arrayContaining([
        "unsupported_type",
        "file_too_large",
        "total_too_large",
      ]));
    }
  });
});
