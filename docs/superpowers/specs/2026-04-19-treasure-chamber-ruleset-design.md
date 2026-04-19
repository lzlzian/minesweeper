# Treasure Chamber Ruleset Design

**Date:** 2026-04-19
**Status:** Approved, ready for implementation plan

## Goal

Ship the first alternative ruleset on top of the framework landed earlier today. `treasure_chamber` is a generous "reward level" variant: sparser walls, sparser gas, more gold, two guaranteed items, and two 25g chests in the off-diagonal corners. No merchant on chamber levels, and the merchant pity timer freezes (does not tick) across a chamber. Primarily a framework stress-test; secondarily a momentum lever via the existing gold/item economy.

## Non-goals

- New UI, banner, or ruleset-name indicator. Player notices it's a chamber by visuals (sparse map + chests in corners) and the absence of a merchant.
- Reachability carve for chests. If a chest ends up walled in, pickaxe or forfeit.
- Tuning work past first ship. We intentionally roll at 50% (weight 1 vs `regular` weight 1) so playtest signal arrives fast; retune in one spot afterward.
- Chest variety (different loot tables, mimic chests, etc.). Both chests give 25g, full stop.
- Deeper biome override surface. We add exactly the six override fields this ruleset needs; future rulesets extend as required.

## Architecture

### Registry entry

Appended to `RULESETS` in `game.js` (near line 50):

```js
const RULESETS = [
  { id: 'regular',          weight: 1, prepare: null,                   apply: null },
  { id: 'treasure_chamber', weight: 1, prepare: prepareTreasureChamber, apply: applyTreasureChamber },
];
```

Weight 1 vs 1 = 50/50 on levels 13+. Levels 1–12 remain `regular` unconditionally (the framework already enforces this — no change to the roll).

### New state fields

Both level-scoped, reset at the top of `initLevel`:

- `state.biomeOverrides` — object or `null`. Set by a ruleset's `prepare`. Today's fields:
  - `wallDensity` (number, default `0.25`)
  - `gasDensity` (number, default `0.20`)
  - `goldScatterDensity` (number, default `0.20`)
  - `guaranteedItemDrops` (number, default `null` → existing 1-or-2 RNG behavior)
  - `suppressMerchant` (boolean, default `false`)
  - `freezePityTick` (boolean, default `false`)
- One new cell-level flag — `cell.chest` (boolean) — added only to chest cells. No new cell *type*: chests reuse `type: 'gold'` so the existing gold-collection code handles pickup. The flag exists purely to switch the render icon (🎁 vs gold stacks).

### Base-code plumbing (new override reads)

