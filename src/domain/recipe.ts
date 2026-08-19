import { z } from "zod";

import {
  cleanAmountText,
  isQualitativeAmount,
  normalizeIngredientAmount,
  parseAmountText,
} from "./amounts";
import { normalizeOilName, normalizeOilText } from "./oil-normalization";
import {
  isHttpUrl,
  normalizeRecipeSource,
  RECIPE_SOURCE_TYPES,
} from "./source";

export { ALLOWED_SERVINGS } from "./amounts";
export type { AllowedServing } from "./amounts";
export { RECIPE_SOURCE_TYPES } from "./source";
export type { RecipeSource, RecipeSourceType } from "./source";

export const RECIPE_CATEGORIES = ["staple", "main", "side", "soup", "dessert", "other"] as const;
export const STEP_INGREDIENT_USAGES = ["all", "half", "remaining", "custom"] as const;

export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];
export type StepIngredientUsage = (typeof STEP_INGREDIENT_USAGES)[number];

const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "IDに使用できない文字が含まれています");
const timestampSchema = z.string().trim().refine(
  (value) => value.length > 0 && Number.isFinite(Date.parse(value)),
  "有効な日時を指定してください",
);
const nullableNutritionValueSchema = z.number().finite().nonnegative().nullable();

export const allowedServingSchema = z.union([
  z.literal(0.5),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

function addIngredientAmountIssues(
  value: { amountText: string; numericAmount: number | null; unit: string },
  context: z.RefinementCtx,
  allowBlank: boolean,
): void {
  const amountText = cleanAmountText(value.amountText);
  const unit = cleanAmountText(value.unit);
  if (!amountText) {
    if (!allowBlank) {
      context.addIssue({ code: "custom", path: ["amountText"], message: "分量を入力してください" });
    }
    if (value.numericAmount !== null) {
      context.addIssue({
        code: "custom",
        path: ["numericAmount"],
        message: "分量文字列が空の場合、数値分量はnullにしてください",
      });
    }
    return;
  }

  if (isQualitativeAmount(amountText)) {
    if (value.numericAmount !== null) {
      context.addIssue({
        code: "custom",
        path: ["numericAmount"],
        message: "少々・適量・ひとつまみは数値化しません",
      });
    }
    if (unit) {
      context.addIssue({
        code: "custom",
        path: ["unit"],
        message: "定性的な分量はamountTextだけに保存してください",
      });
    }
    return;
  }

  const parsed = parseAmountText(amountText);
  if (parsed === null) {
    context.addIssue({
      code: "custom",
      path: ["amountText"],
      message: "分量は整数・小数・分数、または定性的な分量で入力してください",
    });
    return;
  }
  if (value.numericAmount === null || Math.abs(value.numericAmount - parsed) > 1e-9) {
    context.addIssue({
      code: "custom",
      path: ["numericAmount"],
      message: "numericAmountはamountTextを解析した値と一致させてください",
    });
  }
}

const ingredientShape = {
  id: idSchema,
  name: z.string().trim().max(120),
  amountText: z.string().max(40),
  numericAmount: z.number().finite().nonnegative().nullable(),
  unit: z.string().trim().max(30),
  note: z.string().trim().max(240),
  nutritionFoodId: idSchema.nullable().optional(),
};

export const ingredientDraftSchema = z.object(ingredientShape).strict().superRefine((value, context) => {
  addIngredientAmountIssues(value, context, true);
});

export const ingredientSchema = z.object({
  ...ingredientShape,
  name: z.string().trim().min(1, "材料名を入力してください").max(120),
}).strict().superRefine((value, context) => {
  addIngredientAmountIssues(value, context, false);
});

export const stepIngredientRefSchema = z.object({
  ingredientId: idSchema,
  usage: z.enum(STEP_INGREDIENT_USAGES),
  customAmountText: z.string().max(40).optional(),
}).strict().superRefine((value, context) => {
  if (value.usage !== "custom" && value.customAmountText !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["customAmountText"],
      message: "customAmountTextはusageがcustomの場合だけ指定できます",
    });
  }
  if (value.usage === "custom"
    && value.customAmountText !== undefined
    && !value.customAmountText.trim()) {
    context.addIssue({
      code: "custom",
      path: ["customAmountText"],
      message: "カスタム分量を入力してください",
    });
  }
});

export const MAX_RECIPE_TIMER_SECONDS = 24 * 60 * 60;

const recipeTimerSecondsDraftSchema = z
  .number({ error: "タイマー時間を入力してください" })
  .int("タイマー時間は1秒単位で入力してください")
  .nonnegative("タイマー時間は0秒以上で入力してください")
  .max(MAX_RECIPE_TIMER_SECONDS, "タイマー時間は24時間以内で入力してください");

const recipeTimerSecondsSchema = z
  .number({ error: "タイマー時間を入力してください" })
  .int("タイマー時間は1秒単位で入力してください")
  .positive("タイマー時間は1秒以上で入力してください")
  .max(MAX_RECIPE_TIMER_SECONDS, "タイマー時間は24時間以内で入力してください");

