import type { DemoStatus } from "@/domain/demo-session";
import { clearAiReviewSession, clearCompletionReceipt } from "@/features/creation/creation-session";
import { clearLocalDataForUser } from "@/lib/indexed-db";

export const DEMO_UID = "demo-user";
export const DEMO_SESSION_KEY = "recipe-library-demo-session-v1";
export const DEMO_RECIPES_STORAGE_KEY = "recipe-library-demo-recipes-v1";

export function readLocalDemoExpiry(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DEMO_SESSION_KEY) ?? "null") as { expiresAt?: unknown } | null;
    return typeof parsed?.expiresAt === "string" ? parsed.expiresAt : null;
  } catch {
    return null;
  }
}

export function writeLocalDemoSession(status: Extract<DemoStatus, { active: true }>): void {
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({ expiresAt: status.expiresAt }));
}

export async function clearDemoLocalData(options: { keepSessionMarker?: boolean } = {}): Promise<void> {
  window.localStorage.removeItem(DEMO_RECIPES_STORAGE_KEY);
  if (!options.keepSessionMarker) window.localStorage.removeItem(DEMO_SESSION_KEY);
  clearAiReviewSession();
  clearCompletionReceipt();
  try {
    await clearLocalDataForUser(DEMO_UID);
  } catch {
    // Local cleanup remains best-effort when IndexedDB is unavailable.
  }
}
