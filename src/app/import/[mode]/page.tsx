import { notFound } from "next/navigation";

import { ImportRecipeFlow, type ImportMode } from "@/features/import/ImportRecipeFlow";

const MODES = new Set<ImportMode>(["ai", "text", "screenshot", "youtube", "website"]);

export default async function ImportPage({ params }: { params: Promise<{ mode: string }> }) {
  const { mode } = await params;
  if (!MODES.has(mode as ImportMode)) notFound();
  return <ImportRecipeFlow mode={mode as ImportMode} />;
}
