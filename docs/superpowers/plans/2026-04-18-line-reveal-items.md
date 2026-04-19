# Line-Reveal Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three line-reveal items (Row Scan, Column Scan, Cross Scan) to Mining Crawler. Each reveals cells along a shape centered on the player, stopping at walls, detonating gas harmlessly along the way. Extends the existing starter-stash + map-drops + merchant acquisition pattern.

**Architecture:** All changes live in `game.js`, `index.html`, `style.css` — no new files. The three new items reuse the instant-use pattern already in place for Scanner: button click → guard-and-has-target check → decrement count → walk the shape from the player outward → play SFX + render. A shared `walkRay(r, c, dR, dC, cb)` helper deduplicates the directional loops. State extends to 6 item keys with back-compat guard on save load.

**Tech Stack:** Plain HTML/CSS/JS, no build tooling, no test framework. Run via `npx serve . -l 3000` and open `http://localhost:3000` (Web Audio API breaks on `file://`).

**Reference spec:** `docs/superpowers/specs/2026-04-18-line-reveal-items-design.md`

**Note on TDD:** Project has no test runner. Each task ends with a manual browser-verification step — keep changes small and commit frequently. Line numbers in "Files" refer to the file state at the start of that task; shifts from prior tasks will move them.

---

## Task 1: Extend state with new item keys

**Files:**
- Modify: `game.js:8-27` (the `state` object)

- [ ] **Step 1: Add row/column/cross keys to state.items**

Replace the `items` line in the `state` object declaration (currently at `game.js:23`):

```javascript
  items: { potion: 0, scanner: 0, pickaxe: 0 },
```

with:

```javascript
  items: { potion: 0, scanner: 0, pickaxe: 0, row: 0, column: 0, cross: 0 },
```

- [ ] **Step 2: Start the local server and verify no JS errors**

Run (from project root, new terminal):

```bash
npx serve . -l 3000
```

Open `http://localhost:3000` in a browser. Verify:
- Game loads to start screen.
- Browser console (F12) shows no errors.

(Leave the server running for subsequent tasks.)

- [ ] **Step 3: Commit**

```bash
git add game.js
git commit -m "feat: extend state.items with row/column/cross keys"
```

---

## Task 2: Seed new item keys in starter stash + save/load

**Files:**
- Modify: `game.js` — `startGame()` function (currently ~`game.js:1535`)
- Modify: `game.js` — `resumeGame()` function (currently ~`game.js:1549`)

- [ ] **Step 1: Update starter stash in startGame**

Find this line in `startGame()`:

```javascript
  state.items = { potion: 1, scanner: 1, pickaxe: 1 };
```

Replace with:

```javascript
  state.items = { potion: 1, scanner: 1, pickaxe: 1, row: 1, column: 1, cross: 1 };
```

- [ ] **Step 2: Add back-compat guard in resumeGame**

Find this line in `resumeGame()`:

```javascript
  state.items = { ...save.items };
```

Replace with:

```javascript
  state.items = { ...save.items };
  // Back-compat: saves from before line-reveal items lack these keys.
  state.items.row = state.items.row ?? 0;
  state.items.column = state.items.column ?? 0;
  state.items.cross = state.items.cross ?? 0;
```

- [ ] **Step 3: Browser-verify starter stash**

Refresh `http://localhost:3000`. In the start screen, click "New Run" (not Continue, if it exists). Open the console and run:

```javascript
state.items
```

Expected: `{ potion: 1, scanner: 1, pickaxe: 1, row: 1, column: 1, cross: 1 }`.

- [ ] **Step 4: Browser-verify save back-compat**

In the console, simulate an old save and resume:

```javascript
localStorage.setItem('miningCrawler.runState', JSON.stringify({
  level: 2,
  stashGold: 50,
  items: { potion: 1, scanner: 1, pickaxe: 1 },
  levelsSinceMerchant: 0
}));
location.reload();
```

After reload, click Continue. Then in the console:

