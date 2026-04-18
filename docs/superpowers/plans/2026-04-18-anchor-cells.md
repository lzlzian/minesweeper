# Anchor Cells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-reveal isolated 0-adjacency cells at level start, creating cascading pockets of certainty that break up long guess-chains.

**Architecture:** Single new function `placeAnchors()` added to `game.js`, called from `initLevel()`. No new state, UI, or audio. All tuning knobs are constants at the top of the function.

**Tech Stack:** Plain JS (no build step), existing `game.js` codebase.

---

## File Structure

- **Modify:** `game.js` — add `placeAnchors()` function (~60 lines), add one call in `initLevel()`

That's it. Single file, single function, single call site.

---

### Task 1: Add `anchorCountForSize()` helper

**Files:**
- Modify: `game.js` (insert after `gridSizeForLevel` function, around line 44)

- [ ] **Step 1: Add the helper function**

Insert after the `gridSizeForLevel` function (line 44):

```js
function anchorCountForSize(size) {
  if (size <= 12) return 1;
  if (size <= 14) return 2;
  return Math.random() < 0.5 ? 2 : 3;
}
```

- [ ] **Step 2: Verify no syntax errors**

Open `index.html` in browser, open devtools console. Confirm no errors on page load.

- [ ] **Step 3: Commit**

```bash
git add game.js
git commit -m "feat(anchors): add anchorCountForSize helper"
```

---

### Task 2: Add `placeAnchors()` function

**Files:**
- Modify: `game.js` (insert after `placeItemDrops` function, around line 743)

- [ ] **Step 1: Add the tuning constants and candidate collection**

Insert after the `placeItemDrops` function:

```js
const ANCHOR_MIN_DIST_START = 4;
const ANCHOR_MIN_DIST_EXIT = 3;
const ANCHOR_MIN_DIST_BETWEEN = 5;

function placeAnchors() {
  const target = anchorCountForSize(state.rows);
  if (target === 0) return;

  const startR = state.playerRow;
  const startC = state.playerCol;
  const exitR = state.exit.r;
  const exitC = state.exit.c;

  // Collect candidates: adjacency-0, non-gas, non-wall, far enough from start/exit.
  const candidates = [];
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const cell = state.grid[r][c];
      if (cell.type === 'gas' || cell.type === 'wall') continue;
      if (cell.adjacent !== 0) continue;
      const distStart = Math.max(Math.abs(r - startR), Math.abs(c - startC));
      const distExit = Math.max(Math.abs(r - exitR), Math.abs(c - exitC));
      if (distStart < ANCHOR_MIN_DIST_START) continue;
      if (distExit < ANCHOR_MIN_DIST_EXIT) continue;
      candidates.push({ r, c });
    }
  }

  // Shuffle candidates (Fisher-Yates).
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  // Pick anchors one at a time, enforcing spacing and merge checks.
  const placed = [];

  for (const cand of candidates) {
    if (placed.length >= target) break;

    // Enforce minimum distance from already-placed anchors.
    const tooClose = placed.some(a =>
      Math.max(Math.abs(cand.r - a.r), Math.abs(cand.c - a.c)) < ANCHOR_MIN_DIST_BETWEEN
    );
    if (tooClose) continue;

    // Snapshot revealed state before cascading this anchor.
    const snapshot = state.revealed.map(row => [...row]);

    revealCell(cand.r, cand.c);

    // Collect which cells were newly revealed.
    const newCells = [];
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        if (state.revealed[r][c] && !snapshot[r][c]) {
          newCells.push({ r, c });
        }
      }
    }

    // Merge check: if any newly-revealed cell is adjacent (Chebyshev 1)
    // to a cell that was already revealed before this anchor, the cascade
    // merged with an existing region. Roll it back.
    let merged = false;
    for (const nc of newCells) {
      for (let dr = -1; dr <= 1 && !merged; dr++) {
        for (let dc = -1; dc <= 1 && !merged; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = nc.r + dr;
          const nc2 = nc.c + dc;
          if (nr < 0 || nr >= state.rows || nc2 < 0 || nc2 >= state.cols) continue;
          if (snapshot[nr][nc2]) {
            merged = true;
          }
        }
      }
      if (merged) break;
    }

    if (merged) {
      // Un-reveal all cells this anchor opened.
      for (const nc of newCells) {
        state.revealed[nc.r][nc.c] = false;
      }
      continue;
    }

    placed.push(cand);
  }
}
```

