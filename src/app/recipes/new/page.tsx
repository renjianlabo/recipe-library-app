import { createEmptyRecipeDraft } from "@/domain/recipe";
import { RecipeEditor } from "@/features/editor/RecipeEditor";

export default function NewRecipePage() {
  return (
    <RecipeEditor
      initialDraft={createEmptyRecipeDraft()}
      draftKey="new-manual"
      heading="レシピを作成"
      description="基本情報から順に、必要な項目を入力しましょう。"
      completionAfterSave
      closeHref="/create"
    />
  );
}
