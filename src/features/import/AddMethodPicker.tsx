"use client";

import Link from "next/link";

import { AppIcon } from "@/components/AppIcon";
import { AuthGate } from "@/components/AuthGate";

export function AddMethodPicker() {
  return (
    <AuthGate>
      <main className="page-container create-page">
        <header className="app-header"><div><p>CREATE RECIPE</p><h1>レシピを作成</h1></div></header>
        <div className="create-intro"><h2>作成方法を選択</h2><p>あなたに合う方法で、レシピを残しましょう</p></div>
        <section className="creation-options">
          <Link href="/create/ai" className="creation-card ai"><span className="choice-icon"><AppIcon name="spark" size={25} /></span><span><em>おすすめ</em><strong>AIで作成</strong><small>文章・画像・URLから<br />AIがレシピを整理します</small></span><AppIcon name="arrow" size={20} /></Link>
          <Link href="/create/manual" className="creation-card"><span className="choice-icon soft"><AppIcon name="edit" size={24} /></span><span><strong>手動で作成</strong><small>材料や作り方を自分で入力します</small></span><AppIcon name="arrow" size={20} /></Link>
        </section>
        <p className="privacy-note">レシピはあなた専用のノートに保存されます</p>
      </main>
    </AuthGate>
  );
}
