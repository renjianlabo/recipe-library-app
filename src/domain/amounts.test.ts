import { describe, expect, it } from "vitest";

import {
  ALLOWED_SERVINGS,
  formatAmount,
  formatAmountWithUnit,
  formatIngredientAmount,
  formatNutritionAmount,
  formatScaledIngredientAmount,
  isAllowedServing,
  normalizeIngredientAmount,
  normalizeAiIngredientAmount,
  parseAmountWithUnit,
  parseAmountText,
  scaleAmount,
} from "./amounts";

describe("amount helpers", () => {
  it("parses integers, decimals, full-width/simple fractions, and mixed fractions", () => {
    expect(parseAmountText("2")).toBe(2);
    expect(parseAmountText("0.75")).toBe(0.75);
    expect(parseAmountText(".5")).toBe(0.5);
    expect(parseAmountText(" 3 / 4 ")).toBe(0.75);
    expect(parseAmountText("１／３")).toBeCloseTo(1 / 3);
    expect(parseAmountText("½")).toBe(0.5);
    expect(parseAmountText("1 1/2")).toBe(1.5);
  });

  it("does not guess blank, qualitative, negative, malformed, or zero-denominator input", () => {
    for (const value of ["", "少々", "適量", "適宜", "ひとつまみ", "-1", "1/0", "1 2/2", "約2", null, undefined]) {
      expect(parseAmountText(value)).toBeNull();
    }
  });

  it("only accepts the five new serving counts", () => {
    expect(ALLOWED_SERVINGS).toEqual([0.5, 1, 2, 3, 4]);
    for (const servings of ALLOWED_SERVINGS) expect(isAllowedServing(servings)).toBe(true);
    for (const servings of [0, 1.5, 2.5, 3.5, 4.5, 20, "2"]) {
      expect(isAllowedServing(servings)).toBe(false);
    }
  });

  it("moves legacy qualitative units into amountText and discards misleading numbers", () => {
    expect(normalizeIngredientAmount(0.1, 0.1, "少々")).toEqual({
      amountText: "少々",
      numericAmount: null,
      unit: "",
    });
    expect(normalizeIngredientAmount("適量", null, "")).toEqual({
      amountText: "適量",
      numericAmount: null,
      unit: "",
    });
    expect(normalizeIngredientAmount("適宜", null, "")).toEqual({
      amountText: "適宜",
      numericAmount: null,
      unit: "",
    });
  });

  it("deterministically normalizes AI amounts with known embedded units", () => {
    const cases = [
      ["150g", "150", 150, "g"],
      ["150 g", "150", 150, "g"],
      ["2個", "2", 2, "個"],
      ["1/2個", "0.5", 0.5, "個"],
      ["0.5個", "0.5", 0.5, "個"],
      ["大さじ2", "2", 2, "大さじ"],
      ["大さじ 2", "2", 2, "大さじ"],
      ["小さじ1", "1", 1, "小さじ"],
      ["60ml", "60", 60, "ml"],
      ["60 ml", "60", 60, "ml"],
    ] as const;

    for (const [input, amountText, numericAmount, unit] of cases) {
      expect(normalizeAiIngredientAmount(input)).toEqual({ amountText, numericAmount, unit });
    }
  });

  it("keeps ambiguous AI amounts and never invents a numeric value", () => {
    for (const input of ["少々", "適量", "適宜", "ひとつまみ", "1袋（200g）", "1本程度", "お好みで"]) {
      expect(normalizeAiIngredientAmount(input)).toEqual({
        amountText: input.normalize("NFKC"),
        numericAmount: null,
        unit: "",
      });
    }
  });

  it("scales numeric values to every allowed serving count and leaves qualitative text unchanged", () => {
    const base = { amountText: "200", numericAmount: 200 };
    expect(ALLOWED_SERVINGS.map((to) => scaleAmount(base, 2, to).numericAmount)).toEqual([
      50, 100, 200, 300, 400,
    ]);
    expect(scaleAmount({ amountText: "1/2", numericAmount: 0.5 }, 2, 3)).toEqual({
      amountText: "0.75",
      numericAmount: 0.75,
    });
    expect(scaleAmount({ amountText: "ひとつまみ", numericAmount: null }, 1, 4)).toEqual({
      amountText: "ひとつまみ",
      numericAmount: null,
    });
    for (const amountText of ["少々", "適量", "適宜", "ひとつまみ", "お好みで"]) {
      expect(scaleAmount({ amountText, numericAmount: null }, 2, 4)).toEqual({
        amountText,
        numericAmount: null,
      });
    }
  });

  it("formats common fractions, mixed numbers, and other values without long decimals", () => {
    expect(formatAmount(0.5)).toBe("1/2");
    expect(formatAmount(0.167)).toBe("1/6");
    expect(formatAmount(1 / 12)).toBe("1/12");
    expect(formatAmount(1 / 3)).toBe("1/3");
    expect(formatAmount(2 / 3)).toBe("2/3");
    expect(formatAmount(1.25)).toBe("1 1/4");
    expect(formatAmount(1.75)).toBe("1 3/4");
    expect(formatAmount(0.625)).toBe("5/8");
    expect(formatAmount(1.23456)).toBe("1.235");
  });

  it("uses decimals for continuous and nutrition values, and fractions for countable values", () => {
    expect(formatAmountWithUnit(formatIngredientAmount(37.5, "g"), "g")).toBe("37.5g");
    expect(formatAmountWithUnit(formatIngredientAmount(320.5, "kcal"), "kcal")).toBe("320.5kcal");
    expect(formatAmountWithUnit(formatIngredientAmount(1 / 12, "個"), "個")).toBe("1/12個");
    expect(formatNutritionAmount(320.5)).toBe("320.5");
    expect(formatNutritionAmount(1 / 2)).toBe("0.5");
  });

  it("places Japanese measuring units before amounts and parses either order", () => {
    expect(formatAmountWithUnit(formatIngredientAmount(1, "大さじ"), "大さじ")).toBe("大さじ1");
    expect(formatAmountWithUnit(formatIngredientAmount(0.167, "カップ"), "カップ")).toBe("1/6カップ");
    expect(parseAmountWithUnit("大さじ1/2", "個")).toEqual({ numericAmount: 0.5, unit: "大さじ" });
    expect(parseAmountWithUnit("50g", "個")).toEqual({ numericAmount: 50, unit: "g" });
  });

  it("scales and formats a complete ingredient display in one domain helper", () => {
    expect(formatScaledIngredientAmount({ amountText: "75", numericAmount: 75, unit: "g" }, 2, 1)).toEqual({
      amountText: "37.5",
      unit: "g",
      displayAmount: "37.5g",
    });
    expect(formatScaledIngredientAmount({ amountText: "1", numericAmount: 1, unit: "個" }, 2, 1)).toEqual({
      amountText: "0.5",
      unit: "個",
      displayAmount: "0.5個",
    });
    expect(formatScaledIngredientAmount({ amountText: "1.5", numericAmount: 1.5, unit: "個" }, 2, 2).displayAmount).toBe("1.5個");
  });
});
