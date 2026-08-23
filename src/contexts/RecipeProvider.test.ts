import { beforeEach, describe, expect, it } from "vitest";

import { createDemoRecipes } from "@/domain/demo-recipes";
import { DEMO_RECIPES_STORAGE_KEY } from "@/lib/demo-local";
import { readDemoRecipes } from "./RecipeProvider";

describe("demo recipe storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("shows initial recipes only when the session has never stored a recipe list", () => {
    expect(readDemoRecipes()).toHaveLength(createDemoRecipes().length);
  });

  it("preserves an intentionally emptied recipe list across reloads", () => {
    window.localStorage.setItem(DEMO_RECIPES_STORAGE_KEY, "[]");
    expect(readDemoRecipes()).toEqual([]);
  });
});
