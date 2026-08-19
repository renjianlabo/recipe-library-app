import { describe, expect, it } from "vitest";

import { createRecipeBackup } from "@/domain/backup";
import type { Recipe } from "@/domain/recipe";

import {
  createBackupDownload,
  inspectBackupJson,
  inspectLegacyJson,
  legacyCandidateKey,
  materializeConfirmedLegacyCandidates,
  materializeLegacyImport,
  parseAiStatus,
} from "./settings-core";

const recipe: Recipe = {
  id: "recipe-1",
  userId: "user-1",
  title: "トースト",
  category: "staple",
  servings: 1,
  ingredients: [{
    id: "bread",
    name: "食パン",
    amountText: "1",
    numericAmount: 1,
    unit: "枚",
    note: "",
  }],
  steps: [{
    id: "step-1",
    order: 1,
    text: "焼く。",
    ingredientRefs: [{ ingredientId: "bread", usage: "all" }],
    timers: [],
  }],
  tips: [],
  memo: "",
  tags: [],
  source: { type: "manual", url: null },
  nutrition: {
    calories: null,
    carbohydrates: null,
    protein: null,
    fat: null,
    fiber: null,
    salt: null,
    calculatedAt: null,
  },
  isFavorite: false,
  createdAt: "2026-07-31T00:00:00.000Z",
  updatedAt: "2026-07-31T00:00:00.000Z",
};

describe("settings backup helpers", () => {
  it("creates a versioned, portable JSON download", () => {
    const download = createBackupDownload([recipe], "2026-07-31T12:34:56.000Z");

    expect(download.fileName).toBe("recipe-library-backup-2026-07-31.json");
    expect(JSON.parse(download.text)).toMatchObject({
      formatVersion: 1,
      exportedAt: "2026-07-31T12:34:56.000Z",
      settings: {},
      recipes: [{ id: "recipe-1", userId: "user-1" }],
    });
  });

  it("validates every recipe and rejects a backup owned by another user", () => {
    const backup = createRecipeBackup([recipe], {}, "2026-07-31T12:34:56.000Z");
    const result = inspectBackupJson(JSON.stringify(backup), "different-user");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toContainEqual({
        path: "recipes.0.userId",
        message: "別のユーザーのレシピは復元できません",
      });
    }
  });

  it("reports malformed JSON without producing a restorable backup", () => {
    expect(inspectBackupJson("{broken", "user-1")).toEqual({
      success: false,
      issues: [{ path: "", message: "JSONとして読み取れません。ファイル内容を確認してください" }],
    });
  });
});

describe("legacy settings import", () => {
  it("dry-runs first, reports skipped recipes, then materializes the same valid recipes", () => {
    const input = {
      recipes: [
        {
          id: "legacy-toast",
          title: "旧トースト",
          group: "staple",
          servings: 1,
          ingredients: [{ id: "bread", name: "食パン", amount: 1, unit: "枚" }],
          steps: ["食パンを焼く。"],
          source: "manual",
        },
        {
          id: "broken",
          title: "",
          group: "unknown",
          servings: 7,
          ingredients: [],
          steps: [],
        },
      ],
    };
    const inspection = inspectLegacyJson(
      JSON.stringify(input),
      "user-1",
      "2026-07-31T12:34:56.000Z",
    );

    expect(inspection.success).toBe(true);
    if (!inspection.success) return;
    expect(inspection.report).toMatchObject({
      dryRun: true,
      total: 2,
      convertedCount: 1,
      skippedCount: 1,
    });
    expect(inspection.report.skipped[0]?.reasons.length).toBeGreaterThan(0);

    const converted = materializeLegacyImport(inspection, "user-1");
    expect(converted.dryRun).toBe(false);
    expect(converted.recipes).toHaveLength(1);
    expect(converted.recipes[0]).toMatchObject({ id: "legacy-toast", userId: "user-1" });
  });

  it("rejects a document that has no recipes array", () => {
    const result = inspectLegacyJson("{}", "user-1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toContain("ルートはrecipes配列を持つオブジェクトである必要があります");
    }
  });

  it("keeps unsupported servings as a candidate until an explicit allowed value is chosen", () => {
    const inspection = inspectLegacyJson(JSON.stringify({
      recipes: [{
        id: "legacy-stew",
        title: "旧シチュー",
        group: "main",
        servings: 3.5,
        ingredients: [{ id: "potato", name: "じゃがいも", amount: 2, unit: "個" }],
        steps: ["じゃがいもを煮る。"],
        source: "manual",
      }],
    }), "user-1", "2026-07-31T12:34:56.000Z");

    expect(inspection.success).toBe(true);
    if (!inspection.success) return;
    expect(inspection.report).toMatchObject({
      convertedCount: 0,
      candidateCount: 1,
      skippedCount: 0,
    });
    const materialized = materializeLegacyImport(inspection, "user-1");
    const candidate = materialized.candidates[0];
    expect(candidate.draft.servings).toBeNull();
    expect(() => materializeConfirmedLegacyCandidates([candidate], {})).toThrow(
      "「旧シチュー」の人数を確認してください。",
    );

    const recipes = materializeConfirmedLegacyCandidates([candidate], {
      [legacyCandidateKey(candidate)]: 3,
    });
    expect(recipes).toHaveLength(1);
    expect(recipes[0]).toMatchObject({
      id: "legacy-stew",
      userId: "user-1",
      title: "旧シチュー",
      servings: 3,
    });
  });
});

describe("AI status validation", () => {
  it("accepts only the authenticated endpoint response shape", () => {
    expect(parseAiStatus({
      configured: true,
      model: "gemini-test",
      youtubeConfigured: false,
    })).toEqual({
      configured: true,
      model: "gemini-test",
      youtubeConfigured: false,
    });

    expect(() => parseAiStatus({ configured: "yes", model: "gemini-test" })).toThrow();
  });
});
