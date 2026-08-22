"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { createEmptyRecipeDraft, type RecipeDraft } from "@/domain/recipe";
import { RecipeEditor } from "@/features/editor/RecipeEditor";
import { readAiReviewSession } from "./creation-session";

export function ManualRecipeEntry({ editAiDraft = false }: { editAiDraft?: boolean }) {
  const [draft, setDraft] = useState<RecipeDraft | null | undefined>(editAiDraft ? undefined : createEmptyRecipeDraft());
  const [needsServingsConfirmation, setNeedsServingsConfirmation] = useState(false);

  useEffect(() => {
    if (!editAiDraft) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const session = readAiReviewSession();
      setDraft(session?.draft ?? null);
      setNeedsServingsConfirmation(session?.needsServingsConfirmation ?? false);
    });
    return () => { active = false; };
  }, [editAiDraft]);

  if (draft === undefined) return <main className="center-screen" aria-busy="true">レシピを読み込んでいます</main>;
  if (draft === null) return <main className="center-screen narrow-panel"><h1>編集するレシピがありません</h1><Link className="primary-flow-button" href="/create/ai">AIでレシピを作成</Link></main>;

  return (
    <RecipeEditor
      initialDraft={draft}
      draftKey={editAiDraft ? "ai-review-edit" : "new-manual"}
      heading={editAiDraft ? "レシピを編集" : "レシピを作成"}
      description="基本情報から順に、必要な項目を入力しましょう。"
      needsServingsConfirmation={needsServingsConfirmation}
      completionAfterSave
      clearAiSessionOnSave={editAiDraft}
      allowDraftRecovery={!editAiDraft}
      closeHref="/create"
    />
  );
}
