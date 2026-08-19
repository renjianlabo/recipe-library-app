import type { RecipeDraft } from "./recipe";
import { normalizeSearchText } from "./recipe-search";

export type IngredientImpactSection = "step" | "tip" | "memo";
export type IngredientImpactMatch = "reference" | "text";

export interface IngredientRemovalImpact {
  section: IngredientImpactSection;
  index: number;
  id?: string;
  text: string;
  matches: IngredientImpactMatch[];
}

function containsIngredientName(text: string, ingredientName: string): boolean {
  const name = normalizeSearchText(ingredientName);
  if (!name) return false;
  const target = normalizeSearchText(text);
  if (Array.from(name).length < 2) return target.includes(name);

  let index = target.indexOf(name);
  while (index >= 0) {
    const preceding = index > 0 ? target[index - 1] : "";
    if (!preceding || /[\s、。,.をにへとでがはもやてのな]/.test(preceding)
      || !/[A-Za-z0-9一-龯々〆ヵヶぁ-ゖァ-ヺー]/.test(preceding)) return true;
    index = target.indexOf(name, index + name.length);
  }
  return false;
}

export function findIngredientRemovalImpacts(
  recipe: RecipeDraft,
  ingredientId: string,
): IngredientRemovalImpact[] {
  const ingredient = [...recipe.ingredients, ...(recipe.seasonings ?? [])]
    .find((item) => item.id === ingredientId);
  if (!ingredient) return [];
  const impacts: IngredientRemovalImpact[] = [];

  recipe.steps.forEach((step, index) => {
    const matches: IngredientImpactMatch[] = [];
    if (step.ingredientRefs.some((reference) => reference.ingredientId === ingredientId)) {
      matches.push("reference");
    }
    if (containsIngredientName(step.text, ingredient.name)) matches.push("text");
    if (matches.length) {
      impacts.push({ section: "step", index, id: step.id, text: step.text, matches });
    }
  });
  recipe.tips.forEach((tip, index) => {
    if (containsIngredientName(tip, ingredient.name)) {
      impacts.push({ section: "tip", index, text: tip, matches: ["text"] });
    }
  });
  if (containsIngredientName(recipe.memo, ingredient.name)) {
    impacts.push({ section: "memo", index: 0, text: recipe.memo, matches: ["text"] });
  }
  return impacts;
}
