"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { AppIcon } from "@/components/AppIcon";
import { AuthGate } from "@/components/AuthGate";
import { RecipeCard } from "@/components/RecipeCard";
import { usePantry } from "@/contexts/PantryProvider";
import { useRecipes } from "@/contexts/RecipeProvider";
import type { RecipeCategory } from "@/domain/recipe";
import { searchRecipes } from "@/domain/recipe-search";
import { canMakeWithPantry } from "@/domain/seasonings";
import { CATEGORY_OPTIONS } from "@/lib/presentation";

export function RecipeBook() {
  const searchParams = useSearchParams();
  const initialCategory = searchParams?.get("category") ?? null;
  const { recipes, loading, error } = useRecipes();
  const { selected, custom } = usePantry();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<RecipeCategory | "all">(
    CATEGORY_OPTIONS.some(([value]) => value === initialCategory) ? initialCategory as RecipeCategory : "all",
  );
  const [pantryOnly, setPantryOnly] = useState(false);

  const visible = useMemo(() => searchRecipes(recipes, { query, category }).filter((recipe) => (
    !pantryOnly || canMakeWithPantry(recipe, selected, custom)
  )), [category, custom, pantryOnly, query, recipes, selected]);

  const categoryLabel = category === "all"
    ? "すべてのレシピ"
    : CATEGORY_OPTIONS.find(([value]) => value === category)?.[1] ?? "レシピ";

  return (
    <AuthGate>
      <main className="page-container recipes-page">
        <header className="app-header"><div><p>ALL RECIPES</p><h1>レシピ</h1></div></header>
        <label className="search recipe-search"><AppIcon name="search" size={20} /><input aria-label="レシピを検索" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="料理名・食材で検索" /></label>
        <div className="recipe-controls">
          <label className="category-select"><span>カテゴリー</span><select value={category} onChange={(event) => setCategory(event.target.value as RecipeCategory | "all")}><option value="all">すべて</option>{CATEGORY_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><AppIcon name="chevron" size={15} /></label>
          <button type="button" className={`pantry-toggle ${pantryOnly ? "active" : ""}`} onClick={() => setPantryOnly((value) => !value)} aria-pressed={pantryOnly}><span className="pantry-dot" />調味料</button>
        </div>
        <p className="pantry-help">{pantryOnly ? "登録済みの調味料だけで作れるレシピを表示中" : "調味料フィルターをオンにすると、家にある調味料で絞り込めます"}</p>
        {error ? <p className="alert warning" role="status">{error}</p> : null}
        <div className="list-label"><span>{categoryLabel}</span><small>{loading ? "読み込み中" : `${visible.length}件`}</small></div>
        <div className="recipe-list">{visible.map((recipe) => <RecipeCard recipe={recipe} key={recipe.id} />)}</div>
        {!loading && visible.length === 0 ? <div className="empty-recipes"><strong>レシピが見つかりません</strong><span>検索条件を変えてみてください</span></div> : null}
      </main>
    </AuthGate>
  );
}
