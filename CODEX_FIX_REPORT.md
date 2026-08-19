# Codex修正報告書

作業日: 2026-07-31  
対象: `recipe-library-app`  
参照専用: `recipe-app-reference`（変更なし）

## 修正した問題

### フェーズ1: 公開前の必須修正

- AI抽出・AI修正ルートへ`maxDuration = 300`を追加した。
- AI待機時間を既定45秒・最大120秒へ統一し、Vercel側の終了より前にアプリ側で失敗を扱えるようにした。
- 413・504などプラットフォーム由来の非JSON応答を、日本語の安全なエラーへ変換した。
- AIリクエスト本文を4,000,000 bytes、圧縮後画像合計を約2MBへ制限し、画像枚数に応じて1枚ごとの予算を動的配分した。
- 画像入力は1〜6枚、元画像1枚5MB・合計20MBという選択時制約を維持し、画面に「送信時は約2MBへ縮小」と明記した。
- 塩・砂糖・肉・ねぎ・だし汁などの一般名を代表食品へ先行マッピングし、水・湯・お湯・氷を栄養計算から除外した。
- 同順位の食品照合を、入力との差が小さい短い一般食品名優先へ変更した。
- 料理モード初期化を`uid + recipe.id`単位へ変更し、同一`id + updatedAt`の購読更新で工程位置・複数タイマーを巻き戻さないようにした。
- 180/192/512pxとmaskableの低色数PNGアイコンを決定論的に生成し、iOS/Android用metadataとmanifestへ登録した。
- 未知のサーバー例外は秘密値や入力本文を含めず、エラー名・安全なコード・発生箇所・スタックだけを記録するようにした。
- Firebase Admin設定不備を利用者の認証失敗と分離し、`AUTH_CONFIGURATION_ERROR`の500応答にした。
- 復元文言を「対象IDを上書き・追加し、ファイルにない現在のレシピは残る」という実挙動へ一致させた。

### フェーズ2: 要件充足

- 日本語助詞・列挙記号を考慮する材料名削除の純粋関数を追加した。
- 材料だけに依存する工程は削除を初期選択にし、別材料の独立した後続工程は残すようにした。
- 「材料名だけ除く」の結果を確定前にtextareaで編集できるようにした。
- `isFavorite`を既定`false`の後方互換フィールドとして追加し、詳細切替と一覧絞り込みを接続した。
- 検索をドメイン実装へ一本化し、かな差、複数語AND、レシピ名・材料・タグ、分類・材料・タグ・お気に入り絞り込みへ対応した。
- 分量整形を`domain/amounts.ts`へ集約し、連続量は小数、可算量は分数、計量単位は自然な日本語順にした。1/6・1/12にも対応した。
- 詳細と料理モードの工程材料表示を共通関数へ統一した。
- Firestore transactionと`updatedAt`で競合を検出し、編集画面へ「最新を読み込む」「別レシピとして保存」「キャンセル」を追加した。入力は競合時も保持する。
- 移行・復元由来で栄養が完全に未計算のレシピは、詳細表示時に一度だけ計算し、成功時だけ競合条件付きで保存するようにした。
- Service Workerのキャッシュ名をデプロイ識別子から生成し、新世代activate時に旧シェルキャッシュを削除するようにした。
- Firestore Rules実Emulatorテストと、外部通信をモックするPlaywright E2Eを追加した。
- 旧人数が0.5/1/2/3/4以外のレシピを捨てず、`servings: null`候補として内容を保持し、設定画面で明示選択後だけ復元するようにした。
- タイマーの空欄・0・負数・24時間超過をUIとZodの日本語エラーで拒否し、壊れたタイマー候補だけを除外するようにした。

### フェーズ3: 操作性・保守性

- 油名の正規化と誤変換防止を追加し、油・砂糖・小麦粉・味噌の根拠付き容量重量換算を追加した。
- 共通`ModalDialog`へ初期フォーカス、Tab/Shift+Tabトラップ、Esc終了、triggerへのフォーカス復帰を実装し、材料影響・下書き復元・削除確認・競合確認へ適用した。
- `maximumScale: 1`を削除した。
- AI差分の工程材料とタイマーを、材料名・用途・工程番号・分秒による日本語表示へ変更した。
- AI取込の下書きキーを取込セッション固有にした。
- ログアウト時は現在UIDの下書き・料理セッション・保留書込だけを削除し、別UIDのデータを保持するようにした。
- 本番CSPを追加し、Firebase Authentication、Googleログイン、Firestore、必要な画像・font・workerを許可した。`unsafe-eval`は使用していない。
- Create Next App残存SVG、未使用CSS、旧エイリアス、重複した検索・分類・分量実装を削除した。
- カバレッジ対象へ`.tsx`を追加した。

