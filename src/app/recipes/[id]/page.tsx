import type { Metadata } from "next";

import { RecipeDetail } from "@/features/recipes/RecipeDetail";

export const metadata: Metadata = { title: "レシピ詳細" };

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecipeDetail recipeId={id} />;
}
