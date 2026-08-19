"use client";

import { useRef, useState } from "react";

import { useAuth } from "@/contexts/AuthProvider";
import { diffRecipes, type RecipeDiffChange } from "@/domain/recipe-diff";
import type { RecipeDraft } from "@/domain/recipe";
import { authenticatedJson } from "@/lib/authenticated-api";
import { prepareImages } from "@/lib/image-processing";
import { formatRecipeDiffChange } from "./formatRecipeDiff";
import { normalizeAiDraft } from "./normalizeAiDraft";

type AiRecipeResponse = {
  draft: Omit<RecipeDraft, "servings"> & { servings: RecipeDraft["servings"] | null };
  warnings: string[];
  needsServingsConfirmation: boolean;
  detectedServings: number | null;
};

function ChangeRow({
  change,
  beforeDraft,
  afterDraft,
}: {
  change: RecipeDiffChange;
  beforeDraft: RecipeDraft;
  afterDraft: RecipeDraft;
}) {
  const formatted = formatRecipeDiffChange(change, beforeDraft, afterDraft);
  return (
    <li className="diff-row">
      <strong>{formatted.label}</strong>
      {formatted.details ? (
        <ul className="plain-list" aria-label={`${formatted.label}の変更内容`}>
          {formatted.details.map((detail, index) => <li key={`${index}:${detail}`}>{detail}</li>)}
        </ul>
      ) : (
        <div className="diff-values">
          <span><small>変更前</small>{formatted.before}</span>
          <span aria-hidden="true">→</span>
          <span><small>変更後</small>{formatted.after}</span>
        </div>
      )}
    </li>
  );
}

export function AiRevisionPanel({
  draft,
  onApply,
  seedInstruction,
  onSeedConsumed,
}: {
  draft: RecipeDraft;
  onApply: (draft: RecipeDraft) => void;
  seedInstruction?: string | null;
  onSeedConsumed?: () => void;
}) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [instruction, setInstruction] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [candidate, setCandidate] = useState<RecipeDraft | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayedInstruction = seedInstruction ?? instruction;

  const requestRevision = async () => {
    if (!user) {
      setError("AI修正にはログインが必要です。");
      return;
    }
    const effectiveInstruction = displayedInstruction.trim() || (files.length
      ? "追加した画像の情報を、現在のレシピへ必要な範囲だけ反映してください。"
      : "");
    if (!effectiveInstruction) {
      setError("修正してほしい内容を入力してください。");
      return;
    }
    if (seedInstruction) {
      setInstruction(seedInstruction);
      onSeedConsumed?.();
    }
    setLoading(true);
    setError(null);
    try {
      const images = files.length ? await prepareImages(files) : [];
      const response = await authenticatedJson<AiRecipeResponse>(user, "/api/ai/revise", {
        body: {
          currentRecipe: draft,
          instruction: effectiveInstruction,
          images: images.map((image) => ({ data: image.dataUrl, mimeType: image.mimeType })),
        },
      });
      const parsed = normalizeAiDraft({
        ...response.draft,
        servings: response.draft.servings,
      });
      setCandidate(parsed);
      setWarnings(response.needsServingsConfirmation
        ? [...response.warnings, "人数を確認してから反映してください。"]
        : response.warnings);
    } catch (cause) {
      setCandidate(null);
      setError(cause instanceof Error ? cause.message : "AI修正に失敗しました。入力内容は保持されています。");
    } finally {
      setLoading(false);
    }
  };

  const diff = candidate ? diffRecipes(draft, candidate) : null;

  return (
    <section className="card stack" id="ai-revision">
      <div>
        <p className="eyebrow">AI revision</p>
        <h2>AIに追加修正を頼む</h2>
        <p className="muted">現在の内容を基に、指定した箇所だけを変更します。変更は確認するまで反映しません。</p>
      </div>
      <label className="field">
        <span>修正指示</span>
        <textarea
          rows={4}
          maxLength={10000}
          value={displayedInstruction}
          onChange={(event) => {
            if (seedInstruction) onSeedConsumed?.();
            setInstruction(event.target.value);
          }}
          placeholder="例：3人分です。最後に黒こしょうを加えてください。"
        />
      </label>
      <label className="field">
        <span>追加スクリーンショット（任意・6枚まで）</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
        />
      </label>
      {files.length ? <p className="muted">{files.length}枚を送信前に端末内で縮小します。元画像は保存しません。</p> : null}
      <button className="button secondary" type="button" disabled={loading} onClick={() => void requestRevision()}>
        {loading ? "AIが修正案を作成中…" : "修正案を作る"}
      </button>
      {error ? <p className="alert error" role="alert">{error}</p> : null}

      {candidate && diff ? (
        <div className="stack diff-panel" aria-live="polite">
          <h3>AIによる変更内容</h3>
          {warnings.map((warning) => <p className="alert warning" key={warning}>{warning}</p>)}
          {diff.hasChanges ? <ul className="diff-list">{diff.changes.map((change) => (
            <ChangeRow
              key={`${change.path}:${change.kind}`}
              change={change}
              beforeDraft={draft}
              afterDraft={candidate}
            />
          ))}</ul> : (
            <p className="alert warning">現在の内容から変更はありませんでした。</p>
          )}
          <div className="button-row">
            <button className="button" type="button" onClick={() => setCandidate(null)}>変更を取り消す</button>
            <button className="button secondary" type="button" disabled={loading} onClick={() => void requestRevision()}>もう一度頼む</button>
            <button className="button primary" type="button" disabled={!diff.hasChanges} onClick={() => {
              onApply(candidate);
              setCandidate(null);
              setInstruction("");
              setFiles([]);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}>変更を反映する</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
