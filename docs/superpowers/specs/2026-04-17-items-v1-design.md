# Items v1 — Design

**Date:** 2026-04-17
**Status:** Approved, ready for implementation plan

## Context

v3 of Mining Crawler is fun but larger levels (Level 5+, grids ≥14×14) surface a pain point: chains of forced guesses. Dense walls/gas intentionally break minesweeper solvability so the player plays the odds, but in later levels the player hits several guess-or-die situations back-to-back on the way to the exit. Correct guesses reveal only another number, which often produces another forced guess. Agency collapses.

Discussion explored three broad directions (Candy-Crush-style handcrafted levels, Balatro-style runs with meta, and a persistent-toolbox model). User's session shape ("pull out phone, play 1-10 levels, put down anytime") rules out long runs and forgotten synergies. Rather than commit to a long-term shape now, we introduce **items** that solve the immediate pain and let us learn which direction the game wants to grow into.

## Goal & Scope

Give the player three distinct tools for defusing guess-chains, place them sparingly in the world, and see how the game feels. Playtesting will tell us whether the fun shifts toward build-and-spend (Balatro direction) or resource-light puzzle expeditions (persistent-toolbox direction).

**Explicitly out of scope:**
- Cross-level persistence, inventory carry-over
- Shop, gold-spend flow
- Item synergies, rarity tiers, item upgrades
- Meta-progression tree

These are deferred until we see how the core three items feel in practice.

## Items

Three items, each targeting a distinct class of cell so their use-cases don't overlap.

### 💊 Potion
- **Effect:** Instantly heal +1 HP, capped at the level's max HP (3).
- **Target:** None — instant use.
- **Disabled when:** HP is already at max.
- **Purpose:** A correctly-guessed 50/50 that happened to cost a heart no longer cascades into a second guess being fatal. Equivalent to "ate the hit, keep going."

### 🔍 Scanner
- **Effect:** Dig a chosen cell safely. Behaves exactly like a normal dig except:
  - Gas cells do not cost HP; they are detonated harmlessly (become detonated floor with red ✖, adjacency numbers unchanged — same rule as a surviving gas dig).
  - Cascade reveal still triggers on an adjacency-0 cell, as with a normal dig.
- **Target:** Any non-wall unrevealed cell.
- **Disabled when:** No valid targets (polish, optional).
- **Purpose:** The clutch item. Survive the one square you can't read.

### ⛏️ Pickaxe
- **Effect:** Convert a wall cell to a revealed floor cell. The newly-exposed cell shows its adjacency number (fresh count of gas neighbors). Neighbors' numbers do NOT change — walls never participated in adjacency counts, so removing one is information-preserving for existing cells.
- **Target:** Any wall cell (revealed or not — walls are always visible).
- **Disabled when:** No valid targets (polish, optional).
- **Purpose:** Open a fresh angle of approach when every existing frontier is a guess. Reshapes the problem geometry instead of rolling the die.

## Acquisition (Option C)

Two sources combined:

1. **Starting stash (fixed):** Each level begins with `1 Potion, 1 Scanner, 1 Pickaxe`. Same every level for first pass.
2. **Map drops:** During level generation, after gas/wall/gold placement, place **1–2 item cells** on safe tiles (type `empty`, no gold, not the spawn/exit). Revealing an item cell grants one random item (uniform across the three types) and cascades normally if the cell is adjacency-0.

**Cross-level:** Items do NOT carry over. Level advancement resets to the 1/1/1 starting stash. This is a playtest stub; persistence is a deferred meta-progression question.

## UI

A toolbar strip below the grid (above or below the existing HUD — fit where it looks natural).

**Layout:** Three item buttons in a row, each showing icon + count:
```
[ 💊 1 ]  [ 🔍 1 ]  [ ⛏️ 1 ]
```

**Interaction:**
- **Potion:** Click → heals immediately. No targeting step.
- **Scanner / Pickaxe:** Click the button → enters targeting mode:
  - Button visually highlights (e.g., border + glow)
  - Cursor / cell hover hint indicates valid targets (Scanner: unrevealed non-wall cells; Pickaxe: wall cells)
  - Click a valid target cell → item applied, count decremented, targeting mode exits
  - Click an invalid cell or press Escape → cancels targeting mode, item not consumed
  - Click the same button again → cancels targeting mode
- Only one item can be in targeting mode at a time. Clicking a different item button switches the active mode.

**Disabled states:**
- Count at 0 → button greyed out, not clickable
- Potion at full HP → greyed out, not clickable
- Scanner/Pickaxe with no valid targets visible → greyed out (optional polish, skip if finicky)

**Feedback:**
- Item use plays a distinct SFX (reuse existing sounds where sensible; potion can share the gold/pickup SFX or use dig sound for first pass — final SFX are a later polish pass)
- Count decrement is visually obvious (short pulse animation on the number, optional)

## Edge Cases & Rules

- **Scanner on a cell that would cascade:** cascade runs normally. A scanner used on an adjacency-0 cell can open a large area for free. This is intentional — it's the payoff for saving the scanner for the right moment.
- **Pickaxe on a wall next to the exit / edge:** legal. No special casing.
- **Map-drop item cell as the spawn cell:** don't place item drops on the spawn cell (spawn always auto-reveals; the player would get a free item without deciding to dig). Simplest rule: exclude spawn and exit cells from item-drop candidates.
- **Item cell in a cascade:** if cascade sweeps through an item cell, grant the item the same as a direct dig (i.e., the cascade reveals it and the player receives the item). Matches how gold behaves today.
- **Death with items remaining:** items are level-scoped, so they're simply lost. Retry Level resets the 1/1/1 stash (same as a fresh level).
- **Level advance with items remaining:** items are discarded. First-pass behavior, to be revisited when we decide on persistence.

## Architecture / Implementation Notes

This section exists to constrain implementation choices; details live in the implementation plan.

- **State:** Add `state.items = { potion: 0, scanner: 0, pickaxe: 0 }` and an `activeItem: null | 'scanner' | 'pickaxe'` targeting field.
- **Cell type:** Extend the cell type union to include `'item'` OR keep `type === 'empty'` and add an `item` field on the cell. The latter is cleaner (adjacency calc doesn't need to treat `'item'` specially). Prefer the `item` field approach.
- **Reveal path:** In the code path that reveals a cell (and in cascade), after the cell is marked revealed, check `cell.item` and if present, increment `state.items[cell.item]`, clear the field, update HUD.
- **Dig entry point:** The click handler currently calls dig(). Intercept earlier: if `state.activeItem`, route the click to the item's use function instead. Validate the target, apply effect, decrement count, clear `activeItem`.
- **Pickaxe adjacency:** When converting a wall to floor, set `cell.type = 'empty'`, compute `cell.adjacent = countAdjacentGas(r, c)`, mark revealed. Do not recompute neighbors — their counts remain correct.
- **Map-drop placement:** New pass in the map generator, after gold veins are placed. Collect all `'empty'` cells that are not spawn/exit/gold-bearing, shuffle, take 1 or 2 (randomize), assign a random item to each.

## Testing / Playtest Criteria

This is a playtest-first change. Success looks like:
- Playing Level 5-10 feels like there are tools to reach for in tight spots instead of a forced coinflip
- Each of the three items gets used naturally (none feels vestigial)
- No item feels overwhelmingly strong — i.e., "scanner makes the game trivial" would be a failure mode to watch for

If one item is clearly dead weight or clearly too strong after a few sessions, that informs the next iteration — tune numbers, change acquisition rate, or swap the item out.
