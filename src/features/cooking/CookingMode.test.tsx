import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Recipe } from "@/domain/recipe";
import {
  deleteRecipeLibraryLocalDatabase,
  loadCookingSession,
  saveCookingSession,
} from "@/lib/indexed-db";

import { CookingMode } from "./CookingMode";
import {
  createCookingSession,
  createCookingTimer,
  finishCookingTimer,
  moveCookingStep,
  type CookingSession,
} from "./cooking-core";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

function recipe(userId = "user-1", id = "recipe-1"): Recipe {
  return {
    id,
    userId,
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
    ],
    seasonings: [{
      id: "seasoning-salt",
      name: "塩",
      amountText: "少々",
      numericAmount: null,
      unit: "",
      note: "",
    }],
    steps: [
      {
        id: "step-1",
        order: 1,
        text: "玉ねぎを炒める。",
        ingredientRefs: [
          { ingredientId: "ingredient-onion", usage: "half" },
          { ingredientId: "seasoning-salt", usage: "all" },
        ],
        timers: [{ id: "timer-suggestion", label: "炒める", seconds: 180 }],
      },
      {
        id: "step-2",
        order: 2,
        text: "残りの玉ねぎを加える。",
        ingredientRefs: [{ ingredientId: "ingredient-onion", usage: "remaining" }],
        timers: [],
      },
    ],
    tips: [],
    memo: "",
    tags: [],
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
  };
}

