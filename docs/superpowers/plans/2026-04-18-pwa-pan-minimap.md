# PWA + Pan/Minimap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the game comfortable to play on mobile by (a) turning it into an installable PWA that removes iOS Safari quirks, and (b) replacing the whole-board `transform: scale()` fit approach with a fixed-cell-size board that pans inside a viewport, with a minimap overlay for overview and fast-travel camera.

**Architecture:** PWA is additive config only — a manifest, icons, and a few `<head>` tags. The pan/minimap change wraps the existing `#board` in a new `#viewport` container with `overflow: hidden`. Board position is controlled by `transform: translate(panX, panY)`. A pointer state machine on the viewport arbitrates between tap (walk/dig), long-press (flag), and drag (pan). A `<canvas id="minimap">` sibling overlays the top-right; tapping it animates the pan to recenter. Cell size stays 40px (unchanged); `fitBoard()` is deleted. Auto-recenter keeps the player in view unless the user just manually panned.

**Tech Stack:** Plain HTML/CSS/JS, no build step. Pointer Events API, Canvas 2D, Web App Manifest, iOS-specific meta tags. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-18-pwa-pan-minimap-design.md`

---

## File Structure

**New files:**
- `manifest.json` — PWA manifest at project root.
- `assets/icon-192.png`, `assets/icon-512.png` — PWA icons referenced by manifest.
- `assets/apple-touch-icon.png` — iOS home-screen icon (180×180).

**Modified files:**
- `index.html` — head tags for PWA + viewport wrapper + minimap canvas.
- `style.css` — `#viewport` container, `#minimap` styles, remove `#board` margin hacks.
- `game.js` — delete `fitBoard()`, add pan state + pointer arbiter + minimap renderer + auto-recenter.

**Why keep `game.js` as one file:** the file is ~1500 lines but the game is solo/POC-stage and the codebase convention is single-file plain JS. Splitting modules now would require a build step (`type=module` or similar) and isn't warranted. New code goes into clearly-sectioned blocks with comment headers, matching existing style.

---

## Task 1: Create PWA manifest and icons

**Files:**
- Create: `manifest.json`
- Create: `assets/icon-192.png` (placeholder)
- Create: `assets/icon-512.png` (placeholder)
- Create: `assets/apple-touch-icon.png` (placeholder, 180×180)

- [ ] **Step 1: Create `manifest.json` at project root**

File: `manifest.json`

```json
{
  "name": "Mining Crawler",
  "short_name": "Mining",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#1a1a2e",
  "theme_color": "#1a1a2e",
  "icons": [
    { "src": "assets/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "assets/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Note: colors match the existing `body { background: #1a1a2e }` in `style.css` so the standalone launch color matches game chrome (spec said `#000000` as placeholder; matching existing palette is the correct choice).

- [ ] **Step 2: Generate placeholder icons**

Three PNG files, solid-color with a ⛏️ emoji centered. Easiest method: open a browser tab, run this in the JS console on any blank page, save the downloads.

```js
function makeIcon(size, filename) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, size, size);
  ctx.font = `${Math.floor(size * 0.6)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⛏️', size / 2, size / 2 + size * 0.05);
  const link = document.createElement('a');
  link.download = filename;
  link.href = c.toDataURL('image/png');
  link.click();
}
makeIcon(192, 'icon-192.png');
makeIcon(512, 'icon-512.png');
makeIcon(180, 'apple-touch-icon.png');
```

Move the downloaded files into `assets/`.

- [ ] **Step 3: Verify files exist**

Run: `ls assets/ | grep -E '(icon-(192|512)|apple-touch-icon)\.png'`
Expected: three filenames listed.

- [ ] **Step 4: Commit**

```bash
git add manifest.json assets/icon-192.png assets/icon-512.png assets/apple-touch-icon.png
git commit -m "feat: add PWA manifest and placeholder icons"
```

---

## Task 2: Wire PWA tags into index.html

**Files:**
- Modify: `index.html` (head section)

- [ ] **Step 1: Update viewport meta and add PWA head tags**

Replace the current `<meta name="viewport" ...>` line and add the new tags. The resulting `<head>` section should look like:

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no, viewport-fit=cover">
  <meta name="theme-color" content="#1a1a2e">
  <link rel="manifest" href="manifest.json">
  <link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Mining">
  <title>Mine Sweeper</title>
  <link rel="stylesheet" href="style.css">
</head>
```

- [ ] **Step 2: Serve and verify manifest is loaded**

Run: `npx serve . -l 3000`

In a browser: open `http://localhost:3000`, open DevTools → Application → Manifest. Expected: manifest loaded with name "Mining Crawler", display "standalone", icons visible.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add PWA meta tags and manifest link"
```

---

## Task 3: Add viewport/board wrapper in HTML and CSS

**Files:**
- Modify: `index.html` (body — wrap `#board` in `#viewport`, add `<canvas id="minimap">`)
- Modify: `style.css` (add `#viewport`, `#minimap` styles; remove `#board` `transform-origin`)

- [ ] **Step 1: Wrap `#board` in `#viewport` and add `<canvas id="minimap">` as a sibling**

Edit `index.html` body. Replace:

```html
  <div id="board">
    <div id="grid-container"></div>
    <div id="player-sprite">🙂</div>
  </div>
```

with:

```html
  <div id="play-area">
    <div id="viewport">
      <div id="board">
        <div id="grid-container"></div>
        <div id="player-sprite">🙂</div>
      </div>
    </div>
    <canvas id="minimap" width="100" height="100"></canvas>
  </div>
```

The minimap is a **sibling** of `#viewport` (not a child). Both live inside `#play-area` which is the positioning context. This keeps minimap clicks out of the viewport's pan arbiter.

- [ ] **Step 2: Add viewport and minimap CSS**

Append to `style.css`:

```css
#play-area {
  position: relative;
  width: 100vw;
  max-width: 100vw;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
}

#viewport {
  position: relative;
  overflow: hidden;
  flex: 1 1 auto;
  touch-action: none;
}

#viewport #board {
  position: absolute;
  top: 0;
  left: 0;
  padding: 16px;
  transform-origin: 0 0;
  will-change: transform;
}

#minimap {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 100px;
  height: 100px;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  z-index: 8;
  cursor: pointer;
}
```

- [ ] **Step 3: Remove the old `transform-origin` from `#board`**

Edit `style.css`. The existing `#board` block is:

```css
#board {
  position: relative;
  padding: 1rem;
  transform-origin: top center;
}
```

Replace with:

```css
#board {
  /* Positioning now comes from `#viewport #board` above. */
}
```

(Or delete the block entirely — the `#viewport #board` rule covers what's needed.)

