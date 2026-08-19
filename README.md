# My Recipe Note

Figma Makeで設計したUI・画面遷移を基準にした、個人用のクラウドレシピ帳です。iPhoneのPWAとPCから同じアカウントで利用でき、AIが利用できない場合も手動登録・編集・料理モードまで完結します。資格情報がない環境では、端末保存のデモモードで主要画面と操作を確認できます。

このディレクトリは旧`recipe-app-reference`を直接変更せず、新規に構築したNext.jsアプリです。旧Expressサーバー、ローカルJSONへの書き込み、食事記録、摂取目標、NG食材、Claude連携、旧画面デザインは含めていません。

## 主な機能

- メールアドレス/パスワード認証、確認メール、パスワード再設定とFirestoreのユーザー別レシピ保存
- アカウント不要で端末内に保存できるデモモード
- 3タブ（ホーム・レシピ・作成）と、Figma準拠の固定/非固定ナビゲーション
- カテゴリ別ホーム、レシピ一覧、料理名・材料検索、分類/家にある調味料フィルター、詳細
- 手動登録と共通編集フォーム
- 任意の料理画像追加（端末側で300KB以下へ縮小）
- 材料・工程の追加、削除、並べ替え、工程材料参照、工程タイマー
- 分数・小数・定性的な分量と0.5/1/2/3/4人分の換算
- 材料削除時の工程・ポイント・メモ影響確認
- IndexedDBへの下書き自動保存、復元/破棄、クラウド保存失敗時の保留
- 文章、複数スクリーンショット、YouTube、公開WebページからのAI下書き作成
- 現在の下書きを基にしたAI修正、ローカル算出した差分の承認/取消
- 1工程ずつ表示する料理モード、スワイプ、複数タイマー、Wake Lock、途中再開
- 工程材料と全材料Bottom Sheet、家にある調味料のクラウド設定
- JSONバックアップ/復元と旧レシピ形式の事前確認付き移行
- manifest、Service Worker、オフライン案内を含むPWA基盤

## 構成

- Next.js 16 App Router / React 19 / TypeScript strict
- Firebase Authentication / Cloud Firestore
- Firebase Admin SDKによるAPIのIDトークン検証
- Gemini API（`@google/genai` Interactions API、既定`gemini-3.6-flash`）
- YouTube Data API v3
- Zodによるブラウザー・API・保存・バックアップ境界の検証
- IndexedDB（`idb`）による端末内下書き/料理セッション/保留書き込み
- Vitest / Testing Library

APIキーとFirebase Admin資格情報はサーバー側だけで使用します。ブラウザーへ渡すのはFirebase Web App用の`NEXT_PUBLIC_FIREBASE_*`公開設定だけです。

## ローカルセットアップ

必要環境はNode.js 22以上です（`firebase-admin` 14系の実行要件）。Firestore Rulesテストまで実行する場合はJava 21も必要です。

```powershell
cd C:\github\codex_recipe_app_handoff\recipe-library-app
npm install
Copy-Item .env.example .env.local
npm run dev
```

`http://localhost:3000`を開きます。Firebase公開設定がない場合は、資格情報を要求せずセットアップ案内を表示します。

### Firebase

1. FirebaseプロジェクトとWeb Appを作成します。
2. Authenticationで「メール/パスワード」プロバイダーを有効にし、ローカル/本番ドメインを承認済みドメインへ追加します。
3. Cloud Firestoreを作成します。
4. Web App設定を`NEXT_PUBLIC_FIREBASE_*`へ設定します。
5. サービスアカウント値を`FIREBASE_PROJECT_ID`、`FIREBASE_CLIENT_EMAIL`、`FIREBASE_PRIVATE_KEY`へ設定します。秘密鍵の改行は環境変数内で`\n`として保持できます。代わりにサービスアカウントJSON全体を`FIREBASE_SERVICE_ACCOUNT_JSON`へ設定できます。
6. 利用者を限定する場合は`ALLOWED_EMAILS`へカンマ区切りでメールアドレスを設定します。空の場合も、認証済みユーザーのデータはUID別パスに分離されます。
7. ルールと索引をデプロイします。

```powershell
npx firebase-tools login
npx firebase-tools use <firebase-project-id>
npx firebase-tools deploy --only firestore:rules,firestore:indexes
```

`firestore.rules`は`users/{uid}`配下だけを本人へ許可し、レシピ本文の`userId`とドキュメントIDも検証します。

### GeminiとYouTube

- `GEMINI_API_KEY`: Gemini APIキー
- `GEMINI_MODEL`: 省略時`gemini-3.6-flash`
- `YOUTUBE_DATA_API_KEY`: YouTube Data API v3キー
- `AI_TIMEOUT_MS`: AIリクエスト上限時間（既定45秒、最大120秒）
- `AI_RATE_LIMIT_PER_MINUTE`: UIDごとのAI呼出上限

