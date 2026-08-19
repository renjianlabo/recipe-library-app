import type { Metadata } from "next";

import { RecipeBook } from "@/features/recipes/RecipeBook";

export const metadata: Metadata = { title: "レシピ帳" };

export default function RecipesPage() {
  return <RecipeBook />;
}