- [ ] **Step 4: Serve and eyeball-check**

Run: `npx serve . -l 3000` (if not already running) and open `http://localhost:3000`. Start a new run.

Expected: game looks the same as before on desktop. Board may position slightly differently (absolute inside viewport), but cells, player, HUD, item bar all visible and interactive. Minimap canvas is a small dark square in the top-right of the viewport area, visible but empty (no rendering yet).

Note: the `flex: 1 1 auto` on `#viewport` means the viewport grows to fill remaining vertical space between HUD and item bar. Scrolling/panning is not yet wired, but clicking cells still works because the existing cell handlers are still attached.

- [ ] **Step 5: Commit**

```bash
git add index.html style.css
git commit -m "refactor: wrap board in viewport container, add minimap canvas"
```

---

## Task 4: Add pan state and translate helpers in game.js

**Files:**
- Modify: `game.js` (add pan state block after UI REFERENCES section ~line 80; add helpers)

- [ ] **Step 1: Move layout constants to the UI REFERENCES section**

The constants `CELL_SIZE`, `CELL_GAP`, `BOARD_PAD` currently live in the RENDERING section (game.js:222-224). Pan code will reference them, so move them earlier.

In game.js around line 222, find:

```js
const CELL_SIZE = 40;
const CELL_GAP = 2;
const BOARD_PAD = 16; // #board padding in px (1rem)

function fitBoard() {
```

Remove the three `const` lines (keep `fitBoard` for now — Task 5 deletes it).

Add them at the top of the UI REFERENCES section (right after `const itemCounts = {...}` around line 80):

```js
const CELL_SIZE = 40;
const CELL_GAP = 2;
const BOARD_PAD = 16;
```

- [ ] **Step 2: Add pan state + helpers**

Append after the constants added in Step 1, in a new section:

