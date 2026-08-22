import { describe, expect, it } from "vitest";
import {
  aiModelOutputSchema,
  geminiRecipeDraftJsonSchema,
  recipeDraftJsonSchema,
} from "../ai-schema";
import { modelOutput } from "./fixtures";

const forbiddenGeminiKeywords = new Set([
  "$schema",
  "const",
  "exclusiveMinimum",
  "minLength",
  "maxLength",
  "maxItems",
  "pattern",
]);

function collectForbiddenKeywords(value: unknown, found = new Set<string>()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectForbiddenKeywords(item, found));
    return found;
  }

  if (!value || typeof value !== "object") {
    return found;
  }

  for (const [key, childValue] of Object.entries(value)) {
    if (forbiddenGeminiKeywords.has(key)) {
      found.add(key);
    }
    collectForbiddenKeywords(childValue, found);
  }

  return found;
}

function schemaValueAt(...path: string[]) {
  return path.reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    return (value as Record<string, unknown>)[key];
  }, geminiRecipeDraftJsonSchema);
}

describe("Gemini Structured Output schema", () => {
  it("keeps the full Zod-generated schema separate from the Gemini schema", () => {
    expect(recipeDraftJsonSchema).toHaveProperty("$schema");
    expect(collectForbiddenKeywords(geminiRecipeDraftJsonSchema)).toEqual(
      new Set(),
    );
  });

  it("represents the supported serving sizes as a numeric enum plus null", () => {
    expect(
      schemaValueAt("properties", "draft", "properties", "servings"),
    ).toEqual({
      type: ["number", "null"],
      enum: [0.5, 1, 2, 3, 4, null],
    });
  });

  it("keeps app-derived fields out of the Gemini request schema", () => {
    expect(schemaValueAt(
      "properties", "draft", "properties", "ingredients", "items", "properties", "numericAmount",
    )).toBeUndefined();
    expect(schemaValueAt(
      "properties", "draft", "properties", "seasonings", "items", "properties", "numericAmount",
    )).toBeUndefined();
    expect(schemaValueAt(
      "properties", "draft", "properties", "ingredients", "items", "properties", "nutritionFoodId",
    )).toBeUndefined();
    expect(schemaValueAt("properties", "draft", "properties", "source")).toBeUndefined();
    expect(schemaValueAt("properties", "draft", "properties", "tags")).toBeUndefined();
    expect(schemaValueAt(
      "properties", "draft", "properties", "steps", "items", "properties", "id",
    )).toBeUndefined();
    expect(schemaValueAt(
      "properties", "draft", "properties", "steps", "items", "properties", "order",
    )).toBeUndefined();
    expect(schemaValueAt(
      "properties", "draft", "properties", "steps", "items", "properties", "timers", "items", "properties", "id",
    )).toBeUndefined();
  });

  it("continues to enforce strict constraints with Zod after generation", () => {
    const validOutput = modelOutput();
    expect(aiModelOutputSchema.safeParse(validOutput).success).toBe(true);
    expect(
      aiModelOutputSchema.safeParse({
        ...validOutput,
        draft: {
          ...validOutput.draft,
          servings: 3.5,
        },
      }).success,
    ).toBe(false);
    expect(
      aiModelOutputSchema.safeParse({
        ...validOutput,
        detectedServings: 0,
      }).success,
    ).toBe(false);
  });

  it("requires an AI recipe title but accepts empty optional recipe content", () => {
    const validOutput = modelOutput();
    expect(aiModelOutputSchema.safeParse({
      ...validOutput,
      draft: {
        ...validOutput.draft,
        servings: null,
        ingredients: [],
        seasonings: [],
        steps: [],
      },
    }).success).toBe(true);
    expect(aiModelOutputSchema.safeParse({
      ...validOutput,
      draft: { ...validOutput.draft, title: "" },
    }).success).toBe(false);
  });
});
