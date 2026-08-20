import {
  formatAmount,
  isAllowedServing,
  isQualitativeAmount,
  normalizeIngredientAmount,
  parseAmountText,
} from "./amounts";
import {
  finalizeRecipeDraft,
  normalizeRecipeDraft,
  RECIPE_CATEGORIES,
  recipeSchema,
  type Ingredient,
  type Recipe,
  type RecipeCategory,
  type RecipeDraft,
  type RecipeStepDraft,
  type StepIngredientRef,
} from "./recipe";
import { normalizeSearchText } from "./recipe-search";
import { normalizeLegacySource } from "./source";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DEFAULT_MIGRATION_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const MAX_TIMER_SECONDS = 24 * 60 * 60;

type UnknownRecord = Record<string, unknown>;

export interface LegacyMigrationOptions {
  userId: string;
  importedAt?: string;
  dryRun?: boolean;
}

export interface LegacyMigrationWarning {
  recipeIndex: number;
  legacyId: string | null;
  path: string;
  code: string;
  message: string;
}

export interface LegacyMigrationSkip {
  recipeIndex: number;
  legacyId: string | null;
  title: string | null;
  reasons: string[];
}

export interface LegacyMigrationResult {
  dryRun: boolean;
  total: number;
  convertedCount: number;
  candidateCount: number;
  skippedCount: number;
  recipes: Recipe[];
  candidates: LegacyMigrationCandidate[];
  skipped: LegacyMigrationSkip[];
  warnings: LegacyMigrationWarning[];
  documentErrors: string[];
}

/**
 * A structurally valid legacy recipe whose serving count still requires an
 * explicit user choice before it can become a saved Recipe.
 */
export interface LegacyMigrationCandidate {
  recipeIndex: number;
  legacyId: string | null;
  id: string;
  userId: string;
  draft: RecipeDraft;
  createdAt: string;
  updatedAt: string;
  isFavorite: false;
  reason: "servings_requires_confirmation";
}

interface RecipeMigrationContext {
  recipeIndex: number;
  legacyId: string | null;
  warnings: LegacyMigrationWarning[];
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFKC").trim() : "";
}

function warning(
  context: RecipeMigrationContext,
  path: string,
  code: string,
  message: string,
): void {
  context.warnings.push({
    recipeIndex: context.recipeIndex,
    legacyId: context.legacyId,
    path,
    code,
    message,
  });
}