```javascript
state.items
```

Expected: `{ potion: 1, scanner: 1, pickaxe: 1, row: 0, column: 0, cross: 0 }` (old keys preserved, new keys defaulted to 0).

- [ ] **Step 5: Commit**

```bash
git add game.js
git commit -m "feat: seed new items in starter stash and guard save back-compat"
```

---

## Task 3: Add ray-walking helper

**Files:**
- Modify: `game.js` — add helper near `detonateGas` (currently `game.js:1088`)

- [ ] **Step 1: Add walkRay helper**

Insert this helper immediately BEFORE the `detonateGas` function (search for `function detonateGas`). The helper walks from a starting cell in a fixed direction, invoking a callback for each cell, and stops at walls or grid edges. It does NOT include the starting cell.

```javascript
// Walk from (startR, startC) stepping (dR, dC) each iteration. Skips the
// starting cell (callback fires on each subsequent cell). Stops at the
// first wall or grid boundary. The callback receives (r, c) — return true
// to continue, false to halt (e.g., to stop after a specific event).
function walkRay(startR, startC, dR, dC, callback) {
  let r = startR + dR;
  let c = startC + dC;
  while (r >= 0 && r < state.rows && c >= 0 && c < state.cols) {
    if (state.grid[r][c].type === 'wall') return;
    const keepGoing = callback(r, c);
    if (keepGoing === false) return;
    r += dR;
    c += dC;
  }
}
```

- [ ] **Step 2: Browser-verify helper exists**

Refresh the page. In the console:

```javascript
typeof walkRay
```

Expected: `'function'`.

Then walk east from (0, 0) on a fresh level and count cells visited:

```javascript
let count = 0;
walkRay(0, 0, 0, 1, (r, c) => { count++; });
count
```

Expected: a non-negative integer ≤ `state.cols - 1` (stops at first wall or east edge).

- [ ] **Step 3: Commit**

```bash
git add game.js
git commit -m "feat: add walkRay helper for line reveals"
```

---

## Task 4: Add has-target checks for row, column, cross

**Files:**
- Modify: `game.js` — add after `scannerHasTarget` (currently ~`game.js:1625`)

- [ ] **Step 1: Add rowHasTarget, columnHasTarget, crossHasTarget**

Insert these three functions immediately AFTER `scannerHasTarget` (search for `function scannerHasTarget`, insert after its closing `}`). Each walks its shape from the player and returns true if any unrevealed non-wall cell is reachable.

```javascript
// True if the player's row contains at least one unrevealed, non-wall cell
// within wall-bounded range on either side.
function rowHasTarget() {
  const pr = state.playerRow;
  const pc = state.playerCol;
  let found = false;
  const check = (r, c) => {
    if (!state.revealed[r][c]) found = true;
  };
  walkRay(pr, pc, 0, -1, check);
  walkRay(pr, pc, 0, 1, check);
  return found;
}

// True if the player's column contains at least one unrevealed, non-wall
// cell within wall-bounded range up or down.
function columnHasTarget() {
  const pr = state.playerRow;
  const pc = state.playerCol;
  let found = false;
  const check = (r, c) => {
    if (!state.revealed[r][c]) found = true;
  };
  walkRay(pr, pc, -1, 0, check);
  walkRay(pr, pc, 1, 0, check);
  return found;
}

// True if any of the four diagonal rays from the player contains at least
// one unrevealed, non-wall cell within wall-bounded range.
function crossHasTarget() {
  const pr = state.playerRow;
  const pc = state.playerCol;
  let found = false;
  const check = (r, c) => {
    if (!state.revealed[r][c]) found = true;
  };
  walkRay(pr, pc, -1, -1, check);
  walkRay(pr, pc, -1, 1, check);
  walkRay(pr, pc, 1, -1, check);
  walkRay(pr, pc, 1, 1, check);
  return found;
}
```

- [ ] **Step 2: Browser-verify has-target checks**

Refresh the page, click New Run. In the console:

