import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsHome } from "./SettingsHome";

const mocks = vi.hoisted(() => ({
  getIdToken: vi.fn<() => Promise<string>>(),
  signOutUser: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      uid: "user-1",
      email: "cook@example.com",
      emailVerified: true,
      getIdToken: mocks.getIdToken,
    },
    loading: false,
    configured: true,
    accessError: null,
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
});
