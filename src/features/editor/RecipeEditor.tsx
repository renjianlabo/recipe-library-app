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
import { AiRevisionPanel } from "./AiRevisionPanel";
import { IngredientImpactDialog } from "./IngredientImpactDialog";
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
}: {
  initialDraft: RecipeDraft;
  existingRecipe?: Recipe;
  draftKey: string;
  heading: string;
  description: string;
  warnings?: string[];
  needsServingsConfirmation?: boolean;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const { saveRecipe, saveRecipeAsCopy, getLatestRecipe } = useRecipes();
  const [draft, setDraft] = useState(initialDraft);
  const [baseRecipe, setBaseRecipe] = useState(existingRecipe);
  const [ingredientToDelete, setIngredientToDelete] = useState<{
    id: string;
    kind: "ingredient" | "seasoning";
  } | null>(null);
  const [revisionSeed, setRevisionSeed] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<{ attemptedRecipe: Recipe } | null>(null);
  const [servingsConfirmed, setServingsConfirmed] = useState(!needsServingsConfirmation);
  const [recipeId] = useState(() => existingRecipe?.id ?? crypto.randomUUID());
  const autosave = useDraftAutosave({ draftKey, value: draft });
  const aiRevisionEnabled = Boolean(existingRecipe) || initialDraft.source.type !== "manual";

  const setEditorDraft = useCallback((next: RecipeDraft) => {
    if (next.servings !== draft.servings && next.servings !== null) setServingsConfirmed(true);
    setDraft(next);
    setSaveError(null);
  }, [draft.servings]);

  const handleSave = async () => {
    if (!user) {
      setSaveError("保存するにはログインしてください。");
      return;
    }
    if (draft.servings === null || !servingsConfirmed) {
      setSaveError("人数を確認して、0.5・1・2・3・4人分から選択してください。");
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
      router.replace(`/recipes/${encodeURIComponent(recipe.id)}`);
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
    setServingsConfirmed(parsed.data.servings !== null);
  };

  const saveLabel = baseRecipe ? "変更を保存" : "レシピを保存";

  return (
    <AuthGate>
      <main className="page-container editor-page">
        <header className="flow-header"><Link href={baseRecipe ? `/recipes/${encodeURIComponent(baseRecipe.id)}` : "/add"} aria-label="編集を閉じる"><AppIcon name="x" size={22} /></Link><h1>{heading}</h1></header>
        <p className="manual-lead">{description}</p>

        {warnings.map((warning) => <p className="alert warning" key={warning}>{warning}</p>)}
        {needsServingsConfirmation && !servingsConfirmed ? (
          <p className="alert warning" role="status">元の情報から人数を確定できませんでした。必ず人数を選択して内容を確認してください。</p>
        ) : null}
        {autosave.saveError ? <p className="alert warning" role="status">{autosave.saveError}</p> : null}

        <RecipeFieldsEditor
          draft={draft}
          onChange={setEditorDraft}
          onRequestIngredientDelete={(id, kind = "ingredient") => setIngredientToDelete({ id, kind })}
        />

        {aiRevisionEnabled ? (
          <AiRevisionPanel
            draft={draft}
            onApply={(next) => {
              setDraft(next);
              if (next.servings !== null) setServingsConfirmed(true);
            }}
            seedInstruction={revisionSeed}
            onSeedConsumed={() => setRevisionSeed(null)}
          />
        ) : null}

        {saveError ? <p className="alert error" role="alert">{saveError}</p> : null}
        <footer className="editor-save-bar">
          <div>
            <strong>{autosave.lastSavedAt ? "端末内へ下書き保存済み" : "入力内容を端末内へ自動保存"}</strong>
            {autosave.lastSavedAt ? <small>{autosave.lastSavedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</small> : null}
          </div>
          <div className="button-row">
            <Link className="button" href={baseRecipe ? `/recipes/${encodeURIComponent(baseRecipe.id)}` : "/add"}>キャンセル</Link>
            <button className="button primary" type="button" disabled={saving} onClick={() => void handleSave()}>
              {saving ? "保存中…" : saveLabel}
            </button>
          </div>
        </footer>

        {ingredientToDelete ? (
          <IngredientImpactDialog
            draft={draft}
            ingredientId={ingredientToDelete.id}
            itemKind={ingredientToDelete.kind}
            onCancel={() => setIngredientToDelete(null)}
            onApply={(next) => {
              setDraft(next);
              setIngredientToDelete(null);
            }}
            onAskAi={aiRevisionEnabled ? (instruction) => {
              setIngredientToDelete(null);
              setRevisionSeed(instruction);
              window.setTimeout(() => document.getElementById("ai-revision")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
            } : undefined}
          />
        ) : null}

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
                    setServingsConfirmed(true);
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
