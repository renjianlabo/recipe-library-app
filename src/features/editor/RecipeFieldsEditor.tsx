"use client";

import Image from "next/image";
import { useState } from "react";

import { AppIcon } from "@/components/AppIcon";
import { parseAmountText } from "@/domain/amounts";
import { usePantry } from "@/contexts/PantryProvider";
import {
  ALLOWED_SERVINGS,
  MAX_RECIPE_TIMER_SECONDS,
  type IngredientDraft,
  type RecipeDraft,
  type RecipeStepDraft,
  type StepIngredientRef,
} from "@/domain/recipe";
import { CATEGORY_OPTIONS } from "@/lib/presentation";
import { prepareRecipeImage } from "@/lib/image-processing";

function nextId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function moveItem<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return [...items];
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function emptyIngredient(): IngredientDraft {
  return {
    id: nextId("ingredient"),
    name: "",
    amountText: "",
    numericAmount: null,
    unit: "",
    note: "",
  };
}

function emptySeasoning(): IngredientDraft {
  return {
    id: nextId("seasoning"),
    name: "",
    amountText: "",
    numericAmount: null,
    unit: "",
    note: "",
  };
}

function emptyStep(order: number): RecipeStepDraft {
  return {
    id: nextId("step"),
    order,
    text: "",
    ingredientRefs: [],
    timers: [],
  };
}

function reorderSteps(steps: RecipeStepDraft[]): RecipeStepDraft[] {
  return steps.map((step, index) => ({ ...step, order: index + 1 }));
}

export function recipeTimerInputError(seconds: number): string | null {
  if (!Number.isFinite(seconds)) return "タイマー時間を入力してください";
  if (!Number.isInteger(seconds)) return "タイマー時間は1秒単位で入力してください";
  if (seconds <= 0) return "タイマー時間は1秒以上で入力してください";
  if (seconds > MAX_RECIPE_TIMER_SECONDS) return "タイマー時間は24時間以内で入力してください";
  return null;
}

