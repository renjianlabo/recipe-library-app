const LIST_CONNECTORS = new Set(["と", "や", "、", "・"]);
const CASE_PARTICLES = ["を", "に", "へ", "で", "が", "は", "も"] as const;

export interface IngredientNameRemovalResult {
  text: string;
  hasMeaningfulRemainder: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clauseTextBefore(value: string): string {
  const boundary = Math.max(
    value.lastIndexOf("。"),
    value.lastIndexOf("！"),
    value.lastIndexOf("？"),
    value.lastIndexOf("\n"),
  );
  return value.slice(boundary + 1).trim();
}

function cleanRemovalResult(value: string): string {
  return value
    .replace(/[ \t　]+/gu, " ")
    .replace(/[ \t　]+([、。！？])/gu, "$1")
    .replace(/、{2,}/gu, "、")
    .replace(/(?:、|・)(?=[。！？])/gu, "")
    .replace(/^(?:、|・)+/gu, "")
    .trim();
}

function removeOneOccurrence(value: string, index: number, ingredientName: string): string {
  const before = value.slice(0, index);
  const after = value.slice(index + ingredientName.length);
  const precedingConnector = before.match(/(?:[ \t　]*)([とや、・])[ \t　]*$/u);
  const followingConnector = after.match(/^[ \t　]*([とや、・])[ \t　]*/u);

  if (precedingConnector) {
    const connector = precedingConnector[1];
    const connectorIndex = before.length - precedingConnector[0].length;
    const precedingClause = clauseTextBefore(before.slice(0, connectorIndex));
    if (LIST_CONNECTORS.has(connector) && precedingClause) {
      return before.slice(0, connectorIndex) + after;
    }
  }

  if (followingConnector && LIST_CONNECTORS.has(followingConnector[1])) {
    return before + after.slice(followingConnector[0].length);
  }

  const followingParticle = after.match(new RegExp(`^[ \\t　]*(?:${CASE_PARTICLES.join("|")})`, "u"));
  return before + after.slice(followingParticle?.[0].length ?? 0);
}

function startsIngredientDependentClause(text: string, ingredientName: string): boolean {
  const escapedName = escapeRegExp(ingredientName);
  const dependentClause = new RegExp(
    `(?:^|[。！？\\n][ \\t　]*)${escapedName}[ \\t　]*(?:${CASE_PARTICLES.join("|")})(?=[^。！？\\n])`,
    "iu",
  );
  return dependentClause.test(text);
}

function hasIndependentFollowingClause(text: string): boolean {
  return /[、。！？\n][ \t　]*[^、。！？\n]{1,80}?(?:を|に|へ|で|が|は|も)(?=[^、。！？\n])/u.test(text);
}

/**
 * Removes an ingredient name together with an adjacent Japanese list connector
 * or case particle. The function deliberately limits itself to deterministic
 * punctuation/particle cleanup; the caller can let a user edit the result.
 */
export function analyzeIngredientNameRemoval(
  text: string,
  ingredientName: string,
): IngredientNameRemovalResult {
  const name = ingredientName.trim();
  if (!name) return { text, hasMeaningfulRemainder: Boolean(text.trim()) };

  const dependedOnIngredient = startsIngredientDependentClause(text, name);
  const expression = new RegExp(escapeRegExp(name), "iu");
  let next = text;
  let match = expression.exec(next);
  while (match) {
    next = removeOneOccurrence(next, match.index, match[0]);
    match = expression.exec(next);
  }
  next = cleanRemovalResult(next);

  return {
    text: next,
    hasMeaningfulRemainder: Boolean(next)
      && (!dependedOnIngredient || hasIndependentFollowingClause(next)),
  };
}

export function removeIngredientNameFromText(text: string, ingredientName: string): string {
  return analyzeIngredientNameRemoval(text, ingredientName).text;
}
