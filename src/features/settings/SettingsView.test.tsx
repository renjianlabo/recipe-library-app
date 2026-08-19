import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRecipeBackup } from "@/domain/backup";
import type { Recipe } from "@/domain/recipe";

import { SettingsView } from "./SettingsView";

const mocks = vi.hoisted(() => {
  const getIdToken = vi.fn<() => Promise<string>>();
  const signOutUser = vi.fn<() => Promise<void>>();
  return {
    getIdToken,
    signOutUser,
    restoreRecipes: vi.fn<(recipes: Recipe[]) => Promise<void>>(),
    authValue: {
      user: {
        uid: "user-1",
        displayName: "料理 太郎",
        email: "cook@example.com",
        getIdToken,
      },
      loading: false,
      configured: true,
      accessError: null,
      signIn: vi.fn<() => Promise<void>>(),
      signOutUser,
      getIdToken,
    },
  };
});

const recipe: Recipe = {
  id: "recipe-1",
  userId: "user-1",
  title: "トースト",
  category: "staple",
  servings: 1,
  ingredients: [{ id: "bread", name: "食パン", amountText: "1", numericAmount: 1, unit: "枚", note: "" }],
  steps: [{
    id: "step-1",
    order: 1,
    text: "焼く。",
    ingredientRefs: [{ ingredientId: "bread", usage: "all" }],
    timers: [],
  }],
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
  isFavorite: false,
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z",
};

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => mocks.authValue,
}));

vi.mock("@/contexts/RecipeProvider", () => ({
  useRecipes: () => ({
    recipes: [recipe],
    loading: false,
    error: null,
    getRecipe: vi.fn(),
    saveRecipe: vi.fn(),
    deleteRecipe: vi.fn(),
    restoreRecipes: mocks.restoreRecipes,
  }),
}));

function jsonFile(text: string, name = "backup.json"): File {
  const file = new File([text], name, { type: "application/json" });
  Object.defineProperty(file, "text", {
    configurable: true,
    value: vi.fn().mockResolvedValue(text),
  });
  return file;
}

describe("SettingsView", () => {
  beforeEach(() => {
    mocks.getIdToken.mockReset().mockResolvedValue("id-token");
    mocks.signOutUser.mockReset().mockResolvedValue();
    mocks.restoreRecipes.mockReset().mockResolvedValue();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      configured: true,
      model: "gemini-test",
      youtubeConfigured: false,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps the advanced data screen focused on backup and migration", () => {
    render(<SettingsView />);

    expect(screen.getByRole("heading", { name: "データを書き出す・復元", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "設定へ戻る" })).toHaveAttribute("href", "/settings");
    expect(screen.queryByText("AI機能を利用できます")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ログアウト" })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not restore invalid JSON and retains the selected file", async () => {
    render(<SettingsView />);
    const input = screen.getByLabelText("現在形式のバックアップJSON") as HTMLInputElement;
    const file = jsonFile("{broken");

    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("復元できません。現在のデータは変更されていません。")).toBeInTheDocument();
    expect(mocks.restoreRecipes).not.toHaveBeenCalled();
    expect(input.files?.[0]).toBe(file);
  });

  it("describes the upsert behavior, requires confirmation, and retains the preview after a restore failure", async () => {
    mocks.restoreRecipes.mockRejectedValueOnce(new Error("Firestore unavailable"));
    render(<SettingsView />);
    const input = screen.getByLabelText("現在形式のバックアップJSON") as HTMLInputElement;
    const backup = createRecipeBackup([recipe], {}, "2026-07-31T12:34:56.000Z");
    const file = jsonFile(JSON.stringify(backup));

    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText("1件のレシピを復元できます。")).toBeInTheDocument();
    const restoreButton = screen.getByRole("button", { name: "確認した内容で一括復元" });
    expect(restoreButton).toBeDisabled();
    expect(mocks.restoreRecipes).not.toHaveBeenCalled();
    expect(screen.getByText(/バックアップに含まれない現在のレシピは残ります。/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(
      "レシピを上書き・追加し、バックアップに含まれない現在のレシピは残ることを確認しました",
    ));
    expect(restoreButton).toBeEnabled();
    fireEvent.click(restoreButton);

    await waitFor(() => expect(mocks.restoreRecipes).toHaveBeenCalledWith([recipe]));
    expect(await screen.findByText(/Firestore unavailable.*ファイルと確認結果は保持されています。/)).toBeInTheDocument();
    expect(screen.getByText("1件のレシピを復元できます。")).toBeInTheDocument();
    expect(input.files?.[0]).toBe(file);
  });

  it("shows a legacy dry-run report before enabling conversion", async () => {
    render(<SettingsView />);
    const input = screen.getByLabelText("旧形式のrecipes.json");
    const file = jsonFile(JSON.stringify({
      recipes: [
        {
          id: "legacy-toast",
          title: "旧トースト",
          group: "staple",
          servings: 1,
          ingredients: [{ id: "bread", name: "食パン", amount: 1, unit: "枚" }],
          steps: ["食パンを焼く。"],
          source: "manual",
        },
        { id: "broken", group: "unknown", servings: 7, ingredients: [], steps: [] },
      ],
    }), "recipes.json");

    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText(/dry-run: 2件中 1件をそのまま変換でき、0件は人数確認が必要です。/)).toBeInTheDocument();
    expect(screen.getByText("スキップ理由 1件")).toBeInTheDocument();
    const restoreButton = screen.getByRole("button", { name: "確認した旧データを変換・復元" });
    expect(restoreButton).toBeDisabled();
    expect(mocks.restoreRecipes).not.toHaveBeenCalled();
  });

  it("requires a serving choice for every legacy candidate and retains it after restore failure", async () => {
    mocks.restoreRecipes.mockRejectedValueOnce(new Error("Firestore unavailable"));
    render(<SettingsView />);
    const input = screen.getByLabelText("旧形式のrecipes.json") as HTMLInputElement;
    const file = jsonFile(JSON.stringify({
      recipes: [{
        id: "legacy-stew",
        title: "旧シチュー",
        group: "main",
        servings: 3.5,
        ingredients: [{ id: "potato", name: "じゃがいも", amount: 2, unit: "個" }],
        steps: ["じゃがいもを煮る。"],
        source: "manual",
      }],
    }), "recipes.json");

    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("人数の確認が必要なレシピ")).toBeInTheDocument();
    expect(screen.getByText("人数確認待ち").parentElement).toHaveTextContent("1件");
    const servingSelect = screen.getByLabelText("旧シチューの人数") as HTMLSelectElement;
    const restoreButton = screen.getByRole("button", { name: "確認した旧データを変換・復元" });
    fireEvent.click(screen.getByLabelText("dry-run結果を確認し、レシピを上書き・追加することを確認しました"));
    expect(restoreButton).toBeDisabled();
    expect(mocks.restoreRecipes).not.toHaveBeenCalled();

    fireEvent.change(servingSelect, { target: { value: "3" } });
    expect(servingSelect).toHaveValue("3");
    expect(restoreButton).toBeEnabled();
    fireEvent.click(restoreButton);

    await waitFor(() => expect(mocks.restoreRecipes).toHaveBeenCalledWith([
      expect.objectContaining({ id: "legacy-stew", title: "旧シチュー", servings: 3 }),
    ]));
    expect(await screen.findByText(/Firestore unavailable.*ファイルとdry-run結果は保持されています。/)).toBeInTheDocument();
    expect(servingSelect).toHaveValue("3");
    expect(input.files?.[0]).toBe(file);
  });

});
