"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AuthGate } from "@/components/AuthGate";
import { useAuth } from "@/contexts/AuthProvider";
import { useRecipes } from "@/contexts/RecipeProvider";
import type { Recipe } from "@/domain/recipe";
import { CookingMode, isSupportedServings, type SupportedServings } from "./index";

export function isSameRecipeVersion(
  current: Recipe | null | undefined,
  incoming: Recipe | null,
): boolean {
  if (current === incoming) return true;
  if (!current || !incoming) return false;
  return current.id === incoming.id && current.updatedAt === incoming.updatedAt;
}

export function CookingLoader({ recipeId, servings }: { recipeId: string; servings?: number }) {
  const { user } = useAuth();
  const { recipes, getRecipe } = useRecipes();
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(() => recipes.find((item) => item.id === recipeId));

  useEffect(() => {
    let active = true;
    void getRecipe(recipeId)
      .then((value) => {
        if (active) setRecipe((current) => isSameRecipeVersion(current, value) ? current : value);
      })
      .catch(() => {
        if (active) setRecipe((current) => current === null ? current : null);
      });
    return () => { active = false; };
  }, [getRecipe, recipeId]);

  if (!user || recipe === undefined) {
    return <AuthGate><main className="center-screen" aria-busy="true">料理モードを準備しています…</main></AuthGate>;
  }
  if (recipe === null) {
    return (
      <AuthGate>
        <main className="center-screen narrow-panel">
          <h1>レシピが見つかりません</h1>
          <Link className="button primary" href="/recipes">レシピ帳へ戻る</Link>
        </main>
      </AuthGate>
    );
  }
  const selectedServings: SupportedServings = isSupportedServings(servings) ? servings : recipe.servings;
  return (
    <AuthGate>
      <CookingMode
        key={`${user.uid}:${recipe.id}`}
        uid={user.uid}
        recipe={recipe}
        selectedServings={selectedServings}
        returnHref={`/recipes/${encodeURIComponent(recipe.id)}`}
      />
    </AuthGate>
  );
}
