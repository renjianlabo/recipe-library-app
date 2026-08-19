import {
  cleanAmountText,
  formatAmountWithUnit,
  formatIngredientAmount,
  formatScaledIngredientAmount,
  isQualitativeAmount,
  parseAmountWithUnit,
} from "./amounts";
import type { Recipe, RecipeStep } from "./recipe";

export interface DerivedStepIngredient {
  ingredientId: string;
  name: string;
  amountText: string;
  unit: string;
  note: string;
  usage: "all" | "half" | "remaining" | "custom";
  usageLabel: string | null;
  displayAmount: string;
}

export function deriveStepIngredients(
  recipe: Recipe,
  step: RecipeStep,
  selectedServings: Recipe["servings"],
): DerivedStepIngredient[] {
  const scale = selectedServings / recipe.servings;
  const ingredients = new Map(
    [...recipe.ingredients, ...(recipe.seasonings ?? [])]
      .map((ingredient) => [ingredient.id, ingredient]),
  );

  return step.ingredientRefs.flatMap<DerivedStepIngredient>((reference) => {
    const ingredient = ingredients.get(reference.ingredientId);
    if (!ingredient) return [];

    if (reference.usage === "remaining") {
      return [{
        ingredientId: ingredient.id,
        name: ingredient.name,
        amountText: "残り",
        unit: "",
        note: ingredient.note,
        usage: reference.usage,
        usageLabel: "残り",
        displayAmount: "残り",
      }];
    }

    if (reference.usage === "custom") {
      const customAmount = cleanAmountText(reference.customAmountText) || "指定量";
      const parsed = parseAmountWithUnit(customAmount, ingredient.unit);
      if (!parsed || isQualitativeAmount(customAmount)) {
        return [{
          ingredientId: ingredient.id,
          name: ingredient.name,
          amountText: customAmount,
          unit: "",
          note: ingredient.note,
          usage: reference.usage,
          usageLabel: "指定量",
          displayAmount: customAmount,
        }];
      }
      const amountText = formatIngredientAmount(parsed.numericAmount * scale, parsed.unit);
      return [{
        ingredientId: ingredient.id,
        name: ingredient.name,
        amountText,
        unit: parsed.unit,
        note: ingredient.note,
        usage: reference.usage,
        usageLabel: "指定量",
        displayAmount: formatAmountWithUnit(amountText, parsed.unit),
      }];
    }

    const multiplier = reference.usage === "half" ? 0.5 : 1;
    const formatted = formatScaledIngredientAmount(
      ingredient,
      recipe.servings,
      selectedServings,
      multiplier,
    );
    const usageLabel = reference.usage === "half" ? "半量" : null;
    return [{
      ingredientId: ingredient.id,
      name: ingredient.name,
      ...formatted,
      note: ingredient.note,
      usage: reference.usage,
      usageLabel,
      displayAmount: usageLabel
        ? `${formatted.displayAmount}（${usageLabel}）`
        : formatted.displayAmount,
    }];
  });
}
