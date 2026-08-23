"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { AppIcon } from "@/components/AppIcon";
import { AuthGate } from "@/components/AuthGate";
import { useAuth } from "@/contexts/AuthProvider";
import { saveAiReviewSession } from "@/features/creation/creation-session";
import { normalizeAiDraft } from "@/features/editor/normalizeAiDraft";
import { authenticatedJson } from "@/lib/authenticated-api";
import { prepareImages, validateImageFiles } from "@/lib/image-processing";

export type ImportMode = "ai" | "text" | "screenshot" | "youtube" | "website";

type AiRecipeResponse = {
  draft: Parameters<typeof normalizeAiDraft>[0];
  warnings: string[];
  needsServingsConfirmation: boolean;
  detectedServings: number | null;
};

const MODE_META: Record<ImportMode, { title: string; description: string; action: string }> = {
  ai: {
    title: "AIでレシピを作成",
    description: "文章・画像・URLからレシピを作成できます",
    action: "AIでレシピを作成",
  },
  text: {
    title: "文章からレシピを作成",
    description: "レシピ本文をそのまま貼り付けてください。書かれていない情報は推測せず、確認用の下書きを作ります。",
    action: "文章を解析",
  },
  screenshot: {
    title: "スクリーンショットから作成",
    description: "材料と工程が別画像でも、選択した順で最大6枚をまとめて解析します。元画像は保存しません。",
    action: "画像を解析",
  },
  youtube: {
    title: "YouTubeからレシピを作成",
    description: "公開動画のURLを入力してください。概要欄を優先し、動画から工程を補います。",
    action: "動画を解析",
  },
  website: {
    title: "サイトURLからレシピを作成",
    description: "ログイン不要で公開されている料理ページのURLを入力してください。",
    action: "サイトを解析",
  },
};

