import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { migrateLegacyRecipesDocument } from "../src/domain/legacy-migration";

interface CliArguments {
  input: string;
  userId: string;
  output: string | null;
  write: boolean;
}

function usage(): string {
  return [
    "旧recipes.jsonを新形式へ検証付きで変換します。既定はdry-runです。",
    "",
    "dry-run:",
    "  npx tsx scripts/migrate-legacy-recipes.ts --input <recipes.json> --user-id <uid>",
    "",
    "ローカルJSONへ明示的に書き出す:",
    "  npx tsx scripts/migrate-legacy-recipes.ts --input <recipes.json> --user-id <uid> --write --output <converted.json>",
    "",
    "このスクリプトはFirestoreへ接続せず、本番データを自動変更しません。",
  ].join("\n");
}

function parseArguments(argv: readonly string[]): CliArguments {
  const valueAfter = (flag: string): string => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] ?? "" : "";
  };
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }

  const input = valueAfter("--input");
  const userId = valueAfter("--user-id");
  const output = valueAfter("--output") || null;
  const write = argv.includes("--write");
  if (!input || !userId || (write && !output)) {
    throw new Error(usage());
  }
  return { input, userId, output, write };
}

async function main(): Promise<void> {
  const arguments_ = parseArguments(process.argv.slice(2));
  const inputPath = path.resolve(process.cwd(), arguments_.input);
  const document = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
  const result = migrateLegacyRecipesDocument(document, {
    userId: arguments_.userId,
    importedAt: new Date().toISOString(),
    dryRun: !arguments_.write,
  });

  console.log(JSON.stringify(result, null, 2));
  if (result.documentErrors.length) {
    process.exitCode = 1;
    return;
  }
  if (arguments_.write && arguments_.output) {
    const outputPath = path.resolve(process.cwd(), arguments_.output);
    await writeFile(outputPath, `${JSON.stringify({ recipes: result.recipes }, null, 2)}\n`, "utf8");
    console.error(`変換済みJSONを書き出しました: ${outputPath}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "移行スクリプトの実行に失敗しました");
  process.exitCode = 1;
});