```javascript
rowHasTarget()
columnHasTarget()
crossHasTarget()
```

Expected: likely all three return `true` since the start area is a 3×3 reveal surrounded by unrevealed cells.

- [ ] **Step 3: Commit**

```bash
git add game.js
git commit -m "feat: add row/column/cross has-target checks"
```

---

## Task 5: Add useItemRow, useItemColumn, useItemCross

**Files:**
- Modify: `game.js` — add after `useItemScanner` (currently ~`game.js:1644`)

- [ ] **Step 1: Add the three usage functions**

Insert these three functions immediately AFTER `useItemScanner` (search for `function useItemScanner`, insert after its closing `}` — just before the `// Cancel any active targeting mode on Escape.` comment). Each mirrors the scanner: guard, decrement, walk each ray applying reveal/detonate rules, then refresh UI.

```javascript
// Shared ray-reveal loop used by row/column/cross. For each cell along the
// ray: if gas, detonate and mark revealed; otherwise call revealCell
// (which handles cascade + pickup logic). Walls were already filtered by
// walkRay itself.
function revealAlongRay(startR, startC, dR, dC) {
  walkRay(startR, startC, dR, dC, (r, c) => {
    if (state.revealed[r][c]) return true;
    const cell = state.grid[r][c];
    if (cell.type === 'gas') {
      detonateGas(r, c);
      state.revealed[r][c] = true;
    } else {
      revealCell(r, c);
    }
    return true;
  });
}

// Reveal the player's row — two rays (west, east), stop at walls, gas
// detonates harmlessly, empty cells may cascade via revealCell.
function useItemRow() {
  if (state.items.row <= 0) return;
  if (!rowHasTarget()) return;
  state.items.row--;
  const pr = state.playerRow;
  const pc = state.playerCol;
  revealAlongRay(pr, pc, 0, -1);
  revealAlongRay(pr, pc, 0, 1);
  playSfx('scan');
  updateHud();
  updateItemBar();
  renderGrid();
}

// Reveal the player's column — two rays (north, south), stop at walls.
function useItemColumn() {
  if (state.items.column <= 0) return;
  if (!columnHasTarget()) return;
  state.items.column--;
  const pr = state.playerRow;
  const pc = state.playerCol;
  revealAlongRay(pr, pc, -1, 0);
  revealAlongRay(pr, pc, 1, 0);
  playSfx('scan');
  updateHud();
  updateItemBar();
  renderGrid();
}

// Reveal the four diagonals from the player — four rays, stop at walls.
function useItemCross() {
  if (state.items.cross <= 0) return;
  if (!crossHasTarget()) return;
  state.items.cross--;
  const pr = state.playerRow;
  const pc = state.playerCol;
  revealAlongRay(pr, pc, -1, -1);
  revealAlongRay(pr, pc, -1, 1);
  revealAlongRay(pr, pc, 1, -1);
  revealAlongRay(pr, pc, 1, 1);
  playSfx('scan');
  updateHud();
  updateItemBar();
  renderGrid();
}
```

- [ ] **Step 2: Browser-verify row reveal from console**

Refresh, click New Run. Confirm player is at a corner (row 0 or near). In the console:

```javascript
useItemRow()
```

Expected: row of cells where the player stands gets revealed left and right until a wall. Row item count drops to 0. `state.items.row` is `0`. If any gas cells were in the row, they show the red ✖ detonated marker.

- [ ] **Step 3: Browser-verify column reveal**

Still in the console (same page, no refresh needed):

```javascript
useItemColumn()
```

Expected: player's column reveals up and down until a wall. `state.items.column` is `0`.

- [ ] **Step 4: Browser-verify cross reveal**

```javascript
useItemCross()
```

Expected: four diagonal rays reveal, each stopping at a wall. `state.items.cross` is `0`.

- [ ] **Step 5: Commit**

```bash
git add game.js
git commit -m "feat: add useItemRow/Column/Cross line-reveal functions"
```