export function ImportRecipeFlow({ mode }: { mode: ImportMode }) {
  const router = useRouter();
  const { user, demoStatus, refreshDemoStatus } = useAuth();
  const meta = MODE_META[mode];
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    router.prefetch("/create/ai/review");
  }, [router]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
      setError("AI作成にはログインが必要です。");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let body: unknown;
      if (mode === "ai") {
        if (!text.trim() && files.length === 0) throw new Error("レシピの文章、URL、または画像を追加してください。");
        if (files.length > 0) {
          validateImageFiles(files);
          const images = await prepareImages(files);
          body = {
            type: "screenshot",
            images: images.map((image) => ({ data: image.dataUrl, mimeType: image.mimeType })),
            ...(text.trim() ? { text } : {}),
          };
        } else {
          let parsedUrl: URL | null = null;
          try { parsedUrl = new URL(text.trim()); } catch { parsedUrl = null; }
          if (parsedUrl) {
            body = { type: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(parsedUrl.hostname) ? "youtube" : "website", url: parsedUrl.toString() };
          } else {
            body = { type: "text", text };
          }
        }
      } else if (mode === "text") {
        if (!text.trim()) throw new Error("レシピの文章を入力してください。");
        body = { type: "text", text };
      } else if (mode === "screenshot") {
        validateImageFiles(files);
        const images = await prepareImages(files);
        body = {
          type: "screenshot",
          images: images.map((image) => ({ data: image.dataUrl, mimeType: image.mimeType })),
          ...(text.trim() ? { text } : {}),
        };
      } else {
        if (!url.trim()) throw new Error("URLを入力してください。");
        body = { type: mode, url };
      }
      const response = await authenticatedJson<AiRecipeResponse>(user, "/api/ai/extract", { body });
      saveAiReviewSession({
        draft: normalizeAiDraft(response.draft),
        warnings: response.warnings,
        needsServingsConfirmation: response.needsServingsConfirmation,
        detectedServings: response.detectedServings,
      });
      router.push("/create/ai/review");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "解析に失敗しました。入力内容は保持されています。");
    } finally {
      if (user?.isDemo) await refreshDemoStatus().catch(() => undefined);
      setLoading(false);
    }
  };

  return (
    <AuthGate>
      <main className="page-container flow-page ai-action-page">
        <header className="flow-header"><Link href="/create" aria-label="作成を閉じる"><AppIcon name="x" size={22} /></Link><h1>{meta.title}</h1></header>
        <form className="flow-content ai-input" onSubmit={(event) => void submit(event)}>
          <p className="flow-lead">{meta.description}</p>
          {mode === "ai" ? (
            <>
              <label className="ai-textarea"><textarea rows={10} maxLength={50000} value={text} onChange={(event) => setText(event.target.value)} placeholder="レシピの文章やURLを貼り付けてください" /><span>{text.length > 0 ? `${text.length}文字` : "コピーした文章・URLに対応"}</span></label>
              <div className="attachment-row"><label className="attachment-add"><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={(event) => { const selected = Array.from(event.target.files ?? []); setFiles(selected); try { validateImageFiles(selected); setError(null); } catch (cause) { setError(cause instanceof Error ? cause.message : "画像を確認してください。"); } }} /><AppIcon name="image" size={19} /><span>スクリーンショットを追加</span></label><div className="url-hint"><AppIcon name="link" size={16} />URLもそのまま貼り付けできます</div></div>
              {files.length ? <div className="attached-files">{files.map((file, index) => <span key={`${file.name}-${index}`}><AppIcon name="image" size={14} />{file.name}<button type="button" aria-label={`${file.name}を削除`} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></span>)}</div> : null}
            </>
          ) : mode === "text" ? (
            <label className="field">
              <span>レシピの文章</span>
              <textarea
                rows={14}
                maxLength={50000}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="材料、分量、人数、作り方を含む文章を貼り付けてください。"
                required
              />
            </label>
          ) : null}
          {mode === "screenshot" ? (
            <>
              <label className="field">
                <span>スクリーンショット（JPEG・PNG・WebP・HEIC、最大6枚・元画像は1枚5MB/合計20MB、送信時は合計約2MBまで縮小）</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  multiple
                  required
                  onChange={(event) => {
                    const selected = Array.from(event.target.files ?? []);
                    setFiles(selected);
                    try {
                      validateImageFiles(selected);
                      setError(null);
                    } catch (cause) {
                      setError(cause instanceof Error ? cause.message : "画像を確認してください。");
                    }
                  }}
                />
              </label>
              {files.length ? <p className="muted">選択中：{files.map((file) => file.name).join("、")}</p> : null}
              <label className="field">
                <span>画像についての補足（任意）</span>
                <textarea rows={4} maxLength={20000} value={text} onChange={(event) => setText(event.target.value)} placeholder="例：1枚目が材料、2枚目以降が続きです。" />
              </label>
            </>
          ) : null}
          {mode === "youtube" || mode === "website" ? (
            <label className="field">
              <span>{mode === "youtube" ? "YouTube動画URL" : "料理ページURL"}</span>
              <input
                type="url"
                inputMode="url"
                maxLength={2048}
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={mode === "youtube" ? "https://www.youtube.com/watch?v=..." : "https://example.com/recipe/..."}
                required
              />
            </label>
          ) : null}
          {error ? <p className="alert error" role="alert">{error}</p> : null}
          {user?.isDemo && demoStatus.active ? <section className="demo-ai-usage"><div><b>デモモード</b><strong>AI生成　残り {demoStatus.aiRemaining} / {demoStatus.aiLimit} 回</strong></div><div className="demo-ai-dots" aria-hidden="true">{Array.from({ length: demoStatus.aiLimit }, (_, index) => <i className={index < demoStatus.aiRemaining ? "active" : ""} key={index} />)}</div><small>{demoStatus.aiRemaining > 0 ? "デモ中のAI生成には利用回数の上限があります" : "デモモードのAI生成上限に達しました。手動作成は引き続き利用できます。"}</small>{demoStatus.aiRemaining === 0 ? <Link href="/create/manual">手動でレシピを作成</Link> : null}</section> : null}
          <p className="flow-note">AIが情報を整理します。内容は保存前に確認できます。</p>
          <footer className="ai-create-actions floating-action-bar">
            <button className="primary-flow-button" type="submit" disabled={loading || (user?.isDemo && demoStatus.active && demoStatus.aiRemaining === 0) || (mode === "screenshot" && files.length === 0) || (mode === "ai" && !text.trim() && files.length === 0)}>{loading ? "レシピを作成中…" : <>{meta.action} <AppIcon name="arrow" size={18} /></>}</button>
          </footer>
        </form>
      </main>
    </AuthGate>
  );
}
