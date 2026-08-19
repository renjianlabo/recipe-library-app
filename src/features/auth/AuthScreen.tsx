"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AppIcon } from "@/components/AppIcon";
import { useAuth } from "@/contexts/AuthProvider";

export type AuthScreenMode = "login" | "signup" | "verify" | "forgot";

function AuthMark() {
  return (
    <div className="auth-mark">
      <div><AppIcon name="book" size={26} /><span>✦</span></div>
      <p>MY RECIPE NOTE</p>
    </div>
  );
}

function BackHeader({ title, href = "/login" }: { title: string; href?: string }) {
  return (
    <header className="auth-header">
      <Link href={href} aria-label="戻る"><AppIcon name="back" size={21} /></Link>
      <h1>{title}</h1>
    </header>
  );
}

export function AuthScreen({ mode }: { mode: AuthScreenMode }) {
  const router = useRouter();
  const {
    user,
    configured,
    accessError,
    signInWithEmail,
    signUpWithEmail,
    resendVerification,
    resetPassword,
    startDemo,
  } = useAuth();
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [resent, setResent] = useState(false);

  const run = async (action: () => Promise<void>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      after?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "処理を完了できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const login = (event: FormEvent) => {
    event.preventDefault();
    if (!/.+@.+\..+/.test(email) || password.length < 6) {
      setError("メールアドレスとパスワードを確認してください。");
      return;
    }
    void run(() => signInWithEmail(email, password), () => router.replace("/"));
  };

  const signup = (event: FormEvent) => {
    event.preventDefault();
    if (!/.+@.+\..+/.test(email) || password.length < 6 || password !== confirmation) {
      setError("入力内容を確認してください。パスワードは6文字以上で同じ内容を入力してください。");
      return;
    }
    void run(() => signUpWithEmail(email, password), () => router.push("/signup/verify"));
  };

  if (mode === "verify") {
    return (
      <main className="auth-page verify-content">
        <BackHeader title="メールを確認" href="/signup" />
        <div className="auth-mail-icon">✉</div>
        <h2>メールを確認してください</h2>
        <p><b>{user?.email ?? (email || "登録したメールアドレス")}</b> に確認メールを送信しました。<br />メール内のリンクを開くとアカウント登録が完了します。</p>
        {resent ? <span className="resent-message">確認メールを再送しました</span> : null}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button className="auth-secondary" type="button" disabled={busy} onClick={() => void run(resendVerification, () => setResent(true))}>メールを再送する</button>
        <Link className="auth-link" href="/signup">メールアドレスを変更</Link>
      </main>
    );
  }

  if (mode === "forgot") {
    const submit = (event: FormEvent) => {
      event.preventDefault();
      if (!/.+@.+\..+/.test(email)) {
        setError("正しいメールアドレスを入力してください。");
        return;
      }
      void run(() => resetPassword(email), () => setSent(true));
    };
    return (
      <main className="auth-page">
        <BackHeader title="パスワードを再設定" />
        <div className="auth-screen-lead"><h2>再設定メールを<br />お送りします。</h2><p>登録しているメールアドレスに、パスワード再設定用のメールを送信します。</p></div>
        {sent ? (
          <div className="forgot-success"><div className="auth-mail-icon">✉</div><h3>再設定用のメールを送信しました</h3><p>{email} の受信箱をご確認ください。</p></div>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <label>メールアドレス<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="example@gmail.com" autoComplete="email" /></label>
            {error ? <p className="auth-error" role="alert">{error}</p> : null}
            <button className="primary-flow-button" type="submit" disabled={busy}>{busy ? "送信中…" : "再設定メールを送信"}</button>
          </form>
        )}
      </main>
    );
  }

  if (mode === "signup") {
    return (
      <main className="auth-page">
        <BackHeader title="アカウントを作成" />
        <div className="auth-screen-lead"><h2>レシピを、いつでも<br />あなたの手元に。</h2><p>アカウントを作成すると、レシピをクラウドに保存できます。</p></div>
        <form className="auth-form" onSubmit={signup}>
          <label>メールアドレス<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="example@gmail.com" autoComplete="email" /></label>
          <label>パスワード<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="6文字以上" autoComplete="new-password" /></label>
          <label>パスワードをもう一度入力<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="もう一度入力" autoComplete="new-password" /></label>
          <p className="auth-hint">パスワードは6文字以上で設定してください。</p>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="primary-flow-button" type="submit" disabled={busy}>{busy ? "作成中…" : "アカウントを作成"}</button>
        </form>
        <p className="auth-bottom-copy">すでにアカウントをお持ちですか？ <Link href="/login">ログイン</Link></p>
      </main>
    );
  }

  return (
    <main className="auth-page login-content">
      <AuthMark />
      <div className="auth-intro"><h1>自分のレシピを、<br />もっと使いやすく。</h1><p>大切なレシピを、いつでもあなたのそばに。</p></div>
      {!configured ? <p className="auth-config-note">クラウド認証は未設定です。デモモードで全画面を確認できます。</p> : null}
      <form className="auth-form" onSubmit={login}>
        <label>メールアドレス<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="example@gmail.com" autoComplete="email" /></label>
        <label>パスワード<span className="password-field"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="6文字以上" autoComplete="current-password" /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "隠す" : "表示"}</button></span></label>
        {error || accessError ? <p className="auth-error" role="alert">{error ?? accessError}</p> : null}
        <button className="primary-flow-button" type="submit" disabled={busy || !configured}>{busy ? "ログイン中…" : "ログイン"}</button>
      </form>
      <Link className="auth-link" href="/forgot-password">パスワードを忘れた方</Link>
      <div className="auth-divider"><span />または<span /></div>
      <Link className="auth-secondary auth-secondary-link" href="/signup">アカウントを作成</Link>
      <button className="demo-button" type="button" onClick={() => { startDemo(); router.replace("/"); }}><b>デモモードで試す</b><small>アカウント登録なしでアプリを確認できます</small></button>
    </main>
  );
}
