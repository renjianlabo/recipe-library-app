import Link from "next/link";

import styles from "./page.module.css";

export const metadata = {
  title: "オフライン | わたしのレシピ帳",
};

export default function OfflinePage() {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="offline-title">
        <p className={styles.eyebrow}>オフライン</p>
        <h1 id="offline-title">インターネットに接続できません</h1>
        <p>
          通信が戻ったら、もう一度お試しください。端末に保存された下書きや料理の途中状態は消えません。
        </p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/">
            もう一度試す
          </Link>
        </div>
      </section>
    </main>
  );
}
