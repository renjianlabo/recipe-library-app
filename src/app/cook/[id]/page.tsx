import { CookingLoader } from "@/features/cooking/CookingLoader";

export default async function CookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ servings?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const parsedServings = query.servings === undefined ? undefined : Number(query.servings);
  return <CookingLoader recipeId={decodeURIComponent(id)} servings={parsedServings} />;
}
