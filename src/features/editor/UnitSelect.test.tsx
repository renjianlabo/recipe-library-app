import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { RECIPE_UNIT_OPTIONS, UnitSelect } from "./UnitSelect";

function Harness({ initialValue = "" }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  return <UnitSelect value={value} onChange={setValue} />;
}

describe("UnitSelect", () => {
  it("shows the requested shared unit choices", () => {
    render(<Harness />);
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      ...RECIPE_UNIT_OPTIONS.map(([, label]) => label),
      "その他",
    ]);
    expect(screen.getByRole("combobox", { name: "単位" })).toHaveValue("");
  });

  it("stores a preset unit and only shows free input for other", () => {
    render(<Harness />);
    const select = screen.getByRole("combobox", { name: "単位" });

    fireEvent.change(select, { target: { value: "g" } });
    expect(select).toHaveValue("g");
    expect(screen.queryByRole("textbox", { name: "その他の単位" })).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: "__other_unit__" } });
    const custom = screen.getByRole("textbox", { name: "その他の単位" });
    fireEvent.change(custom, { target: { value: "丁" } });
    expect(custom).toHaveValue("丁");
    expect(select).toHaveValue("__other_unit__");
  });

  it("keeps and displays a legacy free-input unit as other", () => {
    render(<Harness initialValue="滴" />);
    expect(screen.getByRole("combobox", { name: "単位" })).toHaveValue("__other_unit__");
    expect(screen.getByRole("textbox", { name: "その他の単位" })).toHaveValue("滴");
  });
});