## 変更ファイル一覧

主要な変更を責務別に列挙する。

- 構成・運用: `.env.example`, `.gitignore`, `README.md`, `next.config.ts`, `eslint.config.mjs`, `package.json`, `package-lock.json`, `tsconfig.json`
- PWA: `src/app/layout.tsx`, `src/app/manifest.ts`, `src/app/manifest.test.ts`, `src/app/icon.png`, `src/app/apple-icon.png`, `public/icons/*`, `public/sw.js`, `src/components/PwaRegister.tsx`, `src/components/PwaRegister.test.ts`, `scripts/generate-icons.mjs`
- API/認証: `src/app/api/ai/extract/route.ts`, `src/app/api/ai/revise/route.ts`, `src/server/api-handlers.ts`, `src/server/api-error.ts`, `src/server/auth.ts`, `src/server/gemini.ts`, `src/lib/authenticated-api.ts`
- 画像取込: `src/lib/image-processing.ts`, `src/features/import/ImportRecipeFlow.tsx`
- 栄養・単位: `src/server/nutrition.ts`, `data/representative-foods.json`, `data/units.json`, `src/domain/oil-normalization.ts`
- レシピschema/検索/差分: `src/domain/recipe.ts`, `src/domain/recipe-search.ts`, `src/domain/recipe-diff.ts`, `src/features/editor/formatRecipeDiff.ts`
- 材料削除/モーダル: `src/domain/ingredient-text.ts`, `src/domain/ingredient-impact.ts`, `src/components/ModalDialog.tsx`, `src/features/editor/IngredientImpactDialog.tsx`, `src/features/editor/RecipeEditor.tsx`
- 分量/工程材料/料理: `src/domain/amounts.ts`, `src/domain/step-ingredients.ts`, `src/features/cooking/CookingMode.tsx`, `CookingLoader.tsx`, `cooking-core.ts`, `src/features/recipes/RecipeDetail.tsx`, `recipe-detail-core.ts`
- 保存/競合/ログアウト: `src/lib/recipe-repository.ts`, `src/lib/indexed-db.ts`, `src/contexts/AuthProvider.tsx`, `src/contexts/RecipeProvider.tsx`
- 移行/復元: `src/domain/legacy-migration.ts`, `src/features/settings/SettingsView.tsx`, `settings-core.ts`, `settings.module.css`, `scripts/migrate-legacy-recipes.ts`
- Rules: `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `tests/firestore.rules.test.ts`, `vitest.rules.config.mts`
- E2E: `e2e/recipe-flows.spec.ts`, `playwright.config.ts`, `scripts/start-e2e.mjs`, `src/e2e/E2eAppProviders.tsx`
- 削除: `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg`, `src/app/page.module.css`, 未参照だった`public/icon.svg`
- 上記に対応する`src/**/*.test.ts(x)`群と`vitest.config.mts`, `vitest.setup.ts`

## 追加・変更したテスト

- AIルートの`maxDuration`、45秒既定/120秒cap、413・504、4MB本文制限、秘密値を出さないログ。
- 画像の2MB合計制限と残枚数に応じた予算配分。
- 塩・砂糖・水・一般肉名・ねぎ・だし汁の栄養照合回帰。
- 油正規化、誤変換保護、単位換算。
- かな検索、複数語AND、タグ/材料/お気に入り絞り込み。
- 連続量/可算量/日本語計量単位/1/6・1/12、詳細と料理モードの工程材料一致。
- 料理モードの同一版購読、工程位置、複数タイマー、無効タイマー。
- 材料削除の監査例2件と、別材料の独立工程を残す追加回帰。
- Modalのfocus、Tab trap、Esc、focus復帰。
- 下書き復元/破棄、UID別ログアウト削除。
- 旧人数候補の保持・明示確定、復元upsert文言。
- Firestore Rules: 本人CRUD、他UID拒否、未認証拒否、`userId`偽装拒否。
- Playwright（320×844 Chromium）:
  - 手動作成→保存→一覧→詳細→編集→お気に入り切替/絞り込み
  - 文章取込→確認→保存
  - AI修正→日本語差分確認→反映
  - 材料削除→関連工程確認→編集結果反映
  - 料理モード→タイマー→工程移動→再読込→途中再開

## lint・型チェック・テスト・ビルド結果

- `npm run lint`: 成功（warning 0、error 0）
- `npm run typecheck`: 成功
- `npm test`: 成功
  - Vitest: 38 files / 186 tests passed
  - Firestore Rules: 1 file / 4 tests passed（実Emulator、Java 21）
  - Playwright: 5 tests passed
- 追加の320px幅E2E再実行: 5 tests passed
- `npm run build`: 成功（Next.js 16.2.12、13 static page generations、全route生成）

Rulesを含む`npm test`では、`JAVA_HOME`と`PATH`をTemurin JRE 21.0.12へ向けて実行した。fresh環境でもJava 21以上が必要である。

## npm audit結果

`npm audit`は実行済みで、exit code 1、critical 0 / high 25 / moderate 7だった。`npm audit --omit=dev --json`でもhigh 8 / moderate 6が残るため、すべてがdev-onlyではない。

主要経路:

- `next@16.2.12 → postcss@8.4.31 / sharp@0.34.5`
- `firebase-admin@14.2.0 → @google-cloud/storage@7.21.0 → teeny-request / uuid@9.0.1`
- `firebase-admin → google-gax → rimraf → glob → minimatch → brace-expansion`
- 開発用`eslint` / `eslint-config-next` / `firebase-tools`のglob/minimatch/brace-expansion等

`npm outdated --json`では、監査中心のNext、firebase-admin、eslint-config-next、firebase-toolsはいずれもcurrent=wanted=latestだった。`npm audit fix --dry-run --json`はadded/changed/removedすべて0で、安全な非force修正はない。audit提案はNext 9.3.3、firebase-admin 10.3.0、firebase-tools 14.23.0等への不合理なbreaking downgradeを含むため適用していない。`npm audit fix --force`も実行していない。

現アプリは利用者入力CSSを処理せず、`next/image`/SharpやCloud Storage、UUID、globを直接使っていないため、列挙された経路の直接到達性は低い。ただし本番依存の既知脆弱性として上流更新を追跡する。

参考:

- [PostCSS XSS](https://github.com/advisories/GHSA-qx2v-qp2m-jg93)
- [PostCSS arbitrary file read](https://github.com/advisories/GHSA-6g55-p6wh-862q)
- [PostCSS source map path traversal](https://github.com/advisories/GHSA-r28c-9q8g-f849)
- [Sharp/libvips](https://github.com/advisories/GHSA-f88m-g3jw-g9cj)
- [UUID bounds check](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
- [brace-expansion OOM](https://github.com/advisories/GHSA-mh99-v99m-4gvg)

## 資格情報がなく未検証の項目

- Firebase本番プロジェクトでのGoogleログイン、承認済みドメイン、メールallowlist。
- Firestore本番へのRules/Indexes deployと本番データ書込。Rules自体はEmulatorで検証済み。
- 実`GEMINI_API_KEY`による文章・画像・URL Context・YouTube解析。
- 実`YOUTUBE_DATA_API_KEY`による動画概要欄取得。
- Vercel本番でのFunction実時間、4.5MB platform body制限、504応答、Fluid compute設定。
- iPhone Safari/standaloneでのapple-touch-icon、safe area、PWA更新、実機ピンチズーム。

## 利用者が手動確認すべき手順

### Vercel

1. Root Directoryを`recipe-library-app`、Node.jsを22以上にする。
2. `.env.example`の値をProduction/Previewへ設定し、秘密値を`NEXT_PUBLIC_*`へ入れない。
3. デプロイ後、AI routeの`maxDuration`反映、文章取込、6枚画像取込、意図的な413、長時間処理時の日本語エラーを確認する。
4. デプロイを更新し、Service Workerが新世代へ切り替わり古い画面が残らないことを確認する。

### Firebase

1. VercelドメインをAuthenticationの承認済みドメインへ追加する。
2. `firestore.rules`と`firestore.indexes.json`をdeployする。
3. 許可ユーザーA/BでUID分離、未認証拒否、別ユーザーのrecipeが見えないことを確認する。
4. 同じrecipeを2端末で開き、後から古い版を保存した際に競合3択と入力保持を確認する。

### Gemini / YouTube

1. 文章、スクリーンショット、Web URL、公開YouTube URLをそれぞれ取込み、全経路が同じ確認Editorへ合流することを確認する。
2. AI修正で工程材料とタイマーを変更し、日本語差分を確認するまで確定されないことを確認する。
3. 非公開・ログイン必須・取得不能URLでは推測レシピを作らず、入力を保持したまま失敗することを確認する。
4. YouTube長尺入力がプラン上限で失敗した場合、文章貼付けへ切り替えられることを確認する。

### iPhone / Android

1. iPhone Safariからホーム画面へ追加し、180pxの本アイコン、standalone表示、ピンチズームを確認する。
2. Androidで`purpose:any`と`maskable`の表示を確認する。
3. 320px前後、長い材料名・URL、キーボード表示、モーダルのTab/Esc/focus復帰を実機確認する。

## 監査項目のうち未修正のものと理由

- 既知依存脆弱性は未解消。現在の直接依存が最新版で、安全なpatch/minorまたは非force audit fixが存在しないため。上流のNextがPostCSS 8.5.18+/Sharp 0.35+を採用し、Firebase Admin/StorageがUUID 11.1.1+経路へ更新するまで追跡する。
- Firebase/Gemini/YouTube/Vercel/iPhone実機は資格情報・本番環境・実機がないため未検証。コード、依存注入テスト、Rules Emulator、Playwrightまでは完了した。
- RecipeEditorの競合3択とRecipeDetail栄養backfillは実装済みで、repository transactionテストおよび純粋関数テストはあるが、競合を強制するUIコンポーネントテストとbackfill API→保存の統合テストは今後の追加候補。明白な機能欠落は確認されていない。

## 作業前後の `git status --short`

### 作業前

```text
 M .gitignore
 M README.md
 M next.config.ts
 M package-lock.json
 M package.json
 M src/app/globals.css
 M src/app/layout.tsx
 M src/app/page.tsx
 M tsconfig.json
