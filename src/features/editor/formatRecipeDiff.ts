import type {
  RecipeDraft,
  RecipeSource,
  RecipeTimerDraft,
  StepIngredientRef,
} from "@/domain/recipe";
import type { RecipeDiffChange } from "@/domain/recipe-diff";

export interface FormattedRecipeDiffChange {
  label: string;
  before: string;
  after: string;
  details?: string[];
}

const SOURCE_LABELS: Record<RecipeSource["type"], string> = {
  manual: "手入力",
  text: "テキスト",
  screenshot: "スクリーンショット",
  youtube: "YouTube",
  website: "Webサイト",
};

const FIELD_LABELS: Record<string, string> = {
  id: "ID",
  name: "名前",
  amountText: "分量",
  numericAmount: "数値分量",
  unit: "単位",
  note: "補足",
  order: "順番",
  text: "本文",
  ingredientId: "材料",
  usage: "用途",
  customAmountText: "指定量",
  label: "名前",
  seconds: "時間",
  type: "種類",
  url: "URL",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIngredientRef(value: unknown): value is StepIngredientRef {
  return isRecord(value)
    && typeof value.ingredientId === "string"
    && typeof value.usage === "string";
}

function isTimer(value: unknown): value is RecipeTimerDraft {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.label === "string"
    && typeof value.seconds === "number";
}

function isSource(value: unknown): value is RecipeSource {
  return isRecord(value)
    && typeof value.type === "string"
    && value.type in SOURCE_LABELS
    && (value.url === null || typeof value.url === "string");
}

export function formatTimerDuration(secondsValue: number): string {
  const seconds = Math.max(0, Math.round(secondsValue));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;
  const parts: string[] = [];
  if (hours) parts.push(`${hours}時間`);
  if (minutes) parts.push(`${minutes}分`);
  if (remainingSeconds || parts.length === 0) parts.push(`${remainingSeconds}秒`);
  return parts.join("");
}

function formatSource(source: RecipeSource): string {
  const label = SOURCE_LABELS[source.type];
  return source.url ? `${label}（${source.url}）` : label;
}

function formatPlainValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "なし";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "あり" : "なし";
  if (isSource(value)) return formatSource(value);
  if (isTimer(value)) {
    return `${value.label || "タイマー"}（${formatTimerDuration(value.seconds)}）`;
  }
  if (isIngredientRef(value)) return formatIngredientUsage(value);
  if (Array.isArray(value)) {
    return value.length ? value.map(formatPlainValue).join("、") : "なし";
  }
  if (isRecord(value)) {
    const entries = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => `${FIELD_LABELS[key] ?? key}: ${formatPlainValue(entryValue)}`);
    return entries.length ? entries.join("、") : "なし";
  }
  return String(value);
}

function formatIngredientUsage(reference: StepIngredientRef): string {
  switch (reference.usage) {
    case "all":
      return "全量";
    case "half":
      return "半量";
    case "remaining":
      return "残り";
    case "custom":
      return reference.customAmountText?.trim() || "指定量";
  }
}

function ingredientName(
  ingredientId: string,
  before: RecipeDraft,
  after: RecipeDraft,
): string {
  return [...after.ingredients, ...(after.seasonings ?? [])]
    .find((ingredient) => ingredient.id === ingredientId)?.name
    || [...before.ingredients, ...(before.seasonings ?? [])]
      .find((ingredient) => ingredient.id === ingredientId)?.name
    || "名前不明の材料・調味料";
}

