"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { z } from "zod";

import { AuthGate } from "@/components/AuthGate";
import { AppIcon } from "@/components/AppIcon";
import { ModalDialog } from "@/components/ModalDialog";
import { useAuth } from "@/contexts/AuthProvider";
import { isRecipeConflictError, useRecipes } from "@/contexts/RecipeProvider";
import {
  finalizeRecipeDraft,
  normalizeRecipeDraft,
  recipeDraftSchema,
  type Recipe,
  type RecipeDraft,
} from "@/domain/recipe";
import { clearAiReviewSession, saveCompletionReceipt } from "@/features/creation/creation-session";
import { RecipeFieldsEditor } from "./RecipeFieldsEditor";
import { useDraftAutosave } from "./useDraftAutosave";

function errorMessage(cause: unknown): string {
  if (cause instanceof z.ZodError) {
    return cause.issues[0]?.message ?? "必須項目と入力形式を確認してください。";
  }
  return cause instanceof Error ? cause.message : "保存できませんでした。入力内容は端末内に保持しています。";
}

export function recipeToDraft(recipe: Recipe): RecipeDraft {
  return {
    title: recipe.title,
    imageDataUrl: recipe.imageDataUrl,
    category: recipe.category,
    servings: recipe.servings,
    ingredients: recipe.ingredients,
    seasonings: recipe.seasonings ?? [],
    steps: recipe.steps,
    tips: recipe.tips,
    memo: recipe.memo,
    tags: recipe.tags,
    source: recipe.source,
  };
}