---

## Task 6: Add item bar buttons in HTML

**Files:**
- Modify: `index.html:30-43` (the `#item-bar` div)

- [ ] **Step 1: Append three new buttons to the item bar**

The current `#item-bar` block is:

```html
  <div id="item-bar">
    <button class="item-btn" id="item-potion" data-item="potion">
      <span class="item-icon">🍺</span>
      <span class="item-count" id="item-potion-count">0</span>
    </button>
    <button class="item-btn" id="item-scanner" data-item="scanner">
      <span class="item-icon">🔍</span>
      <span class="item-count" id="item-scanner-count">0</span>
    </button>
    <button class="item-btn" id="item-pickaxe" data-item="pickaxe">
      <span class="item-icon">⛏️</span>
      <span class="item-count" id="item-pickaxe-count">0</span>
    </button>
  </div>
```

Replace with (three new buttons appended):

```html
  <div id="item-bar">
    <button class="item-btn" id="item-potion" data-item="potion">
      <span class="item-icon">🍺</span>
      <span class="item-count" id="item-potion-count">0</span>
    </button>
    <button class="item-btn" id="item-scanner" data-item="scanner">
      <span class="item-icon">🔍</span>
      <span class="item-count" id="item-scanner-count">0</span>
    </button>
    <button class="item-btn" id="item-pickaxe" data-item="pickaxe">
      <span class="item-icon">⛏️</span>
      <span class="item-count" id="item-pickaxe-count">0</span>
    </button>
    <button class="item-btn" id="item-row" data-item="row">
      <span class="item-icon">↔️</span>
      <span class="item-count" id="item-row-count">0</span>
    </button>
    <button class="item-btn" id="item-column" data-item="column">
      <span class="item-icon">↕️</span>
      <span class="item-count" id="item-column-count">0</span>
    </button>
    <button class="item-btn" id="item-cross" data-item="cross">
      <span class="item-icon">✖️</span>
      <span class="item-count" id="item-cross-count">0</span>
    </button>
  </div>
```

- [ ] **Step 2: Browser-verify buttons render**