export function RecipeFieldsEditor({
  draft,
  onChange,
  onRequestIngredientDelete,
}: {
  draft: RecipeDraft;
  onChange: (draft: RecipeDraft) => void;
  onRequestIngredientDelete: (ingredientId: string, kind?: "ingredient" | "seasoning") => void;
}) {
  const pantry = usePantry();
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const seasonings = draft.seasonings ?? [];
  const recipeItems = [...draft.ingredients, ...seasonings];
  const seasoningSuggestions = [...new Set([...pantry.selected, ...pantry.custom])];
  const updateIngredient = (index: number, patch: Partial<IngredientDraft>) => {
    onChange({
      ...draft,
      ingredients: draft.ingredients.map((ingredient, itemIndex) =>
        itemIndex === index ? { ...ingredient, ...patch } : ingredient),
    });
  };

  const updateSeasoning = (index: number, patch: Partial<IngredientDraft>) => {
    onChange({
      ...draft,
      seasonings: seasonings.map((seasoning, itemIndex) =>
        itemIndex === index ? { ...seasoning, ...patch } : seasoning),
    });
  };

  const updateStep = (index: number, patch: Partial<RecipeStepDraft>) => {
    onChange({
      ...draft,
      steps: draft.steps.map((step, itemIndex) => itemIndex === index ? { ...step, ...patch } : step),
    });
  };

  const updateReference = (
    stepIndex: number,
    ingredientId: string,
    patch: Partial<StepIngredientRef> | null,
  ) => {
    const step = draft.steps[stepIndex];
    const existing = step.ingredientRefs.find((reference) => reference.ingredientId === ingredientId);
    let ingredientRefs = step.ingredientRefs;
    if (patch === null) {
      ingredientRefs = ingredientRefs.filter((reference) => reference.ingredientId !== ingredientId);
    } else if (existing) {
      ingredientRefs = ingredientRefs.map((reference) => reference.ingredientId === ingredientId
        ? { ...reference, ...patch }
        : reference);
    } else {
      ingredientRefs = [...ingredientRefs, { ingredientId, usage: "all", ...patch }];
    }
    updateStep(stepIndex, { ingredientRefs });
  };

  return (
    <div className="section-stack">
      <section className="card stack">
        <div className="form-section-header">
          <div><p className="eyebrow">Basic</p><h2>基本情報</h2></div>
          <span className="required-note">* 必須</span>
        </div>
        <label className="field">
          <span>レシピ名 *</span>
          <input
            value={draft.title}
            maxLength={120}
            onChange={(event) => onChange({ ...draft, title: event.target.value })}
            placeholder="例：豚肉と卵の炒めもの"
            required
          />
        </label>
        <div className="manual-photo">
          {draft.imageDataUrl ? (
            <div className="manual-photo-row">
              <Image className="manual-photo-preview" src={draft.imageDataUrl} alt="料理画像のプレビュー" width={78} height={78} unoptimized />
              <div className="photo-actions">
                <label className="text-button">画像を変更<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (!file) return; setImageBusy(true); setImageError(null); void prepareRecipeImage(file).then((image) => onChange({ ...draft, imageDataUrl: image.dataUrl })).catch((cause) => setImageError(cause instanceof Error ? cause.message : "画像を追加できませんでした。")).finally(() => setImageBusy(false)); }} /></label>
                <button className="danger-text" type="button" onClick={() => onChange({ ...draft, imageDataUrl: null })}>削除</button>
              </div>
            </div>
          ) : (
            <label className="manual-photo-empty"><input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (!file) return; setImageBusy(true); setImageError(null); void prepareRecipeImage(file).then((image) => onChange({ ...draft, imageDataUrl: image.dataUrl })).catch((cause) => setImageError(cause instanceof Error ? cause.message : "画像を追加できませんでした。")).finally(() => setImageBusy(false)); }} /><AppIcon name="image" size={19} />{imageBusy ? "画像を準備中…" : "料理画像を追加"}<small>任意</small></label>
          )}
          {imageError ? <p className="auth-error" role="alert">{imageError}</p> : null}
        </div>
        <div className="responsive-fields">
          <label className="field">
            <span>分類 *</span>
            <select
              value={draft.category}
              onChange={(event) => onChange({ ...draft, category: event.target.value as RecipeDraft["category"] })}
            >
              {CATEGORY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>人数 *</span>
            <select
              value={draft.servings ?? ""}
              onChange={(event) => onChange({ ...draft, servings: Number(event.target.value) as RecipeDraft["servings"] })}
            >
              <option value="" disabled>人数を選択</option>
              {ALLOWED_SERVINGS.map((value) => <option key={value} value={value}>{value}人分</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="stack">
        <div className="form-section-header">
          <div><p className="eyebrow">Ingredients</p><h2>材料</h2></div>
          <button
            className="button secondary compact"
            type="button"
            onClick={() => onChange({ ...draft, ingredients: [...draft.ingredients, emptyIngredient()] })}
          >材料を追加</button>
        </div>
        {draft.ingredients.map((ingredient, index) => (
          <article className="card editor-item" key={ingredient.id}>
            <div className="form-section-header">
              <strong>材料 {index + 1}</strong>
              <div className="icon-actions" aria-label={`材料${index + 1}の操作`}>
                <button type="button" disabled={index === 0} onClick={() => onChange({ ...draft, ingredients: moveItem(draft.ingredients, index, -1) })} aria-label="上へ移動">↑</button>
                <button type="button" disabled={index === draft.ingredients.length - 1} onClick={() => onChange({ ...draft, ingredients: moveItem(draft.ingredients, index, 1) })} aria-label="下へ移動">↓</button>
                <button className="danger-text" type="button" onClick={() => onRequestIngredientDelete(ingredient.id)}>削除</button>
              </div>
            </div>
            <label className="field">
              <span>材料名 *</span>
              <input value={ingredient.name} maxLength={120} onChange={(event) => updateIngredient(index, { name: event.target.value })} />
            </label>
            <div className="ingredient-fields">
              <label className="field">
                <span>分量 *</span>
                <input
                  value={ingredient.amountText}
                  maxLength={40}
                  placeholder="150 / 1/2 / 適量"
                  onChange={(event) => updateIngredient(index, {
                    amountText: event.target.value,
                    numericAmount: parseAmountText(event.target.value),
                  })}
                />
              </label>
              <label className="field">
                <span>単位</span>
                <input
                  value={ingredient.unit}
                  maxLength={30}
                  placeholder="g、ml、大さじ"
                  onChange={(event) => updateIngredient(index, { unit: event.target.value })}
                />
              </label>
            </div>
            <label className="field">
              <span>補足</span>
              <input value={ingredient.note} maxLength={240} placeholder="薄切り、常温に戻す など" onChange={(event) => updateIngredient(index, { note: event.target.value })} />
            </label>
          </article>
        ))}
      </section>

      <section className="stack">
        <div className="form-section-header">
          <div><p className="eyebrow">Seasonings</p><h2>調味料</h2></div>
          <button
            className="button secondary compact"
            type="button"
            onClick={() => onChange({ ...draft, seasonings: [...seasonings, emptySeasoning()] })}
          >調味料を追加</button>
        </div>
        <datalist id="pantry-seasoning-options">
          {seasoningSuggestions.map((name) => <option key={name} value={name} />)}
        </datalist>
        {seasonings.map((seasoning, index) => (
          <article className="card editor-item" key={seasoning.id}>
            <div className="form-section-header">
              <strong>調味料 {index + 1}</strong>
              <div className="icon-actions" aria-label={`調味料${index + 1}の操作`}>
                <button type="button" disabled={index === 0} onClick={() => onChange({ ...draft, seasonings: moveItem(seasonings, index, -1) })} aria-label="上へ移動">↑</button>
                <button type="button" disabled={index === seasonings.length - 1} onClick={() => onChange({ ...draft, seasonings: moveItem(seasonings, index, 1) })} aria-label="下へ移動">↓</button>
                <button className="danger-text" type="button" onClick={() => onRequestIngredientDelete(seasoning.id, "seasoning")}>削除</button>
              </div>
            </div>
            <label className="field">
              <span>調味料名 *</span>
              <input
                value={seasoning.name}
                maxLength={120}
                list="pantry-seasoning-options"
                placeholder="候補から選択、または自由入力"
                onChange={(event) => updateSeasoning(index, { name: event.target.value })}
              />
            </label>
            <div className="ingredient-fields">
              <label className="field">
                <span>分量 *</span>
                <input
                  value={seasoning.amountText}
                  maxLength={40}
                  placeholder="1 / 少々 / 適宜"
                  onChange={(event) => updateSeasoning(index, {
                    amountText: event.target.value,
                    numericAmount: parseAmountText(event.target.value),
                  })}
                />
              </label>
              <label className="field">
                <span>単位</span>
                <input
                  value={seasoning.unit}
                  maxLength={30}
                  placeholder="g、ml、大さじ"
                  onChange={(event) => updateSeasoning(index, { unit: event.target.value })}
                />
              </label>
            </div>
            <label className="field">
              <span>補足</span>
              <input value={seasoning.note} maxLength={240} placeholder="お好みで、仕上げ用 など" onChange={(event) => updateSeasoning(index, { note: event.target.value })} />
            </label>
          </article>
        ))}
      </section>

      <section className="stack">
        <div className="form-section-header">
          <div><p className="eyebrow">Steps</p><h2>作り方</h2></div>
          <button
            className="button secondary compact"
            type="button"
            onClick={() => onChange({ ...draft, steps: [...draft.steps, emptyStep(draft.steps.length + 1)] })}
          >工程を追加</button>
        </div>
        {draft.steps.map((step, stepIndex) => (
          <article className="card editor-item" key={step.id}>
            <div className="form-section-header">
              <strong>工程 {stepIndex + 1}</strong>
              <div className="icon-actions" aria-label={`工程${stepIndex + 1}の操作`}>
                <button type="button" disabled={stepIndex === 0} onClick={() => onChange({ ...draft, steps: reorderSteps(moveItem(draft.steps, stepIndex, -1)) })} aria-label="上へ移動">↑</button>
                <button type="button" disabled={stepIndex === draft.steps.length - 1} onClick={() => onChange({ ...draft, steps: reorderSteps(moveItem(draft.steps, stepIndex, 1)) })} aria-label="下へ移動">↓</button>
                <button className="danger-text" type="button" onClick={() => onChange({ ...draft, steps: reorderSteps(draft.steps.filter((_, index) => index !== stepIndex)) })}>削除</button>
              </div>
            </div>
            <label className="field">
              <span>工程本文 *</span>
              <textarea rows={4} maxLength={4000} value={step.text} onChange={(event) => updateStep(stepIndex, { text: event.target.value })} />
            </label>

            <fieldset className="subsection">
              <legend>この工程で使う材料・調味料</legend>
              {recipeItems.length ? recipeItems.map((ingredient) => {
                const reference = step.ingredientRefs.find((item) => item.ingredientId === ingredient.id);
                return (
                  <div className="reference-row" key={ingredient.id}>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={Boolean(reference)}
                        onChange={(event) => updateReference(stepIndex, ingredient.id, event.target.checked ? { usage: "all" } : null)}
                      />
                      <span>{ingredient.name || "名称未入力の材料"}</span>
                    </label>
                    {reference ? (
                      <>
                        <select
                          aria-label={`${ingredient.name || "材料"}の使用量`}
                          value={reference.usage}
                          onChange={(event) => {
                            const usage = event.target.value as StepIngredientRef["usage"];
                            updateReference(stepIndex, ingredient.id, usage === "custom"
                              ? { usage, customAmountText: reference.customAmountText ?? "" }
                              : { usage, customAmountText: undefined });
                          }}
                        >
                          <option value="all">全量</option>
                          <option value="half">半量</option>
                          <option value="remaining">残り</option>
                          <option value="custom">指定量</option>
                        </select>
                        {reference.usage === "custom" ? (
                          <input
                            aria-label={`${ingredient.name || "材料"}の指定量`}
                            value={reference.customAmountText ?? ""}
                            maxLength={40}
                            placeholder="例：50g"
                            onChange={(event) => updateReference(stepIndex, ingredient.id, { customAmountText: event.target.value })}
                          />
                        ) : null}
                      </>
                    ) : null}
                  </div>
                );
              }) : <p className="muted">先に材料または調味料を追加してください。</p>}
            </fieldset>

            <div className="subsection stack">
              <div className="form-section-header">
                <strong>おすすめタイマー</strong>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => updateStep(stepIndex, {
                    timers: [...step.timers, { id: nextId("timer"), label: "タイマー", seconds: 300 }],
                  })}
                >タイマーを追加</button>
              </div>
              {step.timers.map((timer, timerIndex) => {
                const timerError = recipeTimerInputError(timer.seconds);
                const errorId = `${timer.id}-time-error`;
                return (
                <div className="timer-editor-row" key={timer.id}>
                  <label className="field">
                    <span>名前</span>
                    <input value={timer.label} maxLength={100} onChange={(event) => updateStep(stepIndex, {
                      timers: step.timers.map((item, index) => index === timerIndex ? { ...item, label: event.target.value } : item),
                    })} />
                  </label>
                  <label className="field">
                    <span>分</span>
                    <input
                      type="number"
                      min="0.1"
                      max="1440"
                      step="0.1"
                      inputMode="decimal"
                      value={Number.isFinite(timer.seconds) ? timer.seconds / 60 : ""}
                      aria-invalid={timerError ? true : undefined}
                      aria-describedby={timerError ? errorId : undefined}
                      onChange={(event) => updateStep(stepIndex, {
                      timers: step.timers.map((item, index) => index === timerIndex
                        ? {
                          ...item,
                          seconds: event.target.value === ""
                            ? Number.NaN
                            : Math.round(Number(event.target.value) * 60),
                        }
                        : item),
                    })}
                    />
                    {timerError ? <small className="required-note" id={errorId} role="alert">{timerError}</small> : null}
                  </label>
                  <button className="danger-text align-end" type="button" onClick={() => updateStep(stepIndex, {
                    timers: step.timers.filter((_, index) => index !== timerIndex),
                  })}>削除</button>
                </div>
                );
              })}
            </div>
          </article>
        ))}
      </section>

      <section className="card stack">
        <div className="form-section-header"><div><p className="eyebrow">Notes</p><h2>ポイント・メモ</h2></div></div>
        <div className="stack">
          <div className="form-section-header">
            <strong>ポイント</strong>
            <button className="text-button" type="button" onClick={() => onChange({ ...draft, tips: [...draft.tips, ""] })}>追加</button>
          </div>
          {draft.tips.map((tip, index) => (
            <div className="inline-editor" key={`tip-${index}`}>
              <input aria-label={`ポイント${index + 1}`} value={tip} maxLength={500} onChange={(event) => onChange({
                ...draft,
                tips: draft.tips.map((item, itemIndex) => itemIndex === index ? event.target.value : item),
              })} />
              <button className="danger-text" type="button" onClick={() => onChange({ ...draft, tips: draft.tips.filter((_, itemIndex) => itemIndex !== index) })}>削除</button>
            </div>
          ))}
        </div>
        <label className="field">
          <span>メモ</span>
          <textarea rows={4} maxLength={4000} value={draft.memo} onChange={(event) => onChange({ ...draft, memo: event.target.value })} />
        </label>
        <div className="stack">
          <div className="form-section-header">
            <strong>タグ</strong>
            <button className="text-button" type="button" onClick={() => onChange({ ...draft, tags: [...draft.tags, ""] })}>追加</button>
          </div>
          {draft.tags.map((tag, index) => (
            <div className="inline-editor" key={`tag-${index}`}>
              <input aria-label={`タグ${index + 1}`} value={tag} maxLength={50} onChange={(event) => onChange({
                ...draft,
                tags: draft.tags.map((item, itemIndex) => itemIndex === index ? event.target.value : item),
              })} />
              <button className="danger-text" type="button" onClick={() => onChange({ ...draft, tags: draft.tags.filter((_, itemIndex) => itemIndex !== index) })}>削除</button>
            </div>
          ))}
        </div>
        {(draft.source.type === "youtube" || draft.source.type === "website") ? (
          <label className="field">
            <span>出典URL</span>
            <input type="url" inputMode="url" value={draft.source.url ?? ""} maxLength={2048} onChange={(event) => onChange({
              ...draft,
              source: { ...draft.source, url: event.target.value || null },
            })} />
          </label>
        ) : (
          <p className="muted">作成元：{draft.source.type === "manual" ? "手動" : draft.source.type === "text" ? "文章" : "スクリーンショット"}（出典URLは保存しません）</p>
        )}
      </section>
    </div>
  );
}
