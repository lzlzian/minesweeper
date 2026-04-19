# Item Tooltips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a descriptive tooltip when the player hovers over (desktop) or long-presses (mobile) any of the six item-bar buttons or any merchant shop slot.

**Architecture:** One shared `#tooltip` DOM element, positioned per trigger. A single `attachTooltip(el, itemKey)` helper wires Pointer Events to any element. Desktop hover uses a 300ms show delay; mobile long-press uses 400ms matching the existing grid long-press. Long-press on mobile is "inspect only" — the subsequent click is suppressed via a `_suppressNextClick` flag on the trigger element, so items are not used and purchases are not made.

**Tech Stack:** Plain HTML/CSS/JS (no build step). Pointer Events API for unified mouse/touch handling. No test framework — manual verification in browser.

**Spec:** `docs/superpowers/specs/2026-04-19-item-tooltips-design.md`

---

## File structure

- `index.html` — add `#tooltip` element as sibling of `#overlay`
- `style.css` — `#tooltip` styles, text classes, tail pseudo-element, flipped variant
- `game.js` — new `ITEM_TOOLTIPS` constant, helper functions (`attachTooltip`, `showTooltip`, `hideTooltip`, `positionTooltip`), init wiring for item-bar buttons, shop-slot wiring inside `showShopOverlay`, suppress-click guards in `onItemButtonClick` and `buyFromMerchant`

No new files; no file splits. Keeping everything in `game.js` follows the existing pattern for this codebase.

## Testing approach

This codebase has no test framework. Every task ends with **manual verification in a running browser** before committing. Start the dev server once with `npx serve . -l 3000`, then hard-reload after each task.

Desktop verification uses mouse events in Chrome. Mobile verification uses Chrome DevTools device emulation (Toggle Device Toolbar → iPhone/Pixel) which enables Pointer Events with `pointerType === 'touch'`. Confirm on a real mobile device at the end if possible.

---

### Task 1: Add tooltip element to HTML

**Files:**
- Modify: `index.html` (insert after `#item-bar`, before `#overlay`)

- [ ] **Step 1: Add the tooltip element**

Find this section in `index.html`:

```html
  </div>
  <div id="overlay" class="hidden">
    <div id="overlay-content"></div>
  </div>
  <script src="game.js"></script>
```

Insert a new `<div id="tooltip">` line between the closing `</div>` of `#item-bar` and the `<div id="overlay">` opening tag, so it becomes:

```html
  </div>
  <div id="tooltip" class="hidden" role="tooltip"></div>
  <div id="overlay" class="hidden">
    <div id="overlay-content"></div>
  </div>
  <script src="game.js"></script>
```

- [ ] **Step 2: Verify the page still loads**

Start the dev server if not running: `npx serve . -l 3000`
Open `http://localhost:3000/` in a browser, hard-reload.
Expected: start menu renders normally; no console errors. Inspect DOM to confirm `<div id="tooltip" class="hidden" role="tooltip">` exists and is not visible.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add #tooltip element for item hover/long-press"
```

---

### Task 2: Add tooltip CSS

**Files:**
- Modify: `style.css` (append to end of file)

- [ ] **Step 1: Append the tooltip CSS block**

Append this block to the end of `style.css`:

```css
#tooltip {
  position: fixed;
  background: #16213e;
  border: 1px solid #3a4a6a;
  border-radius: 8px;
  padding: 0.5rem 0.65rem;
  color: #eee;
  font-size: 0.9rem;
  line-height: 1.35;
  max-width: 220px;
  pointer-events: none;
  z-index: 1000;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}

#tooltip.hidden {
  display: none;
}

#tooltip .tooltip-name {
  font-weight: bold;
  margin-bottom: 0.15rem;
}

#tooltip .tooltip-desc {
  font-weight: normal;
}

#tooltip .tooltip-howto {
  margin-top: 0.25rem;
  font-size: 0.8rem;
  font-style: italic;
  color: #8899bb;
}

#tooltip::before {
  content: '';
  position: absolute;
  left: var(--tooltip-tail-x, 50%);
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
}

/* Default: tooltip above trigger, tail points DOWN from bottom of tooltip */
#tooltip::before {
  bottom: -6px;
  border-top: 6px solid #16213e;
}