export const recipeTimerDraftSchema = z.object({
  id: idSchema,
  label: z.string().trim().max(100, "タイマー名は100文字以内で入力してください"),
  seconds: recipeTimerSecondsDraftSchema,
}).strict();

export const recipeTimerSchema = z.object({
  id: idSchema,
  label: z.string().trim().min(1, "タイマー名を入力してください").max(100, "タイマー名は100文字以内で入力してください"),
  seconds: recipeTimerSecondsSchema,
}).strict();

const recipeStepDraftShape = {
  id: idSchema,
  order: z.number().int().positive(),
  text: z.string().trim().max(4_000),
  ingredientRefs: z.array(stepIngredientRefSchema).max(100),
  timers: z.array(recipeTimerDraftSchema).max(20),
};

export const recipeStepDraftSchema = z.object(recipeStepDraftShape).strict();
export const recipeStepSchema = z.object({
  ...recipeStepDraftShape,
  text: z.string().trim().min(1, "工程本文を入力してください").max(4_000),
  timers: z.array(recipeTimerSchema).max(20),
}).strict();

export const recipeSourceSchema = z.object({
  type: z.enum(RECIPE_SOURCE_TYPES),
  url: z.string().trim().max(2_048).nullable(),
}).strict().superRefine((value, context) => {
  const requiresUrl = value.type === "youtube" || value.type === "website";
  if (requiresUrl && !isHttpUrl(value.url)) {
    context.addIssue({
      code: "custom",
      path: ["url"],
      message: "YouTubeまたはWebサイト由来のレシピにはhttp(s) URLが必要です",
    });
  }
  if (!requiresUrl && value.url !== null) {
    context.addIssue({
      code: "custom",
      path: ["url"],
      message: "manual・text・screenshotでは出典URLを保存しません",
    });
  }
});

export const recipeNutritionSchema = z.object({
  calories: nullableNutritionValueSchema,
  carbohydrates: nullableNutritionValueSchema,
  protein: nullableNutritionValueSchema,
  fat: nullableNutritionValueSchema,
  fiber: nullableNutritionValueSchema,
  salt: nullableNutritionValueSchema,
  calculatedAt: timestampSchema.nullable(),
}).strict();

const recipeDraftShape = {
  title: z.string().trim().max(120),
  imageDataUrl: z.string().max(450_000).regex(/^data:image\/(?:webp|jpeg|png);base64,/).nullable().optional(),
  category: z.enum(RECIPE_CATEGORIES),
  // AI extraction may leave the serving count unresolved until the user confirms it.
  servings: allowedServingSchema.nullable(),
  ingredients: z.array(ingredientDraftSchema).max(100),
  steps: z.array(recipeStepDraftSchema).max(100),
  tips: z.array(z.string().trim().max(500)).max(50),
  memo: z.string().trim().max(4_000),
  tags: z.array(z.string().trim().max(50)).max(50),
  source: recipeSourceSchema,
};

interface RecipeIntegrityValue {
  ingredients: Array<{ id: string }>;
  steps: Array<{
    id: string;
    order: number;
    ingredientRefs: Array<{ ingredientId: string }>;
    timers: Array<{ id: string }>;
  }>;
}

function addRecipeIntegrityIssues(value: RecipeIntegrityValue, context: z.RefinementCtx): void {
  const ingredientIds = new Set<string>();
  value.ingredients.forEach((ingredient, index) => {
    if (ingredientIds.has(ingredient.id)) {
      context.addIssue({
        code: "custom",
        path: ["ingredients", index, "id"],
        message: "材料IDが重複しています",
      });
    }
    ingredientIds.add(ingredient.id);
  });

  const stepIds = new Set<string>();
  const timerIds = new Set<string>();
  value.steps.forEach((step, stepIndex) => {
    if (stepIds.has(step.id)) {
      context.addIssue({ code: "custom", path: ["steps", stepIndex, "id"], message: "工程IDが重複しています" });
    }
    stepIds.add(step.id);
    if (step.order !== stepIndex + 1) {
      context.addIssue({
        code: "custom",
        path: ["steps", stepIndex, "order"],
        message: "工程順は1から連番にしてください",
      });
    }

    const referencedIds = new Set<string>();
    step.ingredientRefs.forEach((reference, referenceIndex) => {
      if (!ingredientIds.has(reference.ingredientId)) {
        context.addIssue({
          code: "custom",
          path: ["steps", stepIndex, "ingredientRefs", referenceIndex, "ingredientId"],
          message: "材料一覧にない材料を工程から参照しています",
        });
      }
      if (referencedIds.has(reference.ingredientId)) {
        context.addIssue({
          code: "custom",
          path: ["steps", stepIndex, "ingredientRefs", referenceIndex, "ingredientId"],
          message: "同じ工程で材料参照が重複しています",
        });
      }
      referencedIds.add(reference.ingredientId);
    });

    step.timers.forEach((timer, timerIndex) => {
      if (timerIds.has(timer.id)) {
        context.addIssue({
          code: "custom",
          path: ["steps", stepIndex, "timers", timerIndex, "id"],
          message: "タイマーIDが重複しています",
        });
      }
      timerIds.add(timer.id);
    });
  });
}

