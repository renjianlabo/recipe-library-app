import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const PROJECT_ID = "demo-recipe-library";
const OWNER_UID = "owner-user";
const RECIPE_ID = "recipe-1";
const RECIPE_PATH = `users/${OWNER_UID}/recipes/${RECIPE_ID}`;

function recipeData(overrides: Record<string, unknown> = {}) {
  return {
    id: RECIPE_ID,
    title: "テストレシピ",
    userId: OWNER_UID,
    ...overrides,
  };
}

describe("Firestore recipe rules", () => {
  let testEnvironment: RulesTestEnvironment;

  beforeAll(async () => {
    testEnvironment = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync("firestore.rules", "utf8"),
      },
    });
  });

  beforeEach(async () => {
    await testEnvironment.clearFirestore();
  });

  afterAll(async () => {
    await testEnvironment.cleanup();
  });

  async function seedOwnerRecipe() {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), RECIPE_PATH), recipeData());
    });
  }

  it("メール確認済みの本人は自分のrecipeを作成・参照・更新・削除できる", async () => {
    const ownerDb = testEnvironment
      .authenticatedContext(OWNER_UID, { email_verified: true })
      .firestore();
    const ownerRecipe = doc(ownerDb, RECIPE_PATH);

    await assertSucceeds(setDoc(ownerRecipe, recipeData()));

    const snapshot = await assertSucceeds(getDoc(ownerRecipe));
    expect(snapshot.data()).toMatchObject(recipeData());

    await assertSucceeds(updateDoc(ownerRecipe, { title: "更新後" }));
    await assertSucceeds(deleteDoc(ownerRecipe));
  });

  it("別UIDは本人のrecipeを参照も書き込みもできない", async () => {
    await seedOwnerRecipe();
    const otherDb = testEnvironment
      .authenticatedContext("other-user", { email_verified: true })
      .firestore();
    const ownerRecipeFromOtherUser = doc(otherDb, RECIPE_PATH);

    await assertFails(getDoc(ownerRecipeFromOtherUser));
    await assertFails(setDoc(ownerRecipeFromOtherUser, recipeData({ title: "改ざん" })));
  });

  it("未認証ユーザーはrecipeを参照も書き込みもできない", async () => {
    await seedOwnerRecipe();
    const unauthenticatedDb = testEnvironment.unauthenticatedContext().firestore();
    const ownerRecipeWithoutAuth = doc(unauthenticatedDb, RECIPE_PATH);

    await assertFails(getDoc(ownerRecipeWithoutAuth));
    await assertFails(setDoc(ownerRecipeWithoutAuth, recipeData({ title: "未認証の変更" })));
  });

  it("本人でもuserIdを別UIDに偽装したrecipeは作成・更新できない", async () => {
    const ownerDb = testEnvironment
      .authenticatedContext(OWNER_UID, { email_verified: true })
      .firestore();
    const ownerRecipe = doc(ownerDb, RECIPE_PATH);

    await assertFails(setDoc(ownerRecipe, recipeData({ userId: "other-user" })));

    await seedOwnerRecipe();
    await assertFails(updateDoc(ownerRecipe, { userId: "other-user" }));
  });
});
