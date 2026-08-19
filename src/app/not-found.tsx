import Link from "next/link";

export default function NotFound() {
  return (
    <main className="center-screen narrow-panel">
      <p className="eyebrow">404</p>
      <h1>ページが見つかりません</h1>
      <p className="muted">URLを確認するか、レシピ帳へ戻ってください。</p>
      <Link className="button primary" href="/recipes">レシピ帳へ戻る</Link>
    </main>
  );
}
