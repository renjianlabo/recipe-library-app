import { z } from "zod";

import { normalizeAiIngredientAmount } from "../domain/amounts";
import {
  ingredientDraftSchema,
  recipeDraftSchema,
  recipeStepDraftSchema,
  recipeTimerDraftSchema,
  stepIngredientRefSchema,
  type RecipeDraft,
} from "../domain/recipe";

export { allowedServingSchema, recipeDraftSchema } from "../domain/recipe";
export type { RecipeDraft } from "../domain/recipe";

const aiRecipeDraftSchema = recipeDraftSchema.refine(
  (draft) => Boolean(draft.title.trim()),
  { path: ["title"], message: "レシピ名を入力してください" },
);

export const aiModelOutputSchema = z.strictObject({
  draft: aiRecipeDraftSchema,
  warnings: z.array(z.string().trim().min(1).max(500)).max(50),
  detectedServings: z.number().finite().positive().max(1_000).nullable(),
});

const aiIngredientEvidenceShape = {
  // A wire reference handle, not an application ID. The server remaps it.
  id: z.string().trim().min(1).max(128),
  name: ingredientDraftSchema.shape.name,
  amountText: ingredientDraftSchema.shape.amountText,
  unit: ingredientDraftSchema.shape.unit,
  note: ingredientDraftSchema.shape.note,
};
const aiIngredientRequestSchema = z.strictObject(aiIngredientEvidenceShape);
const aiIngredientWireSchema = z.strictObject({
  ...aiIngredientEvidenceShape,
  // Accepted only for compatibility with responses produced by the previous
  // transport schema. This value is ignored during server normalization.
  numericAmount: z.unknown().optional(),
  nutritionFoodId: z.unknown().optional(),
});

const aiTimerEvidenceShape = {
  label: recipeTimerDraftSchema.shape.label,
  seconds: recipeTimerDraftSchema.shape.seconds,
};
const aiTimerRequestSchema = z.strictObject(aiTimerEvidenceShape);
const aiTimerWireSchema = z.strictObject({
  ...aiTimerEvidenceShape,
  id: z.unknown().optional(),
});

const aiIngredientReferenceSchema = z.strictObject({
  ingredientId: z.string().trim().min(1).max(128),
  usage: stepIngredientRefSchema.shape.usage,
  customAmountText: stepIngredientRefSchema.shape.customAmountText,
});

const aiStepEvidenceShape = {
  text: recipeStepDraftSchema.shape.text,
  ingredientRefs: z.array(aiIngredientReferenceSchema).max(100),
  timers: z.array(aiTimerRequestSchema).max(20),
};
const aiStepRequestSchema = z.strictObject(aiStepEvidenceShape);
const aiStepWireSchema = z.strictObject({
  ...aiStepEvidenceShape,
  id: z.unknown().optional(),
  order: z.unknown().optional(),
  timers: z.array(aiTimerWireSchema).max(20),
});

const aiRecipeDraftEvidenceShape = {
  title: recipeDraftSchema.shape.title,
  imageDataUrl: recipeDraftSchema.shape.imageDataUrl,
  category: recipeDraftSchema.shape.category,
  servings: recipeDraftSchema.shape.servings,
  ingredients: z.array(aiIngredientRequestSchema).max(100),
  seasonings: z.array(aiIngredientRequestSchema).max(100).optional(),
  steps: z.array(aiStepRequestSchema).max(100),
  tips: recipeDraftSchema.shape.tips,
  memo: recipeDraftSchema.shape.memo,
};

/** Schema sent to Gemini: evidence fields only, without app-derived values. */
const aiGeminiModelOutputSchema = z.strictObject({
  draft: z.strictObject(aiRecipeDraftEvidenceShape),
  warnings: aiModelOutputSchema.shape.warnings,
  detectedServings: aiModelOutputSchema.shape.detectedServings,
});

/**
 * Receive boundary accepting both the current evidence-only response and the
 * previous response shape. Derived legacy values are accepted but not trusted.
 */
export const aiModelWireOutputSchema = z.strictObject({
  draft: z.strictObject({
    ...aiRecipeDraftEvidenceShape,
    ingredients: z.array(aiIngredientWireSchema).max(100),
    seasonings: z.array(aiIngredientWireSchema).max(100).optional(),
    steps: z.array(aiStepWireSchema).max(100),
    tags: z.unknown().optional(),
    source: z.unknown().optional(),
  }),
  warnings: aiModelOutputSchema.shape.warnings,
  detectedServings: aiModelOutputSchema.shape.detectedServings,
});