describe("CookingMode", () => {
  beforeEach(async () => {
    navigation.push.mockReset();
    await deleteRecipeLibraryLocalDatabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the step body before its derived ingredients and runs concurrent timers", async () => {
    render(<CookingMode uid="user-1" recipe={recipe()} />);

    const ingredientHeading = await screen.findByRole("heading", { name: "この工程で使う材料・調味料" });
    const stepText = screen.getByText("玉ねぎを炒める。");
    expect(stepText.compareDocumentPosition(ingredientHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("0.5個（半量）")).toBeInTheDocument();
    expect(screen.getByText("少々")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /全材料を見る/ }));
    const materialsDialog = await screen.findByRole("dialog", { name: "全材料" });
    const materialsSheetClass = materialsDialog.querySelector("section")?.className;
    expect(within(materialsDialog).getByRole("heading", { name: "調味料" })).toBeInTheDocument();
    expect(within(materialsDialog).getByText("塩")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    const suggestion = screen.getByRole("button", { name: "炒める 3:00 開始" });
    fireEvent.click(suggestion);
    fireEvent.click(suggestion);

    await waitFor(() => {
      expect(document.querySelectorAll("[data-timer-id]")).toHaveLength(2);
    });
    const timerHeading = screen.getByRole("heading", { name: /^タイマー$/ });
    const timerSection = timerHeading.closest("section");
    if (!timerSection) throw new Error("timer section was not rendered");
    const addButton = within(timerSection).getByRole("button", { name: "＋ タイマーを追加" });
    const firstTimer = timerSection.querySelector("[data-timer-id]");
    if (!firstTimer) throw new Error("compact timer row was not rendered");
    expect(addButton.compareDocumentPosition(firstTimer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(timerSection).queryByRole("button", { name: /一時停止|再開|\+1分|終了|削除/ })).not.toBeInTheDocument();

    fireEvent.click(within(timerSection).getAllByRole("button", { name: "炒めるを閉じる" })[0]);
    expect(timerSection.querySelectorAll("[data-timer-id]")).toHaveLength(1);

    fireEvent.click(addButton);
    const timerDialog = await screen.findByRole("dialog", { name: "タイマーを追加" });
    expect(timerDialog.querySelector("section")?.className).toContain(String(materialsSheetClass).split(" ")[0]);
    expect(timerDialog.closest("main")?.querySelector("[aria-describedby='swipe-hint'] form")).toBeNull();
  });

  it("completes only through the final button and has no meal logging flow", async () => {
    const source = recipe("user-2", "recipe-2");
    render(<CookingMode uid="user-2" recipe={source} />);

    fireEvent.click(await screen.findByRole("button", { name: "炒める 3:00 開始" }));
    fireEvent.click(await screen.findByRole("button", { name: "次へ" }));
    expect(await screen.findByText("残りの玉ねぎを加える。")).toBeInTheDocument();
    expect(screen.getByText("残り")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "完成" }));

    expect(await screen.findByText("料理が完成しました")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "レシピへ戻る" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "料理を終了する" })).toBeInTheDocument();
    expect(screen.queryByText(/食事として記録|食べた/)).not.toBeInTheDocument();
    expect(document.querySelectorAll("[data-timer-id]")).toHaveLength(0);
    await waitFor(async () => {
      const stored = await loadCookingSession<CookingSession>("user-2");
      expect(stored?.timers).toEqual([]);
      expect(stored?.usedTimerNumbers).toEqual([]);
      expect(stored?.recipe.steps[0].timers).toEqual(source.steps[0].timers);
    });
  });

  it("keeps cooking usable when a stored recipe contains an invalid timer suggestion", async () => {
    const source = recipe("user-invalid", "recipe-invalid");
    source.steps[0].timers = [{ id: "invalid", label: "無効", seconds: 0 }];
    render(<CookingMode uid="user-invalid" recipe={source} />);

    expect(await screen.findByText("玉ねぎを炒める。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /無効/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    expect(await screen.findByText("工程 2 / 2")).toBeInTheDocument();
  });

  it("offers to resume the UID-scoped step and timer state", async () => {
    const now = Date.now();
    const source = recipe("user-3", "recipe-3");
    const base = createCookingSession({ uid: "user-3", recipe: source }, now, "session-restore");
    const timer = createCookingTimer({
      label: "保存タイマー",
      durationSeconds: 300,
      sourceStepId: "step-1",
    }, now, "timer-restore");
    if (!timer) throw new Error("timer fixture failed");
    const stored = {
      ...moveCookingStep(base, 1, now),
      timers: [timer],
    };
    await saveCookingSession("user-3", stored);

    render(<CookingMode uid="user-3" recipe={source} />);
    expect(await screen.findByRole("heading", { name: "続きから再開しますか？" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "続きから再開" }));

    expect(await screen.findByText("工程 2 / 2")).toBeInTheDocument();
    expect(screen.getByText("保存タイマー")).toBeInTheDocument();
  });

  it("keeps the current step and concurrent timers when the same recipe version is re-rendered", async () => {
    const source = recipe("user-4", "recipe-4");
    const { rerender } = render(<CookingMode uid="user-4" recipe={source} />);

    const suggestion = await screen.findByRole("button", { name: "炒める 3:00 開始" });
    fireEvent.click(suggestion);
    fireEvent.click(suggestion);
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    expect(await screen.findByText("工程 2 / 2")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-timer-id]")).toHaveLength(2);

    rerender(<CookingMode uid="user-4" recipe={{ ...source }} />);

    expect(screen.queryByRole("heading", { name: "続きから再開しますか？" })).not.toBeInTheDocument();
    expect(screen.getByText("工程 2 / 2")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-timer-id]")).toHaveLength(2);
  });

  it("keeps a finished timer visible as a compact row until its close button is pressed", async () => {
    const now = Date.now();
    const source = recipe("user-finished", "recipe-finished");
    const base = createCookingSession({ uid: "user-finished", recipe: source }, now, "session-finished");
    const timer = createCookingTimer({ label: "煮込み", durationSeconds: 10 }, now, "timer-finished");
    if (!timer) throw new Error("timer fixture failed");
    await saveCookingSession("user-finished", {
      ...base,
      timers: [finishCookingTimer(timer, now + 10_000)],
    });

    render(<CookingMode uid="user-finished" recipe={source} />);
    fireEvent.click(await screen.findByRole("button", { name: "続きから再開" }));

    expect(screen.getByText("煮込み")).toBeInTheDocument();
    expect(screen.getByText("00:00")).toBeInTheDocument();
    expect(screen.getByText("終了")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "煮込みを閉じる" }));
    expect(screen.queryByText("00:00")).not.toBeInTheDocument();
  });

  it("adds automatically named session-only timers with the wheel picker and keeps them across steps", async () => {
    const source = recipe("user-wheel", "recipe-wheel");
    render(<CookingMode uid="user-wheel" recipe={source} />);

    fireEvent.click(await screen.findByRole("button", { name: "＋ タイマーを追加" }));
    let timerDialog = screen.getByRole("dialog", { name: "タイマーを追加" });
    fireEvent.click(within(timerDialog).getByRole("option", { name: "0", selected: false }));
    const startButtonAtZero = within(timerDialog).getByRole("button", { name: "タイマーを開始" });
    expect(startButtonAtZero).toBeDisabled();
    fireEvent.click(within(timerDialog).getByRole("listbox", { name: "秒" }).querySelector("[role='option']:nth-of-type(2)") as Element);
    expect(startButtonAtZero).toBeEnabled();
    fireEvent.click(startButtonAtZero);
    expect(await screen.findByText("タイマー1")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "タイマーを追加" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "＋ タイマーを追加" }));
    timerDialog = screen.getByRole("dialog", { name: "タイマーを追加" });
    fireEvent.click(within(timerDialog).getByRole("button", { name: "タイマーを開始" }));
    expect(await screen.findByText("タイマー2")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-timer-id]")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "タイマー1を閉じる" }));
    expect(screen.queryByText("タイマー1")).not.toBeInTheDocument();
    expect(screen.getByText("タイマー2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "＋ タイマーを追加" }));
    timerDialog = screen.getByRole("dialog", { name: "タイマーを追加" });
    fireEvent.click(within(timerDialog).getByRole("button", { name: "タイマーを開始" }));
    expect(await screen.findByText("タイマー3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    expect(await screen.findByText("工程 2 / 2")).toBeInTheDocument();
    expect(screen.getByText("タイマー2")).toBeInTheDocument();
    expect(screen.getByText("タイマー3")).toBeInTheDocument();

    await waitFor(async () => {
      const stored = await loadCookingSession<CookingSession>("user-wheel");
      expect(stored?.recipe.steps[0].timers).toEqual(source.steps[0].timers);
      expect(stored?.timers.filter((timer) => timer.sourceStepId === null)).toHaveLength(2);
      expect(stored?.usedTimerNumbers).toEqual([1, 2, 3]);
    });

    fireEvent.click(screen.getByRole("button", { name: "タイマー2を閉じる" }));
    expect(screen.queryByText("タイマー2")).not.toBeInTheDocument();
    expect(screen.getByText("タイマー3")).toBeInTheDocument();
    const timerSection = screen.getByRole("heading", { name: /^タイマー$/ }).closest("section");
    if (!timerSection) throw new Error("timer section was not rendered");
    for (const removedLabel of ["一時停止", "再開", "+1分", "終了", "削除"]) {
      expect(within(timerSection).queryByRole("button", { name: new RegExp(`^${removedLabel.replace("+", "\\+")}$`) })).not.toBeInTheDocument();
    }
  });

  it("dismisses the timer-name keyboard on Enter without starting or resetting the timer draft", async () => {
    render(<CookingMode uid="user-enter" recipe={recipe("user-enter", "recipe-enter")} />);

    fireEvent.click(await screen.findByRole("button", { name: "＋ タイマーを追加" }));
    const timerDialog = screen.getByRole("dialog", { name: "タイマーを追加" });
    const nameInput = within(timerDialog).getByRole("textbox", { name: "タイマー名" });
    const minuteWheel = within(timerDialog).getByRole("listbox", { name: "分" });
    const secondWheel = within(timerDialog).getByRole("listbox", { name: "秒" });

    fireEvent.change(nameInput, { target: { value: "煮込み" } });
    fireEvent.click(within(minuteWheel).getByRole("option", { name: "10" }));
    fireEvent.click(within(secondWheel).getByRole("option", { name: "30" }));
    nameInput.focus();
    fireEvent.keyDown(nameInput, { key: "Enter", code: "Enter" });

    expect(document.activeElement).not.toBe(nameInput);
    expect(screen.getByRole("dialog", { name: "タイマーを追加" })).toBeInTheDocument();
    expect(nameInput).toHaveValue("煮込み");
    expect(within(minuteWheel).getByRole("option", { name: "10", selected: true })).toBeInTheDocument();
    expect(within(secondWheel).getByRole("option", { name: "30", selected: true })).toBeInTheDocument();
    expect(document.querySelectorAll("[data-timer-id]")).toHaveLength(0);

    fireEvent.submit(nameInput.closest("form") as HTMLFormElement);
    expect(document.querySelectorAll("[data-timer-id]")).toHaveLength(0);
    fireEvent.click(within(timerDialog).getByRole("button", { name: "タイマーを開始" }));
    expect(await screen.findByText("煮込み")).toBeInTheDocument();
  });

  it("plays one short two-tone notification per finished timer and none after deletion or completion", async () => {
    let currentTime = 1_000;
    const ticks: Array<() => void> = [];
    const oscillatorStart = vi.fn();
    const resume = vi.fn(function (this: { state: AudioContextState }) {
      this.state = "running";
      return Promise.resolve();
    });
    class AudioContextMock {
      state: AudioContextState = "suspended";
      currentTime = 0;
      destination = {};
      resume = resume;
      createOscillator() {
        return {
          type: "sine",
          frequency: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: oscillatorStart,
          stop: vi.fn(),
        };
      }
      createGain() {
        return {
          gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
        };
      }
    }
    vi.spyOn(Date, "now").mockImplementation(() => currentTime);
    vi.spyOn(window, "setInterval").mockImplementation(((callback: TimerHandler) => {
      if (typeof callback === "function") ticks.push(() => callback());
      return 1;
    }) as typeof window.setInterval);
    Object.defineProperty(window, "AudioContext", { configurable: true, value: AudioContextMock });

    render(<CookingMode uid="user-audio" recipe={recipe("user-audio", "recipe-audio")} />);
    const addTimer = await screen.findByRole("button", { name: "＋ タイマーを追加" });

    const startTenSecondTimer = (label: string) => {
      fireEvent.click(addTimer);
      const dialog = screen.getByRole("dialog", { name: "タイマーを追加" });
      fireEvent.change(within(dialog).getByRole("textbox", { name: "タイマー名" }), { target: { value: label } });
      const minuteWheel = within(dialog).getByRole("listbox", { name: "分" });
      fireEvent.click(within(minuteWheel).getByRole("option", { name: "0" }));
      const secondWheel = within(dialog).getByRole("listbox", { name: "秒" });
      fireEvent.click(within(secondWheel).getByRole("option", { name: "10" }));
      fireEvent.click(within(dialog).getByRole("button", { name: "タイマーを開始" }));
    };

    startTenSecondTimer("煮込み");
    startTenSecondTimer("蒸らし");
    expect(resume).toHaveBeenCalled();

    currentTime = 11_000;
    act(() => ticks[0]());
    expect(oscillatorStart).toHaveBeenCalledTimes(4);
    act(() => ticks[0]());
    expect(oscillatorStart).toHaveBeenCalledTimes(4);

    startTenSecondTimer("削除するタイマー");
    fireEvent.click(screen.getByRole("button", { name: "削除するタイマーを閉じる" }));
    currentTime = 21_000;
    act(() => ticks[0]());
    expect(oscillatorStart).toHaveBeenCalledTimes(4);

    startTenSecondTimer("完成時タイマー");
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    fireEvent.click(screen.getByRole("button", { name: "完成" }));
    currentTime = 31_000;
    act(() => ticks[0]());
    expect(oscillatorStart).toHaveBeenCalledTimes(4);
    expect(document.querySelectorAll("[data-timer-id]")).toHaveLength(0);
  });
});
