import { describe, expect, it } from "vitest";

import {
  MAX_RECIPE_TIMER_SECONDS,
  recipeTimerDraftSchema,
  recipeTimerSchema,
} from "./recipe";

function messages(result: ReturnType<typeof recipeTimerSchema.safeParse>): string[] {
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("recipe timer validation", () => {
  it("returns Japanese errors for zero, negative, excessive, and blank-equivalent values", () => {
    expect(messages(recipeTimerSchema.safeParse({ id: "timer-1", label: "煮る", seconds: 0 })))
      .toContain("タイマー時間は1秒以上で入力してください");
    expect(messages(recipeTimerSchema.safeParse({ id: "timer-1", label: "煮る", seconds: -1 })))
      .toContain("タイマー時間は1秒以上で入力してください");
    expect(messages(recipeTimerSchema.safeParse({
      id: "timer-1",
      label: "煮る",
      seconds: MAX_RECIPE_TIMER_SECONDS + 1,
    }))).toContain("タイマー時間は24時間以内で入力してください");

    const blank = recipeTimerDraftSchema.safeParse({ id: "timer-1", label: "煮る", seconds: Number.NaN });
    expect(blank.success).toBe(false);
    if (!blank.success) {
      expect(blank.error.issues.map((issue) => issue.message)).toContain("タイマー時間を入力してください");
    }
  });

  it("uses a Japanese error for a blank saved timer name", () => {
    expect(messages(recipeTimerSchema.safeParse({ id: "timer-1", label: "", seconds: 60 })))
      .toContain("タイマー名を入力してください");
  });
});