function deterministicId(
  candidate: unknown,
  prefix: string,
  index: number,
  used: Set<string>,
): string {
  const requested = cleanString(candidate);
  let id = ID_PATTERN.test(requested) ? requested : `${prefix}-${index + 1}`;
  const base = id;
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

function normalizedTimestamp(value: unknown, fallback: string): string {
  const text = cleanString(value);
  if (!text || !Number.isFinite(Date.parse(text))) return fallback;
  return new Date(text).toISOString();
}

function zodReasons(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

function migrateIngredients(
  input: unknown,
  context: RecipeMigrationContext,
): {
  ingredients: Ingredient[];
  legacyIdMap: Map<string, string>;
  nameMap: Map<string, Ingredient[]>;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (!Array.isArray(input) || input.length === 0) {
    return { ingredients: [], legacyIdMap: new Map(), nameMap: new Map(), reasons: ["材料が1件もありません"] };
  }

  const usedIds = new Set<string>();
  const legacyIdMap = new Map<string, string>();
  const ingredients: Ingredient[] = [];

  input.forEach((value, index) => {
    if (!isRecord(value)) {
      reasons.push(`ingredients.${index}: 材料がオブジェクトではありません`);
      return;
    }
    const name = cleanString(value.name);
    if (!name) {
      reasons.push(`ingredients.${index}.name: 材料名がありません`);
      return;
    }

    const id = deterministicId(value.id ?? value.ingredientId ?? value.ingredient_id, "ingredient", index, usedIds);
    const oldId = cleanString(value.id ?? value.ingredientId ?? value.ingredient_id);
    if (oldId) legacyIdMap.set(oldId, id);

    const hasRawAmount = Object.prototype.hasOwnProperty.call(value, "rawAmount")
      || Object.prototype.hasOwnProperty.call(value, "raw_amount");
    const rawAmount = hasRawAmount
      ? value.rawAmount ?? value.raw_amount
      : value.amount;
    const amount = normalizeIngredientAmount(
      rawAmount,
      value.numericAmount ?? value.numeric_amount ?? value.amount,
      value.unit,
    );
    if (!amount.amountText) {
      reasons.push(`ingredients.${index}.amount: ${name}の分量がありません`);
      return;
    }
    if (amount.numericAmount === null && !isQualitativeAmount(amount.amountText)) {
      reasons.push(`ingredients.${index}.amount: ${name}の分量を解析できません`);
      return;
    }

    ingredients.push({
      id,
      name,
      amountText: amount.amountText,
      numericAmount: amount.numericAmount,
      unit: amount.unit,
      note: cleanString(value.note),
      ...(cleanString(value.nutritionFoodId ?? value.nutrition_food_id)
        ? { nutritionFoodId: cleanString(value.nutritionFoodId ?? value.nutrition_food_id) }
        : {}),
    });
    if (cleanString(value.unit) && isQualitativeAmount(value.unit)) {
      warning(
        context,
        `ingredients.${index}`,
        "qualitative_unit_normalized",
        `${name}の定性的な単位をamountTextへ移しました`,
      );
    }
  });

  const nameMap = new Map<string, Ingredient[]>();
  ingredients.forEach((ingredient) => {
    const key = normalizeSearchText(ingredient.name);
    nameMap.set(key, [...(nameMap.get(key) ?? []), ingredient]);
  });
  return { ingredients, legacyIdMap, nameMap, reasons };
}

function clearlyMentionsIngredient(text: string, name: string): boolean {
  const normalizedText = normalizeSearchText(text);
  const normalizedName = normalizeSearchText(name);
  if (Array.from(normalizedName).length < 2) return false;
  let index = normalizedText.indexOf(normalizedName);
  while (index >= 0) {
    const preceding = index > 0 ? normalizedText[index - 1] : "";
    // Japanese particles/conjunctions are valid word boundaries; this still rejects
    // 「ねぎ」found inside「玉ねぎ」because the preceding「玉」is not a boundary.
    if (!preceding || /[\s、。,.をにへとでがはもやて]/.test(preceding)
      || !/[A-Za-z0-9一-龯々〆ヵヶぁ-ゖァ-ヺー]/.test(preceding)) return true;
    index = normalizedText.indexOf(normalizedName, index + normalizedName.length);
  }
  return false;
}

function inferredReferences(text: string, ingredients: readonly Ingredient[]): StepIngredientRef[] {
  return ingredients
    .filter((ingredient) => clearlyMentionsIngredient(text, ingredient.name))
    .map((ingredient) => ({ ingredientId: ingredient.id, usage: "all" as const }));
}

function resolveStepIngredient(
  value: unknown,
  path: string,
  ingredients: readonly Ingredient[],
  legacyIdMap: ReadonlyMap<string, string>,
  nameMap: ReadonlyMap<string, Ingredient[]>,
  context: RecipeMigrationContext,
): Ingredient | null {
  if (typeof value === "string") {
    const matches = nameMap.get(normalizeSearchText(value)) ?? [];
    if (matches.length === 1) return matches[0];
    warning(context, path, matches.length ? "ambiguous_ingredient" : "unknown_ingredient", `工程材料「${value}」を一意に解決できません`);
    return null;
  }
  if (!isRecord(value)) {
    warning(context, path, "invalid_step_ingredient", "工程材料の形式が正しくないため除外しました");
    return null;
  }

  const legacyId = cleanString(value.ingredientId ?? value.ingredient_id ?? value.refId ?? value.ref_id);
  if (legacyId) {
    const migratedId = legacyIdMap.get(legacyId) ?? legacyId;
    const byId = ingredients.find((ingredient) => ingredient.id === migratedId);
    if (byId) return byId;
  }
  const name = cleanString(value.name ?? value.ingredient ?? value.label);
  const matches = nameMap.get(normalizeSearchText(name)) ?? [];
  if (matches.length === 1) return matches[0];
  warning(context, path, matches.length ? "ambiguous_ingredient" : "unknown_ingredient", `工程材料「${name || legacyId || "名称なし"}」を一意に解決できません`);
  return null;
}

function amountTextFromLegacyStepIngredient(value: UnknownRecord): string {
  const source = value.rawAmount ?? value.raw_amount ?? value.amount;
  if (typeof source === "number") return formatAmount(source);
  return cleanString(source);
}

function referenceUsage(value: unknown, ingredient: Ingredient): Omit<StepIngredientRef, "ingredientId"> {
  if (!isRecord(value)) return { usage: "all" };
  const explicitMode = cleanString(value.amountMode ?? value.amount_mode);
  if (explicitMode === "remaining") return { usage: "remaining" };
  if (explicitMode === "hidden") return { usage: "custom" };
  if (explicitMode === "all") return { usage: "all" };
  if (explicitMode === "half") return { usage: "half" };

  const amountText = amountTextFromLegacyStepIngredient(value);
  const qualitativeUnit = cleanString(value.unit);
  if (isQualitativeAmount(qualitativeUnit)) {
    return qualitativeUnit === ingredient.amountText
      ? { usage: "all" }
      : { usage: "custom", customAmountText: qualitativeUnit };
  }
  if (amountText === "残り") return { usage: "remaining" };
  if (amountText === "半量") return { usage: "half" };
  if (amountText === "全量" || amountText === "全部" || !amountText) return { usage: "all" };

  if (isQualitativeAmount(amountText)) {
    return amountText === ingredient.amountText
      ? { usage: "all" }
      : { usage: "custom", customAmountText: amountText };
  }
  const numeric = parseAmountText(value.numericAmount ?? value.numeric_amount ?? amountText);
  if (numeric !== null && ingredient.numericAmount !== null) {
    if (Math.abs(numeric - ingredient.numericAmount) < 1e-9) return { usage: "all" };
    if (Math.abs(numeric - ingredient.numericAmount / 2) < 1e-9) return { usage: "half" };
    return { usage: "custom", customAmountText: amountText || formatAmount(numeric) };
  }
  return { usage: "custom", ...(amountText ? { customAmountText: amountText } : {}) };
}

function migrateStepReferences(
  values: unknown,
  path: string,
  ingredients: readonly Ingredient[],
  legacyIdMap: ReadonlyMap<string, string>,
  nameMap: ReadonlyMap<string, Ingredient[]>,
  context: RecipeMigrationContext,
): StepIngredientRef[] {
  if (!Array.isArray(values)) return [];
  const references: StepIngredientRef[] = [];
  const usedIds = new Set<string>();
  values.forEach((value, index) => {
    const ingredient = resolveStepIngredient(
      value,
      `${path}.${index}`,
      ingredients,
      legacyIdMap,
      nameMap,
      context,
    );
    if (!ingredient) return;
    if (usedIds.has(ingredient.id)) {
      warning(context, `${path}.${index}`, "duplicate_step_ingredient", "同じ工程の重複材料参照を除外しました");
      return;
    }
    usedIds.add(ingredient.id);
    references.push({ ingredientId: ingredient.id, ...referenceUsage(value, ingredient) });
  });
  return references;
}

function migrateTimers(
  input: unknown,
  stepId: string,
  path: string,
  context: RecipeMigrationContext,
): RecipeStepDraft["timers"] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((value, index) => {
    const secondsValue = typeof value === "number"
      ? value
      : isRecord(value)
        ? value.seconds ?? value.durationSeconds ?? value.duration_seconds
        : null;
    const seconds = Number(secondsValue);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_TIMER_SECONDS) {
      warning(context, `${path}.${index}`, "invalid_timer", "0秒以下・24時間超・不正なタイマーを除外しました");
      return [];
    }
    const label = isRecord(value) ? cleanString(value.label ?? value.title) : "";
    return [{
      id: `${stepId}-timer-${index + 1}`,
      label: label || `タイマー${index + 1}`,
      seconds: Math.round(seconds),
    }];
  });
}

