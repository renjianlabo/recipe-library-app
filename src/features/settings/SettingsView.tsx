"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import Link from "next/link";

import { AppIcon } from "@/components/AppIcon";
import { AuthGate } from "@/components/AuthGate";
import { useAuth } from "@/contexts/AuthProvider";
import { useRecipes } from "@/contexts/RecipeProvider";
import { ALLOWED_SERVINGS, isAllowedServing, type AllowedServing } from "@/domain/amounts";

import {
  createBackupDownload,
  inspectBackupJson,
  inspectLegacyJson,
  legacyCandidateKey,
  materializeConfirmedLegacyCandidates,
  materializeLegacyImport,
  type BackupInspection,
  type LegacyInspection,
} from "./settings-core";
import styles from "./settings.module.css";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function downloadTextFile(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function SettingsView() {
  return (
    <AuthGate>
      <AuthenticatedSettings />
    </AuthGate>
  );
}

function AuthenticatedSettings() {
  const { user } = useAuth();
  const { recipes, restoreRecipes } = useRecipes();
  const [backupInspection, setBackupInspection] = useState<BackupInspection | null>(null);
  const [backupFileName, setBackupFileName] = useState("");
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [backupBusy, setBackupBusy] = useState<"reading" | "restoring" | null>(null);
  const [backupNotice, setBackupNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [legacyInspection, setLegacyInspection] = useState<LegacyInspection | null>(null);
  const [legacyFileName, setLegacyFileName] = useState("");
  const [legacyConfirmed, setLegacyConfirmed] = useState(false);
  const [legacyServings, setLegacyServings] = useState<Record<string, AllowedServing>>({});
  const [legacyBusy, setLegacyBusy] = useState<"reading" | "restoring" | null>(null);
  const [legacyNotice, setLegacyNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const legacyInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const handleExport = () => {
    setBackupNotice(null);
    try {
      const download = createBackupDownload(recipes);
      downloadTextFile(download.fileName, download.text);
    } catch (error) {
      setBackupNotice({
        kind: "error",
        text: errorMessage(error, "バックアップを作成できませんでした。"),
      });
    }
  };

  const handleBackupFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setBackupBusy("reading");
    setBackupFileName(file.name);
    setBackupInspection(null);
    setBackupConfirmed(false);
    setBackupNotice(null);
    try {
      setBackupInspection(inspectBackupJson(await file.text(), user.uid));
    } catch (error) {
      setBackupNotice({
        kind: "error",
        text: errorMessage(error, "ファイルを読み取れませんでした。選択したファイルは保持されています。"),
      });
    } finally {
      setBackupBusy(null);
    }
  };

  const handleBackupRestore = async () => {
    if (!backupInspection?.success || !backupConfirmed) return;
    setBackupBusy("restoring");
    setBackupNotice(null);
    try {
      await restoreRecipes(backupInspection.backup.recipes);
      setBackupNotice({
        kind: "success",
        text: `${backupInspection.backup.recipes.length}件のレシピを復元しました。`,
      });
      setBackupInspection(null);
      setBackupFileName("");
      setBackupConfirmed(false);
      if (backupInputRef.current) backupInputRef.current.value = "";
    } catch (error) {
      setBackupNotice({
        kind: "error",
        text: `${errorMessage(error, "復元に失敗しました。")} ファイルと確認結果は保持されています。`,
      });
    } finally {
      setBackupBusy(null);
    }
  };

  const handleLegacyFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setLegacyBusy("reading");
    setLegacyFileName(file.name);
    setLegacyInspection(null);
    setLegacyConfirmed(false);
    setLegacyServings({});
    setLegacyNotice(null);
    try {
      setLegacyInspection(inspectLegacyJson(await file.text(), user.uid));
    } catch (error) {
      setLegacyNotice({
        kind: "error",
        text: errorMessage(error, "旧形式ファイルを読み取れませんでした。選択したファイルは保持されています。"),
      });
    } finally {
      setLegacyBusy(null);
    }
  };

  const handleLegacyRestore = async () => {
    if (
      !legacyInspection?.success
      || !legacyConfirmed
      || legacyInspection.report.convertedCount + legacyInspection.report.candidateCount === 0
      || !legacyInspection.report.candidates.every((candidate) => (
        isAllowedServing(legacyServings[legacyCandidateKey(candidate)])
      ))
    ) return;
    setLegacyBusy("restoring");
    setLegacyNotice(null);
    try {
      const converted = materializeLegacyImport(legacyInspection, user.uid);
      if (
        converted.documentErrors.length > 0
        || converted.convertedCount !== legacyInspection.report.convertedCount
        || converted.candidateCount !== legacyInspection.report.candidateCount
      ) {
        throw new Error("確認時と変換結果が一致しないため、復元を中止しました。");
      }
      const confirmedCandidates = materializeConfirmedLegacyCandidates(
        converted.candidates,
        legacyServings,
      );
      const recipesToRestore = [...converted.recipes, ...confirmedCandidates];
      await restoreRecipes(recipesToRestore);
      setLegacyNotice({
        kind: "success",
        text: `${recipesToRestore.length}件の旧レシピを変換して復元しました。`,
      });
      setLegacyInspection(null);
      setLegacyFileName("");
      setLegacyConfirmed(false);
      setLegacyServings({});
      if (legacyInputRef.current) legacyInputRef.current.value = "";
    } catch (error) {
      setLegacyNotice({
        kind: "error",
        text: `${errorMessage(error, "旧データの復元に失敗しました。")} ファイルとdry-run結果は保持されています。`,
      });
    } finally {
      setLegacyBusy(null);
    }
  };

  const validBackup = backupInspection?.success ? backupInspection.backup : null;
  const validLegacy = legacyInspection?.success ? legacyInspection : null;
  const legacyCandidatesResolved = validLegacy?.report.candidates.every((candidate) => (
    isAllowedServing(legacyServings[legacyCandidateKey(candidate)])
  )) ?? false;
  const legacyConfirmedCandidateCount = validLegacy?.report.candidates.filter((candidate) => (
    isAllowedServing(legacyServings[legacyCandidateKey(candidate)])
  )).length ?? 0;
  const legacyRestorableCount = validLegacy
    ? validLegacy.report.convertedCount + validLegacy.report.candidateCount
    : 0;

  return (
    <main className={`page-container ${styles.page}`}>
      <header className="settings-header">
        <Link href="/settings" aria-label="設定へ戻る">
          <AppIcon name="back" size={21} />
        </Link>
        <h1>データを書き出す・復元</h1>
      </header>

      <div className={styles.sections}>
        <section className={`card ${styles.section}`} aria-labelledby="backup-heading">
          <div>
            <h2 id="backup-heading">データ書き出し・復元</h2>
            <p className="muted">レシピをJSONで持ち出し、同じ形式から一括復元できます。</p>
          </div>

          <div className={styles.actionBlock}>
            <div className={styles.blockHeader}>
              <div>
                <h3>バックアップを書き出す</h3>
                <p className="fine-print">現在のレシピ {recipes.length}件を検証済みJSONとして保存します。</p>
              </div>
              <button className="button secondary" type="button" onClick={handleExport}>
                JSONを書き出す
              </button>
            </div>
          </div>

          <div className={styles.actionBlock}>
            <h3>現在形式のバックアップを復元</h3>
            <p className="fine-print">
              まず全件を検証します。確認前や不正なファイルの選択時には、現在のデータを変更しません。
            </p>
            <label className={styles.fileField}>
              <span>現在形式のバックアップJSON</span>
              <input
                ref={backupInputRef}
                type="file"
                accept="application/json,.json"
                onChange={(event) => void handleBackupFile(event)}
                disabled={backupBusy !== null}
              />
            </label>
            {backupFileName ? <p className="fine-print">選択中: {backupFileName}</p> : null}
            {backupBusy === "reading" ? <p aria-live="polite">ファイルを検証しています。</p> : null}

            {backupInspection && !backupInspection.success ? (
              <div className="alert error" role="alert">
                <strong>復元できません。現在のデータは変更されていません。</strong>
                <ul className={styles.issueList}>
                  {backupInspection.issues.map((issue, index) => (
                    <li key={`${issue.path}-${index}`}>
                      {issue.path ? `${issue.path}: ` : ""}{issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {validBackup ? (
              <div className={styles.preview}>
                <p><strong>{validBackup.recipes.length}件のレシピを復元できます。</strong></p>
                <p className="fine-print">書き出し日時: {new Date(validBackup.exportedAt).toLocaleString("ja-JP")}</p>
                <p className="alert warning">
                  バックアップに含まれるレシピを上書き・追加します。
                  バックアップに含まれない現在のレシピは残ります。
                </p>
                <label className={styles.confirmRow}>
                  <input
                    type="checkbox"
                    checked={backupConfirmed}
                    onChange={(event) => setBackupConfirmed(event.currentTarget.checked)}
                  />
                  <span>レシピを上書き・追加し、バックアップに含まれない現在のレシピは残ることを確認しました</span>
                </label>
                <button
                  className="button danger wide"
                  type="button"
                  disabled={!backupConfirmed || backupBusy !== null}
                  onClick={() => void handleBackupRestore()}
                >
                  {backupBusy === "restoring" ? "復元しています" : "確認した内容で一括復元"}
                </button>
              </div>
            ) : null}
            {backupNotice ? (
              <p className={`alert ${backupNotice.kind === "error" ? "error" : ""}`} role={backupNotice.kind === "error" ? "alert" : "status"}>
                {backupNotice.text}
              </p>
            ) : null}
          </div>
        </section>

        <section className={`card ${styles.section}`} aria-labelledby="legacy-heading">
          <div>
            <h2 id="legacy-heading">旧recipe-appから移行</h2>
            <p className="muted">
              旧<code>data/recipes.json</code>をdry-runし、変換件数・警告・スキップ理由を確認してから取り込みます。
            </p>
          </div>
          <label className={styles.fileField}>
            <span>旧形式のrecipes.json</span>
            <input
              ref={legacyInputRef}
              type="file"
              accept="application/json,.json"
              onChange={(event) => void handleLegacyFile(event)}
              disabled={legacyBusy !== null}
            />
          </label>
          {legacyFileName ? <p className="fine-print">選択中: {legacyFileName}</p> : null}
          {legacyBusy === "reading" ? <p aria-live="polite">旧データをdry-runしています。</p> : null}

          {legacyInspection && !legacyInspection.success ? (
            <div className="alert error" role="alert">
              <strong>dry-runを完了できません。現在のデータは変更されていません。</strong>
              <ul className={styles.issueList}>
                {legacyInspection.issues.map((issue, index) => <li key={`${issue}-${index}`}>{issue}</li>)}
              </ul>
            </div>
          ) : null}

          {validLegacy ? (
            <div className={styles.preview}>
              <p>
                <strong>
                  dry-run: {validLegacy.report.total}件中 {validLegacy.report.convertedCount}件をそのまま変換でき、
                  {validLegacy.report.candidateCount}件は人数確認が必要です。
                </strong>
              </p>
              <dl className={styles.reportGrid}>
                <div><dt>変換可能</dt><dd>{validLegacy.report.convertedCount}件</dd></div>
                <div><dt>人数確認待ち</dt><dd>{validLegacy.report.candidateCount}件</dd></div>
                <div><dt>スキップ</dt><dd>{validLegacy.report.skippedCount}件</dd></div>
                <div><dt>警告</dt><dd>{validLegacy.report.warnings.length}件</dd></div>
              </dl>

              {validLegacy.report.candidates.length > 0 ? (
                <section className={styles.candidateSection} aria-labelledby="legacy-servings-heading">
                  <div>
                    <h3 id="legacy-servings-heading">人数の確認が必要なレシピ</h3>
                    <p className="fine-print">
                      旧データの人数は丸めていません。各レシピで人数を選ぶまで復元対象には追加しません。
                    </p>
                  </div>
                  <div className={styles.candidateList}>
                    {validLegacy.report.candidates.map((candidate) => {
                      const key = legacyCandidateKey(candidate);
                      return (
                        <label className={styles.candidateRow} key={key}>
                          <span>
                            <strong>{candidate.draft.title}</strong>
                            <small>旧データ {candidate.recipeIndex + 1}件目</small>
                          </span>
                          <select
                            aria-label={`${candidate.draft.title}の人数`}
                            value={legacyServings[key] ?? ""}
                            onChange={(event) => {
                              const servings = Number(event.currentTarget.value);
                              if (!isAllowedServing(servings)) return;
                              setLegacyServings((current) => ({ ...current, [key]: servings }));
                            }}
                            disabled={legacyBusy !== null}
                          >
                            <option value="">人数を選択</option>
                            {ALLOWED_SERVINGS.map((servings) => (
                              <option value={servings} key={servings}>{servings}人</option>
                            ))}
                          </select>
                        </label>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {validLegacy.report.skipped.length > 0 ? (
                <details className={styles.details}>
                  <summary>スキップ理由 {validLegacy.report.skipped.length}件</summary>
                  <ol className={styles.issueList}>
                    {validLegacy.report.skipped.map((item) => (
                      <li key={`${item.recipeIndex}-${item.legacyId ?? "unknown"}`}>
                        <strong>{item.title ?? `レシピ ${item.recipeIndex + 1}`}</strong>
                        <ul>{item.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}

              {validLegacy.report.warnings.length > 0 ? (
                <details className={styles.details}>
                  <summary>変換時の警告 {validLegacy.report.warnings.length}件</summary>
                  <ol className={styles.issueList}>
                    {validLegacy.report.warnings.map((warning, index) => (
                      <li key={`${warning.recipeIndex}-${warning.path}-${warning.code}-${index}`}>
                        レシピ {warning.recipeIndex + 1} / {warning.path}: {warning.message}
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}

              {legacyRestorableCount > 0 ? (
                <>
                  <p className="alert warning">
                    変換済み{validLegacy.report.convertedCount}件と、人数確認済み
                    {legacyConfirmedCandidateCount}/{validLegacy.report.candidateCount}件を上書き・追加します。
                    移行ファイルに含まれない現在のレシピは残ります。
                    スキップされたレシピは取り込みません。
                  </p>
                  <label className={styles.confirmRow}>
                    <input
                      type="checkbox"
                      checked={legacyConfirmed}
                      onChange={(event) => setLegacyConfirmed(event.currentTarget.checked)}
                    />
                    <span>dry-run結果を確認し、レシピを上書き・追加することを確認しました</span>
                  </label>
                  <button
                    className="button danger wide"
                    type="button"
                    disabled={!legacyConfirmed || !legacyCandidatesResolved || legacyBusy !== null}
                    onClick={() => void handleLegacyRestore()}
                  >
                    {legacyBusy === "restoring" ? "変換・復元しています" : "確認した旧データを変換・復元"}
                  </button>
                </>
              ) : (
                <p className="alert error" role="alert">変換できるレシピがないため復元できません。</p>
              )}
            </div>
          ) : null}
          {legacyNotice ? (
            <p className={`alert ${legacyNotice.kind === "error" ? "error" : ""}`} role={legacyNotice.kind === "error" ? "alert" : "status"}>
              {legacyNotice.text}
            </p>
          ) : null}
        </section>

      </div>
    </main>
  );
}
