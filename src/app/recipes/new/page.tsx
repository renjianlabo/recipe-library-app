import { createEmptyRecipeDraft } from "@/domain/recipe";
import { RecipeEditor } from "@/features/editor/RecipeEditor";

export default function NewRecipePage() {
  return (
    <RecipeEditor
      initialDraft={createEmptyRecipeDraft()}
      draftKey="new-manual"
      heading="手動でレシピを作成"
      description="AIを使わず、材料・工程・タイマーをすべて直接入力できます。"
    />
  );
}
