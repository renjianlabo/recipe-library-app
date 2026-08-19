import { recipeSchema, type Recipe } from "./recipe";

const EMPTY_NUTRITION = {
  calories: null,
  carbohydrates: null,
  protein: null,
  fat: null,
  fiber: null,
  salt: null,
  calculatedAt: null,
} as const;

type DemoRecipeInput = {
  id: string;
  title: string;
  category: Recipe["category"];
  servings: Recipe["servings"];
  ingredients: Array<[string, string, number | null, string]>;
  steps: Array<{ text: string; ingredients: number[]; timer?: [string, number] }>;
  tips?: string[];
  tags?: string[];
};

function createDemoRecipe(input: DemoRecipeInput, index: number): Recipe {
  const ingredients = input.ingredients.map(([name, amountText, numericAmount, unit], ingredientIndex) => ({
    id: `${input.id}-ingredient-${ingredientIndex + 1}`,
    name,
    amountText,
    numericAmount,
    unit,
    note: "",
  }));
  const timestamp = new Date(Date.UTC(2026, 6, 1, 12, index)).toISOString();
  return recipeSchema.parse({
    id: input.id,
    userId: "demo-user",
    title: input.title,
    category: input.category,
    servings: input.servings,
    ingredients,
    steps: input.steps.map((step, stepIndex) => ({
      id: `${input.id}-step-${stepIndex + 1}`,
      order: stepIndex + 1,
      text: step.text,
      ingredientRefs: step.ingredients.map((ingredientIndex) => ({
        ingredientId: ingredients[ingredientIndex].id,
        usage: "full" as const,
      })),
      timers: step.timer ? [{
        id: `${input.id}-timer-${stepIndex + 1}`,
        label: step.timer[0],
        seconds: step.timer[1],
      }] : [],
    })),
    tips: input.tips ?? [],
    memo: "",
    tags: input.tags ?? [],
    source: { type: "manual", url: null },
    nutrition: EMPTY_NUTRITION,
    isFavorite: index < 2,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

const INPUTS: DemoRecipeInput[] = [
  {
    id: "demo-tomato-pork",
    title: "豚肉とトマトの煮込み",
    category: "main",
    servings: 2,
    ingredients: [["豚肩ロース", "250", 250, "g"], ["トマト缶", "1", 1, "缶"], ["玉ねぎ", "1/2", 0.5, "個"], ["にんにく", "1", 1, "片"], ["しょうゆ", "1", 1, "大さじ"]],
    steps: [
      { text: "玉ねぎとにんにくをみじん切りにし、豚肉は食べやすい大きさに切る。", ingredients: [0, 2, 3] },
      { text: "鍋に油を熱し、豚肉の表面に焼き色をつける。", ingredients: [0] },
      { text: "玉ねぎ、にんにく、トマト缶を加え、ふたをして弱火で煮込む。", ingredients: [1, 2, 3], timer: ["煮込み", 1200] },
      { text: "しょうゆで味をととのえ、器に盛る。", ingredients: [4] },
    ],
    tips: ["煮込み時間は豚肉の厚みに合わせて調整してください。"],
    tags: ["作り置き", "煮込み"],
  },
  {
    id: "demo-foil-salmon",
    title: "鮭ときのこのホイル焼き",
    category: "main",
    servings: 2,
    ingredients: [["鮭", "2", 2, "切れ"], ["しめじ", "1/2", 0.5, "袋"], ["バター", "10", 10, "g"], ["塩", "少々", null, ""]],
    steps: [{ text: "アルミホイルに鮭としめじをのせ、塩とバターを加えて包む。", ingredients: [0, 1, 2, 3] }, { text: "フライパンで蒸し焼きにする。", ingredients: [], timer: ["蒸し焼き", 900] }],
    tags: ["魚"],
  },
  {
    id: "demo-spinach-sesame",
    title: "小松菜のごま和え",
    category: "side",
    servings: 3,
    ingredients: [["小松菜", "1", 1, "束"], ["すりごま", "2", 2, "大さじ"], ["しょうゆ", "1", 1, "大さじ"]],
    steps: [{ text: "小松菜をゆでて水気を絞り、食べやすく切る。", ingredients: [0], timer: ["ゆでる", 120] }, { text: "すりごまとしょうゆで和える。", ingredients: [0, 1, 2] }],
  },
  {
    id: "demo-ginger-rice",
    title: "鶏だし生姜ごはん",
    category: "staple",
    servings: 2,
    ingredients: [["米", "1", 1, "合"], ["鶏もも肉", "120", 120, "g"], ["生姜", "1", 1, "片"], ["しょうゆ", "1", 1, "大さじ"]],
    steps: [{ text: "材料を炊飯器に入れ、通常どおり炊く。", ingredients: [0, 1, 2, 3] }, { text: "炊き上がったら全体を混ぜる。", ingredients: [] }],
  },
  {
    id: "demo-miso-soup",
    title: "具だくさん味噌汁",
    category: "soup",
    servings: 3,
    ingredients: [["豆腐", "1/2", 0.5, "丁"], ["大根", "5", 5, "cm"], ["わかめ", "適量", null, ""], ["みそ", "2", 2, "大さじ"]],
    steps: [{ text: "大根をだしでやわらかくなるまで煮る。", ingredients: [1], timer: ["煮る", 600] }, { text: "豆腐とわかめを加え、みそを溶き入れる。", ingredients: [0, 2, 3] }],
  },
  {
    id: "demo-apple-compote",
    title: "りんごのコンポート",
    category: "dessert",
    servings: 4,
    ingredients: [["りんご", "2", 2, "個"], ["きび砂糖", "40", 40, "g"], ["レモン汁", "1", 1, "大さじ"]],
    steps: [{ text: "りんごをくし形に切り、砂糖とレモン汁を加えて弱火で煮る。", ingredients: [0, 1, 2], timer: ["煮る", 900] }],
  },
];

export function createDemoRecipes(): Recipe[] {
  return INPUTS.map(createDemoRecipe).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