```js
// ============================================================
// VIEWPORT / PAN
// ============================================================

const viewportEl = document.getElementById('viewport');
const minimapEl = document.getElementById('minimap');

const pan = {
  x: 0,
  y: 0,
  lastManualPanAt: 0, // timestamp ms; auto-recenter skips within 2000ms of this
};

function getViewportSize() {
  return { w: viewportEl.clientWidth, h: viewportEl.clientHeight };
}

function getBoardSize() {
  const gridW = state.cols * (CELL_SIZE + CELL_GAP) - CELL_GAP;
  const gridH = state.rows * (CELL_SIZE + CELL_GAP) - CELL_GAP;
  return { w: gridW + BOARD_PAD * 2, h: gridH + BOARD_PAD * 2 };
}

function cellCenterPx(r, c) {
  return {
    x: BOARD_PAD + c * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2,
    y: BOARD_PAD + r * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2,
  };
}

function clampPan(x, y) {
  const { w: vw, h: vh } = getViewportSize();
  const { w: bw, h: bh } = getBoardSize();
  const overshootX = vw * 0.5;
  const overshootY = vh * 0.5;

  let clampedX, clampedY;
  if (bw >= vw) {
    clampedX = Math.max(vw - bw - overshootX, Math.min(overshootX, x));
  } else {
    clampedX = (vw - bw) / 2;
  }
  if (bh >= vh) {
    clampedY = Math.max(vh - bh - overshootY, Math.min(overshootY, y));
  } else {
    clampedY = (vh - bh) / 2;
  }
  return { x: clampedX, y: clampedY };
}

function applyPan() {
  board.style.transform = `translate(${pan.x}px, ${pan.y}px)`;
}

function setPan(x, y) {
  const clamped = clampPan(x, y);
  pan.x = clamped.x;
  pan.y = clamped.y;
  applyPan();
}

// Animate pan from current position to (targetX, targetY) over durationMs.
let panAnimId = 0;
function animatePanTo(targetX, targetY, durationMs = 200) {
  const clamped = clampPan(targetX, targetY);
  const startX = pan.x;
  const startY = pan.y;
  const dx = clamped.x - startX;
  const dy = clamped.y - startY;
  const startTime = performance.now();
  const myId = ++panAnimId;

  function step(now) {
    if (myId !== panAnimId) return; // cancelled by newer animation
    const t = Math.min(1, (now - startTime) / durationMs);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
    pan.x = startX + dx * eased;
    pan.y = startY + dy * eased;
    applyPan();
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// Center main viewport on a specific board (row, col), animated.
function centerOnCell(r, c, durationMs = 200) {
  const { w: vw, h: vh } = getViewportSize();
  const cc = cellCenterPx(r, c);
  animatePanTo(vw / 2 - cc.x, vh / 2 - cc.y, durationMs);
}

function isCellOutsideCenterRect(r, c) {
  const { w: vw, h: vh } = getViewportSize();
  const cc = cellCenterPx(r, c);
  const screenX = cc.x + pan.x;
  const screenY = cc.y + pan.y;
  return (
    screenX < vw * 0.2 || screenX > vw * 0.8 ||
    screenY < vh * 0.2 || screenY > vh * 0.8
  );
}

function autoRecenterOnPlayer() {
  // Honor manual scouting: skip if user panned within the last 2s.
  if (performance.now() - pan.lastManualPanAt < 2000) return;
  if (isCellOutsideCenterRect(state.playerRow, state.playerCol)) {
    centerOnCell(state.playerRow, state.playerCol, 200);
  }
}
```

- [ ] **Step 3: Add a `renderMinimap` stub (replaced in Task 7)**

Append to the same section (before the resize listener in Step 4):

```js
// Stub replaced in Task 7 with full implementation.
function renderMinimap() { /* no-op until Task 7 */ }
```

- [ ] **Step 4: Add window resize listener to re-clamp pan**

Append to the same section:

```js
window.addEventListener('resize', () => {
  setPan(pan.x, pan.y); // re-clamp under new viewport size
  renderMinimap();
});
```

- [ ] **Step 5: Verify no runtime errors**

Reload the page. Open the browser console.

Expected: no errors. Board still renders and is interactive (cell click handlers are still attached to cells from `renderGrid`).

- [ ] **Step 6: Commit**

```bash
git add game.js
git commit -m "feat: add pan state, clamp, and animate helpers"
```

---

## Task 5: Delete `fitBoard()` and wire pan to render

**Files:**
- Modify: `game.js` (delete `fitBoard` fn; remove `fitBoard()` call in `renderGrid`)

- [ ] **Step 1: Delete `fitBoard()`**

(The `CELL_SIZE`/`CELL_GAP`/`BOARD_PAD` constants were moved to UI REFERENCES in Task 4 Step 1.)

Find the remaining `fitBoard` block:

```js
function fitBoard() {
  const gridW = state.cols * (CELL_SIZE + CELL_GAP) - CELL_GAP;
  const gridH = state.rows * (CELL_SIZE + CELL_GAP) - CELL_GAP;
  const boardW = gridW + BOARD_PAD * 2;
  const boardH = gridH + BOARD_PAD * 2;
  const maxW = window.innerWidth;
  const scale = Math.min(1, maxW / boardW);
  if (scale < 1) {
    board.style.transform = `scale(${scale})`;
    board.style.marginBottom = `-${boardH * (1 - scale)}px`;
  } else {
    board.style.transform = '';
    board.style.marginBottom = '';
  }
}
```

Delete the entire function.

- [ ] **Step 2: Remove the `fitBoard()` call at the end of `renderGrid`**

Find `renderGrid` around line 146. At its end (near line 219):

```js
  updatePlayerSprite();
  fitBoard();
}
```

Replace with:

```js
  updatePlayerSprite();
  applyPan();
  renderMinimap();
}
```

(`applyPan` re-applies the current transform in case `renderGrid` stomped anything; cheap. `renderMinimap` redraws after board mutation.)

- [ ] **Step 3: Reload and verify board still renders**

Reload `http://localhost:3000`.

Expected: game looks the same as before on desktop. Board position is now inside `#viewport` with `transform: translate(0, 0)` — so it renders at top-left of viewport (no more centering via `transform-origin`). This may look off-center but that's correct for now. The pan system will handle centering.

- [ ] **Step 4: Add initial center-on-player call at end of `initLevel`**

Find `initLevel` around line 1188. At its end (near line 1299):

```js
  collectAt(state.playerRow, state.playerCol);

  updateHud();
  renderGrid();
  hideOverlay();
}
```

Replace with:

```js
  collectAt(state.playerRow, state.playerCol);

  updateHud();
  renderGrid();
  // Snap pan to center on player at level start (instant, not animated).
  const vp = getViewportSize();
  const cc = cellCenterPx(state.playerRow, state.playerCol);
  setPan(vp.w / 2 - cc.x, vp.h / 2 - cc.y);
  hideOverlay();
}
```

- [ ] **Step 5: Reload and verify**

Reload, start a new run.

Expected: level 1 opens with player near center of viewport. Clicking cells still walks/digs (existing handlers). Board can go off-screen on large levels — but no pan gestures yet (next task). Right-click to flag still works on desktop.

- [ ] **Step 6: Commit**

```bash
git add game.js
git commit -m "refactor: remove fitBoard, center viewport on player at level start"
```

---

## Task 6: Pointer state machine (tap/long-press/drag)

**Files:**
- Modify: `game.js` (add pointer arbiter section, remove per-cell click/contextmenu handlers, remove old touchstart/touchend/touchmove handlers)

This is the trickiest task. We're replacing:
- `cell.addEventListener('click', ...)` and `cell.addEventListener('contextmenu', ...)` inside `renderGrid`
- The `touchstart`/`touchend`/`touchmove`/`click`-suppress handlers at the bottom of game.js

with a single `#viewport`-level pointer arbiter that fires tap / long-press / drag based on pointer movement and time.

- [ ] **Step 1: Add the pointer arbiter section**

Append a new section (after the VIEWPORT / PAN section, or near the bottom of the file before the `showStartScreen()` call):

```js
// ============================================================
// POINTER ARBITER (tap / long-press / drag)
// ============================================================

const DRAG_THRESHOLD_PX = 8;
const LONG_PRESS_MS = 400;

// One active pointer at a time. Multi-touch is ignored for gameplay.
let activePointer = null;
// { id, startX, startY, lastX, lastY, startTime, cellR, cellC, state: 'pending'|'drag', longPressFired, longPressTimer }

function cellFromClientPoint(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el) return null;
  const cell = el.closest('.cell');
  if (!cell) return null;
  const r = parseInt(cell.dataset.row);
  const c = parseInt(cell.dataset.col);
  if (isNaN(r) || isNaN(c)) return null;
  return { r, c };
}

function onViewportPointerDown(e) {
  if (activePointer !== null) return; // ignore secondary pointers
  const { r, c } = cellFromClientPoint(e.clientX, e.clientY) || {};
  // Note: r/c may be undefined if pointer-down lands on a gap, player sprite, etc.
  // In that case we still start a drag-capable session (for panning), but tap has no target.
  activePointer = {
    id: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    lastX: e.clientX,
    lastY: e.clientY,
    startTime: performance.now(),
    cellR: r,
    cellC: c,
    state: 'pending',
    longPressFired: false,
    longPressTimer: null,
  };
  viewportEl.setPointerCapture(e.pointerId);

  // Long-press timer fires flag if still pending at 400ms.
  activePointer.longPressTimer = setTimeout(() => {
    if (activePointer && activePointer.state === 'pending' &&
        activePointer.cellR !== undefined && activePointer.cellC !== undefined) {
      activePointer.longPressFired = true;
      handleRightClick(activePointer.cellR, activePointer.cellC);
    }
  }, LONG_PRESS_MS);
}

function onViewportPointerMove(e) {
  if (!activePointer || e.pointerId !== activePointer.id) return;

  const dx = e.clientX - activePointer.startX;
  const dy = e.clientY - activePointer.startY;
  const dist = Math.hypot(dx, dy);

  if (activePointer.state === 'pending' && dist > DRAG_THRESHOLD_PX) {
    activePointer.state = 'drag';
    clearTimeout(activePointer.longPressTimer);
  }

  if (activePointer.state === 'drag') {
    const deltaX = e.clientX - activePointer.lastX;
    const deltaY = e.clientY - activePointer.lastY;
    setPan(pan.x + deltaX, pan.y + deltaY);
    pan.lastManualPanAt = performance.now();
  }

  activePointer.lastX = e.clientX;
  activePointer.lastY = e.clientY;
}

function onViewportPointerUp(e) {
  if (!activePointer || e.pointerId !== activePointer.id) return;
  clearTimeout(activePointer.longPressTimer);

  if (activePointer.state === 'pending' && !activePointer.longPressFired) {
    // Tap: invoke the cell click handler if we had a valid cell.
    if (activePointer.cellR !== undefined && activePointer.cellC !== undefined) {
      handleClick(activePointer.cellR, activePointer.cellC);
    }
  }
  // If state was 'drag', the pan already happened in pointermove — nothing else to do.
  // If longPressFired, handleRightClick already ran — nothing else to do.

  viewportEl.releasePointerCapture(e.pointerId);
  activePointer = null;
}

function onViewportPointerCancel(e) {
  if (!activePointer || e.pointerId !== activePointer.id) return;
  clearTimeout(activePointer.longPressTimer);
  viewportEl.releasePointerCapture(e.pointerId);
  activePointer = null;
}

viewportEl.addEventListener('pointerdown', onViewportPointerDown);
viewportEl.addEventListener('pointermove', onViewportPointerMove);
viewportEl.addEventListener('pointerup', onViewportPointerUp);
viewportEl.addEventListener('pointercancel', onViewportPointerCancel);

// Prevent native contextmenu (desktop right-click) from showing the browser menu.
// We keep desktop right-click-to-flag by handling it explicitly.
viewportEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const { r, c } = cellFromClientPoint(e.clientX, e.clientY) || {};
  if (r !== undefined && c !== undefined) {
    handleRightClick(r, c);
  }
});
```

