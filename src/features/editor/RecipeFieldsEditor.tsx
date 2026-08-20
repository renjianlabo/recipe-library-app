"use client";

import Image from "next/image";
import { useState } from "react";

import { AppIcon } from "@/components/AppIcon";
import { parseAmountText } from "@/domain/amounts";
import {
  ALLOWED_SERVINGS,
  type IngredientDraft,
  type RecipeDraft,
  type RecipeStepDraft,
} from "@/domain/recipe";
import { prepareRecipeImage } from "@/lib/image-processing";
import { CATEGORY_OPTIONS } from "@/lib/presentation";
import { UnitSelect } from "./UnitSelect";

function nextId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function emptyItem(prefix: "ingredient" | "seasoning"): IngredientDraft {
  return {
    id: nextId(prefix),
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

function ItemFields({
  item,
  kind,
  index,
  canDelete,
  onUpdate,
  onDelete,
}: {
  item: IngredientDraft;
  kind: "材料" | "調味料";
  index: number;
  canDelete: boolean;
  onUpdate: (patch: Partial<IngredientDraft>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="ingredient-fields" data-testid={`${kind}-${index + 1}`}>
      <div className="ingredient-field-content">
        <label className="visually-hidden" htmlFor={`${item.id}-name`}>{kind}名</label>
        <input
          id={`${item.id}-name`}
          value={item.name}
          maxLength={120}
          placeholder={`${kind}名`}
          onChange={(event) => onUpdate({ name: event.target.value })}
        />
        <div className="ingredient-subfields">
          <div className="field amount-field">
            <label className="visually-hidden" htmlFor={`${item.id}-amount`}>分量</label>
            <input
              id={`${item.id}-amount`}
              value={item.amountText}
              maxLength={40}
              placeholder="分量（例：150、適量）"
              onChange={(event) => onUpdate({
                amountText: event.target.value,
                numericAmount: parseAmountText(event.target.value),
              })}
            />
          </div>
          <UnitSelect
            compact
            label={`${kind}${index + 1}の単位`}
            value={item.unit}
            onChange={(unit) => onUpdate({ unit })}
          />
        </div>
      </div>
      {canDelete ? (
        <button className="ingredient-delete" type="button" onClick={onDelete} aria-label={`${kind}${index + 1}を削除`}>
          <AppIcon name="trash" size={15} />
        </button>
      ) : <span aria-hidden="true" />}
    </div>
  );
}

export function RecipeFieldsEditor({ draft, onChange }: {
  draft: RecipeDraft;
  onChange: (draft: RecipeDraft) => void;
}) {
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const seasonings = draft.seasonings ?? [];

  const handleImage = (file: File | undefined) => {
    if (!file) return;
    setImageBusy(true);
    setImageError(null);
    void prepareRecipeImage(file)
      .then((image) => onChange({ ...draft, imageDataUrl: image.dataUrl }))
      .catch((cause) => setImageError(cause instanceof Error ? cause.message : "画像を追加できませんでした。"))
      .finally(() => setImageBusy(false));
  };

  const removeItem = (id: string, kind: "ingredient" | "seasoning") => {
    onChange({
      ...draft,
      ingredients: kind === "ingredient" ? draft.ingredients.filter((item) => item.id !== id) : draft.ingredients,
      seasonings: kind === "seasoning" ? seasonings.filter((item) => item.id !== id) : seasonings,
      steps: draft.steps.map((step) => ({
        ...step,
        ingredientRefs: step.ingredientRefs.filter((reference) => reference.ingredientId !== id),
      })),
    });
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag || draft.tags.includes(tag)) return;
    onChange({ ...draft, tags: [...draft.tags, tag] });
    setTagInput("");
  };

  return (
    <div className="manual-form">
      <section className="form-section">
        <div className="form-section-head"><h2>基本情報</h2><small>＊は必須</small></div>
        <label className="form-label">
          <span>料理名 ＊</span>
          <input value={draft.title} maxLength={120} onChange={(event) => onChange({ ...draft, title: event.target.value })} placeholder="例：豚肉とトマトの煮込み" required />
        </label>
        <div className="manual-photo">
          {draft.imageDataUrl ? (
            <div className="manual-photo-row">
              <Image className="manual-photo-preview" src={draft.imageDataUrl} alt="料理画像のプレビュー" width={78} height={78} unoptimized />
              <div className="photo-actions">
                <label className="text-button">画像を変更<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; handleImage(file); }} /></label>
                <button className="danger-text" type="button" onClick={() => onChange({ ...draft, imageDataUrl: null })}>削除</button>
              </div>
            </div>
          ) : (
            <label className="manual-photo-empty"><input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; handleImage(file); }} /><AppIcon name="image" size={19} />{imageBusy ? "画像を準備中…" : "料理画像を追加"}<small>任意</small></label>
          )}
          {imageError ? <p className="auth-error" role="alert">{imageError}</p> : null}
        </div>
        <div className="form-grid">
          <label className="form-label"><span>カテゴリー ＊</span><select value={draft.category} onChange={(event) => onChange({ ...draft, category: event.target.value as RecipeDraft["category"] })}>{CATEGORY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="form-label"><span>人数 ＊</span><select value={draft.servings ?? ""} onChange={(event) => onChange({ ...draft, servings: Number(event.target.value) as RecipeDraft["servings"] })}><option value="" disabled>人数を選択</option>{ALLOWED_SERVINGS.map((value) => <option key={value} value={value}>{value}人前</option>)}</select></label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-head"><h2>材料 ＊</h2><small>分量は「適量」なども入力できます</small></div>
        <div className="ingredient-list">{draft.ingredients.map((ingredient, index) => <ItemFields key={ingredient.id} item={ingredient} kind="材料" index={index} canDelete={draft.ingredients.length > 1} onUpdate={(patch) => onChange({ ...draft, ingredients: draft.ingredients.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) })} onDelete={() => removeItem(ingredient.id, "ingredient")} />)}</div>
        <button className="manual-add-button" type="button" onClick={() => onChange({ ...draft, ingredients: [...draft.ingredients, emptyItem("ingredient")] })}>＋ 材料を追加</button>
      </section>

      <section className="form-section">
        <div className="form-section-head"><h2>調味料</h2><small>分量は「少々」なども入力できます</small></div>
        <div className="ingredient-list">{seasonings.map((seasoning, index) => <ItemFields key={seasoning.id} item={seasoning} kind="調味料" index={index} canDelete onUpdate={(patch) => onChange({ ...draft, seasonings: seasonings.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) })} onDelete={() => removeItem(seasoning.id, "seasoning")} />)}</div>
        <button className="manual-add-button" type="button" onClick={() => onChange({ ...draft, seasonings: [...seasonings, emptyItem("seasoning")] })}>＋ 調味料を追加</button>
      </section>

      <section className="form-section">
        <div className="form-section-head"><h2>作り方 ＊</h2><small>工程タイトルは不要です</small></div>
        <div className="step-list">{draft.steps.map((step, index) => <div className="step-field" key={step.id}><span className="step-number">{index + 1}</span><label className="visually-hidden" htmlFor={`${step.id}-text`}>手順{index + 1}</label><textarea id={`${step.id}-text`} rows={3} maxLength={4000} value={step.text} placeholder="手順を入力" onChange={(event) => onChange({ ...draft, steps: draft.steps.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item) })} />{draft.steps.length > 1 ? <button className="ingredient-delete" type="button" onClick={() => onChange({ ...draft, steps: reorderSteps(draft.steps.filter((_, itemIndex) => itemIndex !== index)) })} aria-label={`手順${index + 1}を削除`}><AppIcon name="trash" size={15} /></button> : <span aria-hidden="true" />}</div>)}</div>
        <button className="manual-add-button" type="button" onClick={() => onChange({ ...draft, steps: [...draft.steps, emptyStep(draft.steps.length + 1)] })}>＋ 手順を追加</button>
      </section>

      <section className="form-section">
        <div className="form-section-head"><h2>その他</h2><small>任意</small></div>
        <div className="optional-section">
          <label className="form-label"><span>ポイント</span><textarea rows={3} maxLength={4000} value={draft.tips.join("\n")} placeholder="おいしく作るコツなど" onChange={(event) => onChange({ ...draft, tips: event.target.value ? [event.target.value] : [] })} /></label>
          <label className="form-label"><span>メモ</span><textarea rows={3} maxLength={4000} value={draft.memo} placeholder="自分用のメモ" onChange={(event) => onChange({ ...draft, memo: event.target.value })} /></label>
          <div className="form-label"><span>タグ</span><div className="tag-input-row"><input value={tagInput} maxLength={50} placeholder="タグを入力" onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTag(); } }} /><button type="button" onClick={addTag}>追加</button></div>{draft.tags.length ? <div className="manual-tags">{draft.tags.map((tag) => <button type="button" key={tag} onClick={() => onChange({ ...draft, tags: draft.tags.filter((item) => item !== tag) })}>{tag}<AppIcon name="x" size={11} /></button>)}</div> : null}</div>
        </div>
      </section>
    </div>
  );
}
