"use client";

import { useMemo, useState } from "react";

import {
  findIngredientRemovalImpacts,
  type IngredientRemovalImpact,
} from "@/domain/ingredient-impact";
import { analyzeIngredientNameRemoval } from "@/domain/ingredient-text";
import type { RecipeDraft } from "@/domain/recipe";
import { ModalDialog } from "@/components/ModalDialog";

type ImpactAction = "keep" | "remove-name" | "delete";

function impactKey(impact: IngredientRemovalImpact): string {
  return `${impact.section}:${impact.index}`;
}

function sectionLabel(section: IngredientRemovalImpact["section"]): string {
  if (section === "step") return "工程";
  if (section === "tip") return "ポイント";
  return "メモ";
}

export function IngredientImpactDialog({
  draft,
  ingredientId,
  onCancel,
  onApply,
  onAskAi,
  itemKind = "ingredient",
}: {
  draft: RecipeDraft;
  ingredientId: string;
  onCancel: () => void;
  onApply: (draft: RecipeDraft) => void;
  onAskAi?: (instruction: string) => void;
  itemKind?: "ingredient" | "seasoning";
}) {
  const ingredient = itemKind === "seasoning"
    ? (draft.seasonings ?? []).find((item) => item.id === ingredientId)
    : draft.ingredients.find((item) => item.id === ingredientId);
  const itemLabel = itemKind === "seasoning" ? "調味料" : "材料";
  const impacts = useMemo(
    () => findIngredientRemovalImpacts(draft, ingredientId),
    [draft, ingredientId],
  );
  const removalResults = useMemo(() => Object.fromEntries(
    impacts
      .filter((impact) => impact.matches.includes("text"))
      .map((impact) => [impactKey(impact), analyzeIngredientNameRemoval(impact.text, ingredient?.name ?? "")]),
  ), [impacts, ingredient?.name]);
  const [actions, setActions] = useState<Record<string, ImpactAction>>(() => Object.fromEntries(
    impacts.filter((impact) => impact.matches.includes("text")).map((impact) => {
      const key = impactKey(impact);
      return [key, removalResults[key]?.hasMeaningfulRemainder === false ? "delete" : "keep"];
    }),
  ));
  const [previews, setPreviews] = useState<Record<string, string>>(() => Object.fromEntries(
    impacts.filter((impact) => impact.matches.includes("text")).map((impact) => {
      const key = impactKey(impact);
      return [key, removalResults[key]?.text ?? impact.text];
    }),
  ));

  if (!ingredient) return null;

  const applyRemoval = () => {
    const deletedSteps = new Set(
      impacts
        .filter((impact) => {
          if (impact.section !== "step") return false;
          const key = impactKey(impact);
          return actions[key] === "delete" || (actions[key] === "remove-name" && !previews[key]?.trim());
        })
        .map((impact) => impact.index),
    );
    const nextSteps = draft.steps
      .filter((_, index) => !deletedSteps.has(index))
      .map((step, index) => {
        const oldIndex = draft.steps.findIndex((item) => item.id === step.id);
        const impact = impacts.find((item) => item.section === "step" && item.index === oldIndex);
        const action = impact ? actions[impactKey(impact)] : "keep";
        const preview = impact ? previews[impactKey(impact)] : undefined;
        return {
          ...step,
          order: index + 1,
          text: action === "remove-name" ? (preview ?? step.text).trim() : step.text,
          ingredientRefs: step.ingredientRefs.filter((reference) => reference.ingredientId !== ingredientId),
        };
      });
    const nextTips = draft.tips.flatMap((tip, index) => {
      const impact = impacts.find((item) => item.section === "tip" && item.index === index);
      const action = impact ? actions[impactKey(impact)] : "keep";
      if (action === "delete") return [];
      const preview = impact ? previews[impactKey(impact)]?.trim() : undefined;
      if (action === "remove-name" && !preview) return [];
      return [action === "remove-name" ? preview ?? tip : tip];
    });
    const memoImpact = impacts.find((impact) => impact.section === "memo");
    const memoAction = memoImpact ? actions[impactKey(memoImpact)] : "keep";

    onApply({
      ...draft,
      ingredients: draft.ingredients.filter((item) => item.id !== ingredientId),
      seasonings: (draft.seasonings ?? []).filter((item) => item.id !== ingredientId),
      steps: nextSteps,
      tips: nextTips,
      memo: memoAction === "delete"
        ? ""
        : memoAction === "remove-name"
          ? previews[memoImpact ? impactKey(memoImpact) : ""]?.trim() ?? draft.memo
          : draft.memo,
    });
  };

  return (
    <ModalDialog
      className="wide-modal"
      titleId="ingredient-impact-title"
      descriptionId="ingredient-impact-description"
      onClose={onCancel}
    >
        <p className="eyebrow">Related content</p>
        <h2 id="ingredient-impact-title">「{ingredient.name || `名称未入力の${itemLabel}`}」を削除しますか</h2>
        {impacts.length ? (
          <>
            <p id="ingredient-impact-description">関連する工程・ポイント・メモが見つかりました。文章ごとに残し方を選び、反映後も内容を確認してください。</p>
            <div className="impact-list">
              {impacts.map((impact) => {
                const key = impactKey(impact);
                return (
                  <article className="impact-item" key={key}>
                    <strong>{sectionLabel(impact.section)} {impact.section === "memo" ? "" : impact.index + 1}</strong>
                    <p>{impact.text || "（本文なし）"}</p>
                    {impact.matches.includes("reference") ? <p className="muted">工程の材料・調味料参照は自動で解除します。</p> : null}
                    {impact.matches.includes("text") ? (
                      <label className="field">
                        <span>文章の扱い</span>
                        <select value={actions[key] ?? "keep"} onChange={(event) => setActions((current) => ({
                          ...current,
                          [key]: event.target.value as ImpactAction,
                        }))}>
                          <option value="keep">文章はそのまま残す</option>
                          <option value="remove-name">{itemLabel}名だけ除く</option>
                          <option value="delete">この{sectionLabel(impact.section)}を削除</option>
                        </select>
                      </label>
                    ) : null}
                    {impact.matches.includes("text") && actions[key] === "remove-name" ? (
                      <label className="field">
                        <span>{sectionLabel(impact.section)}の編集結果</span>
                        <textarea
                          aria-label={`${sectionLabel(impact.section)}の編集結果`}
                          rows={3}
                          value={previews[key] ?? ""}
                          onChange={(event) => setPreviews((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))}
                        />
                        <small className="muted">確定前に自然な文章へ直せます。空欄のまま確定すると、この{sectionLabel(impact.section)}を削除します。</small>
                      </label>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </>
        ) : <p id="ingredient-impact-description">この{itemLabel}を参照する工程や文章は見つかりませんでした。</p>}
        <div className="button-row">
          <button className="button" type="button" data-modal-initial-focus onClick={onCancel}>キャンセル</button>
          {onAskAi ? (
            <button className="button secondary" type="button" onClick={() => onAskAi(
              `${itemLabel}「${ingredient.name}」を削除し、関連する工程・ポイント・メモを意味が自然になるよう必要最小限だけ修正してください。`,
            )}>AIに修正を頼む</button>
          ) : null}
          <button className="button danger" type="button" onClick={applyRemoval}>選択内容で削除</button>
        </div>
    </ModalDialog>
  );
}
