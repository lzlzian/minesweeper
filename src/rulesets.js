// ============================================================
// RULESETS
// ============================================================
// Registry of level rulesets. Each level rolls one from this list (weighted)
// starting at level 13. Levels 1-12 always use 'regular'.
//
// Ruleset shape: { id: string, weight: number, prepare?: (state) => void, apply?: (state) => void }
// - prepare runs BEFORE level generation.
// - apply runs AFTER level generation.
// Both hooks are optional.

export const RULESETS = [
  { id: 'regular', weight: 1, prepare: null, apply: null },
];

export function weightedPick(list) {
  const total = list.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const x of list) {
    r -= x.weight;
    if (r < 0) return x;
  }
  return list[list.length - 1]; // fallback
}

export function resolveRuleset(id) {
  return RULESETS.find(r => r.id === id) || RULESETS[0];
}

// Size at level N: 10 at 1-2, 12 at 3-4, ..., capped at 20.
export function gridSizeForLevel(level) {
  const size = 10 + 2 * Math.floor((level - 1) / 2);
  return Math.min(20, size);
}

export function anchorCountForSize(size) {
  if (size <= 12) return 1;
  if (size <= 14) return 2;
  return Math.random() < 0.5 ? 2 : 3;
}
