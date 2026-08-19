import Link from "next/link";
import Image from "next/image";

import { AppIcon } from "@/components/AppIcon";
import type { Recipe } from "@/domain/recipe";
import { CATEGORY_LABELS, servingsLabel } from "@/lib/presentation";

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <Link className="recipe-card recipe-card--button" href={`/recipes/${encodeURIComponent(recipe.id)}`} aria-label={`${recipe.title}の詳細を見る`}>
      <div className="recipe-card__body">
        <h3>{recipe.title}</h3>
        <div className="ingredients" aria-label="主な材料">
          {recipe.ingredients.slice(0, 3).map((ingredient) => <span key={ingredient.id}>{ingredient.name}</span>)}
        </div>
        <div className="recipe-meta">
          <span>{CATEGORY_LABELS[recipe.category]}</span><i /><span>{servingsLabel(recipe.servings)}</span>
        </div>
      </div>
      {recipe.imageDataUrl ? <Image className="recipe-thumb" src={recipe.imageDataUrl} alt="" width={64} height={64} unoptimized /> : null}
      <AppIcon name="chevron" size={18} />
    </Link>
  );
}
