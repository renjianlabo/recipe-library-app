import type { RecipeDraft } from "./recipe";

export type RecipeDiffKind = "added" | "removed" | "changed" | "reordered";

export interface RecipeDiffChange {
  kind: RecipeDiffKind;
  path: string;
  label: string;
  before: unknown;
  after: unknown;
}

export interface RecipeDiff {
  hasChanges: boolean;
  changes: RecipeDiffChange[];
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function addChange(
  changes: RecipeDiffChange[],
  path: string,
  label: string,
  before: unknown,
  after: unknown,
  kind: RecipeDiffKind = "changed",
): void {
  if (!equal(before, after)) changes.push({ kind, path, label, before, after });
}

function diffIdentifiedItems<T extends { id: string }>(
  changes: RecipeDiffChange[],
  key: string,
  label: string,
  beforeItems: readonly T[],
  afterItems: readonly T[],
  fields: ReadonlyArray<readonly [keyof T, string]>,
): void {
  const beforeById = new Map(beforeItems.map((item) => [item.id, item]));
  const afterById = new Map(afterItems.map((item) => [item.id, item]));

  for (const item of beforeItems) {
    if (!afterById.has(item.id)) {
      changes.push({
        kind: "removed",
        path: `${key}.${item.id}`,
        label: `${label}を削除`,
        before: item,
        after: undefined,
      });
    }
  }
  for (const item of afterItems) {
    const before = beforeById.get(item.id);
    if (!before) {
      changes.push({
        kind: "added",
        path: `${key}.${item.id}`,
        label: `${label}を追加`,
        before: undefined,
        after: item,
      });
      continue;
    }
    for (const [field, fieldLabel] of fields) {
      addChange(
        changes,
        `${key}.${item.id}.${String(field)}`,
        `${label}の${fieldLabel}`,
        before[field],
        item[field],
      );
    }
  }

  const beforeOrder = beforeItems.map((item) => item.id).filter((id) => afterById.has(id));
  const afterOrder = afterItems.map((item) => item.id).filter((id) => beforeById.has(id));
  if (!equal(beforeOrder, afterOrder)) {
    changes.push({
      kind: "reordered",
      path: `${key}.order`,
      label: `${label}の並び順`,
      before: beforeOrder,
      after: afterOrder,
    });
  }
}

/** Computes changes locally from two validated drafts; AI-supplied diff text is never trusted. */
export function diffRecipes(before: RecipeDraft, after: RecipeDraft): RecipeDiff {
  const changes: RecipeDiffChange[] = [];
  addChange(changes, "title", "レシピ名", before.title, after.title);
  addChange(changes, "category", "分類", before.category, after.category);
  addChange(changes, "servings", "人数", before.servings, after.servings);
  addChange(changes, "tips", "ポイント", before.tips, after.tips);
  addChange(changes, "memo", "メモ", before.memo, after.memo);
  addChange(changes, "tags", "タグ", before.tags, after.tags);
  addChange(changes, "source", "出典", before.source, after.source);

  diffIdentifiedItems(changes, "ingredients", "材料", before.ingredients, after.ingredients, [
    ["name", "名前"],
    ["amountText", "分量"],
    ["numericAmount", "数値分量"],
    ["unit", "単位"],
    ["note", "補足"],
    ["nutritionFoodId", "食品紐付け"],
  ]);
  diffIdentifiedItems(changes, "steps", "工程", before.steps, after.steps, [
    ["order", "順番"],
    ["text", "本文"],
    ["ingredientRefs", "使用材料"],
    ["timers", "タイマー"],
  ]);

  return { hasChanges: changes.length > 0, changes };
}

