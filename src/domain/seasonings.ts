import type { Recipe } from "./recipe";

export const SEASONING_GROUPS = [
  { id: "basic", name: "基本調味料", sample: "塩、砂糖、しょうゆ など", items: ["塩", "砂糖", "こしょう", "しょうゆ", "薄口しょうゆ", "酢", "ワインビネガー", "みりん", "料理酒", "味噌"] },
  { id: "oil", name: "油・香味油", sample: "サラダ油、ごま油、オリーブ油 など", items: ["サラダ油", "ごま油", "オリーブ油", "米油", "こめ油", "ラー油", "バター"] },
  { id: "sauce", name: "たれ・ソース", sample: "めんつゆ、ポン酢、ケチャップ など", items: ["めんつゆ", "ポン酢", "ケチャップ", "マヨネーズ", "ウスターソース", "中濃ソース", "オイスターソース"] },
  { id: "spice", name: "香辛料・ハーブ", sample: "こしょう、カレー粉、唐辛子 など", items: ["黒こしょう", "白こしょう", "カレー粉", "一味唐辛子", "七味唐辛子", "乾燥バジル", "乾燥パセリ"] },
  { id: "stock", name: "だし・スープの素", sample: "和風だし、コンソメ、鶏がら など", items: ["和風だし", "顆粒だし", "コンソメ", "鶏がらスープの素", "だしパック"] },
] as const;

export const DEFAULT_SEASONINGS = ["塩", "砂糖", "こしょう", "しょうゆ", "酢", "みりん", "料理酒", "味噌", "サラダ油"];

export function allKnownSeasonings(custom: readonly string[] = []): Set<string> {
  return new Set([...SEASONING_GROUPS.flatMap((group) => group.items), ...custom].map((item) => item.normalize("NFKC").trim()));
}

export function canMakeWithPantry(recipe: Recipe, selected: ReadonlySet<string>, custom: readonly string[] = []): boolean {
  const known = allKnownSeasonings(custom);
  const legacySeasonings = recipe.ingredients
    .map((ingredient) => ingredient.name.normalize("NFKC").trim())
    .filter((name) => known.has(name));
  const explicitSeasonings = (recipe.seasonings ?? [])
    .map((seasoning) => seasoning.name.normalize("NFKC").trim())
    .filter(Boolean);
  const requiredSeasonings = [...new Set([...explicitSeasonings, ...legacySeasonings])];
  return requiredSeasonings.every((name) => selected.has(name));
}