- [ ] **Step 2: Remove per-cell `click` and `contextmenu` handlers from `renderGrid`**

In `renderGrid` around line 208-213, find:

```js
      cell.addEventListener('click', () => handleClick(r, c));
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (longPressTriggered) return;
        handleRightClick(r, c);
      });
```

Delete these four lines. The pointer arbiter now handles all input via event delegation on `#viewport`.

- [ ] **Step 3: Remove the old touch long-press handlers and click suppressor**

Find the block at the bottom of game.js (around line 1491-1521):

```js
// Long-press to flag on touch devices (iOS Safari doesn't fire contextmenu).
let longPressTimer = null;
let longPressTriggered = false;

gridContainer.addEventListener('touchstart', (e) => {
  const cell = e.target.closest('.cell');
  if (!cell) return;
  longPressTriggered = false;
  const r = parseInt(cell.dataset.row);
  const c = parseInt(cell.dataset.col);
  longPressTimer = setTimeout(() => {
    longPressTriggered = true;
    handleRightClick(r, c);
  }, 400);
}, { passive: true });

gridContainer.addEventListener('touchend', () => {
  clearTimeout(longPressTimer);
});

gridContainer.addEventListener('touchmove', () => {
  clearTimeout(longPressTimer);
});

// Suppress the click that follows a long-press flag.
gridContainer.addEventListener('click', (e) => {
  if (longPressTriggered) {
    e.stopPropagation();
    longPressTriggered = false;
  }
}, true);
```

Delete the entire block (all ~30 lines). The pointer arbiter replaces it.

- [ ] **Step 4: Reload and test desktop tap + right-click**

Reload `http://localhost:3000`, start a new run.

Expected:
- Left-click on a reachable cell walks/digs (same as before).
- Right-click on any cell toggles flag (same as before — now via the viewport contextmenu handler).
- Drag the board with left-click hold + move: board pans.
- Click on player cell when merchant: still opens shop.
- Pickaxe targeting: click pickaxe button, click a wall → wall breaks and cascades.

- [ ] **Step 5: Test on mobile simulator / touch device**

Open DevTools → toggle device emulation to iPhone. Reload.

Expected:
- Short tap walks.
- Long hold (>400ms, no movement) flags.
- Drag (movement >8px) pans the board.
- Tap starting and ending under 8px movement in <400ms → walks (not flag, not pan).

- [ ] **Step 6: Commit**

```bash
git add game.js
git commit -m "feat: pointer arbiter for tap/long-press/drag-pan"
```

---

## Task 7: Minimap rendering

**Files:**
- Modify: `game.js` (replace `renderMinimap` stub from Task 4 with real implementation)

- [ ] **Step 1: Replace the stub with real minimap rendering**

Find the stub from Task 4:

```js
function renderMinimap() { /* defined in Task 7 */ }
```

Replace with:

