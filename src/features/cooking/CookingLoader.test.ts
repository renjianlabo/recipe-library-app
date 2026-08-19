import { describe, expect, it } from "vitest";

import type { Recipe } from "@/domain/recipe";

import { isSameRecipeVersion } from "./CookingLoader";

function version(id: string, updatedAt: string): Recipe {
  return { id, updatedAt } as Recipe;
}

describe("isSameRecipeVersion", () => {
  it("treats Firestore objects with the same id and updatedAt as the same version", () => {
    expect(isSameRecipeVersion(version("recipe-1", "2026-07-31T00:00:00.000Z"), {
      ...version("recipe-1", "2026-07-31T00:00:00.000Z"),
    })).toBe(true);
  });

  it("detects an id, timestamp, or availability change", () => {
    const current = version("recipe-1", "2026-07-31T00:00:00.000Z");
    expect(isSameRecipeVersion(current, version("recipe-2", current.updatedAt))).toBe(false);
    expect(isSameRecipeVersion(current, version("recipe-1", "2026-07-31T00:01:00.000Z"))).toBe(false);
    expect(isSameRecipeVersion(current, null)).toBe(false);
  });
});
