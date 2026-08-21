"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AppIcon } from "@/components/AppIcon";
import { AuthGate } from "@/components/AuthGate";
import { useAuth } from "@/contexts/AuthProvider";
import { useRecipes } from "@/contexts/RecipeProvider";
import { formatAmountWithUnit } from "@/domain/amounts";
import { finalizeRecipeDraft, normalizeRecipeDraft, type RecipeDraft } from "@/domain/recipe";
import { CATEGORY_LABELS } from "@/lib/presentation";
import {
  clearAiReviewSession,
  readAiReviewSession,
  saveCompletionReceipt,
  type AiReviewSession,
} from "./creation-session";

function IngredientReview({ items }: { items: RecipeDraft["ingredients"] }) {
  return (
    <div className="ingredient-review">
      {items.map((item) => (
        <div key={item.id}>
          <span>{item.name}</span>
          <b>{formatAmountWithUnit(item.amountText, item.unit)}</b>
        </div>
      ))}
    </div>
  );
}

export function AiRecipeReview() {
  const router = useRouter();
  const { user } = useAuth();
  const { saveRecipe } = useRecipes();
  const [session, setSession] = useState<AiReviewSession | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const warnings = useMemo(
    () => [...new Set(session?.warnings.map((warning) => warning.trim()).filter(Boolean) ?? [])],
    [session],
  );

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setSession(readAiReviewSession());
    });
    return () => { active = false; };
  }, []);

  const save = async () => {
    if (!session || !user) {
      setSaveError("保存するにはログインしてください。");
      return;
    }
    if (session.draft.servings === null || session.needsServingsConfirmation) {
      setSaveError("人数を確認して、編集画面で0.5・1・2・3・4人前から選択してください。");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const now = new Date().toISOString();
      const recipe = finalizeRecipeDraft(normalizeRecipeDraft(session.draft), {
        id: crypto.randomUUID(),
        userId: user.uid,
        isFavorite: false,
        createdAt: now,
        updatedAt: now,
      });
      await saveRecipe(recipe, { expectedUpdatedAt: null });
      saveCompletionReceipt({ recipeId: recipe.id, recipeTitle: recipe.title });
      clearAiReviewSession();
      router.replace("/create/complete");
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "保存できませんでした。内容は保持しています。");
    } finally {
      setSaving(false);
    }
  };

  if (session === undefined) {
    return <AuthGate><main className="center-screen" aria-busy="true">レシピを読み込んでいます</main></AuthGate>;
  }

  if (session === null) {
    return (
      <AuthGate>
        <main className="page-container flow-page ai-review-page">
          <header className="flow-header"><Link href="/create" aria-label="作成を閉じる"><AppIcon name="x" size={22} /></Link><h1>レシピを確認</h1></header>
          <section className="review-missing"><p>確認するレシピがありません。</p><Link className="primary-flow-button" href="/create/ai">AIでレシピを作成</Link></section>
        </main>
      </AuthGate>
    );
  }

  const { draft } = session;
  const hasOther = draft.tips.length > 0
    || Boolean(draft.memo)
    || ((draft.source.type === "youtube" || draft.source.type === "website") && Boolean(draft.source.url));

  return (
    <AuthGate>
      <main className="page-container flow-page ai-review-page">
        <header className="flow-header"><Link href="/create" aria-label="作成を閉じる"><AppIcon name="x" size={22} /></Link><h1>レシピを確認</h1></header>

        <div className="review-content">
          {warnings.length > 0 ? (
            <section className="ai-review-notes" aria-labelledby="ai-review-notes-title">
              <div className="ai-review-notes__head"><span aria-hidden="true">!</span><h2 id="ai-review-notes-title">AIからの確認事項</h2></div>
              <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </section>
          ) : (
            <p className="ai-review-clear" role="status"><span aria-hidden="true">✓</span>確認が必要な項目はありません</p>
          )}

          <p className="review-section-label">基本情報</p>
          <section className="review-title">
            <p>レシピ名</p>
            <h2>{draft.title}</h2>
            <div><span>{CATEGORY_LABELS[draft.category]}</span><span>{draft.servings === null ? "人数未確認" : `${draft.servings}人前`}</span></div>
          </section>

          <section className="review-section"><h3>材料</h3><IngredientReview items={draft.ingredients} /></section>
          {draft.seasonings?.length ? <section className="review-section"><h3>調味料</h3><IngredientReview items={draft.seasonings} /></section> : null}
          <section className="review-section"><h3>作り方</h3><ol className="step-review">{draft.steps.map((step, index) => <li key={step.id}><span>{index + 1}</span><p>{step.text}</p></li>)}</ol></section>

          {hasOther ? (
            <section className="review-section review-other">
              <h3>その他</h3>
              {draft.tips.length ? <div><b>ポイント</b>{draft.tips.map((tip) => <p key={tip}>{tip}</p>)}</div> : null}
              {draft.memo ? <div><b>メモ</b><p>{draft.memo}</p></div> : null}
              {(draft.source.type === "youtube" || draft.source.type === "website") && draft.source.url ? <div><b>出典</b><a href={draft.source.url} target="_blank" rel="noreferrer noopener">{draft.source.url}</a></div> : null}
            </section>
          ) : null}
          {saveError ? <p className="alert error review-save-error" role="alert">{saveError}</p> : null}
        </div>

        <footer className="flow-actions review-fixed-actions">
          <button type="button" className="secondary-flow-button" disabled={saving} onClick={() => router.push("/create/manual?mode=edit")}>編集する</button>
          <button type="button" className="primary-flow-button" disabled={saving} onClick={() => void save()}>{saving ? "保存中…" : "このレシピを保存"}</button>
        </footer>
      </main>
    </AuthGate>
  );
}
