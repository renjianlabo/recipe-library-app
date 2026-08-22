export const ALLOWED_SERVINGS = [0.5, 1, 2, 3, 4] as const;

export type AllowedServing = (typeof ALLOWED_SERVINGS)[number];

export const QUALITATIVE_AMOUNTS = ["少々", "適量", "適宜", "ひとつまみ"] as const;

export type QualitativeAmount = (typeof QUALITATIVE_AMOUNTS)[number];

const QUALITATIVE_AMOUNT_SET = new Set<string>(QUALITATIVE_AMOUNTS);
const COMMON_FRACTIONS: ReadonlyArray<readonly [number, string]> = [
  [1 / 12, "1/12"],
  [1 / 8, "1/8"],
  [1 / 6, "1/6"],
  [1 / 4, "1/4"],
  [1 / 3, "1/3"],
  [3 / 8, "3/8"],
  [5 / 12, "5/12"],
  [1 / 2, "1/2"],
  [7 / 12, "7/12"],
  [5 / 8, "5/8"],
  [2 / 3, "2/3"],
  [3 / 4, "3/4"],
  [5 / 6, "5/6"],
  [7 / 8, "7/8"],
  [11 / 12, "11/12"],
];
const PREFIX_DISPLAY_UNITS = new Set(["大さじ", "小さじ"]);
const MEASURING_UNITS = new Set(["大さじ", "小さじ", "カップ"]);
const SAFE_EMBEDDED_AMOUNT_UNITS = new Set([
  "g", "kg", "mg", "ml", "L", "l", "cc", "個", "本", "枚", "玉", "束",
  "袋", "缶", "パック", "大さじ", "小さじ", "カップ", "合", "片", "丁", "cm",
]);
const CONTINUOUS_UNITS = new Set([
  "g",
  "kg",
  "mg",
  "ml",
  "l",
  "cc",
  "kcal",
  "cal",
  "グラム",
  "キログラム",
  "ミリグラム",
  "ミリリットル",
  "リットル",
]);
const NUMERIC_AMOUNT_SOURCE = String.raw`(?:\d+\s+\d+\s*\/\s*\d+|(?:\d+(?:\.\d+)?|\.\d+)\s*\/\s*(?:\d+(?:\.\d+)?|\.\d+)|(?:\d+(?:\.\d+)?|\.\d+))`;
const SUFFIXED_AMOUNT_PATTERN = new RegExp(`^(${NUMERIC_AMOUNT_SOURCE})\\s*(\\S.*)$`);

export interface IngredientAmount {
  amountText: string;
  numericAmount: number | null;
}

export interface FormattedIngredientAmount {
  amountText: string;
  unit: string;
  displayAmount: string;
}

export function cleanAmountText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .normalize("NFKC")
    .replaceAll("⁄", "/")
    .trim();
}

export function isQualitativeAmount(value: unknown): value is QualitativeAmount {
  return QUALITATIVE_AMOUNT_SET.has(cleanAmountText(value));
}

/**
 * Parses non-negative integers, decimals, simple fractions, and mixed fractions.
 * Qualitative or ambiguous text is deliberately returned as null.
 */
export function parseAmountText(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  const text = cleanAmountText(value);
  if (!text || isQualitativeAmount(text)) return null;

  if (/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) {
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const mixed = text.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const numerator = Number(mixed[2]);
    const denominator = Number(mixed[3]);
    if (denominator === 0 || numerator >= denominator) return null;
    return whole + numerator / denominator;
  }

  const fraction = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (!fraction) return null;
  const numerator = Number(fraction[1]);
  const denominator = Number(fraction[2]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

export function isAllowedServing(value: unknown): value is AllowedServing {
  return typeof value === "number" && ALLOWED_SERVINGS.includes(value as AllowedServing);
}

export function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return "";

  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute + 1e-10);
  const remainder = absolute - whole;
  const matched = COMMON_FRACTIONS.find(([fraction]) => Math.abs(remainder - fraction) < 0.002);

  if (matched) return `${sign}${whole ? `${whole} ` : ""}${matched[1]}`;
  if (Math.abs(remainder) < 0.002) return `${sign}${whole}`;

  return formatDecimalAmount(value);
}

