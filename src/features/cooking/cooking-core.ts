import { z } from "zod";

import {
  ALLOWED_SERVINGS,
  MAX_RECIPE_TIMER_SECONDS,
  allowedServingSchema,
  recipeSchema,
  type AllowedServing,
  type Recipe,
} from "@/domain/recipe";
import { timerNumberFromLabel } from "@/domain/timers";

export { deriveStepIngredients } from "@/domain/step-ingredients";
export type { DerivedStepIngredient } from "@/domain/step-ingredients";

export const COOKING_SESSION_SCHEMA_VERSION = 1 as const;
export const MAX_TIMER_SECONDS = MAX_RECIPE_TIMER_SECONDS;
export const SUPPORTED_SERVINGS = ALLOWED_SERVINGS;
export const SWIPE_THRESHOLD_PX = 60;
export const SWIPE_HORIZONTAL_RATIO = 1.2;

export const SWIPE_EXCLUDED_SELECTOR = [
  "button",
  "input",
  "select",
  "textarea",
  "a",
  "summary",
  "dialog",
  '[role="button"]',
  "[data-swipe-ignore]",
  "[data-timer-id]",
  ".cooking-timers",
  ".cooking-timer-form",
].join(",");

export type SupportedServings = AllowedServing;
export type CookingTimerStatus = "running" | "paused" | "finished";

export interface CookingTimer {
  id: string;
  label: string;
  durationSeconds: number;
  startedAt: number;
  pausedAt: number | null;
  accumulatedPausedMs: number;
  status: CookingTimerStatus;
  sourceStepId: string | null;
  createdAt: number;
  finishedAt: number | null;
}

