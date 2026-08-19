const CONVERTIBLE_OIL_PATTERN = new RegExp(
  [
    "サラダ油",
    "オリーブ油",
    "白絞油",
    "揚げ油",
    "えごま油",
    "米油",
    "こめ油",
    "菜種油",
    "なたね油",
    "キャノーラ油",
    "植物油",
    "食用油",
    "大豆油",
    "コーン油",
    "ひまわり油",
    "紅花油",
    "べに花油",
    "綿実油",
    "落花生油",
    "グレープシードオイル",
    "アボカドオイル",
  ].join("|"),
  "g",
);

const PROTECTED_TERMS = [
  "オリーブオイル",
  "ごま油",
  "ラー油",
  "辣油",
  "醤油",
  "油揚げ",
  "油分",
  "油麩",
  "油そば",
] as const;
const PLACEHOLDER_PREFIX = "__RECIPE_OIL_PROTECTED_";

function protectTerms(value: string): { text: string; terms: string[] } {
  const terms: string[] = [];
  let text = value;
  for (const term of PROTECTED_TERMS) {
    text = text.replaceAll(term, () => {
      const index = terms.push(term) - 1;
      return `${PLACEHOLDER_PREFIX}${index}__`;
    });
  }
  return { text, terms };
}

function restoreTerms(value: string, terms: readonly string[]): string {
  return terms.reduce(
    (text, term, index) => text.replaceAll(`${PLACEHOLDER_PREFIX}${index}__`, term),
    value,
  );
}

/** Normalizes an ingredient name without confusing soy sauce or fried tofu with cooking oil. */
export function normalizeOilName(value: string): string {
  const name = value.normalize("NFKC").trim();
  if (!name) return "";
  if (name === "オリーブオイル" || name === "ごま油") return name;

  const explicit = name.replace(CONVERTIBLE_OIL_PATTERN, "オリーブオイル");
  if (explicit !== name) return explicit;
  return name === "油" ? "オリーブオイル" : name;
}

/** Applies the same oil rule to natural-language cooking instructions. */
export function normalizeOilText(value: string): string {
  const normalized = value.normalize("NFKC").replace(
    CONVERTIBLE_OIL_PATTERN,
    "オリーブオイル",
  );
  const protectedValue = protectTerms(normalized);
  let text = protectedValue.text;

  // Replace the standalone ingredient word 「油」without corrupting words such as 石油 or 灯油.
  text = text.replace(
    /(^|[\s、。,.「」（）()をにへとでがはもやてのな])油(?=$|[\s、。,.「」（）()をにでへとがはも])/g,
    (_match, prefix: string) => `${prefix}オリーブオイル`,
  );
  return restoreTerms(text, protectedValue.terms);
}

export interface OilNormalizableRecipe {
  ingredients: Array<{ name: string }>;
  steps: Array<{ text: string }>;
}

export function normalizeRecipeOils<T extends OilNormalizableRecipe>(recipe: T): T {
  return {
    ...recipe,
    ingredients: recipe.ingredients.map((ingredient) => ({
      ...ingredient,
      name: normalizeOilName(ingredient.name),
    })),
    steps: recipe.steps.map((step) => ({
      ...step,
      text: normalizeOilText(step.text),
    })),
  };
}
