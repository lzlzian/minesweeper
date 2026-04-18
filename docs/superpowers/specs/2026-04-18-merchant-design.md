# Merchant — Design Spec

Date: 2026-04-18
Status: approved for implementation planning

## Problem

Gold is currently a pure score — it accumulates, it carries across levels inside a run, but the player never spends it. Items drop rarely (1-2 per level, hidden in the map), so a player on a cold streak has no reliable way to stock up. We need a gold sink that:

1. Gives gold a purpose inside a run.
2. Provides an alternative, reliable path to items that doesn't undermine the "drops stay rare" decision.
3. Tempts the player off the straight player→exit diagonal, creating more opportunities to engage with the probabilistic-decision core.

## Solution summary

A **merchant** NPC spawns on some levels in one of the two off-diagonal corners (the corners not taken by the player or exit). It is pre-revealed from level start, guaranteed reachable via a non-wall/non-gas path, and walking onto its cell opens a shop overlay that sells a randomized small assortment of the existing v1 items for gold.

## Spawn logic

### Frequency — pity timer

- New state field: `state.levelsSinceMerchant` (integer, initialized to `0` in `startGame`).
- At the top of `initLevel`, before grid generation:
  - If `state.levelsSinceMerchant >= 2` → merchant spawns this level (forced).
  - Else → merchant spawns if `Math.random() < 0.33`.
- Threshold is `>= 2` (not `>= 3`) so "guaranteed every 3 levels" holds: at most 2 consecutive misses, meaning if levels N and N+1 both miss, level N+2 is forced.
- Counter update happens in **`nextLevel`**, not `initLevel`, to avoid double-incrementing on death-retry:
  - If the just-cleared level had a merchant → `state.levelsSinceMerchant = 0`.
  - Else → `state.levelsSinceMerchant++`.
- `startGame` resets the counter to `0` (new run = clean state).
- `retryLevel` does not touch the counter — the retried level re-rolls spawn based on the same counter value the original attempt used.

### Placement — off-diagonal corner

Today:
- `pickPlayerStart` picks a random corner index `cornerIdx ∈ {0, 1, 2, 3}` and stores it in `state._startCornerIdx`.
- `pickExit` uses `3 - cornerIdx` (diagonal opposite).

The two remaining corners are off-diagonal from both the player and the exit. For the merchant:
- Randomly pick one of the two remaining corner indices.
- Use the existing `findNearCorner(r, c)` helper (same one the exit uses) to snap to a valid cell near that corner anchor.
- Clean the merchant cell the same way the exit cell is cleaned:
  - `type = 'empty'` (remove any gas, wall, or gold).
  - `goldValue = 0`.
  - `item = null`.
  - Recompute adjacency for the merchant cell's neighbors if gas was removed (same pattern used for the exit cell today).

### Reachability — extend existing retry loop

Today, `initLevel` retries grid generation up to 50 times until `isReachable(player, exit)` returns true. Extend this:

- On each attempt, after picking the merchant cell, require **both** `isReachable(player, exit)` **and** `isReachable(player, merchant)`.
- On the 50-attempt fallback (`carvePath(player, exit)`), also call `carvePath(player, merchant)`. Cheap Chebyshev carve, guaranteed solvability.

Note: `isReachable` treats all non-wall/non-gas cells as passable, including the exit cell. A path from player to merchant that passes through the exit is valid — matches the user's ask ("even if the path leads to exit first and then merchant, that's fine too").

### Pre-reveal

At the end of `initLevel`, after pre-revealing the player's start cell and the exit:

```js
if (state.merchant) {
  state.revealed[state.merchant.r][state.merchant.c] = true;
}
```

No cascade — just the single cell. The player can see the 🧙 icon from turn 1.

## Inventory & pricing

### Stock roll

When the merchant spawns, roll its stock at the same time as placement:

- Size: `2` or `3` slots, 50/50 coin flip.
- Each slot: independent uniform draw from `{'potion', 'scanner', 'pickaxe'}`. Duplicates allowed.
- Stored as:

```js
state.merchant = {
  r, c,
  stock: [
    { type: 'potion',  price: 10, sold: false },
    { type: 'pickaxe', price: 15, sold: false },
    // ...
  ],
};
```

### Prices

Fixed per item:
- 💊 potion: **10 g**
- ⛏️ pickaxe: **15 g**
- 🔍 scanner: **20 g**

Motivation: the game has no long-term gold sink, so prices are deliberately set to keep the player gold-starved. Tuning expected after playtest.

### Persistence within a level