function migrateSteps(
  input: unknown,
  ingredients: readonly Ingredient[],
  legacyIdMap: ReadonlyMap<string, string>,
  nameMap: ReadonlyMap<string, Ingredient[]>,
  context: RecipeMigrationContext,
): RecipeStepDraft[] {
  if (!Array.isArray(input)) return [];
  const usedIds = new Set<string>();
  const steps: RecipeStepDraft[] = [];

  input.forEach((value, legacyIndex) => {
    if (typeof value === "string") {
      const text = value.trim();
      if (!text) {
        warning(context, `steps.${legacyIndex}`, "empty_step", "空の工程を除外しました");
        return;
      }
      const id = deterministicId(null, "step", legacyIndex, usedIds);
      steps.push({
        id,
        order: steps.length + 1,
        text,
        ingredientRefs: inferredReferences(text, ingredients),
        timers: [],
      });
      return;
    }
    if (!isRecord(value)) {
      warning(context, `steps.${legacyIndex}`, "invalid_step", "不正な工程を除外しました");
      return;
    }

    const text = cleanString(
      value.text ?? value.instruction ?? value.description ?? value.body,
    ).trim();
    if (!text) {
      warning(context, `steps.${legacyIndex}`, "missing_step_text", "工程タイトルは本文へ転用せず、本文のない工程を除外しました");
      return;
    }
    if (cleanString(value.title ?? value.name)) {
      warning(context, `steps.${legacyIndex}.title`, "step_title_dropped", "旧工程タイトルを破棄しました");
    }
    const id = deterministicId(value.id, "step", legacyIndex, usedIds);
    let ingredientRefs = migrateStepReferences(
      value.ingredients,
      `steps.${legacyIndex}.ingredients`,
      ingredients,
      legacyIdMap,
      nameMap,
      context,
    );
    if (!ingredientRefs.length) ingredientRefs = inferredReferences(text, ingredients);
    const timerInput = Array.isArray(value.suggestedTimers)
      ? value.suggestedTimers
      : value.suggested_timers;
    steps.push({
      id,
      order: steps.length + 1,
      text,
      ingredientRefs,
      timers: migrateTimers(timerInput, id, `steps.${legacyIndex}.timers`, context),
    });
  });
  return steps;
}