```js
function renderMinimap() {
  const dpr = window.devicePixelRatio || 1;
  const cssSize = 100;
  // Resize backing store for crisp rendering on high-DPI displays.
  if (minimapEl.width !== cssSize * dpr) {
    minimapEl.width = cssSize * dpr;
    minimapEl.height = cssSize * dpr;
  }
  const ctx = minimapEl.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Pixel-per-cell, use the larger board dimension so the board fits.
  const boardDim = Math.max(state.rows, state.cols);
  const pxPerCell = Math.floor(cssSize / boardDim);
  const drawW = pxPerCell * state.cols;
  const drawH = pxPerCell * state.rows;
  const offsetX = (cssSize - drawW) / 2;
  const offsetY = (cssSize - drawH) / 2;

  // Background (fully opaque so unrevealed area is visibly dark even over faint BG).
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, cssSize, cssSize);

  // Draw each cell.
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const x = offsetX + c * pxPerCell;
      const y = offsetY + r * pxPerCell;
      const cell = state.grid[r][c];

      if (!state.revealed[r][c]) {
        ctx.fillStyle = '#222';
      } else if (cell.type === 'wall') {
        ctx.fillStyle = '#333';
      } else {
        ctx.fillStyle = '#666';
      }
      ctx.fillRect(x, y, pxPerCell, pxPerCell);
    }
  }

  // Special markers (drawn on top, 2x2 px boxes — scaled by pxPerCell).
  const markerSize = Math.max(2, Math.floor(pxPerCell * 0.6));

  function drawMarker(r, c, color) {
    const x = offsetX + c * pxPerCell + (pxPerCell - markerSize) / 2;
    const y = offsetY + r * pxPerCell + (pxPerCell - markerSize) / 2;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, markerSize, markerSize);
  }

  // Exit (always pre-revealed).
  drawMarker(state.exit.r, state.exit.c, '#33ff33');

  // Merchant (if spawned; always pre-revealed).
  if (state.merchant) {
    drawMarker(state.merchant.r, state.merchant.c, '#ff33ff');
  }

  // Player last so it's always visible.
  drawMarker(state.playerRow, state.playerCol, '#ffdd00');
}
```

- [ ] **Step 2: Reload and verify minimap renders**

Reload `http://localhost:3000`, start a new run.

Expected: minimap top-right of viewport shows a small dark grid. Yellow dot = player, green dot = exit. As you reveal cells, lighter squares appear. Walls in revealed areas are darker than floor.

- [ ] **Step 3: Wire minimap tap to recenter main view**

Append to the same section (after `renderMinimap`):

```js
minimapEl.addEventListener('click', (e) => {
  const rect = minimapEl.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;
  const cssSize = 100;
  const boardDim = Math.max(state.rows, state.cols);
  const pxPerCell = Math.floor(cssSize / boardDim);
  const drawW = pxPerCell * state.cols;
  const drawH = pxPerCell * state.rows;
  const offsetX = (cssSize - drawW) / 2;
  const offsetY = (cssSize - drawH) / 2;
  const c = Math.floor((clickX - offsetX) / pxPerCell);
  const r = Math.floor((clickY - offsetY) / pxPerCell);
  if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return;
  pan.lastManualPanAt = performance.now(); // treat as manual pan
  centerOnCell(r, c, 200);
});
```

- [ ] **Step 4: Reload and test minimap tap**

Reload. Tap (or click) a spot on the minimap.

Expected: main view animates to center on that board coordinate over ~200ms. Player does NOT move. Auto-recenter is disabled for 2s so the camera stays put; a subsequent walk will re-engage auto-recenter.

- [ ] **Step 5: Commit**

```bash
git add game.js
git commit -m "feat: minimap rendering and tap-to-recenter"
```

---

## Task 8: Auto-recenter after player actions

**Files:**
- Modify: `game.js` (add `autoRecenterOnPlayer()` calls after player moves)

The `autoRecenterOnPlayer()` function was defined in Task 4. Now we call it at the right places.

- [ ] **Step 1: Identify player-move sites**

The player position changes in these places inside `game.js`:

1. `handleClick` — after walking to a revealed cell (via `animateWalk`).
2. `handleClick` — after digging gas (`state.playerRow = r`).
3. `handleClick` — after digging empty (`state.playerRow = r`).
4. `handleItemClick` — if any item repositions the player (scanner/potion don't; pickaxe doesn't). So no changes here.
5. `animateWalk` — internally updates player position per step; we can either call per-step (laggy) or once at end (cleaner). Call once at end.

Call `autoRecenterOnPlayer()` after `updatePlayerSprite()` in all three `handleClick` sites, and at the end of `animateWalk`.

- [ ] **Step 2: Add autoRecenterOnPlayer() calls in `animateWalk`**

Find `animateWalk` (around line 926). The function walks the player one step at a time; auto-recenter per step gives the camera a chance to track the player without waiting for the walk to complete.

