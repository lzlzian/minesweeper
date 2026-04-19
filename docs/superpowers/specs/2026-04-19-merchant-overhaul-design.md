# Merchant Overhaul — Design Spec

**Date:** 2026-04-19
**Status:** Approved for implementation
**Related:** `2026-04-18-merchant-design.md` (prior merchant spec — this supersedes its stock + pricing sections)

## Goal

Make the merchant the centerpiece of the momentum loop. Today it appears ~33% of levels with 2-3 items at full price; players leave most runs feeling they had no real economy. This pass increases spawn rate, floods the shop with stock, and adds a discount distribution so most visits produce a meaningful haul.

Target feel: "Found a merchant — I'm about to load up."

Target numbers (back-of-envelope with 80g budget every ~2 levels, greedy cheapest-first): median visit buys 7 items, unlucky ~5, lucky 9-10. Raw math in "Appendix: pricing math" below.

## Scope

### In scope
- Merchant spawn rate bump
- Stock size increase (2-3 → 10)
- Discount distribution applied to every slot independently
- Shop UI redesign: 2×5 grid with fixed-shape buttons and discount badges
- Reroll button with per-merchant escalating cost
- Save/load back-compat for new slot shape and merchant state

### Out of scope
- No new item types (distribution stays uniform over the existing 6: potion, pickaxe, scanner, row, column, cross)
- No per-item weighting (each slot rolls uniformly over types)
- No "large merchant" vs "small merchant" variation — all merchants are 10-slot now
- No changes to merchant placement logic (still off-diagonal corner, still pre-revealed, still reachable)
- No changes to pity timer rules (still `levelsSinceMerchant >= 2` forces spawn)
- No changes to item effects or base prices

## Design

### 1. Spawn rate

Base probability `0.33` → `0.50`. Pity timer unchanged.

Expected merchants per 10-level run: ~5, up from ~3.3. With pity, worst-case still one every 3 levels.

### 2. Stock generation

Each merchant rolls 10 slots independently. Per slot:

1. Pick `type` uniformly from `['potion', 'pickaxe', 'scanner', 'row', 'column', 'cross']`. Duplicates allowed.
2. Pick `discount` tier from the distribution below.
3. Compute `price` from the base price table and the discount.

**Base price table** (unchanged from current `MERCHANT_PRICES`):

| Type | Base |
|---|---|
| potion | 10 |
| pickaxe | 15 |
| scanner | 20 |
| row | 25 |
| column | 25 |
| cross | 30 |

**Discount distribution:**

| Tier key | Probability | Multiplier | Rule |
|---|---|---|---|
| `free` | 1% | — | price = 0 |
| `d90` | 5% | 0.10 | price = max(1, round(base × 0.10)) |
| `d75` | 15% | 0.25 | price = max(1, round(base × 0.25)) |
| `d50` | 20% | 0.50 | price = max(1, round(base × 0.50)) |
| `d25` | 25% | 0.75 | price = max(1, round(base × 0.75)) |
| `full` | 34% | 1.00 | price = base |

**Slot shape:**

```js
{
  type: 'scanner',        // item type
  basePrice: 20,          // from MERCHANT_PRICES[type]
  discountKey: 'd50',     // one of 'free', 'd90', 'd75', 'd50', 'd25', 'full'
  price: 10,              // computed, used for spend math
  sold: false
}
```

Both `basePrice` and `price` are stored so the UI can render strike-through when the slot is discounted.

### 3. Shop UI — 2×5 grid

Replace current flex-row shop layout with a CSS grid:

```css
.shop-slots {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  grid-template-rows: repeat(2, auto);
  gap: 0.5rem;
  margin: 1rem 0;
}
```

Each card:

- Fixed width (`1fr` of the grid column)
- Icon (1.6rem, slightly smaller than current 1.8rem to fit)
- Name (unchanged)
- Price line: if `discountKey !== 'full'`, show `<s>${basePrice}g</s> ${price}g`; else show `${price}g`. When `price === 0`, show `FREE` in gold color.
- Button (fixed shape, see below)
- Discount badge (top-right absolute, only when `discountKey !== 'full'`)

On small mobile (≤360px portrait), the 5-column grid shrinks each card to ~60-65px. Icons and text remain legible; cards may stack vertically if content wraps but should not scroll horizontally.

### 4. Button shape fix

Root cause of the existing bug: button is content-sized, so "Buy" vs "Sold out" vs "Can't afford" are different widths.

Fix:

- Button is `width: 100%` of its card
- Fixed `min-height: 1.8rem`
- Identical padding regardless of label
- Label set: `"Buy"` (default) / `"Sold"` (when `slot.sold`). Both 3-4 characters, roughly the same pixel width.
- When `totalGold < slot.price` and not sold: label stays `"Buy"`, button gets `:disabled` styling (greyed out). No `"Need Xg"` text — that reintroduces width variance and clutters a 10-card grid.

### 5. Discount badges

A small absolutely-positioned pill in the top-right corner of the card:

