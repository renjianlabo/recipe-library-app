import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsHome } from "./SettingsHome";

const mocks = vi.hoisted(() => ({
  getIdToken: vi.fn<() => Promise<string>>(),
  signOutUser: vi.fn<() => Promise<void>>(),
  endDemo: vi.fn<() => Promise<void>>(),
  demo: false,
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    user: mocks.demo ? {
      uid: "demo-user",
      email: null,
      emailVerified: true,
      isDemo: true,
      getIdToken: mocks.getIdToken,
    } : {
      uid: "user-1",
      email: "cook@example.com",
      emailVerified: true,
      getIdToken: mocks.getIdToken,
    },
    loading: false,
    configured: true,
    accessError: null,
    demoStatus: mocks.demo ? { active: true, expiresAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(), aiLimit: 5, aiUsed: 2, aiRemaining: 3 } : { active: false },
    endDemo: mocks.endDemo,
    signOutUser: mocks.signOutUser,
  }),
}));

vi.mock("@/contexts/RecipeProvider", () => ({
  useRecipes: () => ({ recipes: [] }),
}));

describe("SettingsHome", () => {
  beforeEach(() => {
    mocks.getIdToken.mockReset().mockResolvedValue("id-token");
    mocks.signOutUser.mockReset().mockResolvedValue();
    mocks.endDemo.mockReset().mockResolvedValue();
    mocks.demo = false;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ configured: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("matches the Figma settings rows and checks AI status from the server", async () => {
    render(<SettingsHome />);

    expect(screen.getByText("データを書き出す")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /バックアップから復元/ })).toHaveAttribute("href", "/settings/data");
    expect(screen.queryByText("家にある調味料")).not.toBeInTheDocument();
    expect(await screen.findByText("利用可能")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/ai/status", expect.objectContaining({
      method: "GET",
      headers: expect.objectContaining({ Authorization: "Bearer id-token" }),
    }));
  });

  it("logs out from the settings top", async () => {
    render(<SettingsHome />);
    fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));
    await waitFor(() => expect(mocks.signOutUser).toHaveBeenCalledTimes(1));
  });

  it("shows demo details and requires confirmation before ending", async () => {
    mocks.demo = true;
    render(<SettingsHome />);
    expect(screen.getByText("残り 3 / 5 回")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ログアウト" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "デモを終了" }));
    expect(screen.getByRole("dialog", { name: "デモモードを終了しますか？" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(mocks.endDemo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "デモを終了" }));
    fireEvent.click(screen.getAllByRole("button", { name: "デモを終了" })[1]);
    await waitFor(() => expect(mocks.endDemo).toHaveBeenCalledTimes(1));
  });
});
