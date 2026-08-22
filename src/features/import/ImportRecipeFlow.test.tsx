import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImportRecipeFlow } from "./ImportRecipeFlow";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
const api = vi.hoisted(() => ({ authenticatedJson: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/components/AuthGate", () => ({ AuthGate: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/contexts/AuthProvider", () => ({ useAuth: () => ({ user: { uid: "user-1" } }) }));
vi.mock("@/lib/authenticated-api", () => ({ authenticatedJson: api.authenticatedJson }));

const response = {
  draft: {
    title: "テストレシピ",
    category: "main",
    servings: null,
    ingredients: [],
    seasonings: [],
    steps: [],
    tips: [],
    memo: "",
    tags: [],
    source: { type: "text", url: null },
  },
  warnings: [],
  needsServingsConfirmation: true,
  detectedServings: null,
};

beforeEach(() => {
  window.sessionStorage.clear();
  navigation.push.mockReset();
  api.authenticatedJson.mockReset().mockResolvedValue(response);
});

afterEach(cleanup);

describe("ImportRecipeFlow primary action", () => {
  it("renders one floating action and keeps the existing submit flow", async () => {
    render(<ImportRecipeFlow mode="ai" />);
    fireEvent.change(screen.getByPlaceholderText("レシピの文章やURLを貼り付けてください"), { target: { value: "テスト入力" } });

    const actions = screen.getAllByRole("button", { name: /AIでレシピを作成/ });
    expect(actions).toHaveLength(1);
    expect(actions[0].closest("footer")).toHaveClass("ai-create-actions", "floating-action-bar");
    fireEvent.click(actions[0]);

    await waitFor(() => expect(api.authenticatedJson).toHaveBeenCalledTimes(1));
    expect(navigation.push).toHaveBeenCalledWith("/create/ai/review");
  });

  it("keeps the single floating action disabled while AI creation is running", async () => {
    let resolveRequest: ((value: typeof response) => void) | undefined;
    api.authenticatedJson.mockReturnValueOnce(new Promise<typeof response>((resolve) => { resolveRequest = resolve; }));
    render(<ImportRecipeFlow mode="ai" />);
    fireEvent.change(screen.getByPlaceholderText("レシピの文章やURLを貼り付けてください"), { target: { value: "テスト入力" } });
    fireEvent.click(screen.getByRole("button", { name: /AIでレシピを作成/ }));

    const loadingButton = await screen.findByRole("button", { name: "レシピを作成中…" });
    expect(loadingButton).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "レシピを作成中…" })).toHaveLength(1);

    resolveRequest?.(response);
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/create/ai/review"));
  });
});
