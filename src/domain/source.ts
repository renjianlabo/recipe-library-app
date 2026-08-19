export const RECIPE_SOURCE_TYPES = ["manual", "text", "screenshot", "youtube", "website"] as const;

export type RecipeSourceType = (typeof RECIPE_SOURCE_TYPES)[number];

export interface RecipeSource {
  type: RecipeSourceType;
  url: string | null;
}

export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeRecipeSource(value: unknown): RecipeSource {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as { type?: unknown; url?: unknown }
    : {};
  const type = RECIPE_SOURCE_TYPES.includes(source.type as RecipeSourceType)
    ? source.type as RecipeSourceType
    : "manual";

  if (type !== "youtube" && type !== "website") return { type, url: null };
  const url = typeof source.url === "string" ? source.url.trim() : null;
  return { type, url: isHttpUrl(url) ? url : null };
}

export function normalizeLegacySource(value: unknown): RecipeSource {
  if (value === "manual" || value === "claude") return { type: "manual", url: null };
  return normalizeRecipeSource(value);
}

