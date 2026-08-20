import { formatDecimalAmount, normalizeIngredientAmount } from "@/domain/amounts";
import { normalizeRecipeDraft, recipeDraftSchema, type RecipeDraft } from "@/domain/recipe";

const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function uniqueId(requested: unknown, fallback: string, used: Set<string>): string {
  const candidate = typeof requested === "string" ? requested.trim() : "";
  let next = candidate && candidate.length <= 128 && VALID_ID.test(candidate) ? candidate : fallback;
  let suffix = 2;
  while (used.has(next)) {
    next = `${fallback}-${suffix}`;
    suffix += 1;
  }
  used.add(next);
  return next;
}

/** Repairs only structural AI-output details; it never invents recipe facts. */
export function normalizeAiDraft(input: unknown): RecipeDraft {
  if (!input || typeof input !== "object") throw new TypeError("AIの下書き形式が正しくありません。");
  const raw = input as RecipeDraft;
  if (!Array.isArray(raw.ingredients) || !Array.isArray(raw.steps)) {
    throw new TypeError("AIの下書きに材料または工程がありません。");
  }

  const ingredientIds = new Set<string>();
  const ingredientIdMap = new Map<string, string>();
  const normalizeItems = (items: RecipeDraft["ingredients"], prefix: "ingredient" | "seasoning") => items.map((ingredient, index) => {
    const oldId = typeof ingredient.id === "string" ? ingredient.id : "";
    const id = uniqueId(oldId, `${prefix}-${index + 1}`, ingredientIds);
    if (!ingredientIdMap.has(oldId)) ingredientIdMap.set(oldId, id);
    const amount = normalizeIngredientAmount(
      ingredient.amountText,
      ingredient.numericAmount,
      ingredient.unit,
    );
    return {
      ...ingredient,
      ...amount,
      amountText: amount.numericAmount === null ? amount.amountText : formatDecimalAmount(amount.numericAmount),
      id,
    };
  });
  const ingredients = normalizeItems(raw.ingredients, "ingredient");
  const seasonings = normalizeItems(Array.isArray(raw.seasonings) ? raw.seasonings : [], "seasoning");

  const stepIds = new Set<string>();
  const timerIds = new Set<string>();
  const steps = raw.steps.map((step, stepIndex) => {
    const seenReferences = new Set<string>();
    const ingredientRefs = (Array.isArray(step.ingredientRefs) ? step.ingredientRefs : []).flatMap((reference) => {
      const ingredientId = ingredientIdMap.get(reference.ingredientId);
      if (!ingredientId || seenReferences.has(ingredientId)) return [];
      seenReferences.add(ingredientId);
      return [{ ...reference, ingredientId }];
    });
    const timers = (Array.isArray(step.timers) ? step.timers : []).map((timer, timerIndex) => ({
      ...timer,
      id: uniqueId(timer.id, `timer-${stepIndex + 1}-${timerIndex + 1}`, timerIds),
    }));
    return {
      ...step,
      id: uniqueId(step.id, `step-${stepIndex + 1}`, stepIds),
      order: stepIndex + 1,
      ingredientRefs,
      timers,
    };
  });

  const source = raw.source.type === "youtube" || raw.source.type === "website"
    ? raw.source
    : { ...raw.source, url: null };
  return normalizeRecipeDraft(recipeDraftSchema.parse({
    ...raw,
    ingredients,
    seasonings,
    steps,
    tips: Array.isArray(raw.tips) ? raw.tips.filter((value) => value.trim()) : [],
    tags: Array.isArray(raw.tags) ? raw.tags.filter((value) => value.trim()) : [],
    source,
  }));
}