Refresh the page. In the start screen, click New Run. Expected: six buttons in the item bar (🍺 🔍 ⛏️ ↔️ ↕️ ✖️), each showing `1` as the count. Buttons may overflow horizontally on narrow viewports — that's acceptable for now.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add row/column/cross buttons to item bar"
```

---

## Task 7: Wire up itemButtons/itemCounts refs and click handlers

**Files:**
- Modify: `game.js:70-80` (itemButtons and itemCounts map literals)
- Modify: `game.js` — DOMContentLoaded or similar init that wires click handlers (search `onItemButtonClick` to find the current attach point)

- [ ] **Step 1: Extend itemButtons and itemCounts maps**

The current maps at `game.js:71-80` are:

```javascript
const itemButtons = {
  potion: document.getElementById('item-potion'),
  scanner: document.getElementById('item-scanner'),
  pickaxe: document.getElementById('item-pickaxe'),
};
const itemCounts = {
  potion: document.getElementById('item-potion-count'),
  scanner: document.getElementById('item-scanner-count'),
  pickaxe: document.getElementById('item-pickaxe-count'),
};
```

Replace with:

```javascript
const itemButtons = {
  potion: document.getElementById('item-potion'),
  scanner: document.getElementById('item-scanner'),
  pickaxe: document.getElementById('item-pickaxe'),
  row: document.getElementById('item-row'),
  column: document.getElementById('item-column'),
  cross: document.getElementById('item-cross'),
};
const itemCounts = {
  potion: document.getElementById('item-potion-count'),
  scanner: document.getElementById('item-scanner-count'),
  pickaxe: document.getElementById('item-pickaxe-count'),
  row: document.getElementById('item-row-count'),
  column: document.getElementById('item-column-count'),
  cross: document.getElementById('item-cross-count'),
};
```

- [ ] **Step 2: Find and inspect the click wiring**

Search `game.js` for where item buttons get click listeners. Look for a pattern like:

```javascript
for (const key of [...]) {
  itemButtons[key].addEventListener('click', () => onItemButtonClick(key));
}
```

or individual `addEventListener` calls on each button. Use Grep:

```
Grep: addEventListener.*click.*onItemButtonClick  (or just: onItemButtonClick)
```

If there's an iteration over keys, the keys list must include the new three. If there are individual `addEventListener` calls, add three more.

- [ ] **Step 3: Extend the click wiring**

**Case A — iteration over keys:** replace the loop's key array with `['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross']`.

**Case B — individual wiring:** add these three lines immediately after the pickaxe wiring:

```javascript
itemButtons.row.addEventListener('click', () => onItemButtonClick('row'));
itemButtons.column.addEventListener('click', () => onItemButtonClick('column'));
itemButtons.cross.addEventListener('click', () => onItemButtonClick('cross'));
```

- [ ] **Step 4: Browser-verify wiring**

Refresh the page, click New Run. In the console:

```javascript
itemButtons.row.click()
```

Expected: row reveals immediately (player's row opens up left+right to walls). Count on `↔️` drops to `0`. The button becomes disabled (greyed) after use — that's Task 8's work; for now just verify the click fires and the item is consumed.

- [ ] **Step 5: Commit**

```bash
git add game.js
git commit -m "feat: wire row/column/cross buttons to click handlers"
```

---

## Task 8: Extend updateItemBar + onItemButtonClick for new items

**Files:**
- Modify: `game.js` — `updateItemBar()` function (currently ~`game.js:464`)
- Modify: `game.js` — `onItemButtonClick()` function (currently ~`game.js:1590`)

- [ ] **Step 1: Extend updateItemBar key list and disabled checks**

The current `updateItemBar` is:

```javascript
function updateItemBar() {
  for (const key of ['potion', 'scanner', 'pickaxe']) {
    const count = state.items[key];
    itemCounts[key].textContent = count;

    const btn = itemButtons[key];
    let disabled = count === 0 || state.gameOver;
    if (key === 'potion' && state.hp >= MAX_HP) disabled = true;
    if (key === 'scanner' && !scannerHasTarget()) disabled = true;
    btn.disabled = disabled;

    btn.classList.toggle('active', state.activeItem === key);
  }
}
```

Replace with:

```javascript
function updateItemBar() {
  for (const key of ['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross']) {
    const count = state.items[key];
    itemCounts[key].textContent = count;

    const btn = itemButtons[key];
    let disabled = count === 0 || state.gameOver;
    if (key === 'potion' && state.hp >= MAX_HP) disabled = true;
    if (key === 'scanner' && !scannerHasTarget()) disabled = true;
    if (key === 'row' && !rowHasTarget()) disabled = true;
    if (key === 'column' && !columnHasTarget()) disabled = true;
    if (key === 'cross' && !crossHasTarget()) disabled = true;
    btn.disabled = disabled;

    btn.classList.toggle('active', state.activeItem === key);
  }
}
```

- [ ] **Step 2: Extend onItemButtonClick with three new instant-use branches**

The current `onItemButtonClick` is:

```javascript
function onItemButtonClick(itemKey) {
  if (state.gameOver || state.busy) return;
  if (state.items[itemKey] <= 0) return;

  if (itemKey === 'potion') {
    useItemPotion();
    return;
  }

  if (itemKey === 'scanner') {
    useItemScanner();
    return;
  }

  // Pickaxe: toggle targeting mode.
  if (state.activeItem === itemKey) {
    state.activeItem = null;
  } else {
    state.activeItem = itemKey;
  }
  updateItemBar();
  renderGrid();
}
```

Replace with:

```javascript
function onItemButtonClick(itemKey) {
  if (state.gameOver || state.busy) return;
  if (state.items[itemKey] <= 0) return;

  if (itemKey === 'potion') {
    useItemPotion();
    return;
  }

  if (itemKey === 'scanner') {
    useItemScanner();
    return;
  }

  if (itemKey === 'row') {
    useItemRow();
    return;
  }

  if (itemKey === 'column') {
    useItemColumn();
    return;
  }

  if (itemKey === 'cross') {
    useItemCross();
    return;
  }

  // Pickaxe: toggle targeting mode.
  if (state.activeItem === itemKey) {
    state.activeItem = null;
  } else {
    state.activeItem = itemKey;
  }
  updateItemBar();
  renderGrid();
}
```

- [ ] **Step 3: Browser-verify disabled states**

Refresh the page, click New Run. Expected:
- All six buttons show their counts (`1` each).
- All six are enabled initially.
- Click `↔️` (row). Row reveals. `↔️` button greys out (count = 0 AND no more row items; has-target check returns true briefly before count is 0, but the count-0 check disables it).
- Similarly for `↕️` and `✖️`.

- [ ] **Step 4: Browser-verify has-target disabling**

Playtest to walk the player into a dead-end alcove (3-walls-around), then observe the item bar. Expected: if all three rays of a shape are blocked, the corresponding button greys out.

Alternatively simulate via console:

```javascript
// Surround the player with walls in all 8 neighbors.
for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
  if (dr === 0 && dc === 0) continue;
  const r = state.playerRow + dr, c = state.playerCol + dc;
  if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) continue;
  state.grid[r][c].type = 'wall';
  state.revealed[r][c] = false;
}
renderGrid();
updateItemBar();
```

Expected: `↔️`, `↕️`, `✖️` all disabled; `🍺` still enabled (if not at max HP); `🔍` disabled; `⛏️` enabled (walls are valid pickaxe targets).

- [ ] **Step 5: Commit**

```bash
git add game.js
git commit -m "feat: integrate row/column/cross into updateItemBar and onItemButtonClick"
```

---

## Task 9: Extend map drops to include new items

**Files:**
- Modify: `game.js` — `placeItemDrops()` function (currently ~`game.js:929-957`)

- [ ] **Step 1: Extend itemTypes pool in placeItemDrops**

The current line inside `placeItemDrops()` is:

```javascript
  const itemTypes = ['potion', 'scanner', 'pickaxe'];
