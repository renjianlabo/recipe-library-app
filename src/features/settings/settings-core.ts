import { z } from "zod";

import {
  createRecipeBackup,
  validateRecipeBackup,
  type BackupValidationIssue,
  type RecipeBackup,
} from "@/domain/backup";
import {
  migrateLegacyRecipesDocument,
  type LegacyMigrationCandidate,
  type LegacyMigrationResult,
} from "@/domain/legacy-migration";
import { isAllowedServing, type AllowedServing } from "@/domain/amounts";
import { finalizeRecipeDraft, type Recipe } from "@/domain/recipe";

const aiStatusSchema = z.object({
  configured: z.boolean(),
  model: z.string().trim().min(1),
  youtubeConfigured: z.boolean(),
}).strict();

export type AiStatus = z.infer<typeof aiStatusSchema>;

export type BackupInspection =
  | { success: true; backup: RecipeBackup }
  | { success: false; issues: BackupValidationIssue[] };

export type LegacyInspection =
  | {
      success: true;
      source: unknown;
      importedAt: string;
      report: LegacyMigrationResult;
    }
  | {
      success: false;
      issues: string[];
      report?: LegacyMigrationResult;
    };

function parseJson(text: string): { success: true; value: unknown } | { success: false } {
  try {
    return { success: true, value: JSON.parse(text) as unknown };
  } catch {
    return { success: false };
  }
}

export function parseAiStatus(input: unknown): AiStatus {
  return aiStatusSchema.parse(input);
}

export function createBackupDownload(
  recipes: readonly Recipe[],
  exportedAt = new Date().toISOString(),
): { fileName: string; text: string } {
  const backup = createRecipeBackup(recipes, {}, exportedAt);
  return {
    fileName: `recipe-library-backup-${exportedAt.slice(0, 10)}.json`,
    text: `${JSON.stringify(backup, null, 2)}\n`,
  };
}

export function inspectBackupJson(text: string, expectedUserId: string): BackupInspection {
  const parsed = parseJson(text);
  if (!parsed.success) {
    return {
      success: false,
      issues: [{ path: "", message: "JSONとして読み取れません。ファイル内容を確認してください" }],
    };
  }
  return validateRecipeBackup(parsed.value, expectedUserId);
}

export function inspectLegacyJson(
  text: string,
  userId: string,
  importedAt = new Date().toISOString(),
): LegacyInspection {
  const parsed = parseJson(text);
  if (!parsed.success) {
    return { success: false, issues: ["JSONとして読み取れません。ファイル内容を確認してください"] };
  }

  const report = migrateLegacyRecipesDocument(parsed.value, {
    userId,
    importedAt,
    dryRun: true,
  });
  if (report.documentErrors.length > 0) {
    return { success: false, issues: report.documentErrors, report };
  }
  return { success: true, source: parsed.value, importedAt, report };
}

export function materializeLegacyImport(
  inspection: Extract<LegacyInspection, { success: true }>,
  userId: string,
): LegacyMigrationResult {
  return migrateLegacyRecipesDocument(inspection.source, {
    userId,
    importedAt: inspection.importedAt,
    dryRun: false,
  });
}

export type LegacyServingSelections = Readonly<Record<string, AllowedServing | undefined>>;

export function legacyCandidateKey(
  candidate: Pick<LegacyMigrationCandidate, "recipeIndex" | "id">,
): string {
  return `${candidate.recipeIndex}:${candidate.id}`;
}

/**
 * A legacy candidate is intentionally not a Recipe while servings is null.
 * Only an explicit supported serving selection may finalize it for restore.
 */
export function materializeConfirmedLegacyCandidates(
  candidates: readonly LegacyMigrationCandidate[],
  selections: LegacyServingSelections,
): Recipe[] {
  return candidates.map((candidate) => {
    const servings = selections[legacyCandidateKey(candidate)];
    if (!isAllowedServing(servings)) {
      throw new Error(`「${candidate.draft.title}」の人数を確認してください。`);
    }
    return finalizeRecipeDraft(
      { ...candidate.draft, servings },
      {
        id: candidate.id,
        userId: candidate.userId,
        isFavorite: candidate.isFavorite,
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
      },
    );
  });
}