/* Flipped: tooltip below trigger, tail points UP from top of tooltip */
#tooltip.tooltip-below::before {
  bottom: auto;
  top: -6px;
  border-top: none;
  border-bottom: 6px solid #16213e;
}
```

- [ ] **Step 2: Verify manually in browser**

Hard-reload `http://localhost:3000/`. Open DevTools console and run:

```js
const t = document.getElementById('tooltip');
t.classList.remove('hidden');
t.innerHTML = '<div class="tooltip-name">Potion</div><div class="tooltip-desc">Restore 1 ❤️.</div><div class="tooltip-howto">Tap to use instantly.</div>';
t.style.left = '50px';
t.style.top = '200px';
```

Expected: a dark-blue rounded tooltip appears at (50, 200) with bold "Potion", normal-weight description, and a dimmer italic "Tap to use instantly." line. A small downward-pointing triangle tail is visible at the bottom center.

Then test the flipped variant:

```js
t.classList.add('tooltip-below');
```

Expected: the tail moves to the top of the tooltip and points upward.

Clean up:

```js
t.classList.add('hidden');
t.classList.remove('tooltip-below');
```

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "style: add #tooltip styles with flipped-tail variant"
```

---

### Task 3: Add ITEM_TOOLTIPS data constant

**Files:**
- Modify: `game.js` (insert after `itemCounts` declaration, around line 182)

- [ ] **Step 1: Insert the constant**

Find this block in `game.js` (around lines 175-182):

```js
const itemCounts = {
  potion: document.getElementById('item-potion-count'),
  scanner: document.getElementById('item-scanner-count'),
  pickaxe: document.getElementById('item-pickaxe-count'),
  row: document.getElementById('item-row-count'),
  column: document.getElementById('item-column-count'),
  cross: document.getElementById('item-cross-count'),
};
```

Directly after the closing `};` of `itemCounts`, add an empty line and then:

```js
const ITEM_TOOLTIPS = {
  potion:  { name: 'Potion',      desc: 'Restore 1 ❤️.',                                         howto: 'Tap to use instantly.' },
  scanner: { name: 'Scanner',     desc: 'Reveal the 3×3 around you.',                             howto: 'Tap to use instantly.' },
  pickaxe: { name: 'Pickaxe',     desc: 'Break one wall tile.',                                   howto: 'Tap, then select a wall.' },
  row:     { name: 'Row Scan',    desc: 'Reveal along your row until walls stop it.',             howto: 'Tap to use instantly.' },
  column:  { name: 'Column Scan', desc: 'Reveal along your column until walls stop it.',          howto: 'Tap to use instantly.' },
  cross:   { name: 'Cross Scan',  desc: 'Reveal along all four diagonals until walls stop them.', howto: 'Tap to use instantly.' },
};
```

- [ ] **Step 2: Verify no syntax errors**

Hard-reload `http://localhost:3000/`. Open DevTools console.
Expected: no errors. Run `ITEM_TOOLTIPS.potion.name` in the console → `"Potion"`.

- [ ] **Step 3: Commit**

```bash
git add game.js
git commit -m "feat: add ITEM_TOOLTIPS data table"
```

---

### Task 4: Add tooltip helper functions

**Files:**
- Modify: `game.js` (append block at the end of file, BEFORE the `renderStartMenu();` final line — use the last section before init wiring)

- [ ] **Step 1: Add the helper block**

We will append a new section just BEFORE the `// Wire button clicks` comment (around line 2301). Locate this block:

```js
// Wire button clicks
for (const key of ['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross']) {
  itemButtons[key].addEventListener('click', () => onItemButtonClick(key));
}
```

Immediately ABOVE that block (add a blank line separator), insert:

