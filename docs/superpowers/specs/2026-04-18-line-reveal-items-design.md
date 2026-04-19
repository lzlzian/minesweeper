# Line-Reveal Items — Design

**Date:** 2026-04-18
**Status:** Approved, ready for implementation plan

## Context

Items v1 (potion, scanner, pickaxe) gave the player tools for defusing guess-chains in local trouble spots. Playtest since has shown that anchor cells + existing items work well for short tactical decisions, but the player still lacks a tool for *reshaping the map at range* — reading a corridor before committing to walk it, or opening a fresh angle on a distant frontier.

These three new items — **Row Scan**, **Column Scan**, **Cross Scan** — extend the item system with line-of-sight reveals centered on the player. They take the scanner's "reveal shape with gas detonation" pattern and stretch it along lines instead of a 3×3 square.

This is an additive iteration on items v1, not a restructuring. Acquisition, UI, and implementation follow the existing items patterns with minimal new surface area.

## Goal & Scope

Add three line-reveal items to give the player tools for momentum: correctly-guessed situations can now cash out into larger map reveals when positioning is right. Use playtest to learn whether line reveals feel like the right kind of "momentum reward," or whether they collapse into "use both, walk to exit."

**In scope:**
- Three new items with shape-based reveal logic
- Acquisition via starter stash, map drops, and merchant
- UI slot in the item bar for each
- Save/load back-compat for older saves

**Out of scope:**
- Distinct SFX per item (reuse `scan` for first pass)
- Custom targeting UI (all three are instant-use, no targeting)
- Item rarity tiers or upgrades
- Rebalancing of existing items or merchant pool pricing beyond adding the new entries

## Items

All three items are **instant-use** (like Potion and Scanner). They fire immediately on button click from the player's current position. No targeting mode.

**Shared reveal rules** (all three items):
- Reveal expands along the shape's rays, starting from the player's cell.
- Each ray **stops at the first wall** it encounters. The wall itself stays unrevealed (walls are always visible regardless, so no change there).
- **Gas cells along the ray detonate harmlessly** — become detonated floor with the red ✖, no HP cost, same rule as scanner or a surviving gas dig.
- Empty cells reveal normally. Adjacency-0 cells still trigger the usual cascade via `revealCell`.
- Item pickups or gold in revealed cells are NOT auto-collected (consistent with scanner — only stepping onto a cell collects its payload). Icons become visible, but pickup happens via `revealCell`'s existing logic, not a special case.

### ↔️ Row Scan
- **Shape:** The player's current row. Two rays — one expanding left from the player's column, one expanding right.
- **Disabled when:** No unrevealed non-wall cells exist along the row within wall-bounded range.

### ↕️ Column Scan
- **Shape:** The player's current column. Two rays — one expanding up, one expanding down.
- **Disabled when:** No unrevealed non-wall cells exist along the column within wall-bounded range.

### ✖️ Cross Scan
- **Shape:** Four diagonal rays from the player — NE, NW, SE, SW. The player's own cell is already revealed so it's just the four rays.
- **Disabled when:** No unrevealed non-wall cells exist along any of the four diagonals within wall-bounded range.

Icons (`↔️`, `↕️`, `✖️`) are placeholders and may be tuned for clarity during implementation.

## Acquisition

Symmetric with existing items — same three sources.

1. **Starter stash:** Granted once per run (on `newRun`). Becomes `{ potion: 1, scanner: 1, pickaxe: 1, row: 1, column: 1, cross: 1 }`.
2. **Map drops:** The existing 1–2 items-per-level placement rolls uniformly across all 6 types.
3. **Merchant shop:** Pool expands to all 6 items. Prices:
   - Potion 10g (existing)
   - Pickaxe 15g (existing)
   - Scanner 20g (existing)
   - Row 25g (new)
   - Column 25g (new)
   - Cross 30g (new)
   - Merchant still picks 2–3 slots per visit, sampling from the full pool.

Items persist across levels (including death-retry) via the existing save/load, which already serializes `state.items`.

## UI

Item bar grows from 3 buttons to 6:

```
[ 🍺 N ] [ 🔍 N ] [ ⛏️ N ] [ ↔️ N ] [ ↕️ N ] [ ✖️ N ]
```

**Interaction:** All three new items mirror Potion/Scanner (instant-use). Click → effect fires immediately. No targeting mode, no Escape handling.

**Disabled states:** Greyed out when count is 0 OR the shape's `has-target` check returns false.

**Feedback:**
- Reuse existing `scan` SFX for all three (distinct SFX is a later polish pass).
- Gas detonations along the ray spawn the existing red `💀` float per cell via `spawnPickupFloat`.
- No new animation needed; `renderGrid` + existing cascade/detonation animations cover it.

