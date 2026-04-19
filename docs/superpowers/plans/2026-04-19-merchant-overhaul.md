# Merchant Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bump merchant spawn rate to 50%, grow stock from 2-3 slots to 10 with a per-slot discount distribution (free/90/75/50/25/full), add a reroll button with per-merchant escalating cost (10/20/30g), and redesign the shop UI as a 2×5 grid with fixed-shape buttons and discount badges.

**Architecture:** All changes live in `game.js` and `style.css` — no new files, no build step. `state.merchant` gains a `rerollCount` field; each `stock` slot gains `basePrice` and `discountKey` fields alongside the existing `price` and `sold`. The existing `showShopOverlay` function is rewritten to render the grid and a reroll button; a new `rerollMerchant()` function is added next to `buyFromMerchant`. Current save payload does not persist `state.merchant` (it's re-rolled on `initLevel`) — so no save/load back-compat guards are required.

**Tech Stack:** Plain HTML/CSS/JS, no build tooling. Run locally with `npx serve . -l 3000` (not `file://` — Web Audio breaks).

**Reference spec:** `docs/superpowers/specs/2026-04-19-merchant-overhaul-design.md`

**Note on TDD:** This project has no test runner. Each task ends with a manual browser-verification step. Keep changes small and commit frequently.

**Important deviation from spec § 8:** The spec plans back-compat guards for saved merchant data. After checking `saveRun()` at `game.js:1531-1539`, `state.merchant` is NOT in the save payload — it's freshly rolled every `initLevel` call. So the load-time guards described in spec § 8 are dropped from this plan. No functional change to the spec's intent.

---

## Task 1: Discount distribution + stock generator

**Files:**
- Modify: `game.js:673-684` (`MERCHANT_PRICES` and `rollMerchantStock`)

- [ ] **Step 1: Replace the stock generator**

In `game.js`, replace lines 673-684 (from `const MERCHANT_PRICES` through the closing brace of `rollMerchantStock`) with:

```javascript
const MERCHANT_PRICES = { potion: 10, pickaxe: 15, scanner: 20, row: 25, column: 25, cross: 30 };

// Discount distribution: weights sum to 100.
// Each slot's discount is rolled independently.
const DISCOUNT_TIERS = [
  { key: 'free', weight: 1,  mult: 0 },
  { key: 'd90',  weight: 5,  mult: 0.10 },
  { key: 'd75',  weight: 15, mult: 0.25 },
  { key: 'd50',  weight: 20, mult: 0.50 },
  { key: 'd25',  weight: 25, mult: 0.75 },
  { key: 'full', weight: 34, mult: 1.00 },
];

function rollDiscountTier() {
  const total = DISCOUNT_TIERS.reduce((s, t) => s + t.weight, 0); // 100
  let r = Math.random() * total;
  for (const tier of DISCOUNT_TIERS) {
    r -= tier.weight;
    if (r < 0) return tier;
  }
  return DISCOUNT_TIERS[DISCOUNT_TIERS.length - 1]; // fallback (shouldn't hit)
}

function priceFromTier(basePrice, tier) {
  if (tier.key === 'free') return 0;
  if (tier.key === 'full') return basePrice;
  return Math.max(1, Math.round(basePrice * tier.mult));
}

function rollMerchantStock() {
  const itemTypes = ['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross'];
  const stock = [];
  for (let i = 0; i < 10; i++) {
    const type = itemTypes[Math.floor(Math.random() * itemTypes.length)];
    const basePrice = MERCHANT_PRICES[type];
    const tier = rollDiscountTier();
    const price = priceFromTier(basePrice, tier);
    stock.push({ type, basePrice, discountKey: tier.key, price, sold: false });
  }
  return stock;
}
```

- [ ] **Step 2: Manual verify in browser console**

Start dev server: `npx serve . -l 3000`, open `http://localhost:3000/` in a browser. In DevTools console, run:

```js
rollMerchantStock()
```

Expected: an array of 10 objects, each with `type`, `basePrice`, `discountKey`, `price`, `sold: false`. Discount keys should be a mix — run the call several times and confirm you see at least `full`, `d25`, `d50` appearing across runs. The `price` should equal `basePrice` when `discountKey === 'full'` and be strictly less otherwise.

- [ ] **Step 3: Sanity-check distribution**

In the console, run:

```js
const counts = { free: 0, d90: 0, d75: 0, d50: 0, d25: 0, full: 0 };
for (let i = 0; i < 10000; i++) counts[rollDiscountTier().key]++;
console.log(counts);
```

Expected: roughly `{ free: ~100, d90: ~500, d75: ~1500, d50: ~2000, d25: ~2500, full: ~3400 }` (±10% on each).

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "feat: 10-slot stock with per-slot discount distribution"
```

---

## Task 2: Bump merchant spawn rate to 50%

**Files:**
- Modify: `game.js:1402` (merchant spawn probability)

- [ ] **Step 1: Change spawn probability**

In `game.js`, replace line 1402:

```javascript
  const spawnMerchant = state.levelsSinceMerchant >= 2 || Math.random() < 0.33;
```

with:

```javascript
  const spawnMerchant = state.levelsSinceMerchant >= 2 || Math.random() < 0.50;
```

- [ ] **Step 2: Manual verify**

Refresh browser. Start a new run, play through 6-8 levels (or use the browser console to just repeatedly call `nextLevel()` after setting `state.hp = 99` and `state.items` to something non-empty to skip death). You should see a merchant on ~half the levels, never more than 3 levels without one.

- [ ] **Step 3: Commit**

```bash
git add game.js
git commit -m "feat: merchant spawn rate 33% -> 50%"
```

---

## Task 3: Add rerollCount field to merchant object

**Files:**
- Modify: `game.js:1464` and `game.js:1479` (merchant instantiation sites)

- [ ] **Step 1: Add `rerollCount: 0` to the primary merchant spawn**

In `game.js`, replace line 1464:

```javascript
        state.merchant = { r: merchantPos.r, c: merchantPos.c, stock: rollMerchantStock() };
```

with:

```javascript
        state.merchant = { r: merchantPos.r, c: merchantPos.c, stock: rollMerchantStock(), rerollCount: 0 };
```

- [ ] **Step 2: Add `rerollCount: 0` to the fallback merchant spawn**

In `game.js`, replace line 1479:

```javascript
        state.merchant = { r: merchantPos.r, c: merchantPos.c, stock: rollMerchantStock() };
```

with:

```javascript
        state.merchant = { r: merchantPos.r, c: merchantPos.c, stock: rollMerchantStock(), rerollCount: 0 };
```

Note: lines 1464 and 1479 are identical strings — use your editor's "find next" to replace both, or confirm both got replaced before committing.

- [ ] **Step 3: Manual verify**

Refresh browser. Play until a merchant spawns. In DevTools console, type `state.merchant` and confirm the object contains `rerollCount: 0`.

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "feat: add rerollCount to merchant state"
```

---

## Task 4: Rewrite showShopOverlay for 2×5 grid + discount UI

**Files:**
- Modify: `game.js:518-548` (`showShopOverlay`)

- [ ] **Step 1: Replace `showShopOverlay`**

In `game.js`, replace the function at lines 518-548 (from `function showShopOverlay` to the closing brace before `function buyFromMerchant`) with:

```javascript
function showShopOverlay(playWelcome = false) {
  if (!state.merchant) return;
  // Clear any active item targeting before opening the shop.
  state.activeItem = null;
  updateItemBar();
  if (playWelcome) playSfx('welcome');

  const totalGold = state.gold + state.stashGold;
  const itemEmoji = { potion: '🍺', pickaxe: '⛏️', scanner: '🔍', row: '↔️', column: '↕️', cross: '✖️' };
  const itemName = { potion: 'Potion', pickaxe: 'Pickaxe', scanner: 'Scanner', row: 'Row Scan', column: 'Column Scan', cross: 'Cross Scan' };

  const slotsHtml = state.merchant.stock.map((slot, idx) => {
    const canAfford = totalGold >= slot.price;
    const disabled = slot.sold || !canAfford;
    const label = slot.sold ? 'Sold' : 'Buy';

    let badgeHtml = '';
    if (slot.discountKey !== 'full') {
      const badgeText = slot.discountKey === 'free' ? 'FREE'
                      : slot.discountKey === 'd90' ? '-90%'
                      : slot.discountKey === 'd75' ? '-75%'
                      : slot.discountKey === 'd50' ? '-50%'
                      : '-25%';
      badgeHtml = `<div class="shop-badge shop-badge-${slot.discountKey}">${badgeText}</div>`;
    }

    let priceHtml;
    if (slot.price === 0) {
      priceHtml = `<div class="shop-slot-price shop-slot-price-free">FREE</div>`;
    } else if (slot.discountKey !== 'full') {
      priceHtml = `<div class="shop-slot-price"><s>${slot.basePrice}g</s> ${slot.price}g</div>`;
    } else {
      priceHtml = `<div class="shop-slot-price">${slot.price}g</div>`;
    }

    return `
      <div class="shop-slot ${slot.sold ? 'sold' : ''}">
        ${badgeHtml}
        <div class="shop-slot-icon">${itemEmoji[slot.type]}</div>
        <div class="shop-slot-name">${itemName[slot.type]}</div>
        ${priceHtml}
        <button onclick="buyFromMerchant(${idx})" ${disabled ? 'disabled' : ''}>${label}</button>
      </div>
    `;
  }).join('');

  const rerollCost = 10 * (state.merchant.rerollCount + 1);
  const canAffordReroll = totalGold >= rerollCost;

  showOverlay(`
    <h2>🧙 Merchant</h2>
    <p>💰 Gold: ${state.gold} · Stash: ${state.stashGold}</p>
    <div class="shop-slots">${slotsHtml}</div>
    <div class="shop-actions">
      <button onclick="rerollMerchant()" ${canAffordReroll ? '' : 'disabled'}>🎲 Reroll (${rerollCost}g)</button>
      <button onclick="leaveShop()">Leave</button>
    </div>
  `);
}
```

- [ ] **Step 2: Manual verify (layout only — reroll wired next task)**

Refresh browser. Play until a merchant spawns, step onto it. Expected:

- Shop shows 10 slots in a 2×5 grid (if not, CSS isn't updated yet — next task fixes). At this step the slots may still render as a flex row because the CSS class hasn't been updated; that's expected.
- Each slot shows icon, name, price.
- Discounted slots show a strike-through base price + discounted price (e.g., `<s>20g</s> 10g`).
- FREE slots show "FREE" where the price goes.
- Some slots have a badge div (will be unstyled until CSS is added next task).
- Reroll and Leave buttons appear below the grid. Reroll button currently throws on click — next task wires it.

- [ ] **Step 3: Commit**

```bash
git add game.js
git commit -m "feat: render 10-slot shop grid with discount UI"
```

---

## Task 5: Add rerollMerchant function

**Files:**
- Modify: `game.js:551-567` (add `rerollMerchant` between `buyFromMerchant` and `leaveShop`)

- [ ] **Step 1: Add `rerollMerchant` function**

In `game.js`, find `function leaveShop() { hideOverlay(); }` (around line 565). Immediately BEFORE that function, insert:

```javascript
function rerollMerchant() {
  if (!state.merchant) return;
  const cost = 10 * (state.merchant.rerollCount + 1);
  const totalGold = state.gold + state.stashGold;
  if (totalGold < cost) return;
  spendGold(cost);
  state.merchant.rerollCount++;
  state.merchant.stock = rollMerchantStock();
  playSfx('payment');
  updateHud();
  showShopOverlay(); // re-render with new stock and new reroll cost
}
```

- [ ] **Step 2: Manual verify**

Refresh browser. Play until a merchant spawns with some gold on hand (at least 10g — you can cheat in console with `state.gold = 500`). Step onto merchant.

- Click Reroll — stock should regenerate (different items / discounts), 10g deducted, button now reads "🎲 Reroll (20g)".
- Click Reroll again — 20g deducted, button now reads "🎲 Reroll (30g)".
- Buy one item, click Reroll — the newly-rolled stock should have no sold slots (sold state wiped).
- Drain your gold below current reroll cost — Reroll button greyed out.

- [ ] **Step 3: Verify per-merchant reset**

While still in the same run, leave shop and proceed to the next level(s) until another merchant spawns. Step onto it. Reroll cost should be back to "(10g)".

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "feat: add rerollMerchant with per-merchant escalating cost"
```

---

## Task 6: Shop CSS — 2×5 grid, fixed button, slot layout

**Files:**
- Modify: `style.css:345-399` (shop-slots and shop-slot rules)

- [ ] **Step 1: Replace shop CSS block**

In `style.css`, replace the block from line 345 (`.shop-slots`) through line 399 (the closing brace of `.shop-slot button:hover:not(:disabled)`) with:

```css
.shop-slots {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  grid-template-rows: repeat(2, auto);
  gap: 0.5rem;
  margin: 1rem 0;
  width: 100%;
  max-width: 480px;
}

.shop-slot {
  position: relative;
  background: #0f1a30;
  border: 2px solid #2a3a5a;
  border-radius: 8px;
  padding: 0.4rem 0.25rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  min-width: 0; /* allow cards to shrink inside grid */
}

.shop-slot.sold {
  opacity: 0.4;
}

.shop-slot-icon {
  font-size: 1.6rem;
  line-height: 1;
}

.shop-slot-name {
  font-size: 0.75rem;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.shop-slot-price {
  color: #ffd700;
  font-weight: bold;
  font-size: 0.8rem;
  text-align: center;
}

.shop-slot-price s {
  color: #7a7a7a;
  font-weight: normal;
  margin-right: 0.2em;
}

.shop-slot-price-free {
  color: #ffd700;
}

.shop-slot button {
  width: 100%;
  min-height: 1.8rem;
  margin-top: 0.25rem;
  padding: 0.25rem 0;
  font-size: 0.85rem;
  background: #e94560;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}

.shop-slot button:disabled {
  background: #555;
  cursor: default;
}

.shop-slot button:hover:not(:disabled) {
  background: #c73e54;
}

.shop-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  margin-top: 0.5rem;
}

.shop-actions button {
  padding: 0.4rem 0.9rem;
  font-size: 0.95rem;
  background: #e94560;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.shop-actions button:disabled {
  background: #555;
  cursor: default;
}

.shop-actions button:hover:not(:disabled) {
  background: #c73e54;
}
```

- [ ] **Step 2: Manual verify grid + button shape**

Refresh browser. Open a merchant shop. Expected:

- 10 slots laid out as 2 rows × 5 columns.
- All Buy/Sold buttons have the same width (spanning the card).
- "Sold" buttons (simulate by buying an item) and disabled "Buy" buttons (simulate by setting `state.gold = 0; state.stashGold = 0` in console before opening shop) have the same width as live "Buy" buttons.
- Reroll + Leave buttons centered below the grid with a small gap.

- [ ] **Step 3: Verify mobile width (desktop approximation)**

In DevTools, toggle device toolbar (Ctrl+Shift+M / Cmd+Shift+M), set viewport to 360×640 (Android-narrow). Open merchant shop. Expected:

- No horizontal scroll bar on the overlay.
- All 10 slots still visible in a 2×5 grid (cards shrink to fit).
- Icons and prices still legible; text may ellipsis on long item names ("Column Scan") — acceptable.

- [ ] **Step 4: Commit**

```bash
git add style.css
git commit -m "style: 2x5 shop grid with fixed-shape buttons and reroll row"
```

---

## Task 7: Discount badges CSS

**Files:**
- Modify: `style.css` (append new badge rules at the end of the shop block, after the `.shop-actions` rules from Task 6)

- [ ] **Step 1: Append badge rules**

At the end of the shop-related CSS block (immediately after the last `.shop-actions` rule added in Task 6, before the next unrelated selector), insert:

```css
.shop-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  padding: 2px 5px;
  font-size: 0.6rem;
  font-weight: bold;
  border-radius: 999px;
  line-height: 1;
  pointer-events: none;
  z-index: 1;
}

.shop-badge-d25  { background: #4ade80; color: #0f1a30; }
.shop-badge-d50  { background: #fbbf24; color: #0f1a30; }
.shop-badge-d75  { background: #fb923c; color: #0f1a30; }
.shop-badge-d90  { background: #ef4444; color: #ffffff; }

.shop-badge-free {
  color: #ffffff;
  background: linear-gradient(90deg, #ff5f6d, #ffc371, #4ade80, #60a5fa, #a78bfa);
  background-size: 200% 100%;
  animation: shop-badge-free-pulse 2s linear infinite;
  text-shadow: 0 0 2px rgba(0,0,0,0.8);
}

@keyframes shop-badge-free-pulse {
  0%   { background-position:   0% 50%; }
  100% { background-position: 200% 50%; }
}
```

- [ ] **Step 2: Manual verify badges**

Refresh browser. Open a merchant shop. Reroll several times to see a variety of discount tiers. Expected:

- 25% slots have a small green "-25%" pill at top-right.
- 50% slots show yellow "-50%".
- 75% slots show orange "-75%".
- 90% slots show red "-90%".
- Full-price slots have no badge.
- FREE slots: keep rerolling (1% each roll) until one appears. Badge should read "FREE" with a rainbow gradient that animates sideways.

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "style: discount tier badges with rainbow FREE variant"
```

---

## Task 8: Smoke test full feature end-to-end

**Files:**
- No changes — playtest only.

- [ ] **Step 1: Spawn-rate and gameplay loop**

Refresh browser. Start a new run. Play normally (no cheating) through at least 5 levels. Expected:

- Merchant appears on roughly half the levels; never more than 3 levels between merchants.
- When you visit a merchant, you can typically afford 5-8 items from the 10-slot stock (may vary per seed).

- [ ] **Step 2: Reroll affordability**

On a merchant with 50+ gold, reroll at least 3 times in one visit. Confirm cost scales 10 → 20 → 30 → 40g.

- [ ] **Step 3: Cross-level sanity**

Visit a merchant, reroll twice (cost now 30g). Leave, clear level, reach next merchant. Confirm that merchant's reroll cost is back to 10g (per-merchant reset).

- [ ] **Step 4: Visual regressions**

- HUD still shows `💰 X · Stash: Y` correctly after each buy and each reroll.
- Starting and resuming a saved game still works (Continue button on start screen).
- Dying at a merchant level and clicking "Retry Level" regenerates normally.

- [ ] **Step 5: Mobile layout sanity**

Open the site on a real phone (or DevTools device emulator) at 360px and 414px widths. Confirm shop overlay looks correct, no horizontal scroll, badges visible, buttons tappable.

- [ ] **Step 6: No commit needed**

This task is verification only. If you found regressions, file them as follow-up tasks; do not bundle fixes into this commit stream.

---

## Self-review notes

- Spec § 1 (spawn rate) → Task 2.
- Spec § 2 (stock generation + distribution + slot shape) → Task 1.
- Spec § 3 (2×5 grid) → Tasks 4 + 6.
- Spec § 4 (button shape fix) → Tasks 4 (label) + 6 (CSS).
- Spec § 5 (discount badges) → Task 4 (HTML) + Task 7 (CSS).
- Spec § 6 (reroll) → Tasks 3 (state field) + 4 (reroll button in overlay) + 5 (function) + 6 (CSS for action row).
- Spec § 7 (data flow) → matches Tasks 4+5 exactly.
- Spec § 8 (save/load back-compat) → **intentionally omitted** (see "Important deviation" at top of plan). Merchant is not persisted in the save format; guards would be dead code.
- Spec testing checklist → Task 8.
