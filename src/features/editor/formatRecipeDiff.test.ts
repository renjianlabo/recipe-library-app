import { describe, expect, it } from "vitest";

import type { RecipeDraft } from "@/domain/recipe";
import type { RecipeDiffChange } from "@/domain/recipe-diff";

import { formatRecipeDiffChange, formatTimerDuration } from "./formatRecipeDiff";

function draft(): RecipeDraft {
  return {
    title: "野菜炒め",
    category: "main",
    servings: 2,
    ingredients: [
      { id: "carrot", name: "にんじん", amountText: "1", numericAmount: 1, unit: "本", note: "" },
      { id: "garlic", name: "にんにく", amountText: "1", numericAmount: 1, unit: "片", note: "" },
    ],
    steps: [
      { id: "step-1", order: 1, text: "切る。", ingredientRefs: [], timers: [] },
      { id: "step-2", order: 2, text: "準備する。", ingredientRefs: [], timers: [] },
      { id: "step-3", order: 3, text: "炒める。", ingredientRefs: [], timers: [] },
      { id: "step-4", order: 4, text: "煮る。", ingredientRefs: [], timers: [] },
    ],
    tips: [],
    memo: "",
    tags: [],
    source: { type: "manual", url: null },
  };
}

function change(overrides: Partial<RecipeDiffChange>): RecipeDiffChange {
  return {
    kind: "changed",
    path: "title",
    label: "レシピ名",
    before: "変更前",
    after: "変更後",
    ...overrides,
  };
}

describe("formatRecipeDiffChange", () => {
  it("describes a newly used step ingredient by name and usage", () => {
    const before = draft();
    const after = draft();
    after.steps[2].ingredientRefs = [{ ingredientId: "carrot", usage: "all" }];

    const formatted = formatRecipeDiffChange(change({
      path: "steps.step-3.ingredientRefs",
      label: "工程の使用材料",
      before: [],
      after: after.steps[2].ingredientRefs,
    }), before, after);

    expect(formatted.label).toBe("工程3の材料");
    expect(formatted.details).toEqual(["にんじん 全量を追加"]);
  });

  it("shows timer labels and minute/second changes in Japanese", () => {
    const before = draft();
    const after = draft();
    before.steps[3].timers = [{ id: "timer-1", label: "煮込み", seconds: 300 }];
    after.steps[3].timers = [{ id: "timer-1", label: "煮込み", seconds: 480 }];

    const formatted = formatRecipeDiffChange(change({
      path: "steps.step-4.timers",
      label: "工程のタイマー",
      before: before.steps[3].timers,
      after: after.steps[3].timers,
    }), before, after);

    expect(formatted.label).toBe("工程4のタイマー");
    expect(formatted.details).toEqual(["煮込み：5分 → 8分"]);
  });

  it("formats added objects without exposing raw JSON", () => {
    const before = draft();
    const after = draft();
    const ingredient = after.ingredients[0];

    const formatted = formatRecipeDiffChange(change({
      kind: "added",
      path: "ingredients.carrot",
      label: "材料を追加",
      before: undefined,
      after: ingredient,
    }), before, after);

    expect(formatted.before).toBe("なし");
    expect(formatted.after).toBe("にんじん（1本）");
    expect(formatted.after).not.toContain("{");
    expect(formatted.after).not.toContain("\"");
  });

  it("formats hours, minutes, and seconds without zero-only suffixes", () => {
    expect(formatTimerDuration(30)).toBe("30秒");
    expect(formatTimerDuration(300)).toBe("5分");
    expect(formatTimerDuration(3_665)).toBe("1時間1分5秒");
  });
});
