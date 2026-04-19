# Persistent HP + Health Fountain — Design

**Date:** 2026-04-19
**Status:** Approved, ready for planning

## Summary

Today, HP is level-scoped: `initLevel` sets `state.hp = MAX_HP` on every new level, so players always descend to a free full heal. This flattens the tension of taking damage — a 1-HP clear of level N feels the same as a 3-HP clear.

This change makes HP **run-scoped**: whatever HP you walk out of a level with is what you start the next level with. To offset the loss of the free heal, a new **Health Fountain** (💧) spawns with 50% probability on each level, full-heals the player on step, and politely declines if you're already at full HP.

The result: damage matters across levels; healing becomes something you earn (fountain, potion purchase, starter potion) rather than something you get for free. Expected value ≈ 1.5 HP per level (0.5 × 3 for the fountain) — in the same neighborhood as today's guaranteed full heal, but with meaningful variance.

## Goals

- Make accumulated damage matter across level transitions.
- Introduce a new on-map reward (fountain) whose spawn is probabilistic and non-guaranteed.
- Keep infrastructure changes small: reuse existing cell-placement, pre-reveal, and float-message patterns.

## Non-goals

- No retuning of `MAX_HP`, potion heal amount, or merchant potion price.
- No fountain-related achievements, stats, or settings toggles.
- No guaranteed pathability to the fountain.
- No ruleset-specific spawn-rate variation.
- No new SFX (reuse potion heal).
- No save-format version bump — back-compat handled via field fallback.

## Design

### HP persistence

**Change:** Remove the `state.hp = MAX_HP;` line from `initLevel` (currently at game.js:1600). HP is now carried between levels.

**HP reset points (where HP still jumps back to `MAX_HP`):**
- `startGame` — new run starts fresh at 3/3.
- `retryLevel` — death-retry resets to 3/3. (Otherwise a death-retry at 0 HP is instantly unplayable, since any gas detonation kills.)
- `resumeGame` — loads `save.hp ?? MAX_HP`. The fallback handles saves from before this feature.

**HP carry points (HP preserved as-is):**
- `nextLevel` — descending preserves the player's current HP.

**Persistence:** `saveRun` writes `state.hp` into the payload. `resumeGame` reads it back with a `?? MAX_HP` fallback for back-compat.

### Fountain data model

- New cell type: `'fountain'`. Rendered as 💧 when unused. When `used`, the cell renders as normal revealed floor with its adjacency number.
- New run state: `state.fountain = { r, c, used: false } | null`.
- Level-scoped: reset to `null` at the top of `initLevel`, like `state.merchant`.
- NOT persisted in `saveRun`. Resuming mid-level re-rolls the whole board (matches merchant behavior today).

### Fountain spawn and placement

**Roll:** In `initLevel`, after merchant placement and reachability check succeed, roll `Math.random() < 0.50`. If false, no fountain this level. No pity timer, no ruleset override.

**Ruleset interaction:** Fountain rolls the same on all rulesets, including `treasure_chamber`. No `suppressFountain` biome override.

**Candidate cells:** Any cell satisfying all of:
- `type === 'empty'` (not wall, gas, gold, chest, merchant)
- Not the player start cell
- Not the exit cell
- Not the merchant cell (if one spawned)
- Not a chest cell (if Treasure Chamber placed any)

**Pick:** Uniform-random pick from the candidate pool. If the pool is empty (extremely unlikely on any reasonable board), skip fountain for this level — no retry, no carve.

**Reachability:** Not required. A walled-off fountain is acceptable and matches the user's explicit requirement. Same behavior as chests today.

**Conversion:** Chosen cell's `type` is set to `'fountain'`. No `adjacent` recompute needed — fountain is not gas, so it doesn't change neighbors' adjacency counts. The fountain cell's *own* adjacency number is whatever `countAdjacentGas` returned when the cell was still `'empty'`.

**Pre-reveal:** After picking, `state.revealed[r][c] = true`. The 3×3 around the fountain does NOT cascade — only the single cell is revealed. Player sees 💧 and its adjacency number from turn 1.

### Fountain interaction

In `collectAt(r, c)`, after existing gold/item/chest handling, add a fountain branch:

```
if (state.fountain &&
    state.fountain.r === r &&
    state.fountain.c === c &&
    !state.fountain.used) {
  if (state.hp >= MAX_HP) {
    spawnPickupFloat(r, c, 'Already at full HP', 'float-info');
    // fountain persists; do not consume
  } else {
    state.hp = MAX_HP;
    state.fountain.used = true;
    spawnPickupFloat(r, c, '+❤️', 'float-heal');
    playSfx('drink'); // reuse existing potion heal SFX
    updateHud();
    renderGrid();
  }
}
```

Behavior summary:
- Full HP on entry → float message shown, fountain untouched. Player can return later.
- Below full HP → heal to `MAX_HP`, fountain consumed, cell reverts to plain revealed floor on next render.
- No repeated healing — once `used = true`, the fountain is inert for the remainder of the level.

