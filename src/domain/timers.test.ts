import { describe, expect, it } from "vitest";

import {
  TIMER_MINUTE_OPTIONS,
  TIMER_SECOND_OPTIONS,
  formatTimerDurationJa,
  nextTimerLabel,
  timerDurationSeconds,
  timerNumberFromLabel,
} from "./timers";

describe("timer helpers", () => {
  it("uses 0-60 minutes and only ten-second increments below 60", () => {
    expect(TIMER_MINUTE_OPTIONS).toEqual(Array.from({ length: 61 }, (_, index) => index));
    expect(TIMER_SECOND_OPTIONS).toEqual([0, 10, 20, 30, 40, 50]);
    expect(timerDurationSeconds(60, 50)).toBe(3_650);
    expect(timerDurationSeconds(0, 0)).toBeNull();
    expect(timerDurationSeconds(5, 60)).toBeNull();
  });

  it("assigns the first unused sequential default name", () => {
    expect(nextTimerLabel([])).toBe("タイマー1");
    expect(nextTimerLabel(["煮込み", "タイマー1", "タイマー3"])).toBe("タイマー2");
    expect(timerNumberFromLabel("タイマー12")).toBe(12);
    expect(timerNumberFromLabel("煮込み")).toBeNull();
  });

  it("formats compact Japanese durations", () => {
    expect(formatTimerDurationJa(30)).toBe("30秒");
    expect(formatTimerDurationJa(600)).toBe("10分");
    expect(formatTimerDurationJa(630)).toBe("10分30秒");
  });
});