export interface CookingSession {
  schemaVersion: typeof COOKING_SESSION_SCHEMA_VERSION;
  uid: string;
  sessionId: string;
  recipeId: string;
  recipe: Recipe;
  selectedServings: SupportedServings | null;
  currentStepIndex: number;
  timers: CookingTimer[];
  usedTimerNumbers: number[];
  status: "active" | "completed";
  startedAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface SwipePoint {
  x: number;
  y: number;
}

export const cookingTimerSchema = z
  .object({
    id: z.string().trim().min(1),
    label: z.string().trim().min(1).max(80),
    durationSeconds: z.number().int().min(1).max(MAX_TIMER_SECONDS),
    startedAt: z.number().finite().nonnegative(),
    pausedAt: z.number().finite().nonnegative().nullable(),
    accumulatedPausedMs: z.number().finite().nonnegative(),
    status: z.enum(["running", "paused", "finished"]),
    sourceStepId: z.string().trim().min(1).nullable(),
    createdAt: z.number().finite().nonnegative(),
    finishedAt: z.number().finite().nonnegative().nullable(),
  })
  .strict()
  .superRefine((timer, context) => {
    if (timer.status === "paused" && timer.pausedAt === null) {
      context.addIssue({ code: "custom", message: "paused timer requires pausedAt", path: ["pausedAt"] });
    }
    if (timer.status !== "paused" && timer.pausedAt !== null) {
      context.addIssue({ code: "custom", message: "only paused timer may have pausedAt", path: ["pausedAt"] });
    }
    if (timer.status === "finished" && timer.finishedAt === null) {
      context.addIssue({ code: "custom", message: "finished timer requires finishedAt", path: ["finishedAt"] });
    }
    if (timer.status !== "finished" && timer.finishedAt !== null) {
      context.addIssue({ code: "custom", message: "only finished timer may have finishedAt", path: ["finishedAt"] });
    }
  });

export const cookingSessionSchema = z
  .object({
    schemaVersion: z.literal(COOKING_SESSION_SCHEMA_VERSION),
    uid: z.string().trim().min(1),
    sessionId: z.string().trim().min(1),
    recipeId: z.string().trim().min(1),
    recipe: recipeSchema,
    selectedServings: allowedServingSchema.nullable(),
    currentStepIndex: z.number().int().nonnegative(),
    timers: z.array(cookingTimerSchema),
    usedTimerNumbers: z.array(z.number().int().positive()).default([]),
    status: z.enum(["active", "completed"]),
    startedAt: z.number().finite().nonnegative(),
    updatedAt: z.number().finite().nonnegative(),
    completedAt: z.number().finite().nonnegative().nullable(),
  })
  .strict()
  .superRefine((session, context) => {
    if (session.uid !== session.recipe.userId) {
      context.addIssue({ code: "custom", message: "recipe user does not match session user", path: ["recipe", "userId"] });
    }
    if (session.recipeId !== session.recipe.id) {
      context.addIssue({ code: "custom", message: "recipe id does not match snapshot", path: ["recipeId"] });
    }
    if (session.status === "completed" && session.completedAt === null) {
      context.addIssue({ code: "custom", message: "completed session requires completedAt", path: ["completedAt"] });
    }
    if (session.status === "active" && session.completedAt !== null) {
      context.addIssue({ code: "custom", message: "active session cannot have completedAt", path: ["completedAt"] });
    }

    const stepIds = new Set(session.recipe.steps.map((step) => step.id));
    session.timers.forEach((timer, index) => {
      if (timer.sourceStepId !== null && !stepIds.has(timer.sourceStepId)) {
        context.addIssue({
          code: "custom",
          message: "timer source step does not exist",
          path: ["timers", index, "sourceStepId"],
        });
      }
    });
  });

function makeId(prefix: string, now: number): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Math.round(now)}-${randomId}`;
}

function cloneRecipe(recipe: Recipe): Recipe {
  const cloned = JSON.parse(JSON.stringify(recipe)) as Recipe;
  return {
    ...cloned,
    steps: cloned.steps.map((step) => ({
      ...step,
      timers: step.timers.filter((timer) => (
        typeof timer.label === "string"
        && timer.label.trim().length > 0
        && Number.isInteger(timer.seconds)
        && timer.seconds >= 1
        && timer.seconds <= MAX_TIMER_SECONDS
      )),
    })),
  };
}

function safeNow(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new TypeError("now must be a non-negative finite number");
  return value;
}

export function isSupportedServings(value: unknown): value is SupportedServings {
  return SUPPORTED_SERVINGS.includes(value as SupportedServings);
}

export function createCookingSession(
  input: { uid: string; recipe: Recipe; selectedServings?: SupportedServings | null },
  now = Date.now(),
  sessionId?: string,
): CookingSession {
  const timestamp = safeNow(now);
  const uid = input.uid.trim();
  if (!uid || input.recipe.userId !== uid) throw new TypeError("recipe must belong to the cooking user");
  if (input.recipe.steps.length === 0) throw new TypeError("recipe has no cooking steps");
  const selectedServings = input.selectedServings ?? input.recipe.servings;
  if (selectedServings !== null && !isSupportedServings(selectedServings)) {
    throw new TypeError("unsupported serving count");
  }

  const session: CookingSession = {
    schemaVersion: COOKING_SESSION_SCHEMA_VERSION,
    uid,
    sessionId: sessionId?.trim() || makeId("cooking", timestamp),
    recipeId: input.recipe.id,
    recipe: cloneRecipe(input.recipe),
    selectedServings,
    currentStepIndex: 0,
    timers: [],
    usedTimerNumbers: [],
    status: "active",
    startedAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
  };
  return cookingSessionSchema.parse(session) as CookingSession;
}

export function createCookingTimer(
  input: { label?: string; durationSeconds: number; sourceStepId?: string | null },
  now = Date.now(),
  id?: string,
): CookingTimer | null {
  const timestamp = safeNow(now);
  if (!Number.isInteger(input.durationSeconds) || input.durationSeconds < 1 || input.durationSeconds > MAX_TIMER_SECONDS) {
    return null;
  }
  const timer: CookingTimer = {
    id: id?.trim() || makeId("timer", timestamp),
    label: input.label?.trim() || "タイマー",
    durationSeconds: input.durationSeconds,
    startedAt: timestamp,
    pausedAt: null,
    accumulatedPausedMs: 0,
    status: "running",
    sourceStepId: input.sourceStepId?.trim() || null,
    createdAt: timestamp,
    finishedAt: null,
  };
  const result = cookingTimerSchema.safeParse(timer);
  return result.success ? (result.data as CookingTimer) : null;
}

export function remainingTimerSeconds(timer: CookingTimer, now = Date.now()): number {
  if (timer.status === "finished") return 0;
  const timestamp = safeNow(now);
  const effectiveNow = timer.status === "paused" ? (timer.pausedAt ?? timestamp) : timestamp;
  const elapsedMs = Math.max(0, effectiveNow - timer.startedAt - timer.accumulatedPausedMs);
  return Math.max(0, Math.ceil((timer.durationSeconds * 1_000 - elapsedMs) / 1_000));
}

export function finishCookingTimer(timer: CookingTimer, now = Date.now()): CookingTimer {
  if (timer.status === "finished") return { ...timer };
  const timestamp = safeNow(now);
  return {
    ...timer,
    status: "finished",
    pausedAt: null,
    finishedAt: timestamp,
  };
}

export function pauseCookingTimer(timer: CookingTimer, now = Date.now()): CookingTimer {
  if (timer.status !== "running") return { ...timer };
  const timestamp = safeNow(now);
  if (remainingTimerSeconds(timer, timestamp) === 0) return finishCookingTimer(timer, timestamp);
  return { ...timer, status: "paused", pausedAt: timestamp };
}

export function resumeCookingTimer(timer: CookingTimer, now = Date.now()): CookingTimer {
  if (timer.status !== "paused") return { ...timer };
  const timestamp = safeNow(now);
  const pausedAt = timer.pausedAt ?? timestamp;
  return {
    ...timer,
    status: "running",
    pausedAt: null,
    accumulatedPausedMs: timer.accumulatedPausedMs + Math.max(0, timestamp - pausedAt),
  };
}

export function addCookingTimerSeconds(timer: CookingTimer, seconds = 60): CookingTimer | null {
  if (
    timer.status === "finished" ||
    !Number.isInteger(seconds) ||
    seconds < 1 ||
    timer.durationSeconds + seconds > MAX_TIMER_SECONDS
  ) {
    return null;
  }
  return { ...timer, durationSeconds: timer.durationSeconds + seconds };
}

export function reconcileCookingTimers(
  session: CookingSession,
  now = Date.now(),
): { session: CookingSession; newlyFinished: CookingTimer[] } {
  const timestamp = safeNow(now);
  const newlyFinished: CookingTimer[] = [];
  const timers = session.timers.map((timer) => {
    if (timer.status !== "running" || remainingTimerSeconds(timer, timestamp) > 0) return timer;
    const finished = finishCookingTimer(timer, timestamp);
    newlyFinished.push(finished);
    return finished;
  });
  if (!newlyFinished.length) return { session, newlyFinished };
  return { session: { ...session, timers, updatedAt: timestamp }, newlyFinished };
}

export function updateCookingSessionTimer(
  session: CookingSession,
  timerId: string,
  transform: (timer: CookingTimer) => CookingTimer | null,
  now = Date.now(),
): CookingSession {
  const index = session.timers.findIndex((timer) => timer.id === timerId);
  if (index < 0) return session;
  const timer = transform(session.timers[index]);
  if (!timer) return session;
  const timers = [...session.timers];
  timers[index] = timer;
  return { ...session, timers, updatedAt: safeNow(now) };
}

export function deleteCookingSessionTimer(session: CookingSession, timerId: string, now = Date.now()): CookingSession {
  const timers = session.timers.filter((timer) => timer.id !== timerId);
  return timers.length === session.timers.length ? session : { ...session, timers, updatedAt: safeNow(now) };
}

export function moveCookingStep(session: CookingSession, requestedIndex: number, now = Date.now()): CookingSession {
  const maximum = Math.max(0, session.recipe.steps.length - 1);
  const index = Math.min(Math.max(Number.isInteger(requestedIndex) ? requestedIndex : 0, 0), maximum);
  return index === session.currentStepIndex
    ? session
    : { ...session, currentStepIndex: index, updatedAt: safeNow(now) };
}

export function completeCookingSession(session: CookingSession, now = Date.now()): CookingSession {
  if (session.status === "completed") return session;
  const timestamp = safeNow(now);
  return {
    ...session,
    timers: [],
    usedTimerNumbers: [],
    status: "completed",
    completedAt: timestamp,
    updatedAt: timestamp,
  };
}

export function restoreCookingSession(value: unknown, expectedUid: string, now = Date.now()): CookingSession | null {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  const parsed = cookingSessionSchema.safeParse(candidate);
  if (!parsed.success || parsed.data.uid !== expectedUid.trim()) return null;

  const maximum = parsed.data.recipe.steps.length - 1;
  const currentStepIndex = Math.min(parsed.data.currentStepIndex, maximum);
  const timers = parsed.data.timers.map((timer) => (
    timer.status === "paused" ? resumeCookingTimer(timer as CookingTimer, now) : timer
  ));
  const usedTimerNumbers = Array.from(new Set([
    ...parsed.data.usedTimerNumbers,
    ...timers
      .map((timer) => timerNumberFromLabel(timer.label))
      .filter((value): value is number => value !== null),
  ]));
  const restored = { ...parsed.data, currentStepIndex, timers, usedTimerNumbers } as CookingSession;
  return reconcileCookingTimers(restored, now).session;
}

export function getSwipeDirection(
  start: SwipePoint | null,
  end: SwipePoint | null,
  touchCount = 1,
): "left" | "right" | null {
  if (!start || !end || touchCount !== 1) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy) * SWIPE_HORIZONTAL_RATIO) {
    return null;
  }
  return dx < 0 ? "left" : "right";
}

export function nextSwipeStepIndex(
  currentIndex: number,
  stepCount: number,
  direction: "left" | "right" | null,
): number {
  const maximum = Math.max(0, stepCount - 1);
  const index = Math.min(Math.max(Number.isInteger(currentIndex) ? currentIndex : 0, 0), maximum);
  if (direction === "left" && index < maximum) return index + 1;
  if (direction === "right" && index > 0) return index - 1;
  return index;
}