export function formatDecimalAmount(value: number): string {
  if (!Number.isFinite(value)) return "";
  const rounded = Math.round((value + Number.EPSILON) * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function formatIngredientAmount(value: number, unit = ""): string {
  const normalizedUnit = cleanAmountText(unit).toLocaleLowerCase("ja");
  return CONTINUOUS_UNITS.has(normalizedUnit) ? formatDecimalAmount(value) : formatAmount(value);
}

export function formatNutritionAmount(value: number): string {
  return formatDecimalAmount(value);
}

export function formatAmountWithUnit(amountText: string, unit: string): string {
  const amount = cleanAmountText(amountText);
  const normalizedUnit = cleanAmountText(unit);
  if (!amount) return normalizedUnit;
  if (!normalizedUnit || isQualitativeAmount(amount)) return amount;
  return PREFIX_DISPLAY_UNITS.has(normalizedUnit) ? `${normalizedUnit}${amount}` : `${amount}${normalizedUnit}`;
}

export function parseAmountWithUnit(
  value: unknown,
  fallbackUnit = "",
): { numericAmount: number; unit: string } | null {
  const text = cleanAmountText(value);
  if (!text || isQualitativeAmount(text)) return null;

  const direct = parseAmountText(text);
  if (direct !== null) return { numericAmount: direct, unit: cleanAmountText(fallbackUnit) };

  for (const prefix of MEASURING_UNITS) {
    if (!text.startsWith(prefix)) continue;
    const numericAmount = parseAmountText(text.slice(prefix.length));
    if (numericAmount !== null) return { numericAmount, unit: prefix };
  }

  const suffixed = text.match(SUFFIXED_AMOUNT_PATTERN);
  if (!suffixed) return null;
  const numericAmount = parseAmountText(suffixed[1]);
  const unit = cleanAmountText(suffixed[2]);
  return numericAmount === null || !unit ? null : { numericAmount, unit };
}

export function formatScaledIngredientAmount(
  ingredient: IngredientAmount & { unit: string },
  savedServings: number,
  selectedServings: number,
  multiplier = 1,
): FormattedIngredientAmount {
  const unit = cleanAmountText(ingredient.unit);
  const scale = savedServings > 0 && Number.isFinite(savedServings)
    ? selectedServings / savedServings
    : 1;
  const multiplierIsOne = Math.abs(scale * multiplier - 1) < 1e-9;
  const amountText = ingredient.numericAmount === null || multiplierIsOne
    ? cleanAmountText(ingredient.amountText)
    : formatDecimalAmount(ingredient.numericAmount * scale * multiplier);
  return { amountText, unit, displayAmount: formatAmountWithUnit(amountText, unit) };
}

export function normalizeIngredientAmount(
  amountText: unknown,
  numericAmount: unknown = null,
  unit: unknown = "",
): IngredientAmount & { unit: string } {
  const text = cleanAmountText(amountText);
  const cleanUnit = cleanAmountText(unit);
  if (isQualitativeAmount(text)) {
    return { amountText: text, numericAmount: null, unit: cleanUnit };
  }

  if (isQualitativeAmount(cleanUnit)) {
    return { amountText: cleanUnit, numericAmount: null, unit: "" };
  }

  const parsedText = parseAmountText(text);
  if (parsedText !== null) {
    return { amountText: text, numericAmount: parsedText, unit: cleanUnit };
  }

  const parsedNumeric = parseAmountText(numericAmount);
  if (!text && parsedNumeric !== null) {
    return {
      amountText: formatAmount(parsedNumeric),
      numericAmount: parsedNumeric,
      unit: cleanUnit,
    };
  }

  return { amountText: text, numericAmount: null, unit: cleanUnit };
}

/**
 * Normalizes evidence extracted by AI without trusting its derived numeric value.
 * Only an exact numeric expression, optionally paired with a known unit, is
 * converted. Ambiguous text is preserved and deliberately remains unscaled.
 */
export function normalizeAiIngredientAmount(
  amountText: unknown,
  unit: unknown = "",
): IngredientAmount & { unit: string } {
  const text = cleanAmountText(amountText);
  const cleanUnit = cleanAmountText(unit);
  if (isQualitativeAmount(text)) {
    return { amountText: text, numericAmount: null, unit: cleanUnit };
  }
  if (isQualitativeAmount(cleanUnit)) {
    return { amountText: cleanUnit, numericAmount: null, unit: "" };
  }

  const direct = parseAmountText(text);
  if (direct !== null) {
    return {
      amountText: formatDecimalAmount(direct),
      numericAmount: direct,
      unit: cleanUnit,
    };
  }

  const combined = parseAmountWithUnit(text, cleanUnit);
  if (combined && SAFE_EMBEDDED_AMOUNT_UNITS.has(combined.unit)) {
    return {
      amountText: formatDecimalAmount(combined.numericAmount),
      numericAmount: combined.numericAmount,
      unit: combined.unit,
    };
  }

  return { amountText: text, numericAmount: null, unit: cleanUnit };
}

export function scaleAmount(
  value: IngredientAmount,
  fromServings: AllowedServing,
  toServings: AllowedServing,
): IngredientAmount {
  if (!isAllowedServing(fromServings) || !isAllowedServing(toServings)) {
    throw new RangeError("servings must be one of 0.5, 1, 2, 3, or 4");
  }
  if (isQualitativeAmount(value.amountText)) return { ...value, numericAmount: null };

  const numericAmount = value.numericAmount ?? parseAmountText(value.amountText);
  if (numericAmount === null) return { ...value, numericAmount: null };
  if (fromServings === toServings) return { ...value, numericAmount };

  const scaled = numericAmount * (toServings / fromServings);
  return { amountText: formatDecimalAmount(scaled), numericAmount: scaled };
}