**Layout:** Keep single row, let flexbox handle shrinkage. If 6 buttons feel cramped on narrow viewports in playtest, revisit (wrap, shrink icons). Don't pre-optimize.

## Edge Cases & Rules

- **Player standing next to a wall:** one ray may have zero range (stops on step 1). Valid. Other rays still fire normally. Has-target check handles the all-rays-blocked case.
- **Empty-then-gas-then-empty along a ray:** gas detonates harmlessly, ray continues past the detonated cell. (Detonated gas becomes revealed floor, so "stop at walls only" still holds.)
- **Wall immediately adjacent to player in all shape directions:** has-target returns false, button greyed out. Player cannot waste the item.
- **Cascading reveal crossing a wall-bounded section:** an adjacency-0 cell along the ray triggers the existing cascade via `revealCell`, which can flood-fill beyond the ray's bounds. Intentional — consistent with scanner's cascade behavior.
- **Item pickup icons along the ray:** revealed but NOT collected (player must still step on them).
- **Gold along the ray:** revealed but NOT collected (same rule).
- **Using the item at the spawn cell on turn 1:** legal. Can surface a lot if the start area is open. Matches scanner's behavior.
- **Save file from before this change:** loaded save may lack `row`, `column`, `cross` keys in `state.items`. Initializer guards: seed missing keys to 0 on load.

## Architecture / Implementation Notes

Extension of the items v1 architecture. No new abstractions.

- **State:** `state.items` gains three keys: `row`, `column`, `cross`. All default to 0, set by starter-stash init on `newRun`. `activeItem` field unchanged (still only `'pickaxe'` uses targeting).

- **Usage functions:** Add `useItemRow()`, `useItemColumn()`, `useItemCross()` following the scanner template:
  1. Guard: count > 0 AND `<shape>HasTarget()` returns true.
  2. Decrement `state.items[<key>]`.
  3. Walk the shape's cells from the player outward. Break each ray on wall. For each unrevealed non-wall cell:
     - If `cell.type === 'gas'`: call `detonateGas(r, c)`, set `state.revealed[r][c] = true`.
     - Else: call `revealCell(r, c)` (handles cascade + pickups).
  4. `playSfx('scan')`, `updateHud()`, `updateItemBar()`, `renderGrid()`.

- **Has-target checks:** Add `rowHasTarget()`, `columnHasTarget()`, `crossHasTarget()`. Each walks its shape's rays with the same "stop at wall" rule and returns true if any unrevealed non-wall cell exists. Used by `updateItemBar` to drive the disabled state.

- **Ray-walking helper (optional):** A shared `walkRay(startR, startC, dR, dC, callback)` helper could deduplicate the four directional loops in row/col (2 rays each) and cross (4 rays). Worth considering during implementation if it shortens and clarifies. Not required — inline loops are fine if the helper doesn't pay its way.

- **Routing:** `onItemButtonClick(itemKey)` gets three new branches mirroring the potion/scanner instant-use branches. No changes to the pickaxe targeting path.

- **Item bar rendering:** `updateItemBar()` iterates item keys to render buttons. Add `row`, `column`, `cross` to the key list in display order. Each entry needs: icon, label, usage handler, has-target check, disabled-if-count-0 check.

- **Merchant:** Extend the merchant's item catalog (icons + prices) to include the three new entries. The existing 2–3-slot picker samples from the catalog — no other changes needed.

- **Map drops:** The random-type roll at level-gen becomes uniform across 6 types. No placement-logic changes.

- **Save/load back-compat:** On load, after `state.items = { ...save.items }`, ensure the three new keys exist:
  ```js
  state.items.row = state.items.row ?? 0;
  state.items.column = state.items.column ?? 0;
  state.items.cross = state.items.cross ?? 0;
  ```
  This covers saves from before the update.

## Testing / Playtest Criteria

Same bar as items v1:
- Each of the 6 items gets used naturally in late levels (none feels vestigial).
- No item trivializes the board — watch specifically for row+column opening too much on the large open boards.
- Cross on dense-wall levels should feel weaker (short rays) — that's the intended power curve, not a bug.
- Positioning feels meaningful: the player should notice themselves walking to better firing spots before using a line-reveal.

If row/column feel overpowered on large boards, likely tunings (for a later iteration, not this spec):
- Switch gas behavior from "detonate harmlessly" to "gas blocks the ray" or "gas reveals but stays gas" (noted in session as a future tuning lever).
- Cap ray distance (e.g., 8 cells per direction).
- Raise merchant prices or remove from starter stash.

If cross feels dead-weight, likely tunings:
- Let it pass through one wall per ray.
- Make it hit a 5×5 diagonal instead of 4 rays.