Five hardcoded reads become override-aware, plus one new branch in `nextLevel` for pity freeze. Each density read falls back to the current literal, so `regular` (and any ruleset that doesn't set overrides) behaves identically:

| Location | Current | Override read |
|---|---|---|
| `placeWallClumps` wall count, `game.js:642` | `0.25` | `state.biomeOverrides?.wallDensity ?? 0.25` |
| `initLevel` gas count, `game.js:1516` | `0.20` | `state.biomeOverrides?.gasDensity ?? 0.20` |
| `placeGoldVeins` scatter roll, `game.js:1027` | `Math.random() < 0.2` | `Math.random() < (state.biomeOverrides?.goldScatterDensity ?? 0.2)` |
| `placeItemDrops` drop count, `game.js:1056` | `1 + Math.floor(Math.random() * 2)` | `state.biomeOverrides?.guaranteedItemDrops ?? (1 + Math.floor(Math.random() * 2))` |
| `initLevel` merchant decision, `game.js:1508` | `state.levelsSinceMerchant >= 2 \|\| Math.random() < 0.50` | `state.biomeOverrides?.suppressMerchant ? false : (state.levelsSinceMerchant >= 2 \|\| Math.random() < 0.50)` |

Pity-timer freeze is one extra branch in `nextLevel` (`game.js:1707`):

```js
if (state.biomeOverrides?.freezePityTick) {
  // freeze: do not change state.levelsSinceMerchant
} else if (state.merchant) {
  state.levelsSinceMerchant = 0;
} else {
  state.levelsSinceMerchant++;
}
```

`initLevel` clears `state.biomeOverrides = null` *before* calling `ruleset.prepare?.(state)` so each level starts from a clean slate. Freezing pity on the chamber level works because `nextLevel` runs while the chamber's `biomeOverrides` are still on state; `initLevel` for the next level then wipes them.

Gold multiplier note: we bump the scatter density (0.20 → 0.30). Vein centers and their neighbors stay at the current 3-vein layout — we don't mess with vein count for this ship. Combined effect is roughly "more gold" without creating a specific multiplier we'd need to tune precisely.

### `prepareTreasureChamber`

```js
function prepareTreasureChamber(state) {
  state.biomeOverrides = {
    wallDensity:         0.15,
    gasDensity:          0.12,
    goldScatterDensity:  0.30,
    guaranteedItemDrops: 2,
    suppressMerchant:    true,
    freezePityTick:      true,
  };
}
```

No other work in `prepare` — densities drive generation, merchant suppression drives the spawn decision.

### `applyTreasureChamber`

Runs at the very end of `initLevel`, after generation, player/exit placement, anchors, pre-reveal. Responsibilities:

1. Compute the two off-diagonal corners (the two that are neither player start nor exit). `pickMerchantCorner` currently picks one of these two — we use both. Implementation can factor out the corner-picking logic or duplicate it inline; either is fine.
2. For each corner:
   - Clear whatever landed there (wall → floor, gas → floor, existing gold/item → overwritten). Recompute `adjacent` for its 8 neighbors since removing a gas/wall changes their counts.
   - Mark the cell as a chest: `cell.type = 'gold'`, `cell.goldValue = 25`, `cell.item = null`, `cell.chest = true`.
   - Pre-reveal the chest cell. If its adjacency is 0, cascade-reveal from it (same cascade code anchors use).
3. Call `renderGrid()` at the end — `apply` runs after the base `renderGrid()` inside `initLevel`, so chest visuals wouldn't paint otherwise.

### Render path

The gold renderer checks `cell.chest`. If truthy, render a 🎁 emoji in place of the gold stack icons. Bobs/drop-shadow identical to gold. On pickup, the existing gold-collection code sets `cell.type = 'empty'` and `cell.goldValue = 0`; we also clear `cell.chest = false`. Pickup float reads "+25" (no special chest label for first ship — keep it consistent with gold).

## Data flow

```
Level 13+, roll picks treasure_chamber:
  initLevel →
    clear biomeOverrides →
    prepareTreasureChamber sets overrides →
    HP/merchant/rows reset →
    spawnMerchant = false (override) →
    generation reads overridden densities →
    placeGoldVeins scatters at 0.30 →
    placeItemDrops forces 2 →
    anchors/start/exit as usual →
    applyTreasureChamber stamps two chests →
    renderGrid

Walking onto a chest:
  existing gold-pickup path runs →
  +25 to state.gold →
  pickup float "+25" →
  cell reverts to empty →
  chest flag cleared

nextLevel after a chamber:
  biomeOverrides.freezePityTick === true →
  levelsSinceMerchant unchanged →
  state.level++ →
  state.rulesetId = null →
  saveRun (persists level + cleared rulesetId) →
  initLevel rolls fresh ruleset
```

## Save/load

No changes to the save payload. `rulesetId` is already round-tripped by the framework; `biomeOverrides` is rebuilt by `prepare` on resume.

Mid-chamber refresh + Continue re-runs `initLevel` with the same `rulesetId`, so `prepare` re-applies overrides and `apply` re-stamps chests on the same (deterministically chosen) corners. The surrounding map re-rolls — same limitation as regular levels. Not fixing here.

Legacy saves without `rulesetId` on level ≥13 roll fresh, per the existing framework. Nothing new.

Unknown `rulesetId` in a save (e.g., we rename the chamber later) falls back to `RULESETS[0]` (regular) via `resolveRuleset`'s existing fallback. Save round-trip stays lossless — the original id stays in state.

## Testing (manual — no test runner)

1. **Regular levels still regular:** play levels 1–12. Confirm `state.rulesetId === 'regular'` and the map looks normal (wall/gas densities, merchant odds, gold amounts, 1–2 item drops). No chests.
2. **50/50 split at level 13+:** reach level 13, refresh/retry a few times. Confirm `state.rulesetId` alternates between `'regular'` and `'treasure_chamber'` roughly half the time.
3. **Chamber visual vibe-check:** on a chamber level, eyeball — walls look noticeably sparser, gas sparser, more gold scattered, two items drop, no merchant.
4. **Chests present and paying out:** both off-diagonal corners show 🎁, pre-revealed. Walk onto each → `+25` float, `state.gold` increments by 25, cell becomes plain revealed floor.
5. **No merchant on chamber:** confirm `state.merchant === null` on chamber levels even when `state.levelsSinceMerchant >= 2` (which would normally force-spawn one).
6. **Pity freeze works:** in console, set `state.levelsSinceMerchant = 2`, force a chamber (temporarily hard-code the roll or tweak weights). Finish the chamber. Next level: `state.levelsSinceMerchant` still 2, not 3.
7. **Retry-on-death preserves ruleset:** die on a chamber → retry → still a chamber, chests re-stamped in corners (map otherwise fresh).
8. **Resume mid-chamber:** refresh mid-level → Continue → chamber level reloads with chests in corners.
9. **Walled-chest frequency:** play ~10 chambers, note how often either chest is walled in. One-in-ten-ish is fine. If most chambers have a walled chest, wall density needs a second pass.
10. **No bleed-through to regular:** after a chamber, the next-level regular has normal wall/gas densities and normal merchant odds. Confirm `state.biomeOverrides === null` at the top of the next `initLevel`.

## Risks / watchpoints

- **Plumbing the four overrides cleanly.** First time base code reads `biomeOverrides`. Risk: a typo or missed `??` fallback causes regular levels to use `undefined` and produce NaN counts / broken maps. Mitigation: test #1 and #10 above are specifically guarded against this. Implement by refactoring each read in isolation and re-testing regular levels before wiring in the chamber.
- **Pity-freeze placement.** Easy to put the branch in the wrong spot (e.g., checking biomeOverrides in `initLevel` instead of `nextLevel`). Spec above names line 1707 explicitly.
- **Chest on a former gas/wall cell** changes the adjacency counts of its 8 neighbors. Skipping the re-count causes a visual bug where neighbors show stale numbers. `applyTreasureChamber` must recount — spec step 2 calls this out.
- **50% rate is loud.** Expected half of levels 13+ to be chambers. If it feels like "the real game is chambers", dial weight down (1 vs 4 = 20%). One-line change. Memory this after playtest.
- **Chest economy tuning.** 25g × 2 = 50g per chamber, roughly ¾ of a single discounted merchant slot. Might feel weak given the level has no merchant either. Post-playtest we retune the 25 or bump to 3 chests. Tracked, not blocking.
- **Pickaxe incentive shift.** Walled chests + no merchant to buy more pickaxes could push players toward hoarding pickaxes for chambers. Probably a good thing (real trade-off), but watch for it.

## Scope check

One registry entry, two small hook functions, five override reads plus one pity-freeze branch in `nextLevel`, one chest branch in the render path, one chest flag-clear on gold pickup. No save-payload changes. Plumbing is the bulk of the work; the ruleset itself is thin.
