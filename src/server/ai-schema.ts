import { z } from "zod";

import {
  recipeDraftSchema,
  type RecipeDraft,
} from "../domain/recipe";

export { allowedServingSchema, recipeDraftSchema } from "../domain/recipe";
export type { RecipeDraft } from "../domain/recipe";

export const aiModelOutputSchema = z.strictObject({
  draft: recipeDraftSchema,
  warnings: z.array(z.string().trim().min(1).max(500)).max(50),
  detectedServings: z.number().finite().positive().max(1_000).nullable(),
});

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
  recipeDraftJsonSchema,
) as Record<string, unknown>;
