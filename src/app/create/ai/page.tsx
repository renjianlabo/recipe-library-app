import type { Metadata } from "next";

import { ImportRecipeFlow } from "@/features/import/ImportRecipeFlow";

export const metadata: Metadata = { title: "AIでレシピを作成" };

export default function AiCreatePage() {
  return <ImportRecipeFlow mode="ai" />;
}