function migrateOneRecipe(
  value: unknown,
  recipeIndex: number,
  options: Required<LegacyMigrationOptions>,
  warnings: LegacyMigrationWarning[],
): { recipe?: Recipe; candidate?: LegacyMigrationCandidate; skip?: LegacyMigrationSkip } {
  const record = isRecord(value) ? value : null;
  const legacyId = record ? cleanString(record.id) || null : null;
  const title = record ? cleanString(record.title) || null : null;
  const context: RecipeMigrationContext = { recipeIndex, legacyId, warnings };
  const reasons: string[] = [];
  if (!record) {
    return { skip: { recipeIndex, legacyId, title, reasons: ["レシピがオブジェクトではありません"] } };
  }
  if (!title) reasons.push("title: レシピ名がありません");

  const category = cleanString(record.group ?? record.category);
  if (!RECIPE_CATEGORIES.includes(category as RecipeCategory)) {
    reasons.push("group: 未対応の分類です");
  }
  const servings = record.servings;
  const migratedServings = isAllowedServing(servings) ? servings : null;

  const migratedIngredients = migrateIngredients(record.ingredients, context);
  reasons.push(...migratedIngredients.reasons);
  const steps = migrateSteps(
    record.steps,
    migratedIngredients.ingredients,
    migratedIngredients.legacyIdMap,
    migratedIngredients.nameMap,
    context,
  );
  if (!steps.length) reasons.push("steps: 使用できる工程が1件もありません");
  if (reasons.length || !title) {
    return { skip: { recipeIndex, legacyId, title, reasons } };
  }

  const source = normalizeLegacySource(record.source);
  if (record.source === "claude") {
    warning(context, "source", "claude_source_mapped_manual", "旧claude由来はURLを作らずmanualへ変換しました");
  } else if (record.source !== undefined && record.source !== "manual") {
    warning(context, "source", "unknown_source_normalized", "未対応の旧出典を安全な値へ正規化しました");
  }

  const importedAt = normalizedTimestamp(options.importedAt, DEFAULT_MIGRATION_TIMESTAMP);
  const createdAt = normalizedTimestamp(record.created_at ?? record.createdAt, importedAt);
  const updatedAt = normalizedTimestamp(record.updated_at ?? record.updatedAt, createdAt);
  const id = ID_PATTERN.test(legacyId ?? "") ? legacyId! : `legacy-recipe-${recipeIndex + 1}`;
  const draft: RecipeDraft = {
    title,
    category: category as RecipeCategory,
    servings: migratedServings,
    ingredients: migratedIngredients.ingredients,
    steps,
    tips: Array.isArray(record.tips) ? record.tips.map(cleanString).filter(Boolean) : [],
    memo: cleanString(record.memo),
    tags: Array.isArray(record.tags) ? record.tags.map(cleanString).filter(Boolean) : [],
    source,
  };

  try {
    if (migratedServings === null) {
      warning(
        context,
        "servings",
        "servings_requires_confirmation",
        "旧データの人数は丸めず未確定として保持しました。0.5、1、2、3、4から確認してください",
      );
      return {
        candidate: {
          recipeIndex,
          legacyId,
          id,
          userId: options.userId,
          draft: normalizeRecipeDraft(draft),
          createdAt,
          updatedAt,
          isFavorite: false,
          reason: "servings_requires_confirmation",
        },
      };
    }
    const recipe = finalizeRecipeDraft(draft, {
      id,
      userId: options.userId,
      createdAt,
      updatedAt,
    });
    return { recipe: recipeSchema.parse(recipe) };
  } catch (error) {
    if (error && typeof error === "object" && "issues" in error) {
      return {
        skip: {
          recipeIndex,
          legacyId,
          title,
          reasons: zodReasons(error as { issues: Array<{ path: PropertyKey[]; message: string }> }),
        },
      };
    }
    return { skip: { recipeIndex, legacyId, title, reasons: ["変換後レシピの検証に失敗しました"] } };
  }
}