?? .env.example
?? CLAUDE_CODE_AUDIT.md
?? DATA_PROVENANCE.md
?? data/
?? firebase.json
?? firestore.indexes.json
?? firestore.rules
?? public/icon.svg
?? public/sw.js
?? scripts/
?? src/app/add/
?? src/app/api/
?? src/app/cook/
?? src/app/error.tsx
?? src/app/import/
?? src/app/loading.tsx
?? src/app/manifest.test.ts
?? src/app/manifest.ts
?? src/app/not-found.tsx
?? src/app/offline/
?? src/app/recipes/
?? src/app/robots.ts
?? src/app/settings/
?? src/components/
?? src/contexts/
?? src/domain/
?? src/features/
?? src/lib/
?? src/server/
?? vitest.config.mts
?? vitest.setup.ts
```

### 作業後

```text
 M .gitignore
 M README.md
 M eslint.config.mjs
 M next.config.ts
 M package-lock.json
 M package.json
 D public/file.svg
 D public/globe.svg
 D public/next.svg
 D public/vercel.svg
 D public/window.svg
 M src/app/globals.css
 M src/app/layout.tsx
 D src/app/page.module.css
 M src/app/page.tsx
 M tsconfig.json
?? .env.example
?? CLAUDE_CODE_AUDIT.md
?? CODEX_FIX_REPORT.md
?? DATA_PROVENANCE.md
?? data/
?? e2e/
?? firebase.json
?? firestore.indexes.json
?? firestore.rules
?? playwright.config.ts
?? public/icons/
?? public/sw.js
?? scripts/
?? src/app/add/
?? src/app/api/
?? src/app/apple-icon.png
?? src/app/cook/
?? src/app/error.tsx
?? src/app/icon.png
?? src/app/import/
?? src/app/loading.tsx
?? src/app/manifest.test.ts
?? src/app/manifest.ts
?? src/app/not-found.tsx
?? src/app/offline/
?? src/app/recipes/
?? src/app/robots.ts
?? src/app/settings/
?? src/components/
?? src/contexts/
?? src/domain/
?? src/e2e/
?? src/features/
?? src/lib/
?? src/server/
?? tests/
?? vitest.config.mts
?? vitest.rules.config.mts
?? vitest.setup.ts
```

既存の未コミット変更を保持し、今回と無関係な内容をresetしていない。

## Claude Code再検査時の重点項目

1. Vercel本番の300秒宣言、45秒アプリtimeout、4MB本文/2MB画像が実platform挙動と整合するか。
2. 栄養照合の代表食品IDと単位換算が実データで妥当か。
3. Firestore購読更新中も料理モードの工程・複数タイマーが巻き戻らないか。
4. 競合3択、別recipe保存、栄養backfillのUI統合テストを追加する余地。
5. 320pxおよびiPhone standaloneでのmodal focus、safe area、長文、PNGアイコン、PWA更新。
6. Next/PostCSS/Sharp、Firebase Admin/Storage/UUID、firebase-tools/ESLintの上流修正版採用状況。
7. E2E専用Providerが`NODE_ENV=development && NEXT_PUBLIC_E2E_MODE=1`以外で有効にならず、本番Firebase経路が維持されること。