- [ ] **Step 2: Verify no syntax errors**

Open `index.html` in browser, open devtools console. Confirm no errors on page load. The function exists but is not called yet — game should behave identically to before.

- [ ] **Step 3: Commit**

```bash
git add game.js
git commit -m "feat(anchors): add placeAnchors function with candidate selection, spacing, and merge check"
```

---

### Task 3: Wire `placeAnchors()` into `initLevel()`

**Files:**
- Modify: `game.js:1148-1154` (the pre-reveal section of `initLevel`)

- [ ] **Step 1: Add the call**

Find this block in `initLevel()`:

```js
  // Pre-reveal exit cell and the player's starting cell only (no cascade — player digs from turn 1)
  state.revealed[state.exit.r][state.exit.c] = true;
  state.revealed[state.playerRow][state.playerCol] = true;
  if (state.merchant) {
    state.revealed[state.merchant.r][state.merchant.c] = true;
  }
  collectAt(state.playerRow, state.playerCol);
```

Replace with:

```js
  // Pre-reveal exit cell and the player's starting cell only (no cascade — player digs from turn 1)
  state.revealed[state.exit.r][state.exit.c] = true;
  state.revealed[state.playerRow][state.playerCol] = true;
  if (state.merchant) {
    state.revealed[state.merchant.r][state.merchant.c] = true;
  }

  // Reveal the player's start area so anchors can merge-check against it.
  revealCell(state.playerRow, state.playerCol);

  placeAnchors();

  collectAt(state.playerRow, state.playerCol);
```

Note: the player start cell currently just gets `revealed[r][c] = true` without calling `revealCell`, so the start area's cascade hasn't happened yet when anchors are placed. We need to call `revealCell` on the start cell first so the merge-check can see the start cascade. `revealCell` is idempotent (checks `revealed[r][c]` and returns early if true), but the start cell's `adjacent` might be 0 in which case calling `revealCell` will cascade it. Since `ensureSafeStart` already cleared gas/walls from the 3×3 around start, this cascade is exactly what we want — and it already happened visually before (the player could see it). Now it just happens explicitly before anchor placement.

- [ ] **Step 2: Playtest — verify anchors appear**

Open `index.html` in browser. Start a new run. Confirm:
- The spawn area cascades open as before
- 1 additional pocket of revealed cells is visible elsewhere on the board (on a 10×10)
- The pocket has numbered edges (cells with adjacency > 0 bordering unrevealed cells)
- The pocket is NOT connected to the spawn area
- Items/gold visible in anchor pockets are NOT collected (gold counter unchanged, item counts unchanged)

Start a few runs to see variation. Some boards may have 0 anchors if no valid candidates exist — that's fine.

- [ ] **Step 3: Playtest — verify larger boards**

Click through to level 5+ (14×14). Confirm 2 anchor pockets appear. Click through to level 7+ (16×16). Confirm 2–3 anchor pockets. Verify none merge with each other or the start area.

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "feat(anchors): wire placeAnchors into initLevel, cascade start cell before anchor placement"
```

---

### Task 4: Playtest and tune

This is a manual tuning task, not a code task. Play 5–10 levels and adjust constants if needed.

- [ ] **Step 1: Check pocket sizes**

Are anchor pockets big enough to provide useful deduction material (3+ numbered edges)? If pockets are consistently tiny (1–2 cells), the min-distance-from-start might be pushing anchors into dense gas regions. Consider reducing `ANCHOR_MIN_DIST_START` from 4 to 3.

- [ ] **Step 2: Check pocket isolation**

Are anchor pockets staying isolated from the start area? If merges happen frequently (anchors getting rejected by the merge check, leaving 0 anchors on most boards), consider reducing `ANCHOR_MIN_DIST_BETWEEN` from 5 to 4.

- [ ] **Step 3: Check difficulty**

Do anchors make the game too easy? If so, reduce anchor count (change `anchorCountForSize` thresholds). If still too sticky/guess-heavy, increase counts.

- [ ] **Step 4: Commit any tuning changes**

```bash
git add game.js
git commit -m "tune(anchors): adjust placement constants from playtesting"
```

Only commit this step if constants were changed. Skip if defaults feel good.
