import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { TimerSetupFields } from "./TimerWheelPicker";

function Harness() {
  const [minutes, setMinutes] = useState(5);
  const [seconds, setSeconds] = useState(30);
  return <TimerSetupFields label="" minutes={minutes} seconds={seconds} onLabelChange={() => undefined} onMinutesChange={setMinutes} onSecondsChange={setSeconds} />;
}

describe("TimerSetupFields", () => {
  it("renders swipeable minute and second wheels with the exact ranges", () => {
    render(<Harness />);
    const minuteWheel = screen.getByRole("listbox", { name: "分" });
    const secondWheel = screen.getByRole("listbox", { name: "秒" });
    expect(within(minuteWheel).getAllByRole("option")).toHaveLength(61);
    expect(within(secondWheel).getAllByRole("option").map((option) => option.textContent)).toEqual(["0", "10", "20", "30", "40", "50"]);
    expect(within(secondWheel).queryByRole("option", { name: "60" })).not.toBeInTheDocument();
    fireEvent.keyDown(secondWheel, { key: "ArrowDown" });
    expect(within(secondWheel).getByRole("option", { name: "40" })).toHaveAttribute("aria-selected", "true");
  });
});
