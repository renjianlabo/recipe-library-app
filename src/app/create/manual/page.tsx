import type { Metadata } from "next";

import { ManualRecipeEntry } from "@/features/creation/ManualRecipeEntry";

export const metadata: Metadata = { title: "レシピを作成" };

export default async function ManualCreatePage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return <ManualRecipeEntry editAiDraft={mode === "edit"} />;
}
