import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DemoEndDialog } from "./DemoEndDialog";

afterEach(cleanup);

describe("DemoEndDialog", () => {
  it("keeps data on cancel and only ends after explicit confirmation", () => {
    const cancel = vi.fn();
    const confirm = vi.fn();
    render(<DemoEndDialog open onCancel={cancel} onConfirm={confirm} />);
    expect(screen.getByText(/AI利用回数は24時間/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "デモを終了" }));
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});
