import { describe, expect, it } from "vitest";

import { normalizeOilName, normalizeOilText, normalizeRecipeOils } from "./oil-normalization";

describe("oil normalization", () => {
  it("normalizes designated cooking oils and preserves olive and sesame oil", () => {
    for (const name of [
      "サラダ油",
      "米油",
      "菜種油",
      "キャノーラ油",
      "植物油",
      "オリーブ油",
      "白絞油",
      "揚げ油",
      "えごま油",
      "油",
    ]) {
      expect(normalizeOilName(name)).toBe("オリーブオイル");
    }
    expect(normalizeOilName("オリーブオイル")).toBe("オリーブオイル");
    expect(normalizeOilName("ごま油")).toBe("ごま油");
  });

  it("updates instruction text naturally without corrupting soy sauce or fried tofu", () => {
    expect(normalizeOilText("フライパンにサラダ油を熱し、ごま油と醤油を加える。"))
      .toBe("フライパンにオリーブオイルを熱し、ごま油と醤油を加える。");
    expect(normalizeOilText("油を熱して油揚げを焼く。"))
      .toBe("オリーブオイルを熱して油揚げを焼く。");
    expect(normalizeOilText("灯油を料理に使ってはいけない。"))
      .toBe("灯油を料理に使ってはいけない。");
  });

  it("preserves oil-like protected terms in ingredient names and instructions", () => {
    for (const name of ["ラー油", "辣油", "醤油", "油揚げ", "油分"]) {
      expect(normalizeOilName(name)).toBe(name);
    }
    expect(normalizeOilText("ラー油と辣油、醤油、油揚げの油分はそのままにする。"))
      .toBe("ラー油と辣油、醤油、油揚げの油分はそのままにする。");
  });

  it("normalizes newly supported oils inside instructions", () => {
    expect(normalizeOilText("オリーブ油と白絞油、揚げ油、えごま油を使う。"))
      .toBe("オリーブオイルとオリーブオイル、オリーブオイル、オリーブオイルを使う。");
  });

  it("normalizes ingredient names and step text through one pure recipe function", () => {
    const original = {
      ingredients: [{ name: "米油", amountText: "1" }],
      steps: [{ text: "米油で炒める。", order: 1 }],
    };
    const normalized = normalizeRecipeOils(original);
    expect(normalized.ingredients[0].name).toBe("オリーブオイル");
    expect(normalized.steps[0].text).toBe("オリーブオイルで炒める。");
    expect(original.ingredients[0].name).toBe("米油");
  });
});
