import { z } from "zod";

import { recipeDraftSchema, type RecipeDraft } from "@/domain/recipe";

const AI_REVIEW_SESSION_KEY = "recipe-library-ai-review-v1";
const COMPLETION_RECEIPT_KEY = "recipe-library-create-complete-v1";

const aiReviewSessionSchema = z.strictObject({
  draft: recipeDraftSchema,
  warnings: z.array(z.string().trim().min(1).max(500)).max(50),
  needsServingsConfirmation: z.boolean(),
  detectedServings: z.number().finite().positive().max(1_000).nullable(),
});

const completionReceiptSchema = z.strictObject({
  recipeId: z.string().trim().min(1).max(128),
  recipeTitle: z.string().trim().min(1).max(120),
});

export type AiReviewSession = {
  draft: RecipeDraft;
  warnings: string[];
  needsServingsConfirmation: boolean;
  detectedServings: number | null;
};

export type CompletionReceipt = z.infer<typeof completionReceiptSchema>;

function readSessionValue<T>(key: string, schema: z.ZodType<T>): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveAiReviewSession(value: AiReviewSession): void {
  if (typeof window === "undefined") return;
  const valid = aiReviewSessionSchema.parse(value);
  window.sessionStorage.setItem(AI_REVIEW_SESSION_KEY, JSON.stringify(valid));
}

export function readAiReviewSession(): AiReviewSession | null {
  return readSessionValue(AI_REVIEW_SESSION_KEY, aiReviewSessionSchema);
}

export function clearAiReviewSession(): void {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(AI_REVIEW_SESSION_KEY);
}

export function saveCompletionReceipt(value: CompletionReceipt): void {
  if (typeof window === "undefined") return;
  const valid = completionReceiptSchema.parse(value);
  window.sessionStorage.setItem(COMPLETION_RECEIPT_KEY, JSON.stringify(valid));
}

export function readCompletionReceipt(): CompletionReceipt | null {
  return readSessionValue(COMPLETION_RECEIPT_KEY, completionReceiptSchema);
}

export function clearCompletionReceipt(): void {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(COMPLETION_RECEIPT_KEY);
}
