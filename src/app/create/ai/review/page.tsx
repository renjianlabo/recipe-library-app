import type { Metadata } from "next";

import { AiRecipeReview } from "@/features/creation/AiRecipeReview";

export const metadata: Metadata = { title: "レシピを確認" };

export default function AiRecipeReviewPage() {
  return <AiRecipeReview />;
}
