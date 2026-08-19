import { describe, expect, it } from "vitest";

import type { Recipe } from "@/domain/recipe";

import {
  MAX_TIMER_SECONDS,
  addCookingTimerSeconds,
  completeCookingSession,
  cookingSessionSchema,
  createCookingSession,
  createCookingTimer,
  deleteCookingSessionTimer,
  deriveStepIngredients,
  finishCookingTimer,
  getSwipeDirection,
  moveCookingStep,
  nextSwipeStepIndex,
  pauseCookingTimer,
  reconcileCookingTimers,
  remainingTimerSeconds,
  restoreCookingSession,
  resumeCookingTimer,
  updateCookingSessionTimer,
} from "./cooking-core";

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "recipe-1",
    userId: "user-1",
    isFavorite: false,
    title: "野菜炒め",
    category: "main",
    servings: 2,
    ingredients: [
      {
        id: "ingredient-onion",
        name: "玉ねぎ",
        amountText: "1",
        numericAmount: 1,
        unit: "個",
        note: "",
      },
      {
        id: "ingredient-salt",
        name: "塩",
        amountText: "少々",
        numericAmount: null,
        unit: "",
        note: "",
      },
    ],
    steps: [
      {
        id: "step-1",
        order: 1,
        text: "玉ねぎを炒める。",
        ingredientRefs: [
          { ingredientId: "ingredient-onion", usage: "half" },
          { ingredientId: "ingredient-salt", usage: "all" },
        ],
        timers: [{ id: "suggestion-1", label: "炒める", seconds: 180 }],
      },
      {
        id: "step-2",
        order: 2,
        text: "残りを加える。",
        ingredientRefs: [
          { ingredientId: "ingredient-onion", usage: "remaining" },
          { ingredientId: "ingredient-salt", usage: "custom", customAmountText: "ひとつまみ" },
        ],
        timers: [],
      },
    ],
    tips: [],
    memo: "",
    tags: ["時短"],
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
    ...overrides,
  };
}

describe("cooking sessions", () => {
  it("stores an immutable recipe snapshot, uid, servings, and STEP 1", () => {
    const source = recipe();
    const session = createCookingSession(
      { uid: "user-1", recipe: source, selectedServings: 4 },
      1_000,
      "session-1",
    );

    expect(session).toMatchObject({
      schemaVersion: 1,
      uid: "user-1",
      sessionId: "session-1",
      recipeId: "recipe-1",
      selectedServings: 4,
      currentStepIndex: 0,
      timers: [],
      status: "active",
      startedAt: 1_000,
      updatedAt: 1_000,
      completedAt: null,
    });
    expect(session.recipe).not.toBe(source);
    source.title = "変更後";
    expect(session.recipe.title).toBe("野菜炒め");
  });

  it("rejects a recipe owned by another user and unsupported servings", () => {
    expect(() => createCookingSession({ uid: "user-2", recipe: recipe() })).toThrow(
      "recipe must belong to the cooking user",
    );
    expect(() => createCookingSession({
      uid: "user-1",
      recipe: recipe({ servings: 5 as Recipe["servings"] }),
    })).toThrow("unsupported serving count");
  });

  it("drops an invalid suggested timer without breaking the cooking session", () => {
    const source = recipe();
    source.steps[0].timers = [{ id: "broken-timer", label: "壊れた候補", seconds: 0 }];
    const session = createCookingSession({ uid: "user-1", recipe: source }, 1_000, "session-1");
    expect(session.recipe.steps[0].timers).toEqual([]);
    expect(session.recipe.steps[0].text).toBe("玉ねぎを炒める。");
  });

  it("moves only within step bounds and completes explicitly", () => {
    const session = createCookingSession({ uid: "user-1", recipe: recipe() }, 1_000, "session-1");
    expect(moveCookingStep(session, 99, 2_000).currentStepIndex).toBe(1);
    expect(moveCookingStep(session, -1, 2_000).currentStepIndex).toBe(0);

    const completed = completeCookingSession(session, 3_000);
    expect(completed).toMatchObject({ status: "completed", completedAt: 3_000, updatedAt: 3_000 });
  });

  it("restores with Zod, clamps the step, and rejects wrong users or corrupt state", () => {
    const session = createCookingSession({ uid: "user-1", recipe: recipe() }, 1_000, "session-1");
    const serialized = JSON.stringify({ ...session, currentStepIndex: 99 });
    expect(restoreCookingSession(serialized, "user-1", 2_000)?.currentStepIndex).toBe(1);
    expect(restoreCookingSession(serialized, "user-2", 2_000)).toBeNull();
    expect(restoreCookingSession("{broken", "user-1", 2_000)).toBeNull();
    expect(restoreCookingSession({ ...session, schemaVersion: 99 }, "user-1", 2_000)).toBeNull();
  });

  it("rejects timer references to missing steps", () => {
    const session = createCookingSession({ uid: "user-1", recipe: recipe() }, 1_000, "session-1");
    const timer = createCookingTimer({ durationSeconds: 60, sourceStepId: "missing" }, 1_000, "timer-1");
    const result = cookingSessionSchema.safeParse({ ...session, timers: [timer] });
    expect(result.success).toBe(false);
  });
});