type AiModelWireOutput = z.infer<typeof aiModelWireOutputSchema>;

const VALID_INTERNAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function uniqueInternalId(requested: string, fallback: string, used: Set<string>): string {
  let candidate = requested.trim();
  if (!candidate || candidate.length > 128 || !VALID_INTERNAL_ID.test(candidate)) {
    candidate = fallback;
  }
  let next = candidate;
  let suffix = 2;
  while (used.has(next)) {
    next = `${fallback}-${suffix}`;
    suffix += 1;
  }
  used.add(next);
  return next;
}

/** Converts AI evidence into the internal draft candidate without inventing recipe facts. */
export function normalizeAiWireOutput(
  output: AiModelWireOutput,
  source: RecipeDraft["source"],
): unknown {
  const rawItems = [
    ...output.draft.ingredients.map((item, index) => ({ item, index, prefix: "ingredient" as const })),
    ...(output.draft.seasonings ?? []).map((item, index) => ({ item, index, prefix: "seasoning" as const })),
  ];
  const idCounts = new Map<string, number>();
  rawItems.forEach(({ item }) => idCounts.set(item.id, (idCounts.get(item.id) ?? 0) + 1));

  const usedIds = new Set<string>();
  const duplicateIds = new Map<string, string>();
  rawItems.forEach(({ item }, combinedIndex) => {
    if ((idCounts.get(item.id) ?? 0) > 1 && !duplicateIds.has(item.id)) {
      duplicateIds.set(item.id, `duplicate-item-${combinedIndex + 1}-ambiguous`);
    }
  });
  const ingredientIdMap = new Map<string, string>();
  const normalizeItem = ({
    item,
    index,
    prefix,
  }: (typeof rawItems)[number]) => {
    const duplicateId = duplicateIds.get(item.id);
    const id = duplicateId ?? uniqueInternalId(item.id, `${prefix}-${index + 1}`, usedIds);
    if (duplicateId && !usedIds.has(duplicateId)) usedIds.add(duplicateId);
    if (!ingredientIdMap.has(item.id)) ingredientIdMap.set(item.id, id);
    const amount = normalizeAiIngredientAmount(item.amountText, item.numericAmount, item.unit);
    return {
      id,
      name: item.name,
      ...amount,
      note: item.note,
    };
  };

  const ingredients = rawItems
    .filter((entry) => entry.prefix === "ingredient")
    .map(normalizeItem);
  const seasonings = rawItems
    .filter((entry) => entry.prefix === "seasoning")
    .map(normalizeItem);
  const steps = output.draft.steps.map((step, stepIndex) => ({
    ...step,
    id: `step-${stepIndex + 1}`,
    order: stepIndex + 1,
    ingredientRefs: step.ingredientRefs.map((reference) => ({
      ingredientId: ingredientIdMap.get(reference.ingredientId) ?? reference.ingredientId,
      usage: reference.usage,
      ...(reference.usage === "custom" && reference.customAmountText?.trim()
        ? { customAmountText: reference.customAmountText }
        : {}),
    })),
    timers: step.timers.map((timer, timerIndex) => ({
      ...timer,
      id: `timer-${stepIndex + 1}-${timerIndex + 1}`,
    })),
  }));

  return {
    ...output,
    draft: {
      ...output.draft,
      ingredients,
      seasonings,
      steps,
      tags: [],
      source,
    },
  };
}

const imageMimeTypeSchema = z.enum([
  "image/png", "image/jpeg", "image/webp", "image/heic", "image/heif",
]);
const screenshotImageSchema = z.union([
  z.strictObject({
    data: z.string().min(1).max(18_000_000),
    mimeType: imageMimeTypeSchema,
  }),
  z.strictObject({
    dataUrl: z.string().min(1).max(18_000_000),
    mimeType: imageMimeTypeSchema,
  }),
]).transform((image) => ({
  data: "data" in image ? image.data : image.dataUrl,
  mimeType: image.mimeType,
}));

export const extractRequestSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), text: z.string().trim().min(1).max(50_000) }),
  z.strictObject({
    type: z.literal("screenshot"),
    images: z.array(screenshotImageSchema).min(1).max(6),
    text: z.string().trim().max(20_000).optional(),
  }),
  z.strictObject({ type: z.literal("youtube"), url: z.string().trim().min(1).max(2_048) }),
  z.strictObject({ type: z.literal("website"), url: z.string().trim().min(1).max(2_048) }),
]);

