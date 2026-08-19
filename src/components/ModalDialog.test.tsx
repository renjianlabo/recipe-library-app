import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { ModalDialog } from "./ModalDialog";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>材料を削除</button>
      {open ? (
        <ModalDialog titleId="test-modal-title" onClose={() => setOpen(false)}>
          <h2 id="test-modal-title">確認</h2>
          <button type="button" data-modal-initial-focus onClick={() => setOpen(false)}>キャンセル</button>
          <button type="button">削除する</button>
        </ModalDialog>
      ) : null}
    </>
  );
}

describe("ModalDialog", () => {
  it("moves focus into the dialog, traps Tab, closes with Escape, and restores focus", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "材料を削除" });
    trigger.focus();
    fireEvent.click(trigger);

    const cancel = screen.getByRole("button", { name: "キャンセル" });
    const remove = screen.getByRole("button", { name: "削除する" });
    expect(cancel).toHaveFocus();

    remove.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(cancel).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(remove).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