describe("timestamp-based multiple timers", () => {
  it("pauses, resumes, adds one minute, and finishes without drift", () => {
    const timer = createCookingTimer(
      { durationSeconds: 300, label: "パスタ", sourceStepId: "step-1" },
      1_000,
      "timer-1",
    );
    expect(timer).not.toBeNull();
    if (!timer) return;

    expect(remainingTimerSeconds(timer, 31_000)).toBe(270);
    const paused = pauseCookingTimer(timer, 31_000);
    expect(paused.status).toBe("paused");
    expect(remainingTimerSeconds(paused, 91_000)).toBe(270);

    const extended = addCookingTimerSeconds(paused);
    expect(extended?.durationSeconds).toBe(360);
    if (!extended) return;
    const resumed = resumeCookingTimer(extended, 91_000);
    expect(resumed.accumulatedPausedMs).toBe(60_000);
    expect(remainingTimerSeconds(resumed, 121_000)).toBe(300);

    const finished = finishCookingTimer(resumed, 122_000);
    expect(finished).toMatchObject({ status: "finished", pausedAt: null, finishedAt: 122_000 });
    expect(remainingTimerSeconds(finished, 200_000)).toBe(0);
  });

  it("enforces one second through 24 hours including extensions", () => {
    expect(createCookingTimer({ durationSeconds: 0 }, 0, "bad")).toBeNull();
    expect(createCookingTimer({ durationSeconds: MAX_TIMER_SECONDS + 1 }, 0, "bad")).toBeNull();
    const maximum = createCookingTimer({ durationSeconds: MAX_TIMER_SECONDS }, 0, "maximum");
    expect(maximum).not.toBeNull();
    if (!maximum) return;
    expect(addCookingTimerSeconds(maximum)).toBeNull();
    expect(addCookingTimerSeconds(maximum, 0)).toBeNull();
  });

  it("restores multiple timers and marks only expired running timers finished", () => {
    const base = createCookingSession({ uid: "user-1", recipe: recipe() }, 0, "session-1");
    const short = createCookingTimer({ durationSeconds: 30, sourceStepId: "step-1" }, 0, "short");
    const long = createCookingTimer({ durationSeconds: 120, sourceStepId: "step-2" }, 0, "long");
    if (!short || !long) throw new Error("timer fixture failed");
    const paused = pauseCookingTimer(long, 10_000);
    const session = { ...base, timers: [short, paused] };

    const reconciled = reconcileCookingTimers(session, 60_000);
    expect(reconciled.newlyFinished.map((timer) => timer.id)).toEqual(["short"]);
    expect(reconciled.session.timers[0].status).toBe("finished");
    expect(reconciled.session.timers[1].status).toBe("paused");
    expect(remainingTimerSeconds(reconciled.session.timers[1], 60_000)).toBe(110);

    const restored = restoreCookingSession(JSON.stringify(session), "user-1", 60_000);
    expect(restored?.timers.map((timer) => timer.status)).toEqual(["finished", "paused"]);
  });

  it("requires pausedAt and finishedAt for their corresponding persisted states", () => {
    const session = createCookingSession({ uid: "user-1", recipe: recipe() }, 0, "session-1");
    const timer = createCookingTimer({ durationSeconds: 60, sourceStepId: "step-1" }, 0, "timer-1");
    if (!timer) throw new Error("timer fixture failed");

    expect(restoreCookingSession({ ...session, timers: [{ ...timer, status: "paused" }] }, "user-1", 0)).toBeNull();
    expect(restoreCookingSession({ ...session, timers: [{ ...timer, status: "finished" }] }, "user-1", 0)).toBeNull();
  });

  it("updates and deletes one timer without affecting concurrent timers", () => {
    const session = createCookingSession({ uid: "user-1", recipe: recipe() }, 0, "session-1");
    const first = createCookingTimer({ durationSeconds: 60, sourceStepId: "step-1" }, 0, "first");
    const second = createCookingTimer({ durationSeconds: 120, sourceStepId: "step-2" }, 0, "second");
    if (!first || !second) throw new Error("timer fixture failed");
    const withTimers = { ...session, timers: [first, second] };

    const paused = updateCookingSessionTimer(withTimers, "first", (timer) => pauseCookingTimer(timer, 10_000), 10_000);
    expect(paused.timers.map((timer) => timer.status)).toEqual(["paused", "running"]);
    expect(deleteCookingSessionTimer(paused, "first", 11_000).timers.map((timer) => timer.id)).toEqual(["second"]);
  });
});

