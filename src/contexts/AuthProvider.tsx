"use client";

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getFirebaseClient, hasFirebaseClientConfig } from "@/lib/firebase-client";
import { clearLocalDataForUser } from "@/lib/indexed-db";

const DEMO_SESSION_KEY = "recipe-library-demo-session-v1";

export type AppUser = Pick<User, "uid" | "displayName" | "email" | "emailVerified" | "getIdToken"> & {
  isDemo?: boolean;
};

const demoUser: AppUser = {
  uid: "demo-user",
  displayName: "デモユーザー",
  email: null,
  emailVerified: true,
  isDemo: true,
  getIdToken: async () => {
    throw new Error("デモモードではAI機能を利用できません。");
  },
};

export type AuthContextValue = {
  user: AppUser | null;
  loading: boolean;
  configured: boolean;
  accessError: string | null;
  signIn: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  startDemo: () => void;
  signOutUser: () => Promise<void>;
  getIdToken: () => Promise<string>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

function shouldUseRedirect(): boolean {
  if (typeof window === "undefined") return false;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || /iPhone|iPad|iPod/i.test(window.navigator.userAgent);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = hasFirebaseClientConfig();
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(configured);
  const [accessError, setAccessError] = useState<string | null>(null);

  useEffect(() => {
    if (window.localStorage.getItem(DEMO_SESSION_KEY) === "1") {
      queueMicrotask(() => {
        setUser(demoUser);
        setLoading(false);
      });
      return;
    }
    const client = getFirebaseClient();
    if (!client) {
      queueMicrotask(() => setLoading(false));
      return;
    }

    void getRedirectResult(client.auth).catch(() => {
      setAccessError("Googleログインを完了できませんでした。もう一度お試しください。");
    });

    return onAuthStateChanged(client.auth, async (nextUser) => {
      setAccessError(null);
      if (nextUser?.emailVerified) {
        try {
          const token = await nextUser.getIdToken();
          const response = await fetch("/api/ai/status", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          if (response.status === 403) {
            await signOut(client.auth);
            setUser(null);
            setAccessError("このGoogleアカウントは利用を許可されていません。");
            setLoading(false);
            return;
          }
        } catch {
          // A status check failure must not discard an otherwise valid Firebase session.
        }
      }
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  const signIn = useCallback(async () => {
    const client = getFirebaseClient();
    if (!client) {
      setAccessError("Firebaseの公開設定がまだありません。");
      return;
    }
    setAccessError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    if (shouldUseRedirect()) {
      await signInWithRedirect(client.auth, provider);
      return;
    }
    try {
      await signInWithPopup(client.auth, provider);
    } catch {
      setAccessError("Googleログインを開始できませんでした。ブラウザのポップアップ設定をご確認ください。");
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const client = getFirebaseClient();
    if (!client) throw new Error("クラウド認証はまだ設定されていません。デモモードは利用できます。");
    setAccessError(null);
    try {
      await signInWithEmailAndPassword(client.auth, email.trim(), password);
    } catch {
      throw new Error("メールアドレスまたはパスワードを確認してください。");
    }
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const client = getFirebaseClient();
    if (!client) throw new Error("クラウド認証はまだ設定されていません。デモモードは利用できます。");
    setAccessError(null);
    try {
      const credential = await createUserWithEmailAndPassword(client.auth, email.trim(), password);
      await sendEmailVerification(credential.user);
    } catch {
      throw new Error("アカウントを作成できませんでした。メールアドレスとパスワードを確認してください。");
    }
  }, []);

  const resendVerification = useCallback(async () => {
    const client = getFirebaseClient();
    const currentUser = client?.auth.currentUser;
    if (!currentUser) throw new Error("確認メールを送るアカウントが見つかりません。");
    await sendEmailVerification(currentUser);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const client = getFirebaseClient();
    if (!client) throw new Error("クラウド認証はまだ設定されていません。");
    try {
      await sendPasswordResetEmail(client.auth, email.trim());
    } catch {
      throw new Error("再設定メールを送信できませんでした。メールアドレスを確認してください。");
    }
  }, []);

  const startDemo = useCallback(() => {
    window.localStorage.setItem(DEMO_SESSION_KEY, "1");
    setAccessError(null);
    setUser(demoUser);
    setLoading(false);
  }, []);

  const signOutUser = useCallback(async () => {
    if (user?.isDemo) {
      window.localStorage.removeItem(DEMO_SESSION_KEY);
      await clearLocalDataForUser(user.uid);
      setUser(null);
      return;
    }
    const client = getFirebaseClient();
    const uid = client?.auth.currentUser?.uid ?? user?.uid;
    if (uid) await clearLocalDataForUser(uid);
    if (client) await signOut(client.auth);
  }, [user]);

  const getIdToken = useCallback(async () => {
    if (!user) throw new Error("ログインが必要です。");
    return user.getIdToken();
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      configured,
      accessError,
      signIn,
      signInWithEmail,
      signUpWithEmail,
      resendVerification,
      resetPassword,
      startDemo,
      signOutUser,
      getIdToken,
    }),
    [user, loading, configured, accessError, signIn, signInWithEmail, signUpWithEmail, resendVerification, resetPassword, startDemo, signOutUser, getIdToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
