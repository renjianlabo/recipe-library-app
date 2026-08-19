"use client";

import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useAuth } from "@/contexts/AuthProvider";
import { DEFAULT_SEASONINGS } from "@/domain/seasonings";
import { getFirebaseClient } from "@/lib/firebase-client";

type PantryState = { selected: string[]; custom: string[] };

export type PantryContextValue = {
  selected: ReadonlySet<string>;
  custom: string[];
  loading: boolean;
  toggle: (name: string) => Promise<void>;
  addCustom: (name: string) => Promise<void>;
};

const LOCAL_KEY_PREFIX = "recipe-library-pantry-v1:";
const DEFAULT_STATE: PantryState = { selected: DEFAULT_SEASONINGS, custom: [] };

function normalizeList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string => typeof value === "string").map((value) => value.normalize("NFKC").trim()).filter(Boolean))];
}

function readLocal(uid: string): PantryState {
  try {
    const value = window.localStorage.getItem(`${LOCAL_KEY_PREFIX}${uid}`);
    if (!value) return DEFAULT_STATE;
    const parsed = JSON.parse(value) as { selected?: unknown; custom?: unknown };
    return { selected: normalizeList(parsed.selected), custom: normalizeList(parsed.custom) };
  } catch {
    return DEFAULT_STATE;
  }
}

const FALLBACK_CONTEXT: PantryContextValue = {
  selected: new Set(DEFAULT_SEASONINGS),
  custom: [],
  loading: false,
  toggle: async () => undefined,
  addCustom: async () => undefined,
};

export const PantryContext = createContext<PantryContextValue>(FALLBACK_CONTEXT);

export function PantryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<PantryState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(false);
  const localOnly = Boolean(user?.isDemo) || process.env.NEXT_PUBLIC_E2E_MODE === "1";

  useEffect(() => {
    if (!user) {
      queueMicrotask(() => {
        setState(DEFAULT_STATE);
        setLoading(false);
      });
      return;
    }
    if (localOnly) {
      queueMicrotask(() => {
        setState(readLocal(user.uid));
        setLoading(false);
      });
      return;
    }
    const client = getFirebaseClient();
    if (!client) return;
    queueMicrotask(() => setLoading(true));
    const settingsRef = doc(client.db, `users/${user.uid}/settings/main`);
    return onSnapshot(settingsRef, (snapshot) => {
      const data = snapshot.data();
      setState(data ? {
        selected: normalizeList(data.seasonings),
        custom: normalizeList(data.customSeasonings),
      } : DEFAULT_STATE);
      setLoading(false);
    }, () => {
      setState(readLocal(user.uid));
      setLoading(false);
    });
  }, [localOnly, user]);

  const persist = useCallback(async (next: PantryState) => {
    if (!user) return;
    setState(next);
    window.localStorage.setItem(`${LOCAL_KEY_PREFIX}${user.uid}`, JSON.stringify(next));
    if (localOnly) return;
    const client = getFirebaseClient();
    if (!client) return;
    await setDoc(doc(client.db, `users/${user.uid}/settings/main`), {
      seasonings: next.selected,
      customSeasonings: next.custom,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }, [localOnly, user]);

  const toggle = useCallback(async (name: string) => {
    const normalized = name.normalize("NFKC").trim();
    if (!normalized) return;
    const selected = new Set(state.selected);
    if (selected.has(normalized)) selected.delete(normalized); else selected.add(normalized);
    await persist({ ...state, selected: [...selected] });
  }, [persist, state]);

  const addCustom = useCallback(async (name: string) => {
    const normalized = name.normalize("NFKC").trim();
    if (!normalized) return;
    await persist({
      selected: [...new Set([...state.selected, normalized])],
      custom: [...new Set([...state.custom, normalized])],
    });
  }, [persist, state]);

  const value = useMemo<PantryContextValue>(() => ({
    selected: new Set(state.selected),
    custom: state.custom,
    loading,
    toggle,
    addCustom,
  }), [addCustom, loading, state, toggle]);

  return <PantryContext.Provider value={value}>{children}</PantryContext.Provider>;
}

export function usePantry(): PantryContextValue {
  return useContext(PantryContext);
}
