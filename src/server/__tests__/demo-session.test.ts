import { describe, expect, it } from "vitest";

import { DEMO_AI_LIMIT, DEMO_DURATION_MS } from "@/domain/demo-session";
import { ApiError } from "../api-error";
import {
  DEMO_COOKIE_NAME,
  demoCookieOptions,
  demoSessionKey,
  getActiveDemoSession,
  startDemoSession,
  type DemoSessionRecord,
  type DemoSessionStore,
} from "../demo-session";

const SESSION_ID = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN_1234";

function memoryStore() {
  const records = new Map<string, DemoSessionRecord>();
  const store: DemoSessionStore = {
    async get(key) { return records.get(key) ?? null; },
    async create(key, record) { records.set(key, { ...record }); },
    async delete(key) { records.delete(key); },
    async consumeAi(key, now) {
      const record = records.get(key);
      if (!record || record.expiresAt <= now) throw new ApiError("DEMO_SESSION_EXPIRED", "expired", 401);
      if (record.aiUsed >= record.aiLimit) throw new ApiError("DEMO_AI_LIMIT_REACHED", "limited", 429);
      const updated = { ...record, aiUsed: record.aiUsed + 1 };
      records.set(key, updated);
      return updated;
    },
  };
  return { store, records };
}

function request(sessionId?: string) {
  return new Request("https://example.test/api/demo/start", sessionId ? {
    headers: { cookie: `${DEMO_COOKIE_NAME}=${sessionId}` },
  } : undefined);
}

describe("demo sessions", () => {
  it("creates a 24-hour session with five AI uses when no cookie exists", async () => {
    const { store, records } = memoryStore();
    const result = await startDemoSession(request(), { store, now: () => 1_000, createSessionId: () => SESSION_ID });
    expect(result.status).toMatchObject({ active: true, aiLimit: 5, aiUsed: 0, aiRemaining: 5, newSession: true });
    expect(records.get(demoSessionKey(SESSION_ID))).toEqual({ createdAt: 1_000, expiresAt: 1_000 + DEMO_DURATION_MS, aiUsed: 0, aiLimit: DEMO_AI_LIMIT });
    expect(demoCookieOptions()).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 86_400 });
  });

  it("reuses an active cookie without resetting quota or expiry", async () => {
    const { store, records } = memoryStore();
    records.set(demoSessionKey(SESSION_ID), { createdAt: 1_000, expiresAt: 1_000 + DEMO_DURATION_MS, aiUsed: 3, aiLimit: 5 });
    const result = await startDemoSession(request(SESSION_ID), { store, now: () => 2_000 });
    expect(result.status).toMatchObject({ active: true, aiUsed: 3, aiRemaining: 2, newSession: false });
  });

  it("deletes an expired cookie session and starts a new five-use period", async () => {
    const { store, records } = memoryStore();
    records.set(demoSessionKey(SESSION_ID), { createdAt: 1_000, expiresAt: 2_000, aiUsed: 5, aiLimit: 5 });
    const nextId = "ZYXWVUTSRQPONMLKJIHGFEDCBA9876543210_abcd";
    const result = await startDemoSession(request(SESSION_ID), { store, now: () => 3_000, createSessionId: () => nextId });
    expect(result.status).toMatchObject({ active: true, aiRemaining: 5, newSession: true });
    expect(records.has(demoSessionKey(SESSION_ID))).toBe(false);
    await expect(getActiveDemoSession(request(nextId), { store, now: () => 3_001 })).resolves.toMatchObject({ aiUsed: 0 });
  });

  it("atomically refuses attempts beyond the five-use limit", async () => {
    const { store, records } = memoryStore();
    const key = demoSessionKey(SESSION_ID);
    records.set(key, { createdAt: 1_000, expiresAt: 1_000 + DEMO_DURATION_MS, aiUsed: 0, aiLimit: 5 });
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => store.consumeAi(key, 2_000)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(5);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(records.get(key)?.aiUsed).toBe(5);
  });
});
