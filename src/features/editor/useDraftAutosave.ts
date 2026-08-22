"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/contexts/AuthProvider";
import { deleteLocalDraft, loadLocalDraft, saveLocalDraft } from "@/lib/indexed-db";

type RecoveryState = "checking" | "available" | "ready";
type RecoverySnapshot<T> = {
  identity: string;
  state: Exclude<RecoveryState, "checking">;
  draft: T | null;
};
type SaveSnapshot = {
  identity: string;
  lastSavedAt: Date | null;
  error: string | null;
};

export function useDraftAutosave<T>({
  draftKey,
  value,
  enabled = true,
  recoverExisting = true,
  delayMs = 600,
}: {
  draftKey: string;
  value: T;
  enabled?: boolean;
  recoverExisting?: boolean;
  delayMs?: number;
}) {
  const { user } = useAuth();
  const identity = user && enabled ? `${user.uid}:${draftKey}` : null;
  const [recovery, setRecovery] = useState<RecoverySnapshot<T> | null>(null);
  const [saveSnapshot, setSaveSnapshot] = useState<SaveSnapshot | null>(null);
  const recoveryState: RecoveryState = !identity
    ? "ready"
    : recovery?.identity === identity
      ? recovery.state
      : "checking";
  const recoverableDraft = recovery?.identity === identity && recovery.state === "available"
    ? recovery.draft
    : null;
  const lastSavedAt = saveSnapshot?.identity === identity ? saveSnapshot.lastSavedAt : null;
  const saveError = saveSnapshot?.identity === identity ? saveSnapshot.error : null;

  useEffect(() => {
    if (!user || !identity) return;
    let active = true;
    if (!recoverExisting) {
      void deleteLocalDraft(user.uid, draftKey).catch(() => undefined).finally(() => {
        if (!active) return;
        setRecovery({ identity, state: "ready", draft: null });
        setSaveSnapshot({ identity, lastSavedAt: null, error: null });
      });
      return () => { active = false; };
    }
    void loadLocalDraft<T>(user.uid, draftKey)
      .then((stored) => {
        if (!active) return;
        setRecovery({
          identity,
          state: stored === null ? "ready" : "available",
          draft: stored,
        });
        setSaveSnapshot((current) => current?.identity === identity
          ? { ...current, error: null }
          : { identity, lastSavedAt: null, error: null });
      })
      .catch(() => {
        if (!active) return;
        setRecovery({ identity, state: "ready", draft: null });
        setSaveSnapshot({
          identity,
          lastSavedAt: null,
          error: "端末内の下書きを確認できませんでした。",
        });
      });
    return () => { active = false; };
  }, [draftKey, identity, recoverExisting, user]);

  useEffect(() => {
    if (!user || !identity || recoveryState !== "ready") return;
    const timeout = window.setTimeout(() => {
      void saveLocalDraft(user.uid, draftKey, value)
        .then(() => {
          setSaveSnapshot({ identity, lastSavedAt: new Date(), error: null });
        })
        .catch(() => setSaveSnapshot({
          identity,
          lastSavedAt: null,
          error: "端末内へ下書きを保存できませんでした。",
        }));
    }, delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, draftKey, identity, recoveryState, user, value]);

  const restoreDraft = useCallback(() => {
    const stored = recoverableDraft;
    if (identity) setRecovery({ identity, state: "ready", draft: null });
    return stored;
  }, [identity, recoverableDraft]);

  const discardRecoveredDraft = useCallback(async () => {
    if (user) await deleteLocalDraft(user.uid, draftKey);
    if (identity) setRecovery({ identity, state: "ready", draft: null });
  }, [draftKey, identity, user]);

  const clearSavedDraft = useCallback(async () => {
    if (user) await deleteLocalDraft(user.uid, draftKey);
    if (identity) {
      setRecovery({ identity, state: "ready", draft: null });
      setSaveSnapshot({ identity, lastSavedAt: null, error: null });
    }
  }, [draftKey, identity, user]);

  return {
    recoveryState,
    recoverableDraft,
    lastSavedAt,
    saveError,
    restoreDraft,
    discardRecoveredDraft,
    clearSavedDraft,
  };
}
