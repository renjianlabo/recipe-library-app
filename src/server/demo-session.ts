import { createHash, randomBytes } from "node:crypto";

import type { Firestore } from "firebase-admin/firestore";

import { DEMO_AI_LIMIT, DEMO_DURATION_MS, type DemoStatus } from "@/domain/demo-session";
import { ApiError } from "./api-error";
import { getFirebaseAdminFirestore } from "./firebase-admin";

export const DEMO_COOKIE_NAME = "recipe_demo_sid";
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{40,100}$/u;
const COLLECTION_NAME = "demoSessions";

export type DemoSessionRecord = {
  createdAt: number;
  expiresAt: number;
  aiUsed: number;
  aiLimit: number;
};

export type DemoSessionStore = {
  get: (key: string) => Promise<DemoSessionRecord | null>;
  create: (key: string, record: DemoSessionRecord) => Promise<void>;
  delete: (key: string) => Promise<void>;
  consumeAi: (key: string, now: number) => Promise<DemoSessionRecord>;
};

export type ActiveDemoSession = DemoSessionRecord & { key: string };

function validRecord(value: unknown): DemoSessionRecord | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<DemoSessionRecord>;
  if (![item.createdAt, item.expiresAt, item.aiUsed, item.aiLimit].every(Number.isFinite)) return null;
  if ((item.createdAt ?? 0) <= 0 || (item.expiresAt ?? 0) <= (item.createdAt ?? 0)) return null;
  if ((item.aiUsed ?? -1) < 0 || (item.aiLimit ?? 0) < 1) return null;
  return item as DemoSessionRecord;
}

export function createFirestoreDemoSessionStore(database: Firestore = getFirebaseAdminFirestore()): DemoSessionStore {
  const reference = (key: string) => database.collection(COLLECTION_NAME).doc(key);
  return {
    async get(key) {
      const snapshot = await reference(key).get();
      return snapshot.exists ? validRecord(snapshot.data()) : null;
    },
    async create(key, record) {
      await reference(key).create(record);
    },
    async delete(key) {
      await reference(key).delete();
    },
    async consumeAi(key, now) {
      return database.runTransaction(async (transaction) => {
        const document = reference(key);
        const snapshot = await transaction.get(document);
        const record = snapshot.exists ? validRecord(snapshot.data()) : null;
        if (!record || record.expiresAt <= now) {
          throw new ApiError("DEMO_SESSION_EXPIRED", "デモ期間が終了しました。デモ中のデータをリセットしました。", 401, false);
        }
        if (record.aiUsed >= record.aiLimit) {
          throw new ApiError(
            "DEMO_AI_LIMIT_REACHED",
            "デモモードのAI生成上限（5回）に達しました。手動でのレシピ作成・編集は引き続き利用できます。",
            429,
            false,
          );
        }
        const updated = { ...record, aiUsed: record.aiUsed + 1 };
        transaction.update(document, { aiUsed: updated.aiUsed });
        return updated;
      });
    },
  };
}

export function demoSessionKey(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex");
}

export function readDemoSessionId(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== DEMO_COOKIE_NAME) continue;
    const value = decodeURIComponent(part.slice(separator + 1).trim());
    return SESSION_ID_PATTERN.test(value) ? value : null;
  }
  return null;
}

export function demoCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEMO_DURATION_MS / 1_000,
  };
}

export function toDemoStatus(record: DemoSessionRecord, newSession?: boolean): DemoStatus {
  return {
    active: true,
    createdAt: new Date(record.createdAt).toISOString(),
    expiresAt: new Date(record.expiresAt).toISOString(),
    aiLimit: record.aiLimit,
    aiUsed: record.aiUsed,
    aiRemaining: Math.max(0, record.aiLimit - record.aiUsed),
    ...(newSession === undefined ? {} : { newSession }),
  };
}

export async function getActiveDemoSession(
  request: Request,
  options: { store?: DemoSessionStore; now?: () => number } = {},
): Promise<ActiveDemoSession | null> {
  const sessionId = readDemoSessionId(request);
  if (!sessionId) return null;
  const store = options.store ?? createFirestoreDemoSessionStore();
  const key = demoSessionKey(sessionId);
  const record = await store.get(key);
  const currentTime = (options.now ?? Date.now)();
  if (!record || record.expiresAt <= currentTime) {
    if (record) await store.delete(key).catch(() => undefined);
    return null;
  }
  return { ...record, key };
}

export async function startDemoSession(
  request: Request,
  options: { store?: DemoSessionStore; now?: () => number; createSessionId?: () => string } = {},
): Promise<{ sessionId: string; status: DemoStatus }> {
  const store = options.store ?? createFirestoreDemoSessionStore();
  const now = options.now ?? Date.now;
  const current = await getActiveDemoSession(request, { store, now });
  const existingId = readDemoSessionId(request);
  if (current && existingId) return { sessionId: existingId, status: toDemoStatus(current, false) };

  const createdAt = now();
  const record: DemoSessionRecord = {
    createdAt,
    expiresAt: createdAt + DEMO_DURATION_MS,
    aiUsed: 0,
    aiLimit: DEMO_AI_LIMIT,
  };
  const sessionId = (options.createSessionId ?? (() => randomBytes(32).toString("base64url")))();
  if (!SESSION_ID_PATTERN.test(sessionId)) throw new Error("Generated demo session ID is invalid");
  await store.create(demoSessionKey(sessionId), record);
  return { sessionId, status: toDemoStatus(record, true) };
}

export async function requireDemoSession(
  request: Request,
  options: { store?: DemoSessionStore; now?: () => number } = {},
): Promise<ActiveDemoSession> {
  const session = await getActiveDemoSession(request, options);
  if (!session) {
    throw new ApiError("AUTH_REQUIRED", "ログインが必要です。もう一度ログインしてください。", 401, true);
  }
  return session;
}
