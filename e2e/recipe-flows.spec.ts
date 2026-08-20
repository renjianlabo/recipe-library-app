import { expect, test, type Page } from "@playwright/test";

import type { Recipe, RecipeDraft } from "../src/domain/recipe";

const E2E_UID = "e2e-user";
const RECIPE_STORAGE_KEY = "recipe-library-e2e-recipes-v1";

function emptyNutrition(): Recipe["nutrition"] {
  return {
    calories: null,
    carbohydrates: null,
    protein: null,
    fat: null,
    fiber: null,
    salt: null,
    calculatedAt: null,
  };
}

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "seed-recipe",
    userId: E2E_UID,
    title: "にんじんとにんにく炒め",
    category: "main",
    servings: 2,
    ingredients: [
      { id: "carrot", name: "にんじん", amountText: "1", numericAmount: 1, unit: "本", note: "" },
      { id: "garlic", name: "にんにく", amountText: "1", numericAmount: 1, unit: "片", note: "" },
    ],
    steps: [
      {
        id: "step-1",
        order: 1,
        text: "にんじんとにんにくを一緒に炒める。",
        ingredientRefs: [
          { ingredientId: "carrot", usage: "all" },
          { ingredientId: "garlic", usage: "all" },
        ],
        timers: [{ id: "timer-1", label: "炒める", seconds: 120 }],
      },
      {
        id: "step-2",
        order: 2,
        text: "にんにくを加えて香りが立つまで炒める。",
        ingredientRefs: [{ ingredientId: "garlic", usage: "all" }],
        timers: [],
      },
    ],
    tips: [],
    memo: "",
    tags: ["E2E"],
    source: { type: "manual", url: null },
    nutrition: emptyNutrition(),
    isFavorite: false,
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

async function seedRecipes(page: Page, recipes: Recipe[]) {
  await page.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, { key: RECIPE_STORAGE_KEY, value: recipes });
}

async function waitForCookingPersistence(page: Page) {
  await expect.poll(async () => page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("recipe-library-app");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      if (!database.objectStoreNames.contains("cooking")) return false;
      const record = await new Promise<{ value?: { currentStepIndex?: number; timers?: unknown[] } } | undefined>((resolve, reject) => {
        const request = database.transaction("cooking", "readonly")
          .objectStore("cooking")
          .get("e2e-user:active");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return record?.value?.currentStepIndex === 1 && record.value.timers?.length === 1;
    } finally {
      database.close();
    }
  })).toBe(true);
}

test("手動作成から保存・一覧・詳細・編集まで完了する", async ({ page }) => {
  await page.goto("/recipes/new");
  await expect(page.getByRole("heading", { name: "レシピを作成" })).toBeVisible();
  await expect(page.getByText("AIに追加修正を頼む", { exact: true })).not.toBeVisible();
  await expect(page.getByLabel("修正指示", { exact: true })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "修正案を作る" })).not.toBeVisible();

  await page.getByLabel("料理名 ＊", { exact: true }).fill("E2E卵焼き");
  await page.getByRole("combobox", { name: "カテゴリー ＊", exact: true }).selectOption("main");
  await page.getByLabel("材料名", { exact: true }).fill("卵");
  await page.getByLabel("分量", { exact: true }).fill("1.5");
  await page.getByRole("combobox", { name: "材料1の単位" }).selectOption("個");
  await page.getByRole("button", { name: "＋ 調味料を追加" }).click();
  const seasoning = page.getByTestId("調味料-1");
  await seasoning.getByLabel("調味料名", { exact: true }).fill("しょうゆ");
  await seasoning.getByLabel("分量", { exact: true }).fill("適量");
  await page.getByLabel("手順1", { exact: true }).fill("卵を混ぜて焼く。");
  for (let index = 0; index < 5; index += 1) {
    await page.getByRole("button", { name: "＋ 手順を追加" }).click();
    await page.getByLabel(`手順${index + 2}`, { exact: true }).fill(`追加の工程${index + 2}です。`);
  }

  await page.getByRole("button", { name: "レシピを保存" }).click();
  await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "E2E卵焼き" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "調味料" })).toBeVisible();
  await expect(page.getByText("1.5個", { exact: true })).toBeVisible();
  await expect(page.getByText("適量", { exact: true })).toBeVisible();
  const actionPosition = await page.locator(".detail-actions").boundingBox();
  await page.locator(".detail-scroll").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const scrolledActionPosition = await page.locator(".detail-actions").boundingBox();
  expect(scrolledActionPosition?.y).toBe(actionPosition?.y);
  const lastStepBottom = await page.locator(".detail-steps li:last-child").evaluate((element) => element.getBoundingClientRect().bottom);
  expect(lastStepBottom).toBeLessThanOrEqual(scrolledActionPosition?.y ?? 0);
  await expect(page.getByRole("link", { name: "編集する", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "料理モードを開始" })).toBeVisible();

  await page.locator(".detail-scroll").evaluate((element) => { element.scrollTop = 0; });
  await page.getByRole("link", { name: "レシピ一覧を閉じる" }).click();
  await expect(page).toHaveURL(/\/recipes$/);
  await page.getByRole("link", { name: /E2E卵焼き/ }).click();
  await expect(page.getByRole("heading", { name: "E2E卵焼き" })).toBeVisible();

  await page.getByRole("link", { name: "編集する", exact: true }).click();
  await expect(page.getByRole("heading", { name: "レシピを編集" })).toBeVisible();
  await page.getByLabel("料理名 ＊", { exact: true }).fill("E2Eだし巻き卵");
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(page.getByRole("heading", { name: "E2Eだし巻き卵" })).toBeVisible();

  await page.getByRole("link", { name: "レシピ一覧を閉じる" }).click();
  await page.getByRole("textbox", { name: "レシピを検索" }).fill("E2Eだし巻き卵");
  await expect(page.getByRole("link", { name: /E2Eだし巻き卵/ })).toBeVisible();
});