### Rendering

**Grid cell render** (wherever `cell.type` dispatches to an icon): add case `'fountain'` → render 💧, but only when `state.fountain && !state.fountain.used`. Use the existing icon-bob animation, like gold and items.

**Minimap:** In `drawMarker` calls within the minimap draw loop, add a fountain marker while `!state.fountain.used`. Pick a distinct color from merchant (`#ff33ff`) and exit (yellow) — cyan (`#33ccff`) or similar. Marker disappears when consumed.

**Floats:** `style.css` currently defines the base `.pickup-float` plus `.pickup-float.float-danger` (red, used for gas detonation). Two new classes:
- `.pickup-float.float-heal` — green-ish. Applied to the `+❤️` float on fountain heal.
- `.pickup-float.float-info` — neutral (white or light gray). Applied to the "Already at full HP" float.

Both reuse the existing `.pickup-float` rise-and-fade animation; only the color differs.

### Rules overlay

In `renderRules`, add a bullet under the items list (or as its own line above the items):

> 💧 **Health Fountain** — walk onto it to heal to full. Spawns on some levels, can't be reused once drunk.

### Save/load

**`saveRun` payload change:**

```js
const data = {
  level: state.level,
  stashGold: state.stashGold,
  items: { ...state.items },
  levelsSinceMerchant: state.levelsSinceMerchant,
  rulesetId: state.rulesetId,
  hp: state.hp,          // NEW
};
```

**`resumeGame`:** `state.hp = save.hp ?? MAX_HP;` — the fallback handles saves written before this change.

Fountain state (`state.fountain`) is NOT saved. On resume, `initLevel` re-rolls it along with the rest of the board.

## Edge cases

| Case | Behavior |
|---|---|
| Player dies at 0 HP → retry | `retryLevel` resets HP to `MAX_HP`. Otherwise unplayable. |
| Player descends at 0 HP... wait, that can't happen — dying triggers game over, not descent. So minimum carried HP is 1. | N/A |
| Player saves mid-level at 1 HP, resumes | `resumeGame` restores HP to 1; `initLevel` re-rolls the board. |
| Fountain spawns but player never reaches it (walled in) | Accepted. Matches chest behavior. |
| Fountain and merchant on same level | Both spawn independently. Fountain cell is guaranteed not the merchant cell by the candidate-cell filter. |
| Treasure Chamber level | Fountain still rolls 50%. Chest cells are excluded from the candidate pool. |
| Fountain roll passes but candidate pool is empty | Skip fountain this level. No retry. |
| Old save (no `hp` field) | Loads as full HP via `?? MAX_HP` fallback. |
| Player drinks fountain, takes damage, comes back | Cell is plain floor; no heal. One-time. |
| Player at full HP steps on fountain, later takes damage, comes back | Fountain still there; heals them. |

## File-level touchpoints

**`game.js`:**
- State init block: add `fountain: null` near `merchant`.
- `initLevel`:
  - Remove `state.hp = MAX_HP;`
  - Add `state.fountain = null;`
  - After the `solved` branch (post-reachability), roll and place fountain.
  - Pre-reveal the fountain cell.
- Cell render function: dispatch `'fountain'` → 💧 render when unused.
- Minimap draw: fountain marker while unused.
- `collectAt`: fountain branch (see Interaction section).
- `saveRun`: add `hp` field.
- `resumeGame`: read `save.hp ?? MAX_HP`.
- `retryLevel`: add `state.hp = MAX_HP;` (currently relies on `initLevel` to set HP).
- `renderRules`: add 💧 bullet.

**`style.css`:** Add `.pickup-float.float-heal` and `.pickup-float.float-info` rules, mirroring the existing `.pickup-float.float-danger` block.

**No changes to:**
- `RULESETS` registry or any ruleset hook.
- `biomeOverrides` object.
- Merchant, items, chest logic.
- Save schema version (back-compat via field fallback is sufficient).

## Testing plan

Manual playtest checks:
1. Start new run, take 1 damage on level 1, descend → HP should still be 2/3 on level 2 (not healed).
2. Find a fountain at <3 HP → heal to 3/3, fountain disappears, cell becomes plain floor with adjacency.
3. Find a fountain at 3/3 HP → "Already at full HP" float, fountain stays. Take 1 damage, return → heal works.
4. Descend a level where fountain didn't spawn → no 💧 icon, no minimap marker.
5. Save mid-run at 1 HP, reload → HP is 1, board re-rolled.
6. Load an old save (from before this feature) → HP loads as 3 (fallback).
7. Die at 0 HP, retry → HP resets to 3/3.
8. Play 10+ levels, confirm fountain spawns roughly half the time (eyeball 50% rate).
9. Check Treasure Chamber level still rolls fountain normally; fountain doesn't land on a chest.
10. Check merchant level — fountain and merchant can coexist; neither blocks the other.
