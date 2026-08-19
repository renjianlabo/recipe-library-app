"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="center-screen narrow-panel">
      <p className="eyebrow">Error</p>
      <h1>画面を表示できませんでした</h1>
      <p className="muted">入力中の内容は端末内の下書きに残っている可能性があります。</p>
      <button className="button primary" type="button" onClick={reset}>もう一度試す</button>
    </main>
  );
}
