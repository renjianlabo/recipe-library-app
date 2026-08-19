import { z } from "zod";

import { recipeSchema, type Recipe } from "./recipe";

export const RECIPE_BACKUP_FORMAT_VERSION = 1 as const;

export const recipeBackupSchema = z.object({
  formatVersion: z.literal(RECIPE_BACKUP_FORMAT_VERSION),
  exportedAt: z.string().trim().refine(
    (value) => value.length > 0 && Number.isFinite(Date.parse(value)),
    "有効な書き出し日時が必要です",
  ),
  recipes: z.array(recipeSchema),
  settings: z.record(z.string(), z.unknown()).default({}),
}).strict();

export type RecipeBackup = z.infer<typeof recipeBackupSchema>;

export interface BackupValidationIssue {
  path: string;
  message: string;
}

export type BackupValidationResult =
  | { success: true; backup: RecipeBackup }
  | { success: false; issues: BackupValidationIssue[] };

export function createRecipeBackup(
  recipes: readonly Recipe[],
  settings: Record<string, unknown> = {},
  exportedAt = new Date().toISOString(),
): RecipeBackup {
  return recipeBackupSchema.parse({
    formatVersion: RECIPE_BACKUP_FORMAT_VERSION,
    exportedAt,
    recipes: [...recipes],
    settings,
  });
}

/** Validates every recipe before callers are allowed to replace any existing data. */
export function validateRecipeBackup(input: unknown, expectedUserId?: string): BackupValidationResult {
  const result = recipeBackupSchema.safeParse(input);
  if (!result.success) {
    return {
      success: false,
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  if (expectedUserId) {
    const issues = result.data.recipes.flatMap((recipe, index) => (
      recipe.userId === expectedUserId
        ? []
        : [{ path: `recipes.${index}.userId`, message: "別のユーザーのレシピは復元できません" }]
    ));
    if (issues.length) return { success: false, issues };
  }

  return { success: true, backup: result.data };
}

export function parseRecipeBackup(input: unknown, expectedUserId?: string): RecipeBackup {
  const result = validateRecipeBackup(input, expectedUserId);
  if (!result.success) {
    throw new Error(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
  }
  return result.backup;
}

