import type { Recipe, RecipeCategory } from "@/domain/recipe";

export const CATEGORY_LABELS: Record<RecipeCategory, string> = {
  staple: "主食",
  main: "主菜",
  side: "副菜",
  soup: "汁物",
  dessert: "デザート",
  other: "その他",
};

export const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS) as Array<[
  RecipeCategory,
  string,
]>;

export function servingsLabel(servings: Recipe["servings"]): string {
  return `${servings}人分`;
}