describe("derived cooking ingredients", () => {
  it("derives current servings and half usage without duplicating recipe values", () => {
    const source = recipe();
    const result = deriveStepIngredients(source, source.steps[0], 4);

    expect(result).toEqual([
      expect.objectContaining({
        ingredientId: "ingredient-onion",
        amountText: "1",
        unit: "個",
        usage: "half",
        usageLabel: "半量",
        displayAmount: "1個（半量）",
      }),
      expect.objectContaining({
        ingredientId: "ingredient-salt",
        amountText: "少々",
        usage: "all",
        displayAmount: "少々",
      }),
    ]);
    expect(source.ingredients[0].numericAmount).toBe(1);
  });

  it("preserves remaining and custom semantics", () => {
    const source = recipe();
    const result = deriveStepIngredients(source, source.steps[1], 4);
    expect(result.map((item) => item.displayAmount)).toEqual(["残り", "ひとつまみ"]);
    expect(result.map((item) => item.usage)).toEqual(["remaining", "custom"]);
  });

  it("scales a numeric custom amount and keeps the top-level ingredient unit", () => {
    const source = recipe();
    const customStep = {
      ...source.steps[0],
      ingredientRefs: [{
        ingredientId: "ingredient-onion",
        usage: "custom" as const,
        customAmountText: "1/4",
      }],
    };
    expect(deriveStepIngredients(source, customStep, 4)[0]).toMatchObject({
      amountText: "1/2",
      unit: "個",
      displayAmount: "1/2個",
    });
  });

  it("scales a custom amount containing its own continuous unit", () => {
    const source = recipe();
    const customStep = {
      ...source.steps[0],
      ingredientRefs: [{
        ingredientId: "ingredient-onion",
        usage: "custom" as const,
        customAmountText: "50g",
      }],
    };
    expect(deriveStepIngredients(source, customStep, 4)[0]).toMatchObject({
      amountText: "100",
      unit: "g",
      displayAmount: "100g",
    });
  });

});

describe("swipe navigation", () => {
  it("requires one touch, 60px, and horizontal dominance", () => {
    expect(getSwipeDirection({ x: 100, y: 20 }, { x: 40, y: 20 })).toBe("left");
    expect(getSwipeDirection({ x: 40, y: 20 }, { x: 100, y: 20 })).toBe("right");
    expect(getSwipeDirection({ x: 100, y: 20 }, { x: 41, y: 20 })).toBeNull();
    expect(getSwipeDirection({ x: 100, y: 20 }, { x: 0, y: 110 })).toBeNull();
    expect(getSwipeDirection({ x: 100, y: 20 }, { x: 0, y: 20 }, 2)).toBeNull();
  });

  it("stays within bounds and never completes on the last left swipe", () => {
    expect(nextSwipeStepIndex(0, 3, "right")).toBe(0);
    expect(nextSwipeStepIndex(0, 3, "left")).toBe(1);
    expect(nextSwipeStepIndex(1, 3, "right")).toBe(0);
    expect(nextSwipeStepIndex(2, 3, "left")).toBe(2);
  });
});
