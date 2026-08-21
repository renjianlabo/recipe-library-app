import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecipeComplete } from "./RecipeComplete";
import { readCompletionReceipt, saveCompletionReceipt } from "./creation-session";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/components/AuthGate", () => ({ AuthGate: ({ children }: { children: ReactNode }) => children }));

beforeEach(() => {
  window.sessionStorage.clear();
  navigation.replace.mockReset();
});

afterEach(cleanup);

describe("RecipeComplete", () => {
  it("shows the saved title and opens the saved recipe", async () => {
    saveCompletionReceipt({ recipeId: "recipe-1", recipeTitle: "豚肉の生姜焼き" });
    render(<RecipeComplete />);

    expect(await screen.findByRole("heading", { name: "レシピを保存しました" })).toBeInTheDocument();
    expect(screen.getByText("豚肉の生姜焼き", { exact: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /レシピを見る/ }));
    expect(navigation.replace).toHaveBeenCalledWith("/recipes/recipe-1");
    expect(readCompletionReceipt()).toBeNull();
  });

  it("returns home from the secondary action", async () => {
    saveCompletionReceipt({ recipeId: "recipe-1", recipeTitle: "豚肉の生姜焼き" });
    render(<RecipeComplete />);
    fireEvent.click(await screen.findByRole("button", { name: "ホームへ" }));
    expect(navigation.replace).toHaveBeenCalledWith("/");
  });
});
