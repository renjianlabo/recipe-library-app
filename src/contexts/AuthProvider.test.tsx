import "@testing-library/jest-dom/vitest";

import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteRecipeLibraryLocalDatabase,
  listPendingWrites,
  loadCookingSession,
  loadLocalDraft,
  saveCookingSession,
  saveLocalDraft,
  savePendingWrite,
} from "@/lib/indexed-db";
import { DEMO_RECIPES_STORAGE_KEY, DEMO_SESSION_KEY } from "@/lib/demo-local";

import { AuthProvider, useAuth } from "./AuthProvider";

type TestUser = {
  uid: string;
  getIdToken: () => Promise<string>;
};

const firebaseMocks = vi.hoisted(() => ({
  auth: { currentUser: null as TestUser | null },
  listener: null as null | ((user: TestUser | null) => void | Promise<void>),
  unsubscribe: vi.fn(),
  getRedirectResult: vi.fn(),
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(),
}));
const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class {
    setCustomParameters() {}
  },
  getRedirectResult: firebaseMocks.getRedirectResult,
  onAuthStateChanged: firebaseMocks.onAuthStateChanged,
  signInWithPopup: firebaseMocks.signInWithPopup,
  signInWithRedirect: firebaseMocks.signInWithRedirect,
  signOut: firebaseMocks.signOut,
}));

vi.mock("@/lib/firebase-client", () => ({
  getFirebaseClient: () => ({ auth: firebaseMocks.auth }),
  hasFirebaseClientConfig: () => true,
}));

function SignOutHarness() {
  const { user, signOutUser } = useAuth();
  const [completed, setCompleted] = useState(false);
  return (
    <div>
      <p>{user?.uid ?? "ログイン待ち"}</p>
      <button type="button" onClick={() => void signOutUser().then(() => setCompleted(true))}>
        ログアウト
      </button>
      {completed ? <p>ログアウト完了</p> : null}
    </div>
  );
}

describe("AuthProvider logout", () => {
  beforeEach(async () => {
    cleanup();
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    await deleteRecipeLibraryLocalDatabase();
    firebaseMocks.auth.currentUser = null;
    firebaseMocks.listener = null;
    firebaseMocks.getRedirectResult.mockResolvedValue(null);
    firebaseMocks.signOut.mockResolvedValue(undefined);
    firebaseMocks.onAuthStateChanged.mockImplementation((_auth, listener) => {
      firebaseMocks.listener = listener;
      return firebaseMocks.unsubscribe;
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
  });

  afterEach(async () => {
    cleanup();
    vi.unstubAllGlobals();
    await deleteRecipeLibraryLocalDatabase();
  });

  it("clears only the current uid before Firebase sign-out", async () => {
    await saveLocalDraft("user-a", "draft", { title: "A" });
    await saveCookingSession("user-a", { recipeId: "recipe-a" });
    await savePendingWrite("user-a", "write", { title: "A" });
    await saveLocalDraft("user-b", "draft", { title: "B" });
    await saveCookingSession("user-b", { recipeId: "recipe-b" });
    await savePendingWrite("user-b", "write", { title: "B" });

    render(<AuthProvider><SignOutHarness /></AuthProvider>);
    await waitFor(() => expect(firebaseMocks.listener).not.toBeNull());

    const currentUser: TestUser = {
      uid: "user-a",
      getIdToken: vi.fn().mockResolvedValue("id-token"),
    };
    firebaseMocks.auth.currentUser = currentUser;
    await act(async () => {
      await firebaseMocks.listener?.(currentUser);
    });
    expect(screen.getByText("user-a")).toBeInTheDocument();

    firebaseMocks.signOut.mockImplementationOnce(async () => {
      await expect(loadLocalDraft("user-a", "draft")).resolves.toBeNull();
      await expect(loadCookingSession("user-a")).resolves.toBeNull();
      await expect(listPendingWrites("user-a")).resolves.toEqual([]);
      await expect(loadLocalDraft("user-b", "draft")).resolves.toEqual({ title: "B" });
    });

    fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));
    expect(await screen.findByText("ログアウト完了")).toBeInTheDocument();

    expect(firebaseMocks.signOut).toHaveBeenCalledWith(firebaseMocks.auth);
    await expect(loadLocalDraft("user-a", "draft")).resolves.toBeNull();
    await expect(loadCookingSession("user-a")).resolves.toBeNull();
    await expect(listPendingWrites("user-a")).resolves.toEqual([]);
    await expect(loadLocalDraft("user-b", "draft")).resolves.toEqual({ title: "B" });
    await expect(loadCookingSession("user-b")).resolves.toEqual({ recipeId: "recipe-b" });
    await expect(listPendingWrites("user-b")).resolves.toHaveLength(1);
  });

  it("clears expired demo data and returns to login before showing it", async () => {
    window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({ expiresAt: new Date(Date.now() - 1_000).toISOString() }));
    window.localStorage.setItem(DEMO_RECIPES_STORAGE_KEY, "[]");
    await saveLocalDraft("demo-user", "draft", { title: "expired" });

    render(<AuthProvider><SignOutHarness /></AuthProvider>);

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/login"));
    expect(window.localStorage.getItem(DEMO_SESSION_KEY)).toBeNull();
    expect(window.localStorage.getItem(DEMO_RECIPES_STORAGE_KEY)).toBeNull();
    await expect(loadLocalDraft("demo-user", "draft")).resolves.toBeNull();
    expect(screen.getByText("ログイン待ち")).toBeInTheDocument();
  });
});