test("文章取り込みを確認して保存する", async ({ page }) => {
  const importedDraft: RecipeDraft = {
    title: "文章からの味噌汁",
    category: "soup",
    servings: 2,
    ingredients: [
      { id: "ingredient-miso", name: "味噌", amountText: "30", numericAmount: 30, unit: "g", note: "" },
      { id: "ingredient-water", name: "水", amountText: "400", numericAmount: 400, unit: "ml", note: "" },
    ],
    steps: [{
      id: "step-miso",
      order: 1,
      text: "水を温めて味噌を溶く。",
      ingredientRefs: [
        { ingredientId: "ingredient-water", usage: "all" },
        { ingredientId: "ingredient-miso", usage: "all" },
      ],
      timers: [],
    }],
    tips: [],
    memo: "",
    tags: ["汁物"],
    source: { type: "text", url: null },
  };
  await page.route("**/api/ai/extract", async (route) => {
    expect(route.request().headers().authorization).toBe("Bearer e2e-test-token");
    expect((await route.request().postDataJSON()).type).toBe("text");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        draft: importedDraft,
        warnings: ["内容を確認してください。"],
        needsServingsConfirmation: false,
        detectedServings: 2,
      }),
    });
  });

  await page.goto("/import/text");
  await page.getByLabel("レシピの文章", { exact: true }).fill("2人分。味噌30g、水400ml。水を温めて味噌を溶く。");
  await page.getByRole("button", { name: "文章を解析" }).click();

  await expect(page.getByRole("heading", { name: "内容を確認" })).toBeVisible();
  await expect(page.getByLabel("料理名 ＊", { exact: true })).toHaveValue("文章からの味噌汁");
  await expect(page.getByLabel("分量", { exact: true }).first()).toHaveValue("30");
  await expect(page.getByLabel("修正指示", { exact: true })).not.toBeVisible();
  await expect(page.getByText("内容を確認してください。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "レシピを保存" }).click();
  await expect(page.getByRole("heading", { name: "文章からの味噌汁" })).toBeVisible();
});

test("編集画面では材料を直接削除し既存の自由入力単位を保持する", async ({ page }) => {
  const seeded = recipe({ id: "ingredient-impact" });
  await seedRecipes(page, [seeded]);
  await page.goto(`/recipes/${seeded.id}/edit`);

  await expect(page.getByRole("combobox", { name: "材料2の単位" })).toHaveValue("__other_unit__");
  await expect(page.getByLabel("その他の単位").last()).toHaveValue("片");
  await page.getByRole("button", { name: "材料2を削除" }).click();
  await expect(page.getByLabel("材料名", { exact: true })).toHaveCount(1);
  await expect(page.getByLabel("手順1", { exact: true })).toHaveValue("にんじんとにんにくを一緒に炒める。");
});

test("料理モードのタイマーと工程を途中状態から再開する", async ({ page }) => {
  const cookingRecipe = recipe({
    id: "cooking-resume",
    title: "E2E煮込み料理",
    steps: [
      {
        id: "step-1",
        order: 1,
        text: "材料を鍋に入れる。",
        ingredientRefs: [{ ingredientId: "carrot", usage: "all" }],
        timers: [{ id: "timer-simmer", label: "煮込み", seconds: 120 }],
      },
      {
        id: "step-2",
        order: 2,
        text: "味を調えて仕上げる。",
        ingredientRefs: [{ ingredientId: "garlic", usage: "all" }],
        timers: [],
      },
    ],
  });
  await seedRecipes(page, [cookingRecipe]);
  await page.goto(`/recipes/${cookingRecipe.id}`);
  await page.getByRole("link", { name: "料理モードを開始" }).click();

  await expect(page.getByRole("heading", { name: "料理モード" })).toBeVisible();
  await page.getByRole("button", { name: "煮込み 2:00 開始" }).click();
  await expect(page.getByRole("heading", { name: "煮込み" })).toBeVisible();
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.getByText("工程 2 / 2", { exact: true })).toBeVisible();
  await waitForCookingPersistence(page);

  await page.reload();
  await expect(page.getByRole("heading", { name: "続きから再開しますか？" })).toBeVisible();
  await page.getByRole("button", { name: "続きから再開" }).click();
  await expect(page.getByText("工程 2 / 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "煮込み" })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "料理モードを終了" }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${cookingRecipe.id}$`));
});
