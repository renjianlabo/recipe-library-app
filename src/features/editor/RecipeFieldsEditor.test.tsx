import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { createEmptyRecipeDraft } from "@/domain/recipe";
import { RecipeFieldsEditor } from "./RecipeFieldsEditor";

function Harness() {
  const [draft, setDraft] = useState(createEmptyRecipeDraft);
  return <RecipeFieldsEditor draft={draft} onChange={setDraft} />;
}

describe("RecipeFieldsEditor", () => {
  it("keeps numeric, fractional, and Japanese amount text without rewriting", () => {
    render(<Harness />);
    const amount = screen.getByLabelText("分量", { exact: true });
    for (const value of ["300", "0.5", "1/2", "少々", "適量", "適宜", "ひとつまみ"]) {
      fireEvent.change(amount, { target: { value } });
      expect(amount).toHaveValue(value);
    }
    expect(amount).not.toHaveAttribute("inputmode", "decimal");
  });

  it("adds a free-input seasoning with the shared unit selector and no candidates", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "＋ 調味料を追加" }));

    const name = screen.getByLabelText("調味料名", { exact: true });
    expect(name).not.toHaveAttribute("list");
    fireEvent.change(name, { target: { value: "候補にないスパイス" } });
    expect(name).toHaveValue("候補にないスパイス");

    const amounts = screen.getAllByLabelText("分量", { exact: true });
    fireEvent.change(amounts[1], { target: { value: "適量" } });
    expect(amounts[1]).toHaveValue("適量");

    const materialUnit = screen.getByRole("combobox", { name: "材料1の単位" });
    const seasoningUnit = screen.getByRole("combobox", { name: "調味料1の単位" });
    fireEvent.change(materialUnit, { target: { value: "個" } });
    fireEvent.change(seasoningUnit, { target: { value: "大さじ" } });
    expect(materialUnit).toHaveValue("個");
    expect(seasoningUnit).toHaveValue("大さじ");
  });

  it("shows the Figma section order without AI revision controls", () => {
    render(<Harness />);
    expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "基本情報", "材料", "調味料", "作り方", "その他",
    ]);
    expect(screen.getByText("料理名 ＊")).toBeInTheDocument();
    expect(screen.getByText("カテゴリー ＊")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /カテゴリー/ })).toBeRequired();
    expect(screen.getByText("人数")).toBeInTheDocument();
    expect(screen.queryByText("人数 ＊")).not.toBeInTheDocument();
    expect(screen.queryByText("AIに追加修正を頼む")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("修正指示")).not.toBeInTheDocument();
    expect(screen.queryByText("工程タイトルは不要です")).not.toBeInTheDocument();
  });

  it("adds, edits, and removes optional step timers with automatic names", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "＋ タイマーを設定" }));
    fireEvent.change(screen.getByLabelText("タイマー名"), { target: { value: "煮込み" } });
    fireEvent.click(within(screen.getByRole("listbox", { name: "分" })).getByRole("option", { name: "10" }));
    fireEvent.click(within(screen.getByRole("listbox", { name: "秒" })).getByRole("option", { name: "30" }));
    fireEvent.click(screen.getByRole("button", { name: "設定する" }));
    expect(screen.getByText("煮込み").closest(".step-timer-summary")).toHaveTextContent("煮込み 10分30秒");

    fireEvent.click(screen.getByRole("button", { name: "＋ タイマーを設定" }));
    fireEvent.click(screen.getByRole("button", { name: "設定する" }));
    expect(screen.getByText("タイマー1").closest(".step-timer-summary")).toHaveTextContent("タイマー1 5分");

    fireEvent.click(screen.getAllByRole("button", { name: "編集" })[1]);
    fireEvent.change(screen.getByLabelText("タイマー名"), { target: { value: "蒸らし" } });
    fireEvent.click(screen.getByRole("button", { name: "変更する" }));
    expect(screen.getByText("蒸らし").closest(".step-timer-summary")).toHaveTextContent("蒸らし 5分");

    fireEvent.click(screen.getAllByRole("button", { name: "削除" })[0]);
    expect(screen.queryByText("煮込み")).not.toBeInTheDocument();
  });
});
