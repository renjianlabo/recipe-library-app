"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AppIcon } from "@/components/AppIcon";
import { AuthGate } from "@/components/AuthGate";
import { DemoEndDialog } from "@/components/DemoEndDialog";
import { useAuth } from "@/contexts/AuthProvider";
import { useRecipes } from "@/contexts/RecipeProvider";
import { demoRemainingLabel } from "@/domain/demo-session";
import { authenticatedJson } from "@/lib/authenticated-api";
import { createBackupDownload } from "./settings-core";

function downloadBackup(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function SettingsHome() {
  const { user, demoStatus, endDemo, signOutUser } = useAuth();
  const { recipes } = useRecipes();
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [endingDemo, setEndingDemo] = useState(false);

  useEffect(() => {
    if (!user) {
      queueMicrotask(() => setAiAvailable(false));
      return;
    }
    let active = true;
    void authenticatedJson<{ configured: boolean }>(user, "/api/ai/status", { method: "GET" })
      .then((value) => active && setAiAvailable(value.configured))
      .catch(() => active && setAiAvailable(false));
    return () => { active = false; };
  }, [demoStatus, user]);

  return (
    <AuthGate>
      <main className="settings-page">
        <header className="settings-header"><Link href="/" aria-label="設定を閉じる"><AppIcon name="back" size={21} /></Link><h1>設定</h1></header>
        <section className="settings-section"><p className="settings-label">AI</p><div className="settings-panel"><div className="settings-row"><span><b>AI接続状態</b><small>文章・画像・URLからレシピを作成できます</small></span><em className={aiAvailable ? "status-available" : "status-unavailable"}><i />{aiAvailable === null ? "確認中" : aiAvailable ? "利用可能" : "未設定"}</em></div></div></section>
        {user?.isDemo && demoStatus.active ? <section className="settings-section"><p className="settings-label">デモモード</p><div className="settings-panel demo-settings-panel"><div className="settings-row"><span><b>デモモードで利用中</b><small>データは24時間でリセットされます</small></span><em>{demoRemainingLabel(demoStatus.expiresAt)}</em></div><div className="settings-row"><span><b>AI生成</b><small>文章・画像・YouTube・Webで共通の上限です</small></span><em>残り {demoStatus.aiRemaining} / {demoStatus.aiLimit} 回</em></div><button type="button" className="demo-settings-end" onClick={() => setConfirmingEnd(true)}>デモを終了</button></div></section> : null}
        <section className="settings-section"><p className="settings-label">データ管理</p><div className="settings-panel"><button className="settings-row" type="button" onClick={() => { const backup = createBackupDownload(recipes); downloadBackup(backup.fileName, backup.text); }}><span><b>データを書き出す</b><small>レシピと設定をバックアップします</small></span><AppIcon name="chevron" size={18} /></button><Link className="settings-row" href="/settings/data"><span><b>バックアップから復元</b><small>以前のデータを読み込みます</small></span><AppIcon name="chevron" size={18} /></Link></div></section>
        <section className="settings-section"><p className="settings-label">アカウント</p><div className="settings-panel"><div className="settings-row"><span><b>{user?.isDemo ? "デモモード" : user?.email ?? "アカウント"}</b><small>{user?.isDemo ? "データはこの端末だけに保存されます" : "クラウドにレシピを保存しています"}</small></span></div></div></section>
        {!user?.isDemo ? <button type="button" className="logout-button" onClick={() => void signOutUser()}>ログアウト</button> : null}
        <DemoEndDialog open={confirmingEnd} busy={endingDemo} onCancel={() => setConfirmingEnd(false)} onConfirm={() => { setEndingDemo(true); void endDemo().finally(() => setEndingDemo(false)); }} />
      </main>
    </AuthGate>
  );
}
