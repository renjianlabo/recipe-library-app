import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HomeView } from "./HomeView";

const auth = vi.hoisted(() => ({ demo: true }));
vi.mock("@/components/AuthGate", () => ({ AuthGate: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/contexts/AuthProvider", () => ({ useAuth: () => auth.demo ? ({ user: { isDemo: true }, demoStatus: { active: true, expiresAt: new Date(Date.now() + 5 * 60 * 60_000).toISOString(), aiLimit: 5, aiUsed: 1, aiRemaining: 4 }, endDemo: vi.fn() }) : ({ user: { isDemo: false }, demoStatus: { active: false }, endDemo: vi.fn() }) }));
vi.mock("@/contexts/RecipeProvider", () => ({ useRecipes: () => ({ recipes: [], loading: false, error: null }) }));

afterEach(cleanup);

describe("HomeView demo status", () => {
  it("shows the compact demo bar only for demo users", () => {
    auth.demo = true;
    const { rerender } = render(<HomeView />);
    expect(screen.getByText("デモモードで利用中")).toBeInTheDocument();
    expect(screen.getByText(/残り5時間/)).toBeInTheDocument();
    expect(screen.queryByText(/残り 4 \/ 5 回/)).not.toBeInTheDocument();
    auth.demo = false;
    rerender(<HomeView />);
    expect(screen.queryByText("デモモードで利用中")).not.toBeInTheDocument();
  });
});
