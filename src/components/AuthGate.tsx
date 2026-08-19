"use client";

import type { ReactNode } from "react";

import { useAuth } from "@/contexts/AuthProvider";
import { AuthScreen } from "@/features/auth/AuthScreen";

export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="center-screen" aria-busy="true">
        <div className="spinner" aria-hidden="true" />
        <p>ログイン状態を確認しています</p>
      </main>
    );
  }

  if (!user) {
    return <AuthScreen mode="login" />;
  }

  if (user.emailVerified === false) {
    return <AuthScreen mode="verify" />;
  }

  return <>{children}</>;
}