Current structure:

```js
async function animateWalk(path) {
  for (let i = 1; i < path.length; i++) {
    state.playerRow = path[i].r;
    state.playerCol = path[i].c;
    playSfx('step');
    updatePlayerSprite();
    await sleep(STEP_MS);
    collectAt(path[i].r, path[i].c);
    updateHud();

    if (path[i].r === state.exit.r && path[i].c === state.exit.c) {
      playSfx('win');
      state.gameOver = true;
      renderGrid();
      addToLifetimeGold(state.gold);
      showEscapedOverlay();
      return false;
    }
  }
  renderGrid();
  ...
```

After `updatePlayerSprite()` inside the loop, add `autoRecenterOnPlayer();`:

```js
async function animateWalk(path) {
  for (let i = 1; i < path.length; i++) {
    state.playerRow = path[i].r;
    state.playerCol = path[i].c;
    playSfx('step');
    updatePlayerSprite();
    autoRecenterOnPlayer();   // <-- NEW
    await sleep(STEP_MS);
    ...
```

(Per-step recenter is smoother than end-only and still cheap — `autoRecenterOnPlayer` no-ops if the player is already in the center rectangle.)

- [ ] **Step 3: Add autoRecenterOnPlayer() calls in `handleClick`**

In `handleClick` (starts around line 1026):

After `updatePlayerSprite()` following the gas-dig branch (~line 1078):

```js
      state.playerRow = r;
      state.playerCol = c;
      updatePlayerSprite();
      flashHurtFace();
      updateHud();
      renderGrid();
+     autoRecenterOnPlayer();
```

After `updatePlayerSprite()` following the empty-dig branch (~line 1092):

```js
      state.playerRow = r;
      state.playerCol = c;
      updatePlayerSprite();
      collectAt(r, c);
      updateHud();
      renderGrid();
+     autoRecenterOnPlayer();
```

(Use actual Edit tool — shown as diff here for clarity.)

- [ ] **Step 4: Reload and test auto-recenter**

Reload `http://localhost:3000`, new run, play to a larger level (e.g. 5+ for 14×14).

Expected:
- As you walk across the board, when the player approaches the edge of the visible viewport, the board pans smoothly to recenter the player.
- If you manually pan (drag) to scout, then walk: for the next 2s the camera respects your scout. After 2s it resumes auto-recenter.

- [ ] **Step 5: Commit**

```bash
git add game.js
git commit -m "feat: auto-recenter viewport on player movement"
```

---

## Task 9: Minimap redraw triggers

**Files:**
- Modify: `game.js` (add `renderMinimap()` calls after reveal/move/init/merchant spawn)

`renderMinimap` is already called once at the end of `renderGrid` (Task 5, Step 2), which covers most cases — `renderGrid` runs after every meaningful state change. But we should verify this is enough and add any missing triggers.

- [ ] **Step 1: Audit `renderGrid` call sites**

Run: grep for `renderGrid` in game.js.

```
Grep pattern: renderGrid
Path: game.js
```

Expected sites (from prior exploration): inside `renderGrid` itself (self), and calls after `initLevel`, reveals, walks, gas detonations, scanner, pickaxe, escape key (cancel targeting). All of these should also refresh the minimap, and since `renderGrid` calls `renderMinimap` at its end, they will.

- [ ] **Step 2: Verify no edge cases missed**

Check if player position updates outside `renderGrid` (e.g., `updatePlayerSprite` without subsequent `renderGrid`). Search:

```
Grep pattern: updatePlayerSprite
Path: game.js
```

If any site calls `updatePlayerSprite` without `renderGrid` afterward, add `renderMinimap()` after it. At the time of writing, `updatePlayerSprite` is followed by `renderGrid` in all player-move paths, so no additional calls needed.

- [ ] **Step 3: Reload and verify minimap updates**

Reload. Play a level:
- Digging a cell updates that cell's color on the minimap.
- Walking updates the player's yellow dot position.
- Starting a new level fully redraws the minimap.
- Buying an item from the merchant does NOT change the minimap (no cell state change).

- [ ] **Step 4: Commit (if any changes made)**

If Step 2 revealed a missing site:

```bash
git add game.js
git commit -m "fix: ensure minimap redraws on all player movement"
```

Else skip (no-op task confirming coverage).

---

## Task 10: Edge cases and polish

**Files:**
- Modify: `style.css`
- Modify: `game.js` (a few polish items)

- [ ] **Step 1: Prevent text selection and iOS callout inside viewport**

Append to `style.css`:

```css
#viewport, #viewport * {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
```

- [ ] **Step 2: Remove `touch-action: manipulation` from body, rely on viewport's `touch-action: none`**

In `style.css`, find:

```css
body {
  ...
  touch-action: manipulation;
}
```

