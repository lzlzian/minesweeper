# Ruleset Framework Design

**Date:** 2026-04-19
**Status:** Approved, ready for implementation plan

## Goal

Add a framework for per-level alternative rulesets that can vary the game's rules. Levels 1–12 always use the "regular" ruleset. Levels 13+ roll a ruleset uniformly (by weight) from a registry that includes `regular` plus future alternatives. No user-visible change today (registry is just `regular`) — this ships the *mechanism* so new rulesets become small additions.

## Non-goals

- Designing any actual alternative ruleset. This is purely the framework.
- Banner/UI to name the ruleset. Current level banner stays as-is; no ruleset name shown.
- Plumbing override fields (board shape, densities). `prepare` hook exists but no base-code fields read any overrides yet — the first alternative ruleset that needs one adds the plumbing alongside itself.

## Architecture

### Registry

A module-scope constant array in `game.js`:

```js
const RULESETS = [
  { id: 'regular', weight: 1, prepare: null, apply: null },
  // future entries: { id: 'locked_exit', weight: 1, apply: applyLockedExit },
];
```

Fields per entry:
- `id` — string, unique, stable (used in save payload)
- `weight` — positive number, for weighted selection
- `prepare` — optional `(state) => void` called *before* level generation
- `apply` — optional `(state) => void` called *after* level generation

Both hooks are optional. `regular` has neither — it's a true no-op.

### Runtime state

Add `state.rulesetId` (string | null | undefined). Holds the currently-rolled ruleset for the *current* level.

### Lifecycle

```
initLevel():
  if (!state.rulesetId) roll ruleset → state.rulesetId
  resolve ruleset = RULESETS.find(id) || RULESETS[0]
  ruleset.prepare?.(state)
  -- existing generation: size → grid → walls → gas → anchors → player/exit → merchant → drops --
  ruleset.apply?.(state)
  renderGrid()

nextLevel() (before level++):
  state.rulesetId = null  // so next initLevel rolls fresh

retry-on-death:
  leave state.rulesetId unchanged  // same level → same ruleset

"New Run" / full reset:
  state.rulesetId = null
```

### Roll rule

```js
if (state.level >= 13 && RULESETS.length > 1) {
  state.rulesetId = weightedPick(RULESETS).id;
} else {
  state.rulesetId = 'regular';
}
```

Picker sums weights and picks one. Fallback to `'regular'` if registry lookup fails at apply time (defense in depth against bad saves).

### Save/load

`saveRun()` includes `state.rulesetId` in the payload.

Load path:
- `savedRun.rulesetId` present → `state.rulesetId = savedRun.rulesetId`
- Absent (legacy save) → leave `state.rulesetId` unset. `initLevel` treats it as "no ruleset yet" and rolls. Level <13 → regular anyway; level ≥13 → uniform roll. Acceptable since ruleset additions are dev-side and saves are per-device.
- Unknown id from a future/removed ruleset → lookup falls back to `RULESETS[0]` (regular). Recorded id stays in state so save round-trip is lossless.

## Data flow

```
New level:
  nextLevel() → rulesetId=null → initLevel() → roll → prepare → generate → apply → render

Retry:
  death screen → initLevel() → rulesetId retained → skip roll → prepare → generate → apply → render

Resume from save:
  load() populates rulesetId → startLevel() → initLevel() → skip roll → prepare → generate → apply → render

New Run:
  reset wipes state → default regular on level 1
```

## Integration points in `game.js`

1. **Top of `initLevel`** — insert the roll + resolve + `prepare` call.
2. **End of `initLevel`, before `renderGrid()`** — insert the `apply` call.
3. **`nextLevel`** — clear `state.rulesetId` before `state.level++`.
4. **`saveRun`** — add `rulesetId: state.rulesetId` to the payload.
5. **`loadRun`** (or equivalent Continue handler) — read `rulesetId` off the save, assign to `state`.
6. **"New Run" handler** — clear `state.rulesetId` along with other reset fields.

## Error handling

- Unknown `rulesetId` → fall back to `RULESETS[0]` via `|| RULESETS[0]`. Log once to console for debugging.
- `weightedPick` with empty or all-zero-weight registry → impossible by construction (regular always present with weight 1). No guard needed.

## Testing (manual — no test runner)

1. Play to level 13+. In console check `state.rulesetId === 'regular'`. Only valid outcome today.
2. Temporarily add a dummy second ruleset:
   ```js
   { id: 'debug', weight: 1, apply: s => console.log('debug ruleset active') }
   ```
   Refresh, play ~10 levels past 13; confirm roughly 50/50 split and log fires on debug-level entries.
3. Die on a debug-ruleset level, retry → `state.rulesetId` still `'debug'`.
4. Mid-run on a debug level, refresh, click Continue → same `rulesetId` comes back.
5. `nextLevel` from a debug level → new level rolls independently (sometimes regular, sometimes debug).
6. Save with `rulesetId: 'debug'`, remove the entry from `RULESETS`, reload → falls back to regular without crashing, console warns once.
7. Remove the dummy before committing.

## Scope check

Framework only. Today's user-visible change: none. The commit adds a field, a registry, two hook call sites, save/load round-tripping. Each future alternative ruleset = one registry entry + one `apply` (and maybe `prepare`) function.
