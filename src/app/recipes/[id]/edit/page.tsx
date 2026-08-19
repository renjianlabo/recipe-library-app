import { RecipeEditLoader } from "@/features/editor/RecipeEditLoader";

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecipeEditLoader recipeId={decodeURIComponent(id)} />;
}