export function migrateLegacyRecipesDocument(
  input: unknown,
  options: LegacyMigrationOptions,
): LegacyMigrationResult {
  const dryRun = options.dryRun !== false;
  const importedAt = options.importedAt ?? DEFAULT_MIGRATION_TIMESTAMP;
  const requiredOptions: Required<LegacyMigrationOptions> = {
    userId: options.userId,
    importedAt,
    dryRun,
  };
  const document = isRecord(input) ? input : null;
  const legacyRecipes = document && Array.isArray(document.recipes) ? document.recipes : null;
  if (!legacyRecipes) {
    return {
      dryRun,
      total: 0,
      convertedCount: 0,
      candidateCount: 0,
      skippedCount: 0,
      recipes: [],
      candidates: [],
      skipped: [],
      warnings: [],
      documentErrors: ["ルートはrecipes配列を持つオブジェクトである必要があります"],
    };
  }

  const warnings: LegacyMigrationWarning[] = [];
  const recipes: Recipe[] = [];
  const candidates: LegacyMigrationCandidate[] = [];
  const skipped: LegacyMigrationSkip[] = [];
  legacyRecipes.forEach((legacyRecipe, recipeIndex) => {
    const migrated = migrateOneRecipe(legacyRecipe, recipeIndex, requiredOptions, warnings);
    if (migrated.recipe) recipes.push(migrated.recipe);
    if (migrated.candidate) candidates.push(migrated.candidate);
    if (migrated.skip) skipped.push(migrated.skip);
  });

  return {
    dryRun,
    total: legacyRecipes.length,
    convertedCount: recipes.length,
    candidateCount: candidates.length,
    skippedCount: skipped.length,
    recipes,
    candidates,
    skipped,
    warnings,
    documentErrors: [],
  };
}

export const migrateLegacyRecipes = migrateLegacyRecipesDocument;
