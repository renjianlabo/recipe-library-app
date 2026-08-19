import { SeasoningCategory } from "@/features/settings/SeasoningsView";

export default async function SeasoningCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  return <SeasoningCategory categoryId={category} />;
}
