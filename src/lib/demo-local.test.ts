import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { saveAiReviewSession, saveCompletionReceipt } from "@/features/creation/creation-session";
import { createEmptyRecipeDraft } from "@/domain/recipe";
import { deleteRecipeLibraryLocalDatabase, loadCookingSession, loadLocalDraft, saveCookingSession, saveLocalDraft } from "./indexed-db";
import {
  clearDemoLocalData,
  DEMO_RECIPES_STORAGE_KEY,
  DEMO_SESSION_KEY,
  DEMO_UID,
} from "./demo-local";

describe("demo local cleanup", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(async () => {
    await deleteRecipeLibraryLocalDatabase();
  });

  it("removes demo recipes, drafts, cooking state, and creation sessions only", async () => {
    window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({ expiresAt: "2099-01-01T00:00:00.000Z" }));
    window.localStorage.setItem(DEMO_RECIPES_STORAGE_KEY, "[]");
    await saveLocalDraft(DEMO_UID, "draft", { title: "demo" });
    await saveCookingSession(DEMO_UID, { recipeId: "demo" });
    await saveLocalDraft("user-1", "draft", { title: "user" });
    saveAiReviewSession({ draft: { ...createEmptyRecipeDraft(), title: "demo", category: "main" }, warnings: [], needsServingsConfirmation: false, detectedServings: null });
    saveCompletionReceipt({ recipeId: "demo", recipeTitle: "demo" });

    await clearDemoLocalData();

    expect(window.localStorage.getItem(DEMO_SESSION_KEY)).toBeNull();
    expect(window.localStorage.getItem(DEMO_RECIPES_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
    await expect(loadLocalDraft(DEMO_UID, "draft")).resolves.toBeNull();
    await expect(loadCookingSession(DEMO_UID)).resolves.toBeNull();
    await expect(loadLocalDraft("user-1", "draft")).resolves.toEqual({ title: "user" });
  });
});
