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