```

Replace with:

```javascript
  const itemTypes = ['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross'];
```

- [ ] **Step 2: Update PICKUP_EMOJI map**

Find the `PICKUP_EMOJI` map (currently `game.js:443`):

```javascript
const PICKUP_EMOJI = { potion: '🍺', scanner: '🔍', pickaxe: '⛏️' };
```

Replace with:

```javascript
const PICKUP_EMOJI = { potion: '🍺', scanner: '🔍', pickaxe: '⛏️', row: '↔️', column: '↕️', cross: '✖️' };
```

This ensures pickup floats show the right icon when the player steps on a new-item drop.

- [ ] **Step 3: Browser-verify map drops include new items**

Refresh, click New Run. In the console, inspect all item drops on the current level:

```javascript
(() => {
  const drops = [];
  for (let r = 0; r < state.rows; r++) for (let c = 0; c < state.cols; c++) {
    if (state.grid[r][c].item) drops.push({ r, c, item: state.grid[r][c].item });
  }
  return drops;
})()
```

Expected: 1 or 2 entries, `item` ∈ {potion, scanner, pickaxe, row, column, cross}. Playing multiple levels (use `nextLevel()` in console, or actually beat levels) should produce all 6 types across a sample.

- [ ] **Step 4: Browser-verify pickup icon for new drops**

In the console, force-place a row item next to the player, reveal it, and walk onto it:

```javascript
const pr = state.playerRow, pc = state.playerCol;
const target = { r: pr, c: pc + 1 };
// Make sure it's a plain empty cell.
state.grid[target.r][target.c].type = 'empty';
state.grid[target.r][target.c].goldValue = 0;
state.grid[target.r][target.c].item = 'row';
state.revealed[target.r][target.c] = true;
renderGrid();
// Now click that cell to walk onto it.
```

Expected: stepping onto the cell spawns a `↔️ +1` pickup float, and `state.items.row` increments.

- [ ] **Step 5: Commit**

```bash
git add game.js
git commit -m "feat: include row/column/cross in map drops and pickup icons"
```

---

## Task 10: Extend merchant stock + shop rendering

**Files:**
- Modify: `game.js` — `MERCHANT_PRICES` map + `rollMerchantStock()` (currently ~`game.js:664-675`)
- Modify: `game.js` — `showShopOverlay()` (currently ~`game.js:509-540`)

- [ ] **Step 1: Extend MERCHANT_PRICES**

The current line is:

```javascript
const MERCHANT_PRICES = { potion: 10, pickaxe: 15, scanner: 20 };
```

Replace with:

```javascript
const MERCHANT_PRICES = { potion: 10, pickaxe: 15, scanner: 20, row: 25, column: 25, cross: 30 };
```

- [ ] **Step 2: Extend rollMerchantStock item pool**

The current line inside `rollMerchantStock()` is:

```javascript
  const itemTypes = ['potion', 'scanner', 'pickaxe'];
