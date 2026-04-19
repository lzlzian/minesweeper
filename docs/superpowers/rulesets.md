# Ruleset Framework — Author Guide

How to add a new level ruleset. The framework ships one ruleset today (`regular`) and exposes two hooks around the existing level generator.

**Last verified:** 2026-04-19. If the code has drifted, grep `RULESETS` / `rulesetId` in `game.js` before trusting this doc.

---

## When a ruleset runs

- **Levels 1–12:** always `regular`.
- **Level 13+:** `initLevel` calls `weightedPick(RULESETS)` and rolls one id.
  - While only `regular` is in the registry, the roll is effectively a no-op.
  - Add even one alternative and level 13+ starts varying.
- **Retry on death:** the ruleset is *preserved* for the retry.
- **Next level:** `state.rulesetId` is cleared so the next level rolls fresh.
- **Save/resume:** `rulesetId` is round-tripped through `localStorage`; legacy saves (no key) roll fresh on first load.
- **New Run:** cleared.

---

## Registry entry

```js
{
  id: 'my_biome',        // required, stable, unique string (appears in saves)
  weight: 1,             // required, positive number, relative to other entries' weights
  prepare: (state) => { /* runs BEFORE generation */ },  // optional
  apply:   (state) => { /* runs AFTER  generation */ },  // optional
}
```

Both hooks are optional. Set unused hooks to `null` (or omit). Keep `id` stable forever — changing it breaks existing saves.

To register: add your entry to the `RULESETS` array near the top of `game.js` (search for `const RULESETS = [`).

---

## The two hooks

### `prepare(state)` — runs BEFORE level generation

Called at the very top of `initLevel`, right after the roll. State is still carrying values from whatever ran before — most fields get reset shortly after `prepare` returns (see "What's NOT set yet" below).

**Use `prepare` to:** set override fields on `state` that base code reads during generation. Today base code reads none — so if your ruleset needs a size override or a wall/gas density override, you must also add that plumbing to the base code (e.g., make `gridSizeForLevel` read `state.boardShape` first). Pattern:

```js
prepare: (state) => {
  state.biomeOverrides = {
    wallDensity: 0.35,  // only meaningful if base code reads this
    gasDensity:  0.10,
  };
},
```

**What's NOT set yet when `prepare` runs:**
- `state.hp`, `state.rows`, `state.cols`, `state.merchant`, `state.activeItem`, `state.busy` — these are reset right after `prepare`.
- `state.grid`, `state.revealed`, `state.flagged` — created during the generation loop.
- `state.playerRow`, `state.playerCol`, `state.exit` — picked during generation.

Fields already set and safe to read in `prepare`: `state.level`, `state.gold`, `state.stashGold`, `state.items`, `state.levelsSinceMerchant`, `state.rulesetId`.

### `apply(state)` — runs AFTER level generation

Called at the very bottom of `initLevel`, just before `hideOverlay()`. At this point the level is fully built: grid, walls, gas, gold, items, player/exit placement, merchant (if any), anchors, pre-revealed start area, pan snapped to player.

**Use `apply` to:** mutate the finished level — swap or move entities, re-type cells, lock the exit, spawn extra objectives, register turn handlers, etc. This is where most ruleset logic will live.

If `apply` visually mutates cells, call `renderGrid()` at the end of your hook. The base `renderGrid()` at the end of generation ran before you, so your changes won't show otherwise.

---

## Example: "Locked exit" ruleset

A minimal real-looking ruleset that locks the exit and spawns a key on a random revealed-adjacent floor cell.

```js
// In game.js, add to the RULESETS array:
{
  id: 'locked_exit',
  weight: 1,
  apply: (state) => {
    // Mark the exit as locked. Base code needs to check state.exitLocked when the
    // player walks onto exit; that plumbing lives in the ruleset's companion code,
    // not here.
    state.exitLocked = true;

    // Drop a key item on a random reachable empty cell.
    const candidates = [];
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const cell = state.grid[r][c];
        if (cell.type === 'empty' && !cell.item && !(r === state.playerRow && c === state.playerCol)) {
          candidates.push({ r, c });
        }
      }
    }
    if (candidates.length) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      state.grid[pick.r][pick.c].item = 'key';
    }

    renderGrid(); // we mutated cells
  },
},
```