```js
// ============================================================
// ITEM TOOLTIPS
// ============================================================

const tooltipEl = document.getElementById('tooltip');
const TOOLTIP_HOVER_DELAY_MS = 300;
const TOOLTIP_LONG_PRESS_MS = 400;
const TOOLTIP_MOVE_THRESHOLD = 8;
const TOOLTIP_GAP = 8;

let tooltipTimer = null;
let tooltipShownFor = null; // element currently showing tooltip, or null

function hideTooltip() {
  if (tooltipTimer) {
    clearTimeout(tooltipTimer);
    tooltipTimer = null;
  }
  tooltipEl.classList.add('hidden');
  tooltipEl.classList.remove('tooltip-below');
  tooltipEl.style.setProperty('--tooltip-tail-x', '50%');
  tooltipShownFor = null;
}

function showTooltip(triggerEl, itemKey) {
  const data = ITEM_TOOLTIPS[itemKey];
  if (!data) return;
  tooltipEl.innerHTML =
    '<div class="tooltip-name">' + data.name + '</div>' +
    '<div class="tooltip-desc">' + data.desc + '</div>' +
    '<div class="tooltip-howto">' + data.howto + '</div>';
  tooltipEl.classList.remove('hidden');
  tooltipEl.classList.remove('tooltip-below');
  positionTooltip(triggerEl);
  tooltipShownFor = triggerEl;
}

function positionTooltip(triggerEl) {
  const trigRect = triggerEl.getBoundingClientRect();
  const tipRect = tooltipEl.getBoundingClientRect();
  const vw = window.innerWidth;

  // Preferred: above trigger
  let top = trigRect.top - tipRect.height - TOOLTIP_GAP;
  let flipBelow = false;
  if (top < TOOLTIP_GAP) {
    top = trigRect.bottom + TOOLTIP_GAP;
    flipBelow = true;
  }

  // Horizontal center on trigger, clamped to viewport
  const trigCenterX = trigRect.left + trigRect.width / 2;
  const preferredLeft = trigCenterX - tipRect.width / 2;
  const clampedLeft = Math.max(
    TOOLTIP_GAP,
    Math.min(preferredLeft, vw - tipRect.width - TOOLTIP_GAP)
  );

  // Tail stays centered on the trigger, even if tooltip is clamped
  const tailX = trigCenterX - clampedLeft;
  tooltipEl.style.setProperty('--tooltip-tail-x', tailX + 'px');

  tooltipEl.style.left = clampedLeft + 'px';
  tooltipEl.style.top = top + 'px';

  if (flipBelow) {
    tooltipEl.classList.add('tooltip-below');
  }
}

function attachTooltip(el, itemKey) {
  let startX = 0;
  let startY = 0;
  let pending = false;

  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (tooltipTimer) clearTimeout(tooltipTimer);
    tooltipTimer = setTimeout(() => {
      tooltipTimer = null;
      showTooltip(el, itemKey);
    }, TOOLTIP_HOVER_DELAY_MS);
  });

  el.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    hideTooltip();
  });

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    startX = e.clientX;
    startY = e.clientY;
    pending = true;
    if (tooltipTimer) clearTimeout(tooltipTimer);
    tooltipTimer = setTimeout(() => {
      tooltipTimer = null;
      if (!pending) return;
      el._suppressNextClick = true;
      showTooltip(el, itemKey);
    }, TOOLTIP_LONG_PRESS_MS);
  });

  el.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') return;
    if (!pending) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (dx * dx + dy * dy > TOOLTIP_MOVE_THRESHOLD * TOOLTIP_MOVE_THRESHOLD) {
      pending = false;
      if (tooltipTimer) {
        clearTimeout(tooltipTimer);
        tooltipTimer = null;
      }
    }
  });

  el.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') return;
    pending = false;
    if (tooltipTimer) {
      clearTimeout(tooltipTimer);
      tooltipTimer = null;
    }
    if (tooltipShownFor === el) hideTooltip();
  });

  el.addEventListener('pointercancel', (e) => {
    if (e.pointerType === 'mouse') return;
    pending = false;
    if (tooltipTimer) {
      clearTimeout(tooltipTimer);
      tooltipTimer = null;
    }
    if (tooltipShownFor === el) hideTooltip();
  });
}

window.addEventListener('scroll', hideTooltip, true);
window.addEventListener('resize', hideTooltip);
```

- [ ] **Step 2: Verify no syntax errors and helpers exist**

Hard-reload `http://localhost:3000/`. Open DevTools console.
Expected: no errors. Run in console:

```js
typeof attachTooltip  // "function"
typeof showTooltip    // "function"
typeof hideTooltip    // "function"
```

All three should return `"function"`.

- [ ] **Step 3: Manually invoke showTooltip on a known element**

With the start menu visible, click "New Run" to start a run (item bar appears). Then in DevTools console:

```js
showTooltip(document.getElementById('item-potion'), 'potion');
```

Expected: the tooltip appears above the Potion button showing "Potion" / "Restore 1 ❤️." / "Tap to use instantly." Then:

```js
hideTooltip();
```

Tooltip disappears.

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "feat: add tooltip helper functions (show/hide/position/attach)"
```

---

### Task 5: Wire tooltips onto the six item-bar buttons

**Files:**
- Modify: `game.js` (the `// Wire button clicks` block around line 2301)

- [ ] **Step 1: Add attachTooltip call inside the existing loop**

Find this block near the end of `game.js`:

```js
// Wire button clicks
for (const key of ['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross']) {
  itemButtons[key].addEventListener('click', () => onItemButtonClick(key));
}
```

Replace with:

```js
// Wire button clicks and tooltips
for (const key of ['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross']) {
  itemButtons[key].addEventListener('click', () => onItemButtonClick(key));
  attachTooltip(itemButtons[key], key);
}
```

- [ ] **Step 2: Verify desktop hover**

Hard-reload `http://localhost:3000/`. Click "New Run". Hover the 🍺 Potion button with the mouse.
Expected: after 300ms, tooltip appears above the button with the right text. Mouse leave → tooltip disappears.

Sweep the cursor quickly across all 6 buttons without pausing.
Expected: no tooltips flash (the 300ms delay absorbs the sweep).

- [ ] **Step 3: Verify desktop click still works**

With no tooltip visible, click 🍺 Potion.
Expected: if HP is below max, potion is consumed and HP increases. If HP is at max, nothing (as today).

Click ⛏️ Pickaxe.
Expected: pickaxe enters targeting mode (button gets yellow active border, cursor in grid changes). Click it again → exits targeting.

- [ ] **Step 4: Verify mobile long-press (DevTools emulation)**

Open DevTools → Toggle Device Toolbar → select iPhone 12 Pro (or any mobile device). Hard-reload the page to pick up pointer type change. Click "New Run".

Long-press 🍺 Potion (hold for ~500ms).
Expected: tooltip appears at 400ms. Release → tooltip disappears. Potion count does NOT decrease (long-press was inspect-only).

Check HP indicator before/after to confirm no heal occurred.

- [ ] **Step 5: Verify mobile short tap still uses item**

Still in device emulation mode, short-tap 🍺 Potion.
Expected: potion consumed if HP below max, same as today.

Short-tap ⛏️ Pickaxe.
Expected: targeting mode activates.

- [ ] **Step 6: Verify mobile movement cancels**

Long-press 🍺 Potion but drag the pointer more than 8px before 400ms elapses.
Expected: no tooltip, no item use.

- [ ] **Step 7: Commit**

```bash
git add game.js
git commit -m "feat: attach tooltips to the 6 item-bar buttons"
```

---

### Task 6: Suppress click on item-bar buttons after long-press

**Files:**
- Modify: `game.js` (the `onItemButtonClick` function, around line 1947)

- [ ] **Step 1: Add the suppression check at the top of onItemButtonClick**

Find `onItemButtonClick` in `game.js`:

```js
function onItemButtonClick(itemKey) {
  if (state.gameOver || state.busy) return;
  if (state.items[itemKey] <= 0) return;

  if (itemKey === 'potion') {
```

Add a new line at the very top of the function body:

```js
function onItemButtonClick(itemKey) {
  const btn = itemButtons[itemKey];
  if (btn && btn._suppressNextClick) {
    btn._suppressNextClick = false;
    return;
  }
  if (state.gameOver || state.busy) return;
  if (state.items[itemKey] <= 0) return;

  if (itemKey === 'potion') {
```

- [ ] **Step 2: Verify mobile long-press does not use item**

Hard-reload in mobile-emulation mode. Click "New Run". Note current potion count in the HUD.

Long-press 🍺 Potion for ~500ms.
Expected: tooltip shows, then hides on release. Potion count unchanged. HP unchanged.

Short-tap 🍺 Potion.
Expected: potion consumed normally.

Repeat for ⛏️ Pickaxe:
- Long-press → tooltip shows, release → targeting mode did NOT activate
- Short-tap → targeting activates normally

- [ ] **Step 3: Verify desktop click path unaffected**

