"use client";

import Link from "next/link";

import { AppIcon } from "@/components/AppIcon";
import { AuthGate } from "@/components/AuthGate";
import { RecipeCard } from "@/components/RecipeCard";
import { useRecipes } from "@/contexts/RecipeProvider";
import type { RecipeCategory } from "@/domain/recipe";

const GROUPS: Array<{ category: RecipeCategory; title: string; subtitle: string }> = [
  { category: "main", title: "主菜", subtitle: "今日のメインに" },
  { category: "side", title: "副菜", subtitle: "あと一品ほしいときに" },
  { category: "staple", title: "主食", subtitle: "ごはん・麺" },
  { category: "soup", title: "汁物", subtitle: "ほっとする一杯" },
  { category: "dessert", title: "デザート", subtitle: "甘いひとときに" },
  { category: "other", title: "その他", subtitle: "お気に入りの一皿" },
];

export function HomeView() {
  const { recipes, loading, error } = useRecipes();

  return (
    <AuthGate>
      <main className="page-container home-page">
        <header className="app-header">
          <div>
            <p>MY RECIPE NOTE</p>
            <h1>今日は何をつくる？</h1>
          </div>
          <Link className="round-action" href="/settings" aria-label="設定"><AppIcon name="settings" size={19} /></Link>
        </header>

        <div className="gentle-note"><span>✦</span><p>保存したレシピから、<b>つくりたい一皿</b>を見つけよう</p></div>

        {error ? <p className="alert warning" role="status">{error}</p> : null}
        {loading ? <p className="home-loading" aria-live="polite">レシピを読み込んでいます…</p> : null}
        {!loading && recipes.length ? GROUPS.map((group) => {
          const groupRecipes = recipes.filter((recipe) => recipe.category === group.category).slice(0, 2);
          if (!groupRecipes.length) return null;
          return (
            <section className="category-section" key={group.category}>
              <div className="section-head"><div><h2>{group.title}</h2><p>{group.subtitle}</p></div><Link href={`/recipes?category=${group.category}`}>もっと見る <AppIcon name="arrow" size={15} /></Link></div>
              <div className="recipe-stack">{groupRecipes.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} />)}</div>
            </section>
          );
        }) : null}
        {!loading && !recipes.length ? <div className="empty-recipes"><strong>まだレシピがありません</strong><span>作成タブから最初のレシピを追加できます</span><Link className="primary-flow-button" href="/add">レシピを作成</Link></div> : null}
      </main>
    </AuthGate>
  );
}
