import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("shows the step body before its derived ingredients and runs concurrent timers", async () => {
    render(<CookingMode uid="user-1" recipe={recipe()} />);

    const ingredientHeading = await screen.findByRole("heading", { name: "この工程で使う材料・調味料" });
    const stepText = screen.getByText("玉ねぎを炒める。");
    expect(stepText.compareDocumentPosition(ingredientHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("0.5個（半量）")).toBeInTheDocument();
    expect(screen.getByText("少々")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /全材料を見る/ }));
    const materialsDialog = await screen.findByRole("dialog", { name: "全材料" });
    expect(within(materialsDialog).getByRole("heading", { name: "調味料" })).toBeInTheDocument();
    expect(within(materialsDialog).getByText("塩")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    const suggestion = screen.getByRole("button", { name: "炒める 3:00 開始" });
    fireEvent.click(suggestion);
    fireEvent.click(suggestion);

    await waitFor(() => {
      expect(screen.getAllByRole("heading", { name: "炒める" })).toHaveLength(2);
    });
    expect(screen.getAllByRole("button", { name: "一時停止" })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "一時停止" })[0]);
    expect(await screen.findByRole("button", { name: "再開" })).toBeInTheDocument();
  });

  it("completes only through the final button and has no meal logging flow", async () => {
    render(<CookingMode uid="user-2" recipe={recipe("user-2", "recipe-2")} />);

    fireEvent.click(await screen.findByRole("button", { name: "次へ" }));
    expect(await screen.findByText("残りの玉ねぎを加える。")).toBeInTheDocument();
    expect(screen.getByText("残り")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "完成" }));

    expect(await screen.findByText("料理が完成しました")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "レシピへ戻る" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "料理を終了する" })).toBeInTheDocument();
    expect(screen.queryByText(/食事として記録|食べた/)).not.toBeInTheDocument();
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
    expect(screen.getByRole("heading", { name: "保存タイマー" })).toBeInTheDocument();
  });

  it("keeps the current step and concurrent timers when the same recipe version is re-rendered", async () => {
    const source = recipe("user-4", "recipe-4");
    const { rerender } = render(<CookingMode uid="user-4" recipe={source} />);

    const suggestion = await screen.findByRole("button", { name: "炒める 3:00 開始" });
    fireEvent.click(suggestion);
    fireEvent.click(suggestion);
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));

    expect(await screen.findByText("工程 2 / 2")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "炒める" })).toHaveLength(2);

    rerender(<CookingMode uid="user-4" recipe={{ ...source }} />);

    expect(screen.queryByRole("heading", { name: "続きから再開しますか？" })).not.toBeInTheDocument();
    expect(screen.getByText("工程 2 / 2")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "炒める" })).toHaveLength(2);
  });

  it("adds automatically named session-only timers with the wheel picker and keeps them across steps", async () => {
    const source = recipe("user-wheel", "recipe-wheel");
    render(<CookingMode uid="user-wheel" recipe={source} />);

    fireEvent.click(await screen.findByRole("button", { name: "＋ タイマーを追加" }));
    fireEvent.click(within(screen.getByRole("listbox", { name: "分" })).getByRole("option", { name: "0" }));
    fireEvent.click(within(screen.getByRole("listbox", { name: "秒" })).getByRole("option", { name: "10" }));
    fireEvent.click(screen.getByRole("button", { name: "タイマーを開始" }));
    expect(await screen.findByRole("heading", { name: "タイマー1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "＋ タイマーを追加" }));
    fireEvent.click(screen.getByRole("button", { name: "タイマーを開始" }));
    expect(await screen.findByRole("heading", { name: "タイマー2" })).toBeInTheDocument();

    const firstTimerCard = screen.getByRole("heading", { name: "タイマー1" }).closest("article");
    if (!firstTimerCard) throw new Error("first timer card was not rendered");
    fireEvent.click(within(firstTimerCard).getByRole("button", { name: "一時停止" }));
    expect(within(firstTimerCard).getByRole("button", { name: "再開" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    expect(await screen.findByText("工程 2 / 2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "タイマー1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "タイマー2" })).toBeInTheDocument();

    await waitFor(async () => {
      const stored = await loadCookingSession<CookingSession>("user-wheel");
      expect(stored?.recipe.steps[0].timers).toEqual(source.steps[0].timers);
      expect(stored?.timers.filter((timer) => timer.sourceStepId === null)).toHaveLength(2);
    });

    const secondTimerCard = screen.getByRole("heading", { name: "タイマー2" }).closest("article");
    if (!secondTimerCard) throw new Error("second timer card was not rendered");
    fireEvent.click(within(firstTimerCard).getByRole("button", { name: "削除" }));
    expect(screen.queryByRole("heading", { name: "タイマー1" })).not.toBeInTheDocument();
    expect(within(secondTimerCard).getByRole("heading", { name: "タイマー2" })).toBeInTheDocument();
  });
});