- `sold: true` sticks until level change. The player can walk away from the merchant cell and return; sold slots stay grayed out, unsold slots stay buyable.
- On `nextLevel` or death-retry, `state.merchant` is re-rolled (or absent) as part of the next `initLevel` call.

### Affordability & payment

- Total gold pool: `state.gold + state.runGold`. Both count toward affordability.
- A buy button is disabled when `state.gold + state.runGold < price`.
- On purchase, deduct from `state.gold` first; if insufficient, overflow into `state.runGold`. This keeps the "current level" gold display meaningful while letting the player spend their full pool.
- Purchased item: `state.items[type]++`.

## Visuals & UI

### On the board

- Merchant cell renders the 🧙 emoji, same rendering pathway as 🚪 exit and 💰 gold.
- Add a `.merchant` CSS class for any later styling hooks (no bespoke styles required for v1).
- Pre-revealed at level start, visible across the map.

### Shop overlay

Reuses the existing `showOverlay` / `hideOverlay` system (same infrastructure as start screen, level-clear, game-over). Layout:

```
🧙 Merchant

💰 Gold: {current} (run: {total})

[ 💊 Potion — 10g ] [ ⛏️ Pickaxe — 15g ] [ 🔍 Scanner — 20g ]
     Buy                 Sold out               Buy

[ Leave ]
```

- Each stock slot is an inline mini-card: emoji, name, price, buy button.
- Sold slots: grayed out, button disabled, label swaps to "Sold out".
- Unaffordable slots: button disabled but not grayed (affordance: "you could buy this with more gold").
- Buy click: deduct gold, increment item count, mark slot `sold: true`, re-render overlay in place.
- Leave button: closes overlay via `hideOverlay`.

### Trigger

- When the player's movement resolution lands them on the merchant cell, show the shop overlay. Same hook point as landing on the exit or stepping onto gold.
- Overlay is passive — no turns pass while open, no HP risk.
- Closing the overlay (Leave button) leaves the player standing on the merchant cell. To re-open:
  - Walking away to another cell and returning re-triggers the overlay.
  - Clicking the merchant cell while already standing on it also re-opens the overlay (special-case in the cell-click handler — merchant cell is the only one where click-on-self-cell does something).
- The "re-open on click while standing on it" path matters because after Leave the player may want to buy more after collecting gold without having to step off and back on.

### Safety

- When opening the shop, set `state.activeItem = null` to clear any targeting mode. (Shouldn't be possible in practice — the overlay blocks board interaction — but cheap defensive clear.)

### SFX

- On successful purchase, reuse `playSfx('gold')` (existing coin sound).
- No new audio asset for v1.

### Start-screen copy

Add one line to the start overlay summary:
> "A 🧙 merchant sometimes appears — spend gold for items."

Keeps parity with the items-v1 copy update.

## State shape

New/changed fields on `state`:

```js
{
  // existing fields...
  levelsSinceMerchant: 0,   // new, run-scoped, reset in startGame
  merchant: null,            // new, level-scoped; either null or
                             // { r, c, stock: [{ type, price, sold }, ...] }
}
```

No localStorage persistence — merchant is fully run-scoped (matches items).

## Edge cases

- **Merchant corner blocked** — `findNearCorner` handles this (same logic already used for the exit anchor). If that fails, the level retry loop kicks in.
- **Merchant cell had gold/gas/wall** — cleaned at placement time (same as exit cell handling). Adjacency recomputed for neighbors if gas was removed.
- **Item drops collide with merchant corner** — `placeItemDrops` already excludes gold, spawn, and exit cells. Add the merchant cell to this exclusion list.
- **Player dies with shop open** — cannot happen (overlay blocks the board; no turns pass).
- **Player has exactly 0 gold** — all buy buttons disabled; Leave still works.
- **Small grids** — level 1 is 10×10; corners are well-separated. No layout concern.

## Out of scope (v1)

- Merchant haggling, discounts, dynamic pricing.
- Rare / legendary / boss-level inventory.
- Merchant-exclusive items (e.g., map reveal, extra HP consumable).
- Merchant dialogue or personality.
- Persistent gold across runs (this feature deliberately keeps all gold run-scoped).
- Audio asset dedicated to the merchant.

## Playtest signals to watch

- Do players detour for the merchant? If not, the corner placement isn't pulling hard enough (merchant too easy to skip) or prices are too high.
- Do players feel gold-starved? If not, prices may need to rise.
- Does the pity timer (every 3 levels) feel right, or does it over/underdeliver?
- Do 2-slot merchants feel underwhelming vs. 3-slot? May need to bias the roll.
- Unreachable merchants (fallback carve path required) — is the carve noticeable/jarring, or invisible?