```

Replace with:

```javascript
  const itemTypes = ['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross'];
```

- [ ] **Step 3: Extend shop icon/name maps in showShopOverlay**

Inside `showShopOverlay()`, find these two lines:

```javascript
  const itemEmoji = { potion: '🍺', pickaxe: '⛏️', scanner: '🔍' };
  const itemName = { potion: 'Potion', pickaxe: 'Pickaxe', scanner: 'Scanner' };
```

Replace with:

```javascript
  const itemEmoji = { potion: '🍺', pickaxe: '⛏️', scanner: '🔍', row: '↔️', column: '↕️', cross: '✖️' };
  const itemName = { potion: 'Potion', pickaxe: 'Pickaxe', scanner: 'Scanner', row: 'Row Scan', column: 'Column Scan', cross: 'Cross Scan' };
```

- [ ] **Step 4: Browser-verify merchant stock includes new items**

Refresh the page. Force a merchant on the next level (levels 3+ auto-spawn, or via console):

```javascript
state.levelsSinceMerchant = 2;
nextLevel();
```

Or: play until level 3+ and find the merchant. Walk onto the merchant cell. Inspect:

```javascript
state.merchant.stock
```

Expected: 2–3 entries, each `{ type, price, sold: false }`. Types may include any of the 6 items. Prices match the table (10/15/20/25/25/30).

The shop overlay should show the correct icon and name for new items. Buy a row scan to verify the purchase flow:

```javascript
state.gold = 100; // give yourself money for testing
buyFromMerchant(0); // assuming slot 0 is something new; otherwise try 1 or 2
```

Expected: gold decrements, `state.items[type]++` reflects correctly, slot shows "Sold out".

- [ ] **Step 5: Commit**

```bash
git add game.js
git commit -m "feat: add row/column/cross to merchant stock and pricing"
```

---

## Task 11: Update start-screen item summary text

**Files:**
- Modify: `game.js` — `showStartScreen()` function (currently ~`game.js:1486`)

- [ ] **Step 1: Update the Items line in the start-screen overlay**

Find this line in `showStartScreen()`:

```javascript
    <p>Items: 🍺 heal · 🔍 reveal the 3×3 around you safely · ⛏️ break a wall</p>
```

Replace with:

```javascript
    <p>Items: 🍺 heal · 🔍 scan 3×3 · ⛏️ break wall · ↔️ row · ↕️ column · ✖️ diagonals</p>