This stub is illustrative — it also needs:
- A `'key'` item case in `collectAt` (pickup handler) that sets `state.exitLocked = false`.
- A guard in the "step onto exit" handler that blocks if `state.exitLocked`.
- An icon/sprite for the key in the render path.
- Save/load handling for `state.exitLocked` *if* we want it to survive a resume mid-level (currently save only fires on level transition, so it's fine — just document that a mid-level refresh would re-roll the key position because `apply` re-runs on resume).

Point is: the hooks themselves are a few lines; the companion plumbing is where most of the work lives.

---

## State fields to be aware of

| Field | Scope | Notes |
|---|---|---|
| `state.rulesetId` | level | Current level's ruleset id. `null` at entry means `initLevel` will roll. |
| `state.level` | run | Check this to gate behavior on level ranges. |
| `state.hp`, `state.gold`, `state.stashGold` | run | Player resources. |
| `state.items` | run | `{ potion, scanner, pickaxe, row, column, cross }` counts. |
| `state.grid` | level | `grid[r][c] = { type, adjacent, item, goldValue, ... }` where `type` ∈ `'empty' | 'gas' | 'wall' | 'gold' | 'detonated'`. |
| `state.revealed`, `state.flagged` | level | `[r][c] = bool` arrays. |
| `state.playerRow`, `state.playerCol`, `state.exit` | level | Positions. |
| `state.merchant` | level | `{ r, c, stock, rerollCount }` or `null`. |

---

## Save/load contract

`saveRun` writes `rulesetId` into the payload. `resumeGame` restores it with `?? null` (legacy saves without the key → fresh roll on resume).

**Rule:** if your ruleset adds fields to `state` that must survive a mid-run save/resume, you must also:
1. Add them to the `saveRun` payload.
2. Restore them in `resumeGame` with a back-compat fallback.

The simpler alternative: put all your state on fields that `apply` can rebuild from scratch on resume. A resume effectively re-runs `initLevel`, so `apply` runs again — if it can idempotently rebuild its world, you don't need save plumbing.

Exception: if `apply` uses randomness (e.g., picks a random cell for a key), the resumed level will have a *different* random layout. Choose:
- Seed the RNG off `state.level + state.rulesetId` (deterministic), or
- Save the specific positions into the payload (explicit).

---

## Testing a new ruleset

No test runner — manual only.

1. Add the registry entry.
2. Hard-code the roll for fast iteration:
   ```js
   // temporarily replace the roll in initLevel:
   state.rulesetId = 'my_new_ruleset'; // force
   ```
   …or in DevTools console, set `state.rulesetId = 'my_new_ruleset'` and call `retryLevel()` to re-run `initLevel` on the same level.
3. Play normally. Watch for:
   - Visual regressions on `regular` levels (your hooks shouldn't run there; confirm in console).
   - Retry (intentional death) keeps you in the same ruleset.
   - Refresh mid-run loads into the same ruleset.
   - Next level rolls fresh.
4. Unhard-code, add a real weight.
5. Commit.

---

## Files touched when adding a ruleset

Minimum for a simple `apply`-only ruleset:
- `game.js` → one entry in `RULESETS`, the hook function, any companion logic (pickup handlers, render tweaks, etc.).

If your ruleset adds persistent state:
- `game.js` → also touch `saveRun`, `resumeGame`.

If your ruleset changes base-code behavior via `prepare` overrides:
- `game.js` → also plumb the override field into whichever base function reads it (e.g., `gridSizeForLevel`, density constants, etc.).

CSS, HTML, and new assets only if the ruleset introduces visible elements (new cell types, new HUD indicators).

---

## Where to look in `game.js`

- `RULESETS` array, `weightedPick`, `resolveRuleset`: near the top, in the `// RULESETS` section.
- Roll + `prepare` call: top of `initLevel`.
- `apply` call: bottom of `initLevel`, just before `hideOverlay()`.
- `state.rulesetId` clears: `startGame`, `nextLevel`.
- Save/load: `saveRun`, `resumeGame`.

(Line numbers deliberately omitted — grep instead; they drift.)

---

## Related docs

- Spec: `docs/superpowers/specs/2026-04-19-ruleset-framework-design.md` (design decisions)
- Plan: `docs/superpowers/plans/2026-04-19-ruleset-framework.md` (step-by-step implementation notes)
