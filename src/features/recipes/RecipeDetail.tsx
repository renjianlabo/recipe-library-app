"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";

import { AppIcon } from "@/components/AppIcon";
import { AuthGate } from "@/components/AuthGate";
import { useRecipes } from "@/contexts/RecipeProvider";
import { formatScaledIngredientAmount } from "@/domain/amounts";
import { ALLOWED_SERVINGS, type Recipe } from "@/domain/recipe";
import { CATEGORY_LABELS } from "@/lib/presentation";

export function RecipeDetail({ recipeId }: { recipeId: string }) {
  const { recipes, getRecipe } = useRecipes();
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(() => recipes.find((item) => item.id === recipeId));
  const [selectedServings, setSelectedServings] = useState<Recipe["servings"]>(recipe?.servings ?? 1);

  useEffect(() => {
    let active = true;
    void getRecipe(recipeId).then((value) => {
      if (!active) return;
      setRecipe(value);
      if (value) setSelectedServings(value.servings);
    }).catch(() => active && setRecipe(null));
    return () => { active = false; };
  }, [getRecipe, recipeId]);

  if (recipe === undefined) return <AuthGate><main className="center-screen" aria-busy="true">レシピを読み込んでいます</main></AuthGate>;
  if (recipe === null) return <AuthGate><main className="center-screen narrow-panel"><h1>レシピが見つかりません</h1><Link className="primary-flow-button" href="/recipes">レシピへ戻る</Link></main></AuthGate>;

  return (
    <AuthGate>
      <main className="detail-page">
        <div className="detail-scroll">
          <header className="detail-header"><Link href="/recipes" aria-label="レシピ一覧を閉じる"><AppIcon name="x" size={21} /></Link></header>
          {recipe.imageDataUrl ? <Image className="detail-image" src={recipe.imageDataUrl} alt={`${recipe.title}の料理`} width={92} height={92} unoptimized /> : null}
          <section className="detail-hero"><span>{CATEGORY_LABELS[recipe.category]}</span><h1>{recipe.title}</h1><label className="serving-select">人数<select value={selectedServings} onChange={(event) => setSelectedServings(Number(event.target.value) as Recipe["servings"])}>{ALLOWED_SERVINGS.map((value) => <option key={value} value={value}>{value}人前</option>)}</select><AppIcon name="chevron" size={15} /></label></section>

          <section className="detail-section"><h2>材料</h2><div className="detail-ingredients">{recipe.ingredients.map((ingredient) => {
            const amount = formatScaledIngredientAmount(ingredient, recipe.servings, selectedServings);
            return <div key={ingredient.id}><span>{ingredient.name}</span><b>{amount.displayAmount}</b></div>;
          })}</div></section>

          {recipe.seasonings?.length ? <section className="detail-section"><h2>調味料</h2><div className="detail-ingredients">{recipe.seasonings.map((seasoning) => {
            const amount = formatScaledIngredientAmount(seasoning, recipe.servings, selectedServings);
            return <div key={seasoning.id}><span>{seasoning.name}</span><b>{amount.displayAmount}</b></div>;
          })}</div></section> : null}

          <section className="detail-section"><h2>作り方</h2><ol className="detail-steps">{recipe.steps.map((step, index) => <li key={step.id}><span>{index + 1}</span><p>{step.text}</p></li>)}</ol></section>

          {recipe.tips.length ? <section className="detail-section detail-note"><h2>ポイント</h2>{recipe.tips.map((tip) => <p key={tip}>{tip}</p>)}</section> : null}
          {recipe.memo ? <section className="detail-section detail-note"><h2>メモ</h2><p>{recipe.memo}</p></section> : null}
          {(recipe.source.type === "youtube" || recipe.source.type === "website") && recipe.source.url ? <section className="detail-section detail-note"><h2>出典</h2><a className="source-link" href={recipe.source.url} target="_blank" rel="noreferrer noopener">{recipe.source.url}</a></section> : null}
        </div>

        <footer className="detail-actions"><Link href={`/recipes/${encodeURIComponent(recipe.id)}/edit`}>編集する</Link><Link href={`/cook/${encodeURIComponent(recipe.id)}?servings=${selectedServings}`}>料理モードを開始 <AppIcon name="arrow" size={17} /></Link></footer>
      </main>
    </AuthGate>
  );
}