```

- [ ] **Step 2: Browser-verify start screen text**

Refresh, and on the start screen check that the new line reads:

```
Items: 🍺 heal · 🔍 scan 3×3 · ⛏️ break wall · ↔️ row · ↕️ column · ✖️ diagonals
```

- [ ] **Step 3: Commit**

```bash
git add game.js
git commit -m "docs: update start-screen item summary for line-reveal items"
```

---

## Task 12: Playtest end-to-end

**Files:** None (manual playtest only)

- [ ] **Step 1: Full-run playtest**

Refresh the page, click New Run. Goal: play 3–5 levels, using each of the 6 items at least once.

Checklist — mark pass/fail for each, report any failures:

- [ ] Start screen shows the new item summary line.
- [ ] Level 1 begins with `state.items = { potion:1, scanner:1, pickaxe:1, row:1, column:1, cross:1 }`.
- [ ] Clicking `↔️` reveals the player's row, stopping at walls on each side.
- [ ] Clicking `↕️` reveals the player's column, stopping at walls top and bottom.
- [ ] Clicking `✖️` reveals the four diagonals, each stopping at its first wall.
- [ ] Gas cells encountered along any ray detonate harmlessly (red ✖, no HP cost).
- [ ] Adjacency-0 cells revealed by a ray trigger cascade normally.
- [ ] Items along a ray: their icons become visible, but count doesn't increment (must step on to collect).
- [ ] Gold cells along a ray: visible, but not auto-collected.
- [ ] Walking onto a row/column/cross item drop spawns correct pickup float and increments count.
- [ ] Merchant (level 3 or pity-timed earlier) shows at least one new item type across a few playthroughs.
- [ ] Saving (complete a level) and reloading — row/column/cross counts persist.
- [ ] Start a New Run while an old save exists → starter stash resets to 1/1/1/1/1/1.
- [ ] Player fully boxed in by walls → all three new buttons greyed out.

- [ ] **Step 2: Save back-compat sanity check**

Open the browser console on the start screen:

```javascript
localStorage.setItem('miningCrawler.runState', JSON.stringify({
  level: 4,
  stashGold: 120,
  items: { potion: 2, scanner: 0, pickaxe: 1 },
  levelsSinceMerchant: 0
}));
location.reload();
```

Click Continue. Expected: starts Level 4 with `state.items = { potion: 2, scanner: 0, pickaxe: 1, row: 0, column: 0, cross: 0 }`. Item bar shows row/column/cross as `0` and disabled.

- [ ] **Step 3: No commit (playtest only)**

If the playtest surfaces bugs, fix them and commit those fixes. Otherwise no commit for this task.

---

## Self-Review Notes

**Spec coverage check:**
- ↔️ Row Scan, ↕️ Column Scan, ✖️ Cross Scan items — Tasks 4, 5.
- Instant-use, no targeting — Tasks 5, 8.
- Stop at walls, gas detonates harmlessly, empty cascades normally — Task 5 (`revealAlongRay`), relies on `walkRay` wall-stop from Task 3.
- Item icons NOT auto-collected from reveal — Task 5 uses `revealCell` which preserves the existing rule.
- Starter stash 1/1/1/1/1/1 — Task 2.
- Map drops uniform across 6 types — Task 9.
- Merchant pool + prices 25/25/30g — Task 10.
- Item bar with 6 buttons + disabled logic — Tasks 6, 7, 8.
- Save/load back-compat guard — Task 2.
- Shared `scan` SFX — Task 5 (reuses `playSfx('scan')`).
- Optional ray-walking helper — Task 3 (kept — dedupes code clearly).

**Placeholder scan:** No TBDs, no "implement later," no vague "add error handling." All code steps show the complete code block. Line-number references noted as shift-sensitive in the header.

**Type consistency:** Item keys `row`, `column`, `cross` consistent across state, maps (`itemButtons`, `itemCounts`, `PICKUP_EMOJI`, `MERCHANT_PRICES`, shop `itemEmoji`/`itemName`), usage functions, has-target functions, `updateItemBar` key list, `onItemButtonClick` branches. `walkRay` / `revealAlongRay` / `<shape>HasTarget` signatures consistent between Task 3 and their call sites in Tasks 4/5.
