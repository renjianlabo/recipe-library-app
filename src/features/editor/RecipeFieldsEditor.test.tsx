import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

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
    <RecipeFieldsEditor
      draft={draft}
      onChange={setDraft}
      onRequestIngredientDelete={() => undefined}
    />
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