| Tier | Text | Background | Notes |
|---|---|---|---|
| `d25` | `-25%` | `#4ade80` (green) | |
| `d50` | `-50%` | `#fbbf24` (yellow) | |
| `d75` | `-75%` | `#fb923c` (orange) | |
| `d90` | `-90%` | `#ef4444` (red) | |
| `free` | `FREE` | rainbow gradient, subtle pulse/hue-rotate animation | 1% rate — should feel special |
| `full` | none | — | no badge, avoids clutter on ~3-4 cards per shop |

Badge uses dark text (`#0f1a30`) for green/yellow/orange (legibility on bright bg) and light text for red / rainbow.

### 6. Reroll

A single button below the 2×5 grid labelled `🎲 Reroll (Xg)`, where X is the current reroll cost.

**Rules:**

- `state.merchant.rerollCount` starts at 0 when merchant is created.
- Cost formula: `10 * (rerollCount + 1)` → 10g, 20g, 30g, ...
- On click: spend via `spendGold(cost)`, increment `rerollCount`, call `rollMerchantStock` to regenerate all 10 slots (wipes `sold` state too), re-render shop.
- Counter resets per-merchant: next merchant starts at 0 again.
- Disabled state: `totalGold < cost`. Same styling as current shop button disabled.
- If all 10 slots are sold, reroll is still allowed — it's the common expected case of "cleared out, try again."
- SFX: reuse `payment` (already used for buys).

**Placement:** below the shop grid, above or beside the existing "Leave" button.

```
[ 10 shop slots in 2x5 grid ]

  [ 🎲 Reroll (10g) ]   [ Leave ]
```

### 7. Data flow

```
stepOnMerchant → showShopOverlay
  ├── reads state.merchant.stock (10 slots with new shape)
  ├── reads state.merchant.rerollCount
  └── renders grid + reroll button + leave button

buyFromMerchant(idx)
  ├── spendGold(slot.price)   -- unchanged
  ├── state.items[slot.type]++
  ├── slot.sold = true
  └── re-render

rerollMerchant()
  ├── cost = 10 * (state.merchant.rerollCount + 1)
  ├── spendGold(cost)
  ├── state.merchant.rerollCount++
  ├── state.merchant.stock = rollMerchantStock()
  ├── playSfx('payment')
  └── re-render
```

### 8. Save/load back-compat

Existing saves may contain:

- Old-shape merchant stock: `{ type, price, sold }` with no `basePrice` / `discountKey`.
- No `rerollCount` on the merchant object.

On load, for each slot in `state.merchant.stock`:

```js
slot.basePrice ??= slot.price;
slot.discountKey ??= 'full';
```

For the merchant object:

```js
state.merchant.rerollCount ??= 0;
```

This way an existing active merchant keeps its old stock (rendered with no badges, no strike-throughs) until the player leaves the level. New merchants use the full new shape. No save migration step required.

## Data model changes summary

### `state.merchant` shape (was):
```js
{ r, c, stock: [{ type, price, sold }] }
```

### `state.merchant` shape (now):
```js
{
  r, c,
  rerollCount: 0,
  stock: [{ type, basePrice, discountKey, price, sold }, ...10]
}
```

### Save payload

No new top-level keys — merchant is already part of the saved level state. Back-compat guards handle old payloads.

## Testing checklist

Manual playtest cases:

1. **Spawn rate feel:** play 10 levels, confirm merchant appears ~5 times (rough eyeball, not statistical).
2. **Stock distribution:** across 5+ merchant visits, confirm we see a mix of discounts (not "always full price" or "always on sale").
3. **FREE roll:** reroll repeatedly on a single merchant to trigger the 1% tier at least once. Confirm badge animation and 0g price work.
4. **Button shape:** on mobile portrait, take a screenshot of a shop with mixed sold/available/can't-afford states. Buttons should all be the same width.
5. **2×5 layout:** verify no horizontal scroll on iPhone-SE-width (~375px) and Android narrow (~360px).
6. **Reroll cost escalation:** buy nothing, reroll 3 times, confirm costs 10 → 20 → 30g.
7. **Reroll wipes sold:** buy 2 items, reroll, confirm those slots are no longer greyed.
8. **Reroll disabled:** with less gold than current reroll cost, button is greyed and can't be clicked.
9. **Per-merchant reset:** exit level, enter next merchant, confirm reroll cost is back to 10g.
10. **Save/load back-compat:** open the game with a pre-existing save that has an old-shape merchant, confirm it still renders and is buyable (no crash, no missing fields).
11. **Save/load of new shape:** refresh mid-level with a new-shape merchant in view, confirm rerollCount and discounts persist.

## Appendix: pricing math

Expected paid per slot at 20g base:

```
E = 0.01*0 + 0.05*2 + 0.15*5 + 0.20*10 + 0.25*15 + 0.34*20
  = 0 + 0.1 + 0.75 + 2.0 + 3.75 + 6.8
  = 13.4g
```

So avg discount ≈ 33% across the whole 10-slot shelf.

Median greedy-buy at 80g (sort 10 slots ascending, buy until gold runs out): typically **7 items**, ~2g left over. Matches target of "7-8 items out of a merchant visit."
