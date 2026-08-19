import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteRecipeLibraryLocalDatabase,
  loadLocalDraft,
  saveLocalDraft,
} from "@/lib/indexed-db";
import { useDraftAutosave } from "./useDraftAutosave";

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ user: { uid: "user-a" } }),
}));

type Draft = { title: string };
function Harness({ onRestore }: { onRestore: (draft: Draft | null) => void }) {
  const autosave = useDraftAutosave<Draft>({
    draftKey: "edit-recipe-1",
    value: { title: "現在の入力" },
    delayMs: 60_000,
  });
  return (
    <>
      <span>{autosave.recoveryState}</span>
      <button type="button" onClick={() => onRestore(autosave.restoreDraft())}>復元</button>
      <button type="button" onClick={() => void autosave.discardRecoveredDraft()}>破棄</button>
    </>
  );
}

describe("useDraftAutosave recovery", () => {
  beforeEach(async () => {
    await deleteRecipeLibraryLocalDatabase();
  });

  it("restores the saved draft and then enables autosave", async () => {
    await saveLocalDraft("user-a", "edit-recipe-1", { title: "前回の入力" });
    const onRestore = vi.fn();
    render(<Harness onRestore={onRestore} />);
    await screen.findByText("available");

    fireEvent.click(screen.getByRole("button", { name: "復元" }));

    expect(onRestore).toHaveBeenCalledWith({ title: "前回の入力" });
    expect(screen.getByText("ready")).toBeInTheDocument();
  });

  it("deletes a discarded recovery draft", async () => {
    await saveLocalDraft("user-a", "edit-recipe-1", { title: "破棄する入力" });
    render(<Harness onRestore={() => undefined} />);
    await screen.findByText("available");

    fireEvent.click(screen.getByRole("button", { name: "破棄" }));
    await screen.findByText("ready");

    await expect(loadLocalDraft("user-a", "edit-recipe-1")).resolves.toBeNull();
    expect(screen.getByText("ready")).toBeInTheDocument();
  });
});