Switch off device emulation. Hard-reload. Click "New Run".
Hover 🍺 Potion (tooltip shows after 300ms), move mouse away (tooltip hides), then click 🍺 Potion.
Expected: potion consumed normally. Flag was never set on desktop, so the suppression branch does not fire.

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "feat: suppress item-button click after long-press inspect"
```

---

### Task 7: Attach tooltips to merchant shop slots

**Files:**
- Modify: `game.js` (end of `showShopOverlay` function, around lines 702-713)

- [ ] **Step 1: Inspect the current showShopOverlay tail**

Open `game.js` and find the end of `showShopOverlay` (around line 704-713):

```js
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

- [ ] **Step 2: Add tooltip wiring after the showOverlay call**

Replace the tail of the function to add a loop after `showOverlay(...)`:

```js
  showOverlay(`
    <h2>🧙 Merchant</h2>
    <p>💰 Gold: ${state.gold} · Stash: ${state.stashGold}</p>
    <div class="shop-slots">${slotsHtml}</div>
    <div class="shop-actions">
      <button onclick="rerollMerchant()" ${canAffordReroll ? '' : 'disabled'}>🎲 Reroll (${rerollCost}g)</button>
      <button onclick="leaveShop()">Leave</button>
    </div>
  `);

  // Wire tooltips onto each shop slot (slots re-render per buy/reroll).
  const slotEls = document.querySelectorAll('#overlay-content .shop-slot');
  state.merchant.stock.forEach((slot, idx) => {
    const el = slotEls[idx];
    if (!el) return;
    el.dataset.slotIdx = idx;
    attachTooltip(el, slot.type);
  });
}
```

- [ ] **Step 3: Verify desktop hover on shop slots**

Hard-reload (non-emulation). Click "New Run" and play until a merchant spawns — or, for faster testing, in DevTools console with a run in progress force a merchant visit:

```js
// Quick merchant-force: set up a merchant with stock and show the overlay
state.merchant = { stock: rollMerchantStock(), rerollCount: 0 };
showShopOverlay();
```

Expected: merchant overlay shows 10 slots. Hover any slot → after 300ms, tooltip appears with that item's name/desc/howto.

Sweep across multiple slots → no flashes.

- [ ] **Step 4: Verify desktop Buy still works**

With shop overlay open, hover a slot (tooltip shows), move mouse away (tooltip hides), click the Buy button in that slot.
Expected: purchase fires as today. Shop re-renders with the slot marked sold.

