import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { PantryContext } from "@/contexts/PantryProvider";
import { createEmptyRecipeDraft, type RecipeDraft } from "@/domain/recipe";

import { RecipeFieldsEditor } from "./RecipeFieldsEditor";

function timerDraft(): RecipeDraft {
  const draft = createEmptyRecipeDraft();
  draft.steps[0].timers = [{ id: "timer-1", label: "煮る", seconds: 300 }];
  return draft;
}

function Harness() {
  const [draft, setDraft] = useState(timerDraft);
  return (
    <PantryContext.Provider value={{
      selected: new Set(["塩", "しょうゆ"]),
      custom: ["自家製たれ"],
      loading: false,
      toggle: async () => undefined,
      addCustom: async () => undefined,
    }}>
      <RecipeFieldsEditor
        draft={draft}
        onChange={setDraft}
        onRequestIngredientDelete={() => undefined}
      />
    </PantryContext.Provider>
  );
}

describe("RecipeFieldsEditor timer input", () => {
  it("shows Japanese errors for blank, zero, negative, and excessive time", () => {
    render(<Harness />);
    const input = screen.getByRole("spinbutton", { name: "分" });

    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByRole("alert")).toHaveTextContent("タイマー時間を入力してください");

    fireEvent.change(input, { target: { value: "0" } });
    expect(screen.getByRole("alert")).toHaveTextContent("タイマー時間は1秒以上で入力してください");

    fireEvent.change(input, { target: { value: "-1" } });
    expect(screen.getByRole("alert")).toHaveTextContent("タイマー時間は1秒以上で入力してください");

    fireEvent.change(input, { target: { value: "1440.1" } });
    expect(screen.getByRole("alert")).toHaveTextContent("タイマー時間は24時間以内で入力してください");

    fireEvent.change(input, { target: { value: "5" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("RecipeFieldsEditor ingredients and seasonings", () => {
  it("keeps numeric, fractional, and Japanese amount text without input-time rewriting", () => {
    render(<Harness />);
    const amount = screen.getByLabelText("分量 *", { exact: true });
    for (const value of ["300", "0.5", "1/2", "少々", "適量", "適宜", "ひとつまみ"]) {
      fireEvent.change(amount, { target: { value } });
      expect(amount).toHaveValue(value);
    }
    expect(amount).not.toHaveAttribute("inputmode", "decimal");
  });

  it("provides pantry seasonings as suggestions while retaining free input", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "調味料を追加" }));

    const name = screen.getByLabelText("調味料名 *", { exact: true });
    expect(name).toHaveAttribute("list", "pantry-seasoning-options");
    expect(document.querySelectorAll("#pantry-seasoning-options option")).toHaveLength(3);

    fireEvent.change(name, { target: { value: "候補にないスパイス" } });
    expect(name).toHaveValue("候補にないスパイス");
    const amounts = screen.getAllByLabelText("分量 *", { exact: true });
    fireEvent.change(amounts[1], { target: { value: "適量" } });
    expect(amounts[1]).toHaveValue("適量");
  });
});
