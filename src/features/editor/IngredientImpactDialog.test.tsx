import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { RecipeDraft } from "@/domain/recipe";

import { IngredientImpactDialog } from "./IngredientImpactDialog";

function draft(): RecipeDraft {
  return {
    title: "野菜炒め",
    category: "main",
    servings: 2,
    ingredients: [
      { id: "carrot", name: "にんじん", amountText: "1", numericAmount: 1, unit: "本", note: "" },
      { id: "garlic", name: "にんにく", amountText: "1", numericAmount: 1, unit: "片", note: "" },
    ],
    steps: [
      {
        id: "step-1",
        order: 1,
        text: "にんじんとにんにくを一緒に炒める。",
        ingredientRefs: [
          { ingredientId: "carrot", usage: "all" },
          { ingredientId: "garlic", usage: "all" },
        ],
        timers: [],
      },
      {
        id: "step-2",
        order: 2,
        text: "にんにくを加えて香りが立つまで炒める。",
        ingredientRefs: [{ ingredientId: "garlic", usage: "all" }],
        timers: [],
      },
    ],
    tips: [],
    memo: "",
    tags: [],
    source: { type: "manual", url: null },
  };
}

describe("IngredientImpactDialog", () => {
  it("defaults ingredient-only instructions to deletion and applies an editable removal preview", () => {
    const onApply = vi.fn();
    render(
      <IngredientImpactDialog
        draft={draft()}
        ingredientId="garlic"
        onCancel={() => undefined}
        onApply={onApply}
        onAskAi={() => undefined}
      />,
    );

    const firstImpact = screen.getByText("にんじんとにんにくを一緒に炒める。").closest("article");
    const secondImpact = screen.getByText("にんにくを加えて香りが立つまで炒める。").closest("article");
    expect(firstImpact).not.toBeNull();
    expect(secondImpact).not.toBeNull();
    expect(within(firstImpact!).getByRole("combobox")).toHaveValue("keep");
    expect(within(secondImpact!).getByRole("combobox")).toHaveValue("delete");

    fireEvent.change(within(firstImpact!).getByRole("combobox"), { target: { value: "remove-name" } });
    const preview = within(firstImpact!).getByRole("textbox", { name: "工程の編集結果" });
    expect(preview).toHaveValue("にんじんを一緒に炒める。");
    fireEvent.change(preview, { target: { value: "にんじんを弱火で炒める。" } });
    fireEvent.click(screen.getByRole("button", { name: "選択内容で削除" }));

    expect(onApply).toHaveBeenCalledTimes(1);
    const result = onApply.mock.calls[0][0] as RecipeDraft;
    expect(result.ingredients.map((ingredient) => ingredient.id)).toEqual(["carrot"]);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({
      order: 1,
      text: "にんじんを弱火で炒める。",
      ingredientRefs: [{ ingredientId: "carrot", usage: "all" }],
    });
  });

  it("keeps the existing manual, delete, keep, and AI choices", () => {
    const onAskAi = vi.fn();
    render(
      <IngredientImpactDialog
        draft={draft()}
        ingredientId="garlic"
        onCancel={() => undefined}
        onApply={() => undefined}
        onAskAi={onAskAi}
      />,
    );

    const options = within(screen.getAllByRole("combobox")[0]).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "文章はそのまま残す",
      "材料名だけ除く",
      "この工程を削除",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "AIに修正を頼む" }));
    expect(onAskAi).toHaveBeenCalledWith(expect.stringContaining("材料「にんにく」を削除"));
  });
});