Remove the `touch-action: manipulation;` line. The `#viewport { touch-action: none; }` from Task 3 handles touch behavior where it matters.

- [ ] **Step 3: Add `overscroll-behavior` to body**

Still in `style.css`, inside `body`:

```css
body {
  ...
  overscroll-behavior: none;
}
```

Prevents pull-to-refresh leakage in browsers (though PWA standalone mode strips it anyway).

- [ ] **Step 4: Handle pointer leaving viewport mid-drag**

The pointer arbiter uses `setPointerCapture`, so drags continue even if the finger leaves the viewport. Verify this works: drag from inside the board out past the edge of the viewport, release. Expected: drag ends cleanly (no stuck state).

If you see a stuck drag state (e.g., subsequent taps don't register), add a `pointerleave` safety:

```js
viewportEl.addEventListener('pointerleave', (e) => {
  if (activePointer && activePointer.state === 'drag') {
    // Let capture keep tracking; no-op.
  }
});
```

Typically not needed — pointer capture handles this — but note it as a followup if observed.

- [ ] **Step 5: Orientation change handling**

`resize` listener from Task 4 covers orientation change in practice (browsers fire `resize` on rotate). Test by rotating a mobile emulator.

Expected: after rotation, board is re-clamped, minimap redraws, player remains in view (auto-recenter fires on the next action).

- [ ] **Step 6: Commit**

```bash
git add style.css game.js
git commit -m "polish: touch-callout, overscroll, orientation handling"
```

---

## Task 11: Full playtest and regression check

**Files:** (none; verification only)

- [ ] **Step 1: Desktop Chrome — full run**

Run: `npx serve . -l 3000`, open Chrome.

- Level 1 (10×10): board fits, pan is a no-op (no visible movement on drag within viewport). Tap walks. Right-click flags. Minimap shows.
- Level 5+ (14×14): board may exceed viewport vertically. Drag pans. Tap walks. Right-click flags. Minimap tap recenters.
- Level 9+ (18×18+): board exceeds viewport both axes. All interactions work. Auto-recenter fires as player walks across.
- Death: retry works, board re-centers on player.
- New run: save clears, start fresh.
- Merchant: shop overlay opens on player-on-merchant click.
- Items: potion, scanner, pickaxe all function. Pickaxe targeting mode: click button, tap wall, wall breaks.
- Save/resume: refresh mid-run, "Continue" button appears, state restored.

- [ ] **Step 2: Mobile Safari (via DevTools emulation or real device)**

Emulate iPhone 14 in Chrome DevTools, or open on a real iPhone via local network.

- Short tap walks.
- Long-press (~500ms, no movement) flags.
- Drag pans.
- Minimap tap recenters main view.
- Pickaxe targeting still tap-to-select.
- Rotation: recenters on next action.

- [ ] **Step 3: iOS Safari — PWA install**

Open in iOS Safari. Tap Share → Add to Home Screen. Launch from home screen.

Expected:
- No Safari chrome (address bar, nav bar).
- Pinch-zoom does nothing.
- Double-tap does nothing (no zoom).
- Pull-down doesn't refresh.
- Gameplay identical to browser.

- [ ] **Step 4: Android Chrome — install prompt**

Open on Android Chrome. After a visit or two, an "Install app?" banner should appear (or menu → Install app).

Expected: same standalone experience. Full gameplay path works.

- [ ] **Step 5: Regression sweep**

Things to specifically re-check:
- Anchor cells pre-reveal on level start — visible on minimap as pre-lit islands.
- 3×3 start area cascades — visible.
- Gas detonation float (red skull) still plays.
- Gold pickup float still plays.
- HP display, gold display, item counts all update.
- BGM plays and loops after first interaction.
- SFX play (dig, boom, gold, step, mark, unmark, win, welcome, payment, scan, drink, pickaxe, pickup).
- Escape key cancels pickaxe targeting.

- [ ] **Step 6: Commit any final fixes**

If any regressions are found, fix in additional commits. Otherwise, the feature is done — no separate "final" commit needed.

---

## Rollback

If something goes wrong mid-way and we want to revert only part of the work, each commit is independent. Revert the problematic commit with `git revert <sha>`. Expected clean reverts:

- Revert Task 2 only: PWA tags disappear but pan/minimap keep working (they don't depend on PWA).
- Revert Task 7 only: minimap disappears but pan still works.
- Revert Task 6 only: breaks badly — per-cell handlers are already deleted. Either fix forward or revert Tasks 5 + 6 together.

## Done when...

- All 11 tasks above are checked.
- Playtest on desktop, mobile browser, and iOS PWA all work.
- No visual regressions vs. pre-work experience on desktop (apart from the intentional minimap overlay).
- Large boards are playable on phone.