Hover the now-sold slot → tooltip still shows (sold state doesn't affect tooltip).

- [ ] **Step 5: Verify mobile long-press on shop slot**

Enable device emulation, reload, trigger shop again:

```js
state.merchant = { stock: rollMerchantStock(), rerollCount: 0 };
showShopOverlay();
```

Long-press any slot (on the slot body, not the Buy button specifically). Expected: tooltip appears at 400ms. Release → tooltip hides. Gold/stash unchanged.

Long-press directly on the "Buy" button inside a slot. Expected: tooltip shows for that slot; release does NOT purchase.

Short-tap the Buy button. Expected: purchase fires normally.

- [ ] **Step 6: Verify reroll re-wires tooltips**

With shop open and enough gold, click Reroll.
Expected: shop re-renders with new stock. Hover a new slot → tooltip works (this confirms attachTooltip runs on each render).

- [ ] **Step 7: Commit**

```bash
git add game.js
git commit -m "feat: attach tooltips to merchant shop slots"
```

---

### Task 8: Suppress Buy click after long-press on shop slots

**Files:**
- Modify: `game.js` (the `buyFromMerchant` function, around line 715)

- [ ] **Step 1: Add the suppression check at the top of buyFromMerchant**

Find `buyFromMerchant` in `game.js`:

```js
function buyFromMerchant(idx) {
  if (!state.merchant) return;
  const slot = state.merchant.stock[idx];
  if (!slot || slot.sold) return;
  const totalGold = state.gold + state.stashGold;
  if (totalGold < slot.price) return;
```

Replace with:

```js
function buyFromMerchant(idx) {
  const slotEl = document.querySelectorAll('#overlay-content .shop-slot')[idx];
  if (slotEl && slotEl._suppressNextClick) {
    slotEl._suppressNextClick = false;
    return;
  }
  if (!state.merchant) return;
  const slot = state.merchant.stock[idx];
  if (!slot || slot.sold) return;
  const totalGold = state.gold + state.stashGold;
  if (totalGold < slot.price) return;
```

- [ ] **Step 2: Verify mobile long-press does not purchase**

Device emulation on. Reload. Start a run, force the shop:

```js
state.merchant = { stock: rollMerchantStock(), rerollCount: 0 };
showShopOverlay();
```

Note gold / stash totals. Long-press the Buy button of an affordable slot for ~500ms.
Expected: tooltip shows. Release → NO purchase. Gold unchanged. Slot not marked sold.

Short-tap the Buy button.
Expected: purchase fires normally. Gold decreases. Slot sold.

- [ ] **Step 3: Verify desktop click path unaffected**

Switch off device emulation, reload, force shop again. Click any affordable Buy button.
Expected: purchase fires. The flag was never set on desktop.

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "feat: suppress shop Buy click after long-press inspect"
```

---

### Task 9: End-to-end smoke test and edge-case sweep

**Files:** none (verification only)

- [ ] **Step 1: Desktop full sweep**

Start a run (or continue). For each of the 6 items in the item bar, hover and confirm the right tooltip appears with correct name, description, and how-to. Confirm short hovers (<300ms) never show a tooltip.

Resize the browser very narrow (~360px wide). Hover the leftmost item → tooltip clamps to the left edge with tail still on the trigger. Same for rightmost.

Scroll something (if possible) or press a key that scrolls. Tooltip hides on scroll.

- [ ] **Step 2: Mobile full sweep (device emulation)**

For each of the 6 item-bar buttons, long-press and confirm tooltip shows, release does not use the item. Short-tap uses item correctly.

Force merchant:

```js
state.merchant = { stock: rollMerchantStock(), rerollCount: 0 };
showShopOverlay();
```

For each of the 10 slots (hit a variety of item types), long-press → tooltip; release → no buy. Short-tap Buy → purchase.

Horizontal-scroll the item bar (if it overflows in emulation). Long-press while starting the scroll → tooltip should NOT fire (the 8px move threshold catches it).

- [ ] **Step 3: Targeting mode compatibility**

Start a run. Acquire or confirm pickaxe count > 0. Short-tap ⛏️ Pickaxe to enter targeting.
Now hover the pickaxe button (desktop) or long-press it (mobile emulation).
Expected: tooltip still shows. Targeting mode is still active (click Pickaxe again to exit or tap a wall to use).

- [ ] **Step 4: Real-device test**

If a real phone is available, deploy (or access the local dev server via LAN IP) and repeat Step 2 on the device. Confirm timings feel right and Android Chrome / iOS Safari both behave.

- [ ] **Step 5: If no issues found, commit nothing (verification only)**

If any task in this sweep reveals a bug, fix it inline, commit that fix with a descriptive message, and re-run the affected subsection.

---

## Self-review checklist

**Spec coverage:**
- Desktop 300ms hover delay — Task 4 (constant), Task 5 (wiring)
- Mobile 400ms long-press — Task 4 (constant), Task 5 (wiring)
- 8px movement threshold — Task 4
- `pointercancel` handling — Task 4
- Scroll/resize hides tooltip — Task 4 (global listeners)
- Click suppression for item bar — Task 6
- Click suppression for shop — Task 8
- Positioning with flip + clamp — Task 4 (positionTooltip)
- Tail centered on trigger — Task 4 (`--tooltip-tail-x` CSS var)
- Shop re-render re-wires — Task 7 (call inside showShopOverlay)
- Pickaxe targeting compatibility — Task 9 Step 3
- Tooltip z-index above overlay — Task 2 (z-index: 1000 vs #overlay's z-index: 10)

**Placeholder scan:** none found. Every code step shows full code. Every verification step gives exact commands and expected output.

**Type consistency:** `attachTooltip(el, itemKey)`, `showTooltip(triggerEl, itemKey)`, `hideTooltip()`, `positionTooltip(triggerEl)` used consistently across tasks. `_suppressNextClick` used consistently on both `itemButtons[key]` and `.shop-slot` elements. `tooltipShownFor` is the only shared state and is only assigned in `showTooltip` / cleared in `hideTooltip`.

**Scope check:** single feature, single session plan. No independent subsystems.