YouTube取込はData APIの概要欄を材料・分量・人数の優先根拠にし、公開動画入力から工程だけを補います。GeminiのYouTube URL入力は現時点で提供状況に制約があるため、失敗時は文章貼付けまたはスクリーンショット取込を利用してください。参考: [Gemini video understanding](https://ai.google.dev/gemini-api/docs/video-understanding)、[YouTube videos.list](https://developers.google.com/youtube/v3/docs/videos/list)。

Webサイト取込は公開HTTP(S) URLだけを許可します。localhost、資格情報付きURL、特殊ポート、プライベート/予約済みIP、DNSで内部IPへ解決されるホストを拒否し、[Gemini URL Context](https://ai.google.dev/gemini-api/docs/url-context)の取得成功を確認します。

## データとバックアップ

設定画面から、現在のユーザーのレシピを検証可能なJSONとして書き出せます。復元はファイルを先に検証し、件数と問題を表示してから明示確認し、Firestoreバッチで原子的に反映します。復元前に現在のデータも書き出してください。

旧`recipe-app-reference/data/recipes.json`は、旧タイトルを工程本文へ混ぜず、工程材料参照とタイマーを可能な範囲で変換する移行スクリプト/設定画面の事前確認から取り込めます。旧レシピは材料IDがないため名前照合で新IDを割り当て、重複していた工程内の分量は材料一覧を正本とします。

まず書き込みなしのdry-runを実行します。

```powershell
npm run migrate:legacy -- --input ../recipe-app-reference/data/recipes.json --user-id <Firebase-UID>
```

結果JSONの`convertedCount`、`skippedCount`、`warnings`、`documentErrors`を確認後、Firestoreへ直接書かず検証済みバックアップ候補をローカル出力します。

```powershell
npm run migrate:legacy -- --input ../recipe-app-reference/data/recipes.json --user-id <Firebase-UID> --write --output ./converted-recipes.json
```

出力は`{ "recipes": [...] }`形式です。設定画面で事前検証し、現在データを書き出してから明示的に復元してください。

旧食品成分データは移行資料として残していますが、今回のバージョンでは栄養計算・栄養表示・食事記録を実装していません。

## PWA

Service Workerは本番ビルドだけで登録されます。アプリシェルと静的資産だけをキャッシュし、API、Firestore、認証、外部サイト応答はキャッシュしません。iPhoneではSafariの共有メニューから「ホーム画面に追加」を選択してください。

キャッシュ名はデプロイ識別子ごとに更新されます。Vercelではデプロイ/コミット識別子を自動利用し、セルフホストではビルド時に`NEXT_DEPLOYMENT_ID`を一意な値へ設定してください。

## 検証

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

`npm test`はVitestのユニット/コンポーネントテスト、Firebase Firestore Emulator上のRulesテスト、Playwright E2Eを順に実行します。RulesテストにはJava 21以上が必要です。`JAVA_HOME`と`PATH`をJava 21へ向け、`java -version`で確認してください。Playwrightを初めて使う環境では、先に`npx playwright install chromium`を実行します。個別実行は`npm run test:unit`、`npm run test:rules`、`npm run test:e2e`を使用してください。

まとめて実行する場合は`npm run verify`を使用します。外部資格情報を必要とする実AI呼出やFirebase本番書込みは自動テストに含めず、依存を注入したハンドラー/サービスの契約テストで検証します。

## Vercelへのデプロイ

1. GitリポジトリをVercelへImportし、Root Directoryを`recipe-library-app`にします。
2. Node.js 22以上を選択します。
3. `.env.example`に列挙した値をProduction/Previewへ設定します。秘密値を`NEXT_PUBLIC_*`へ入れないでください。
4. Deploy後のドメインをFirebase Authenticationの承認済みドメインへ追加します。
5. Firestore Rules/IndexesをFirebase CLIから別途デプロイします。
6. メール登録・確認・ログイン、レシピ保存、調味料設定、PWA再読込、APIの401/403、バックアップ復元を本番ドメインで確認します。

AI取込ルートは`maxDuration = 300`を宣言していますが、実際の上限はVercelのプランとFluid compute設定に従います。現在のFluid computeではHobbyも最大300秒、旧来の非Fluid Hobbyでは最大60秒です。アプリ自身のAI待機時間は既定45秒（環境変数で最大120秒）なので、YouTubeや大きな入力は取得元・Gemini・プラットフォームのいずれかの上限で失敗する場合があります。失敗しても入力は保持されるため、文章貼付けや画像枚数を減らして再試行してください。

Vercel Functionsのリクエスト/レスポンス本文上限は4.5 MBです。本アプリはAI API本文を4,000,000 bytesで拒否し、スクリーンショットは端末側で縮小して合計約2 MBへ収めます。画面で選べる元画像は1枚5 MB・合計20 MBまでですが、そのままサーバーへ送信する意味ではありません。

## 運用上の注意

- スクリーンショットは送信前に端末内で向き補正・縮小し、元画像は保存しません。
- AIの出力は直接保存せず、必ず共通Editorと差分確認を通します。
- AIが人数を確定できない場合は`null`のまま返し、利用者が5候補から選ぶまで保存できません。
- URL先や動画が非公開、ログイン必須、取得制限ありの場合は読み込めません。
- `ALLOWED_EMAILS`変更前に、既存利用者が締め出されないことを確認してください。