export const recipeDraftSchema = z.object(recipeDraftShape).strict().superRefine(addRecipeIntegrityIssues);

export const recipeSchema = z.object({
  id: idSchema,
  userId: idSchema,
  title: z.string().trim().min(1, "レシピ名を入力してください").max(120),
  imageDataUrl: recipeDraftShape.imageDataUrl,
  category: z.enum(RECIPE_CATEGORIES),
  servings: allowedServingSchema,
  ingredients: z.array(ingredientSchema).min(1, "材料を1件以上入力してください").max(100),
  steps: z.array(recipeStepSchema).min(1, "工程を1件以上入力してください").max(100),
  tips: z.array(z.string().trim().min(1).max(500)).max(50),
  memo: recipeDraftShape.memo,
  tags: z.array(z.string().trim().min(1).max(50)).max(50),
  source: recipeSourceSchema,
  nutrition: recipeNutritionSchema,
  // Older Firestore documents and format-version 1 backups do not have this
  // field. Parsing them must remain additive and deterministic.
  isFavorite: z.boolean().default(false),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict().superRefine(addRecipeIntegrityIssues);

export type IngredientDraft = z.infer<typeof ingredientDraftSchema>;
export type Ingredient = z.infer<typeof ingredientSchema>;
export type StepIngredientRef = z.infer<typeof stepIngredientRefSchema>;
export type RecipeTimerDraft = z.infer<typeof recipeTimerDraftSchema>;
export type RecipeTimer = z.infer<typeof recipeTimerSchema>;
export type RecipeStepDraft = z.infer<typeof recipeStepDraftSchema>;
export type RecipeStep = z.infer<typeof recipeStepSchema>;
export type RecipeNutrition = z.infer<typeof recipeNutritionSchema>;
export type RecipeDraft = z.infer<typeof recipeDraftSchema>;
export type Recipe = z.infer<typeof recipeSchema>;

export interface FinalizeRecipeMetadata {
  id: string;
  userId: string;
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
}

export function createEmptyRecipeDraft(): RecipeDraft {
  return {
    title: "",
    imageDataUrl: null,
    category: "other",
    servings: 2,
    ingredients: [{
      id: "ingredient-1",
      name: "",
      amountText: "",
      numericAmount: null,
      unit: "",
      note: "",
    }],
    steps: [{
      id: "step-1",
      order: 1,
      text: "",
      ingredientRefs: [],
      timers: [],
    }],
    tips: [],
    memo: "",
    tags: [],
    source: { type: "manual", url: null },
  };
}

function uniqueTrimmed(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.normalize("NFKC").trim()).filter(Boolean))];
}

export function normalizeRecipeDraft(draft: RecipeDraft): RecipeDraft {
  const ingredients = draft.ingredients.map((ingredient) => {
    const amount = normalizeIngredientAmount(
      ingredient.amountText,
      ingredient.numericAmount,
      ingredient.unit,
    );
    return {
      ...ingredient,
      id: ingredient.id.trim(),
      name: normalizeOilName(ingredient.name),
      amountText: amount.amountText,
      numericAmount: amount.numericAmount,
      unit: amount.unit,
      note: ingredient.note.normalize("NFKC").trim(),
      ...(ingredient.nutritionFoodId === undefined
        ? {}
        : { nutritionFoodId: ingredient.nutritionFoodId?.trim() || null }),
    };
  });

  const steps = draft.steps.map((step, stepIndex) => ({
    ...step,
    id: step.id.trim(),
    order: stepIndex + 1,
    text: normalizeOilText(step.text).trim(),
    ingredientRefs: step.ingredientRefs.map((reference) => ({
      ingredientId: reference.ingredientId.trim(),
      usage: reference.usage,
      ...(reference.usage === "custom" && reference.customAmountText !== undefined
        ? { customAmountText: cleanAmountText(reference.customAmountText) }
        : {}),
    })),
    timers: step.timers.map((timer) => ({
      ...timer,
      id: timer.id.trim(),
      label: timer.label.normalize("NFKC").trim(),
      seconds: Math.round(timer.seconds),
    })),
  }));

  const normalized: RecipeDraft = {
    ...draft,
    title: draft.title.normalize("NFKC").trim(),
    ingredients,
    steps,
    tips: uniqueTrimmed(draft.tips),
    memo: draft.memo.normalize("NFKC").trim(),
    tags: uniqueTrimmed(draft.tags),
    source: normalizeRecipeSource(draft.source),
  };
  return recipeDraftSchema.parse(normalized);
}

export function finalizeRecipeDraft(draft: RecipeDraft, metadata: FinalizeRecipeMetadata): Recipe {
  const normalized = normalizeRecipeDraft(draft);
  return recipeSchema.parse({
    ...normalized,
    ...metadata,
    nutrition: {
      calories: null,
      carbohydrates: null,
      protein: null,
      fat: null,
      fiber: null,
      salt: null,
      calculatedAt: null,
    },
  });
}
