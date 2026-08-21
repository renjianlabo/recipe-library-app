"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppIcon } from "@/components/AppIcon";
import { AuthGate } from "@/components/AuthGate";
import {
  clearCompletionReceipt,
  readCompletionReceipt,
  type CompletionReceipt,
} from "./creation-session";

export function RecipeComplete() {
  const router = useRouter();
  const [receipt, setReceipt] = useState<CompletionReceipt | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setReceipt(readCompletionReceipt());
    });
    return () => { active = false; };
  }, []);

  const leave = (href: string) => {
    clearCompletionReceipt();
    router.replace(href);
  };

  if (receipt === undefined) return <AuthGate><main className="center-screen" aria-busy="true">保存結果を確認しています</main></AuthGate>;

  return (
    <AuthGate>
      <main className="page-container flow-page complete-page">
        <header className="flow-header"><button type="button" onClick={() => leave("/create")} aria-label="保存完了画面を閉じる"><AppIcon name="x" size={22} /></button><h1>レシピを保存</h1></header>
        {receipt ? (
          <section className="complete-content">
            <div className="complete-check"><AppIcon name="check" size={32} /></div>
            <h2>レシピを保存しました</h2>
            <p><b>{receipt.recipeTitle}</b>を<br />レシピに追加しました</p>
            <button type="button" className="primary-flow-button" onClick={() => leave(`/recipes/${encodeURIComponent(receipt.recipeId)}`)}>レシピを見る <AppIcon name="arrow" size={18} /></button>
            <button type="button" className="text-flow-button" onClick={() => leave("/")}>ホームへ</button>
          </section>
        ) : (
          <section className="complete-content complete-missing"><p>保存したレシピの情報を確認できませんでした。</p><button type="button" className="primary-flow-button" onClick={() => leave("/")}>ホームへ</button></section>
        )}
      </main>
    </AuthGate>
  );
}
