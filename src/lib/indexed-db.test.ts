import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearLocalDataForUser,
  deleteCookingSession,
  deleteLocalDraft,
  deletePendingWrite,
  deleteRecipeLibraryLocalDatabase,
  listPendingWrites,
  loadCookingSession,
  loadLocalDraft,
  saveCookingSession,
  saveLocalDraft,
  savePendingWrite,
} from "./indexed-db";

describe("IndexedDB local persistence", () => {
  beforeEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await deleteRecipeLibraryLocalDatabase();
  });

  it("isolates drafts with both uid and draft key", async () => {
    await saveLocalDraft("user-a", "new", { title: "A" });
    await saveLocalDraft("user-b", "new", { title: "B" });

    await expect(loadLocalDraft("user-a", "new")).resolves.toEqual({ title: "A" });
    await expect(loadLocalDraft("user-b", "new")).resolves.toEqual({ title: "B" });
    await expect(loadLocalDraft("user-a", "missing")).resolves.toBeNull();

    await deleteLocalDraft("user-a", "new");
    await expect(loadLocalDraft("user-a", "new")).resolves.toBeNull();
    await expect(loadLocalDraft("user-b", "new")).resolves.toEqual({ title: "B" });
  });

  it("stores one active cooking session per user", async () => {
    await saveCookingSession("user-a", { recipeId: "recipe-1", currentStepIndex: 2 });
    await saveCookingSession("user-a", { recipeId: "recipe-1", currentStepIndex: 3 });
    await saveCookingSession("user-b", { recipeId: "recipe-2", currentStepIndex: 1 });

    await expect(loadCookingSession("user-a")).resolves.toEqual({
      recipeId: "recipe-1",
      currentStepIndex: 3,
    });
    await expect(loadCookingSession("user-b")).resolves.toEqual({
      recipeId: "recipe-2",
      currentStepIndex: 1,
    });

    await deleteCookingSession("user-a");
    await expect(loadCookingSession("user-a")).resolves.toBeNull();
    await expect(loadCookingSession("user-b")).resolves.not.toBeNull();
  });

  it("lists pending writes oldest first and deletes only the requested user record", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    await savePendingWrite("user-a", "second", { value: 2 });
    now.mockReturnValue(500);
    await savePendingWrite("user-a", "first", { value: 1 });
    await savePendingWrite("user-b", "first", { value: 99 });

    await expect(listPendingWrites("user-a")).resolves.toEqual([
      { key: "first", value: { value: 1 }, updatedAt: 500 },
      { key: "second", value: { value: 2 }, updatedAt: 1_000 },
    ]);

    await deletePendingWrite("user-a", "first");
    await expect(listPendingWrites("user-a")).resolves.toHaveLength(1);
    await expect(listPendingWrites("user-b")).resolves.toHaveLength(1);
  });

  it("clears every local store for one uid without touching another uid", async () => {
    await saveLocalDraft("user-a", "draft", { title: "A" });
    await saveCookingSession("user-a", { recipeId: "recipe-a" });
    await savePendingWrite("user-a", "write", { title: "A" });
    await saveLocalDraft("user-b", "draft", { title: "B" });
    await saveCookingSession("user-b", { recipeId: "recipe-b" });
    await savePendingWrite("user-b", "write", { title: "B" });

    await clearLocalDataForUser("user-a");

    await expect(loadLocalDraft("user-a", "draft")).resolves.toBeNull();
    await expect(loadCookingSession("user-a")).resolves.toBeNull();
    await expect(listPendingWrites("user-a")).resolves.toEqual([]);
    await expect(loadLocalDraft("user-b", "draft")).resolves.toEqual({ title: "B" });
    await expect(loadCookingSession("user-b")).resolves.toEqual({ recipeId: "recipe-b" });
    await expect(listPendingWrites("user-b")).resolves.toHaveLength(1);
  });

  it("rejects empty identity parts instead of creating shared records", async () => {
    await expect(saveLocalDraft(" ", "draft", {})).rejects.toThrow("uid must not be empty");
    await expect(savePendingWrite("user-a", "", {})).rejects.toThrow("key must not be empty");
  });
});
