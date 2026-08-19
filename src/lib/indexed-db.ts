import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";

const DATABASE_NAME = "recipe-library-app";
const DATABASE_VERSION = 1;

type StoreName = "drafts" | "cooking" | "pendingWrites";

interface StoredValue<T = unknown> {
  id: string;
  uid: string;
  key: string;
  value: T;
  updatedAt: number;
}

interface RecipeLibraryDatabase extends DBSchema {
  drafts: {
    key: string;
    value: StoredValue;
    indexes: { "by-uid": string; "by-updated-at": number };
  };
  cooking: {
    key: string;
    value: StoredValue;
    indexes: { "by-uid": string; "by-updated-at": number };
  };
  pendingWrites: {
    key: string;
    value: StoredValue;
    indexes: { "by-uid": string; "by-updated-at": number };
  };
}

export interface PendingWrite<T> {
  key: string;
  value: T;
  updatedAt: number;
}

let databasePromise: Promise<IDBPDatabase<RecipeLibraryDatabase>> | null = null;

function assertKeyPart(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new TypeError(`${label} must not be empty`);
  }
  return normalized;
}

function recordId(uid: string, key: string): string {
  return `${encodeURIComponent(uid)}:${encodeURIComponent(key)}`;
}

function getDatabase(): Promise<IDBPDatabase<RecipeLibraryDatabase>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available"));
  }

  databasePromise ??= openDB<RecipeLibraryDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      for (const name of ["drafts", "cooking", "pendingWrites"] as const) {
        if (database.objectStoreNames.contains(name)) continue;
        const store = database.createObjectStore(name, { keyPath: "id" });
        store.createIndex("by-uid", "uid");
        store.createIndex("by-updated-at", "updatedAt");
      }
    },
  });

  return databasePromise;
}

async function putValue<T>(storeName: StoreName, uidValue: string, keyValue: string, value: T): Promise<void> {
  const uid = assertKeyPart(uidValue, "uid");
  const key = assertKeyPart(keyValue, "key");
  const record: StoredValue<T> = {
    id: recordId(uid, key),
    uid,
    key,
    value,
    updatedAt: Date.now(),
  };
  const database = await getDatabase();
  await database.put(storeName, record as StoredValue);
}

async function getValue<T>(storeName: StoreName, uidValue: string, keyValue: string): Promise<T | null> {
  const uid = assertKeyPart(uidValue, "uid");
  const key = assertKeyPart(keyValue, "key");
  const database = await getDatabase();
  const record = await database.get(storeName, recordId(uid, key));
  if (!record || record.uid !== uid || record.key !== key) return null;
  return record.value as T;
}

async function deleteValue(storeName: StoreName, uidValue: string, keyValue: string): Promise<void> {
  const uid = assertKeyPart(uidValue, "uid");
  const key = assertKeyPart(keyValue, "key");
  const database = await getDatabase();
  await database.delete(storeName, recordId(uid, key));
}

export function saveLocalDraft<T>(uid: string, draftKey: string, value: T): Promise<void> {
  return putValue("drafts", uid, draftKey, value);
}

export function loadLocalDraft<T>(uid: string, draftKey: string): Promise<T | null> {
  return getValue<T>("drafts", uid, draftKey);
}

export function deleteLocalDraft(uid: string, draftKey: string): Promise<void> {
  return deleteValue("drafts", uid, draftKey);
}

export function saveCookingSession<T>(uid: string, session: T): Promise<void> {
  return putValue("cooking", uid, "active", session);
}

export function loadCookingSession<T>(uid: string): Promise<T | null> {
  return getValue<T>("cooking", uid, "active");
}

export function deleteCookingSession(uid: string): Promise<void> {
  return deleteValue("cooking", uid, "active");
}

export function savePendingWrite<T>(uid: string, key: string, value: T): Promise<void> {
  return putValue("pendingWrites", uid, key, value);
}

export async function listPendingWrites<T>(uidValue: string): Promise<Array<PendingWrite<T>>> {
  const uid = assertKeyPart(uidValue, "uid");
  const database = await getDatabase();
  const records = await database.getAllFromIndex("pendingWrites", "by-uid", uid);
  return records
    .map((record) => ({ key: record.key, value: record.value as T, updatedAt: record.updatedAt }))
    .sort((left, right) => left.updatedAt - right.updatedAt || left.key.localeCompare(right.key));
}

export function deletePendingWrite(uid: string, key: string): Promise<void> {
  return deleteValue("pendingWrites", uid, key);
}

export async function clearLocalDataForUser(uidValue: string): Promise<void> {
  const uid = assertKeyPart(uidValue, "uid");
  const database = await getDatabase();
  const transaction = database.transaction(["drafts", "cooking", "pendingWrites"], "readwrite");

  await Promise.all(
    (["drafts", "cooking", "pendingWrites"] as const).map(async (storeName) => {
      const store = transaction.objectStore(storeName);
      let cursor = await store.index("by-uid").openKeyCursor(uid);
      while (cursor) {
        await store.delete(cursor.primaryKey);
        cursor = await cursor.continue();
      }
    }),
  );
  await transaction.done;
}

/** Test and account-reset helper. Normal logout should use clearLocalDataForUser. */
export async function deleteRecipeLibraryLocalDatabase(): Promise<void> {
  if (databasePromise) {
    const database = await databasePromise.catch(() => null);
    database?.close();
    databasePromise = null;
  }
  if (typeof indexedDB !== "undefined") {
    await deleteDB(DATABASE_NAME);
  }
}