export function RecipeEditor({
  initialDraft,
  existingRecipe,
  draftKey,
  heading,
  description,
  warnings = [],
  needsServingsConfirmation = false,
  completionAfterSave = false,
  clearAiSessionOnSave = false,
  allowDraftRecovery = true,
  closeHref,
}: {
  initialDraft: RecipeDraft;
  existingRecipe?: Recipe;
  draftKey: string;
  heading: string;
  description: string;
  warnings?: string[];
  needsServingsConfirmation?: boolean;
  completionAfterSave?: boolean;
  clearAiSessionOnSave?: boolean;
  allowDraftRecovery?: boolean;
  closeHref?: string;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const { saveRecipe, saveRecipeAsCopy, getLatestRecipe } = useRecipes();
  const [draft, setDraft] = useState(initialDraft);
  const [baseRecipe, setBaseRecipe] = useState(existingRecipe);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<{ attemptedRecipe: Recipe } | null>(null);
  const [recipeId] = useState(() => existingRecipe?.id ?? crypto.randomUUID());
  const autosave = useDraftAutosave({ draftKey, value: draft, recoverExisting: allowDraftRecovery });

  const setEditorDraft = useCallback((next: RecipeDraft) => {
    setDraft(next);
    setSaveError(null);
  }, []);

  const handleSave = async () => {
    if (!user) {
      setSaveError("保存するにはログインしてください。");
      return;
    }
    setSaving(true);
    setSaveError(null);
    let attemptedRecipe: Recipe | null = null;
    try {
      const normalized = normalizeRecipeDraft(draft);
      const now = new Date().toISOString();
      const finalized = finalizeRecipeDraft(normalized, {
        id: recipeId,
        userId: user.uid,
        isFavorite: baseRecipe?.isFavorite ?? false,
        createdAt: baseRecipe?.createdAt ?? now,
        updatedAt: now,
      });
      const recipe = finalized;
      attemptedRecipe = recipe;
      await saveRecipe(recipe, { expectedUpdatedAt: baseRecipe?.updatedAt ?? null });
      await autosave.clearSavedDraft().catch(() => undefined);
      if (completionAfterSave && !baseRecipe) {
        saveCompletionReceipt({ recipeId: recipe.id, recipeTitle: recipe.title });
        if (clearAiSessionOnSave) clearAiReviewSession();
        router.replace("/create/complete");
      } else {
        router.replace(`/recipes/${encodeURIComponent(recipe.id)}`);
      }
    } catch (cause) {
      if (isRecipeConflictError(cause) && attemptedRecipe) {
        setConflict({ attemptedRecipe });
      } else {
        setSaveError(errorMessage(cause));
      }
    } finally {
      setSaving(false);
    }
  };

  const restoreLocalDraft = () => {
    const stored = autosave.restoreDraft();
    const parsed = recipeDraftSchema.safeParse(stored);
    if (!parsed.success) {
      setSaveError("端末内の下書きは形式が古いか壊れているため復元できませんでした。");
      return;
    }
    setDraft(parsed.data);
  };

  const saveLabel = baseRecipe ? "変更を保存" : "レシピを保存";

  return (
    <AuthGate>
      <main className="page-container editor-page manual-content">
        <header className="flow-header"><Link href={closeHref ?? (baseRecipe ? `/recipes/${encodeURIComponent(baseRecipe.id)}` : "/create")} aria-label="編集を閉じる"><AppIcon name="x" size={22} /></Link><h1>{heading}</h1></header>
        <p className="manual-lead">{description}</p>

        {warnings.map((warning) => <p className="alert warning" key={warning}>{warning}</p>)}
        {needsServingsConfirmation && draft.servings === null ? (
          <p className="alert warning" role="status">元の情報から人数を確定できなかったため、未設定にしています。</p>
        ) : null}
        {autosave.saveError ? <p className="alert warning" role="status">{autosave.saveError}</p> : null}

        <RecipeFieldsEditor draft={draft} onChange={setEditorDraft} />

        {saveError ? <p className="alert error" role="alert">{saveError}</p> : null}
        <footer className="manual-save floating-action-bar">
          <button className="primary-flow-button" type="button" disabled={saving} onClick={() => void handleSave()}>
            {saving ? "保存中…" : saveLabel}
          </button>
        </footer>

        {autosave.recoveryState === "available" ? (
          <ModalDialog
            titleId="restore-draft-title"
            descriptionId="restore-draft-description"
            onClose={() => void autosave.discardRecoveredDraft()}
          >
              <h2 id="restore-draft-title">端末内の下書きを復元しますか</h2>
              <p id="restore-draft-description">前回保存前に閉じた編集内容が見つかりました。現在表示中の内容とどちらを使うか選んでください。</p>
              <div className="button-row">
                <button className="button" type="button" data-modal-initial-focus onClick={() => void autosave.discardRecoveredDraft()}>破棄する</button>
                <button className="button primary" type="button" onClick={restoreLocalDraft}>復元する</button>
              </div>
          </ModalDialog>
        ) : null}

        {conflict ? (
          <ModalDialog
            titleId="recipe-conflict-title"
            descriptionId="recipe-conflict-description"
            onClose={() => setConflict(null)}
          >
            <h2 id="recipe-conflict-title">他の端末でこのレシピが更新されています</h2>
            <p id="recipe-conflict-description">現在の入力は消さずに保持しています。最新内容を読み込むか、自分の内容を別レシピとして保存できます。</p>
            <div className="button-row">
              <button className="button" type="button" data-modal-initial-focus onClick={() => setConflict(null)}>キャンセル</button>
              <button className="button secondary" type="button" onClick={() => {
                if (!baseRecipe) return;
                setSaving(true);
                void getLatestRecipe(baseRecipe.id)
                  .then((latest) => {
                    if (!latest) {
                      setSaveError("最新のレシピが見つかりませんでした。現在の入力は保持しています。");
                      return;
                    }
                    setBaseRecipe(latest);
                    setDraft(recipeToDraft(latest));
                    setConflict(null);
                  })
                  .catch(() => setSaveError("最新のレシピを読み込めませんでした。現在の入力は保持しています。"))
                  .finally(() => setSaving(false));
              }}>最新を読み込む</button>
              <button className="button primary" type="button" onClick={() => {
                setSaving(true);
                void saveRecipeAsCopy(conflict.attemptedRecipe)
                  .then(async (copy) => {
                    await autosave.clearSavedDraft().catch(() => undefined);
                    router.replace(`/recipes/${encodeURIComponent(copy.id)}`);
                  })
                  .catch(() => setSaveError("別のレシピとして保存できませんでした。現在の入力は保持しています。"))
                  .finally(() => setSaving(false));
              }}>自分の編集内容を別のレシピとして保存</button>
            </div>
          </ModalDialog>
        ) : null}
      </main>
    </AuthGate>
  );
}
