import { describe, expect, it } from "vitest";

import {
  analyzeIngredientNameRemoval,
  removeIngredientNameFromText,
} from "./ingredient-text";

describe("ingredient name removal", () => {
  it("removes a listed ingredient together with the preceding connector", () => {
    expect(removeIngredientNameFromText(
      "にんじんとにんにくを一緒に炒める。",
      "にんにく",
    )).toBe("にんじんを一緒に炒める。");
  });

  it("treats an instruction that depends on only the removed ingredient as not meaningful", () => {
    expect(analyzeIngredientNameRemoval(
      "にんにくを加えて香りが立つまで炒める。",
      "にんにく",
    )).toEqual({
      text: "加えて香りが立つまで炒める。",
      hasMeaningfulRemainder: false,
    });
  });

  it("keeps an independent instruction for another ingredient after the removed clause", () => {
    expect(analyzeIngredientNameRemoval(
      "にんにくを切り、にんじんを炒める。",
      "にんにく",
    )).toEqual({
      text: "切り、にんじんを炒める。",
      hasMeaningfulRemainder: true,
    });
  });

  it("removes a following list connector when the ingredient is first", () => {
    expect(removeIngredientNameFromText("にんにく、にんじんを切る。", "にんにく"))
      .toBe("にんじんを切る。");
    expect(removeIngredientNameFromText("にんにくやねぎを刻む。", "にんにく"))
      .toBe("ねぎを刻む。");
  });

  it("handles regular-expression characters in a material name literally", () => {
    expect(removeIngredientNameFromText("A+Bと塩を混ぜる。", "A+B"))
      .toBe("塩を混ぜる。");
  });
});
