"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AuthGate } from "@/components/AuthGate";
import { useRecipes } from "@/contexts/RecipeProvider";
import type { Recipe } from "@/domain/recipe";
import { RecipeEditor, recipeToDraft } from "./RecipeEditor";

export function RecipeEditLoader({ recipeId }: { recipeId: string }) {
  const { recipes, getRecipe } = useRecipes();
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(() => recipes.find((item) => item.id === recipeId));

  useEffect(() => {
    let active = true;
    void getRecipe(recipeId)
      .then((value) => { if (active) setRecipe(value); })
      .catch(() => { if (active) setRecipe(null); });
    return () => { active = false; };
  }, [getRecipe, recipeId]);

  if (recipe === undefined) {
    return <AuthGate><main className="center-screen" aria-busy="true">レシピを読み込んでいます…</main></AuthGate>;
  }
  if (recipe === null) {
    return (
      <AuthGate>
        <main className="center-screen narrow-panel">
          <h1>編集するレシピが見つかりません</h1>
          <Link className="button primary" href="/recipes">レシピ帳へ戻る</Link>
        </main>
      </AuthGate>
    );
  }
  return (
    <RecipeEditor
      initialDraft={recipeToDraft(recipe)}
      existingRecipe={recipe}
      draftKey={`edit-${recipe.id}`}
      heading="レシピを編集"
      description="基本情報から順に、必要な項目を編集しましょう。"
    />
  );
}
