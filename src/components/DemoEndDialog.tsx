"use client";

export function DemoEndDialog({ open, busy, onCancel, onConfirm }: {
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop demo-end-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel();
    }}>
      <section className="demo-end-dialog" role="dialog" aria-modal="true" aria-labelledby="demo-end-title">
        <h2 id="demo-end-title">デモモードを終了しますか？</h2>
        <p>デモ中に作成・編集したレシピや下書きはこの端末から削除されます。AI利用回数は24時間のデモ期間が終わるまでリセットされません。</p>
        <div><button type="button" disabled={busy} onClick={onCancel}>キャンセル</button><button type="button" className="demo-end-confirm" disabled={busy} onClick={onConfirm}>{busy ? "終了中…" : "デモを終了"}</button></div>
      </section>
    </div>
  );
}