export type AiModelOutput = z.infer<typeof aiModelOutputSchema>;
export type ExtractRequest = z.infer<typeof extractRequestSchema>;

export type AiSuccessResponse = {
  draft: RecipeDraft;
  warnings: string[];
  needsServingsConfirmation: boolean;
  detectedServings: number | null;
};

export const recipeDraftJsonSchema = z.toJSONSchema(aiModelOutputSchema, {
  target: "draft-2020-12",
  unrepresentable: "any",
});

// `maxItems` is supported in isolation, but the repeated limits in this nested
// recipe schema make Gemini reject the complete schema as INVALID_ARGUMENT.
// Zod still enforces every omitted constraint after generation.
const GEMINI_OMITTED_SCHEMA_KEYWORDS = new Set([
  "$schema",
  "const",
  "exclusiveMinimum",
  "minLength",
  "maxLength",
  "maxItems",
  "pattern",
]);

function mergeEquivalentEnumBranches(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const branches = schema.anyOf;
  if (!Array.isArray(branches) || branches.length === 0) {
    return schema;
  }

  const firstBranch = branches[0];
  if (
    !firstBranch ||
    typeof firstBranch !== "object" ||
    Array.isArray(firstBranch)
  ) {
    return schema;
  }

  const branchType = (firstBranch as Record<string, unknown>).type;
  if (
    typeof branchType !== "string" ||
    !branches.every((branch) => {
      if (!branch || typeof branch !== "object" || Array.isArray(branch)) {
        return false;
      }

      const branchSchema = branch as Record<string, unknown>;
      return (
        branchSchema.type === branchType &&
        Array.isArray(branchSchema.enum) &&
        Object.keys(branchSchema).every(
          (key) => key === "type" || key === "enum",
        )
      );
    })
  ) {
    return schema;
  }

  const rest = { ...schema };
  delete rest.anyOf;
  const enumValues = branches.flatMap(
    (branch) => (branch as Record<string, unknown>).enum as unknown[],
  );

  return {
    ...rest,
    type: branchType,
    enum: enumValues,
  };
}

function mergeNullableBranches(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const branches = schema.anyOf;
  if (!Array.isArray(branches) || branches.length !== 2) {
    return schema;
  }

  const branchSchemas = branches.filter(
    (branch): branch is Record<string, unknown> =>
      Boolean(branch) && typeof branch === "object" && !Array.isArray(branch),
  );
  if (branchSchemas.length !== 2) {
    return schema;
  }

  const nullBranch = branchSchemas.find(
    (branch) => branch.type === "null" && Object.keys(branch).length === 1,
  );
  const valueBranch = branchSchemas.find((branch) => branch !== nullBranch);
  if (!nullBranch || !valueBranch || typeof valueBranch.type !== "string") {
    return schema;
  }

  const rest = { ...schema };
  delete rest.anyOf;
  const nullableSchema: Record<string, unknown> = {
    ...rest,
    ...valueBranch,
    type: [valueBranch.type, "null"],
  };
  if (Array.isArray(valueBranch.enum)) {
    nullableSchema.enum = [...valueBranch.enum, null];
  }

  return nullableSchema;
}

function toGeminiCompatibleSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toGeminiCompatibleSchema);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const compatibleSchema: Record<string, unknown> = {};
  for (const [key, childValue] of Object.entries(value)) {
    if (key === "const") {
      compatibleSchema.enum = [toGeminiCompatibleSchema(childValue)];
      continue;
    }

    if (GEMINI_OMITTED_SCHEMA_KEYWORDS.has(key)) {
      continue;
    }

    compatibleSchema[key] = toGeminiCompatibleSchema(childValue);
  }

  return mergeNullableBranches(
    mergeEquivalentEnumBranches(compatibleSchema),
  );
}

/**
 * Gemini Structured Output accepts a narrower JSON Schema subset than Zod's
 * draft-2020-12 output. This schema is only an API transport constraint; the
 * existing Zod schema remains the source of truth for received model output.
 */
export const geminiRecipeDraftJsonSchema = toGeminiCompatibleSchema(
  z.toJSONSchema(aiGeminiModelOutputSchema, {
    target: "draft-2020-12",
    unrepresentable: "any",
  }),
) as Record<string, unknown>;