function ingredientRefText(
  reference: StepIngredientRef,
  before: RecipeDraft,
  after: RecipeDraft,
): string {
  return `${ingredientName(reference.ingredientId, before, after)} ${formatIngredientUsage(reference)}`;
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function ingredientRefDetails(
  beforeValue: unknown,
  afterValue: unknown,
  beforeDraft: RecipeDraft,
  afterDraft: RecipeDraft,
): string[] {
  const beforeRefs = Array.isArray(beforeValue) ? beforeValue.filter(isIngredientRef) : [];
  const afterRefs = Array.isArray(afterValue) ? afterValue.filter(isIngredientRef) : [];
  const beforeById = new Map(beforeRefs.map((reference) => [reference.ingredientId, reference]));
  const afterById = new Map(afterRefs.map((reference) => [reference.ingredientId, reference]));
  const details: string[] = [];

  for (const reference of beforeRefs) {
    const next = afterById.get(reference.ingredientId);
    if (!next) {
      details.push(`${ingredientRefText(reference, beforeDraft, afterDraft)}を削除`);
    } else if (formatIngredientUsage(reference) !== formatIngredientUsage(next)) {
      details.push(`${ingredientName(reference.ingredientId, beforeDraft, afterDraft)} ${formatIngredientUsage(reference)} → ${formatIngredientUsage(next)}`);
    }
  }
  for (const reference of afterRefs) {
    if (!beforeById.has(reference.ingredientId)) {
      details.push(`${ingredientRefText(reference, beforeDraft, afterDraft)}を追加`);
    }
  }

  const beforeOrder = beforeRefs.map((reference) => reference.ingredientId);
  const afterOrder = afterRefs.map((reference) => reference.ingredientId);
  if (!sameOrder(beforeOrder, afterOrder)
    && beforeOrder.length === afterOrder.length
    && beforeOrder.every((id) => afterById.has(id))) {
    const orderedNames = afterRefs.map((reference) => ingredientName(reference.ingredientId, beforeDraft, afterDraft));
    details.push(`並び順を変更：${orderedNames.join("、")}`);
  }

  return details.length ? details : ["使用材料を変更"];
}

function timerText(timer: RecipeTimerDraft): string {
  return `${timer.label || "タイマー"}（${formatTimerDuration(timer.seconds)}）`;
}

function timerDetails(beforeValue: unknown, afterValue: unknown): string[] {
  const beforeTimers = Array.isArray(beforeValue) ? beforeValue.filter(isTimer) : [];
  const afterTimers = Array.isArray(afterValue) ? afterValue.filter(isTimer) : [];
  const beforeById = new Map(beforeTimers.map((timer) => [timer.id, timer]));
  const afterById = new Map(afterTimers.map((timer) => [timer.id, timer]));
  const details: string[] = [];

  for (const timer of beforeTimers) {
    const next = afterById.get(timer.id);
    if (!next) {
      details.push(`${timerText(timer)}を削除`);
      continue;
    }
    if (timer.label === next.label && timer.seconds !== next.seconds) {
      details.push(`${next.label || "タイマー"}：${formatTimerDuration(timer.seconds)} → ${formatTimerDuration(next.seconds)}`);
    } else if (timer.label !== next.label || timer.seconds !== next.seconds) {
      details.push(`${timerText(timer)} → ${timerText(next)}`);
    }
  }
  for (const timer of afterTimers) {
    if (!beforeById.has(timer.id)) details.push(`${timerText(timer)}を追加`);
  }

  const beforeOrder = beforeTimers.map((timer) => timer.id);
  const afterOrder = afterTimers.map((timer) => timer.id);
  if (!sameOrder(beforeOrder, afterOrder)
    && beforeOrder.length === afterOrder.length
    && beforeOrder.every((id) => afterById.has(id))) {
    details.push(`並び順を変更：${afterTimers.map((timer) => timer.label || "タイマー").join("、")}`);
  }

  return details.length ? details : ["タイマーを変更"];
}

function stepForPath(path: string, draft: RecipeDraft) {
  const suffix = path.endsWith(".ingredientRefs") ? ".ingredientRefs" : ".timers";
  const stepId = path.slice("steps.".length, -suffix.length);
  return draft.steps.find((step) => step.id === stepId);
}

function formatIngredientSummary(value: unknown): string {
  if (!isRecord(value)) return formatPlainValue(value);
  const name = typeof value.name === "string" && value.name ? value.name : "名前なし";
  const amountText = typeof value.amountText === "string" ? value.amountText : "";
  const unit = typeof value.unit === "string" ? value.unit : "";
  const amount = `${amountText}${unit}` || "分量なし";
  return `${name}（${amount}）`;
}

function formatStepSummary(value: unknown): string {
  if (!isRecord(value)) return formatPlainValue(value);
  const order = typeof value.order === "number" ? `工程${value.order}` : "工程";
  const text = typeof value.text === "string" && value.text ? `：${value.text}` : "";
  return `${order}${text}`;
}

function formatOrderValue(path: string, value: unknown, draft: RecipeDraft): string {
  if (!Array.isArray(value)) return formatPlainValue(value);
  const ids = value.filter((item): item is string => typeof item === "string");
  if (path === "ingredients.order") {
    return ids.map((id) => draft.ingredients.find((ingredient) => ingredient.id === id)?.name || "名前不明の材料").join(" → ") || "なし";
  }
  if (path === "seasonings.order") {
    return ids.map((id) => draft.seasonings?.find((seasoning) => seasoning.id === id)?.name || "名前不明の調味料").join(" → ") || "なし";
  }
  if (path === "steps.order") {
    return ids.map((id) => {
      const step = draft.steps.find((candidate) => candidate.id === id);
      return step ? `工程${step.order}「${step.text}」` : "不明な工程";
    }).join(" → ") || "なし";
  }
  return formatPlainValue(value);
}

/** Converts a locally calculated recipe diff to readable Japanese without exposing raw JSON. */
export function formatRecipeDiffChange(
  change: RecipeDiffChange,
  beforeDraft: RecipeDraft,
  afterDraft: RecipeDraft,
): FormattedRecipeDiffChange {
  if (change.path.startsWith("steps.") && change.path.endsWith(".ingredientRefs")) {
    const step = stepForPath(change.path, afterDraft) ?? stepForPath(change.path, beforeDraft);
    return {
      label: `工程${step?.order ?? "?"}の材料`,
      before: formatPlainValue(change.before),
      after: formatPlainValue(change.after),
      details: ingredientRefDetails(change.before, change.after, beforeDraft, afterDraft),
    };
  }
  if (change.path.startsWith("steps.") && change.path.endsWith(".timers")) {
    const step = stepForPath(change.path, afterDraft) ?? stepForPath(change.path, beforeDraft);
    return {
      label: `工程${step?.order ?? "?"}のタイマー`,
      before: formatPlainValue(change.before),
      after: formatPlainValue(change.after),
      details: timerDetails(change.before, change.after),
    };
  }

  const isIngredientItem = change.path.startsWith("ingredients.")
    && change.path !== "ingredients.order"
    && change.path.split(".").length === 2;
  const isSeasoningItem = change.path.startsWith("seasonings.")
    && change.path !== "seasonings.order"
    && change.path.split(".").length === 2;
  const isStepItem = change.path.startsWith("steps.")
    && change.path !== "steps.order"
    && change.path.split(".").length === 2;
  const before = isIngredientItem || isSeasoningItem
    ? formatIngredientSummary(change.before)
    : isStepItem
      ? formatStepSummary(change.before)
      : formatOrderValue(change.path, change.before, beforeDraft);
  const after = isIngredientItem || isSeasoningItem
    ? formatIngredientSummary(change.after)
    : isStepItem
      ? formatStepSummary(change.after)
      : formatOrderValue(change.path, change.after, afterDraft);

  return { label: change.label, before, after };
}
