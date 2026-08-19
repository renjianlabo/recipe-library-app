import type { RecipeCategory } from "./recipe";

export interface RecipeSearchable {
  title: string;
  category: RecipeCategory;
  tags: string[];
  ingredients: Array<{ name: string }>;
  isFavorite?: boolean;
}

export interface RecipeSearchCriteria {
  query?: string;
  category?: RecipeCategory | "all" | null;
  tags?: string[];
  ingredient?: string;
  favoriteOnly?: boolean;
}

export function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60))
    .replace(/\s+/g, "")
    .trim();
}

function queryTokens(value: unknown): string[] {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .split(/\s+/)
    .map(normalizeSearchText)
    .filter(Boolean);
}

export function matchesRecipeSearch(
  recipe: RecipeSearchable,
  criteria: RecipeSearchCriteria = {},
): boolean {
  if (criteria.category && criteria.category !== "all" && recipe.category !== criteria.category) {
    return false;
  }

  if (criteria.favoriteOnly && recipe.isFavorite !== true) return false;

  const normalizedTags = recipe.tags.map(normalizeSearchText);
  if ((criteria.tags ?? []).some((tag) => !normalizedTags.includes(normalizeSearchText(tag)))) {
    return false;
  }

  const ingredientQuery = normalizeSearchText(criteria.ingredient);
  if (ingredientQuery && !recipe.ingredients.some((ingredient) => (
    normalizeSearchText(ingredient.name).includes(ingredientQuery)
  ))) {
    return false;
  }

  const haystack = [
    recipe.title,
    ...recipe.tags,
    ...recipe.ingredients.map((ingredient) => ingredient.name),
  ].map(normalizeSearchText).join(" ");
  return queryTokens(criteria.query).every((token) => haystack.includes(token));
}

export function searchRecipes<T extends RecipeSearchable>(
  recipes: readonly T[],
  criteria: RecipeSearchCriteria = {},
): T[] {
  return recipes.filter((recipe) => matchesRecipeSearch(recipe, criteria));
}
