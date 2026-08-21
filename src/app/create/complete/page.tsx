import type { Metadata } from "next";

import { RecipeComplete } from "@/features/creation/RecipeComplete";

export const metadata: Metadata = { title: "レシピを保存" };

export default function RecipeCompletePage() {
  return <RecipeComplete />;
}
