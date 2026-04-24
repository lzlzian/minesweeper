# No-Guess Level Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate procedural levels where the player can always deduce a safe path from start to exit using only numbers, walls, and flags — no guessing required.

**Architecture:** A pure logic solver (`src/solver.js`) runs Rule-1 (safe-neighbor elimination) and Rule-2 (gas identification) iteratively over a snapshot of the board. During `initLevel()`, after existing placement succeeds, we run the solver; if it stalls before the exit is reachable through deduced-safe territory, we relocate a frontier gas to unexplored terrain and re-run the solver. Bounded fix attempts, then a safety-valve regenerate. A URL param (`?oldgen=1`) skips the solver entirely to A/B compare against the legacy random generator.

**Tech Stack:** Plain ES modules (JS), no build step. Tests in `tests/smoke.html` (hand-rolled `test()`/`assertEq`). Matches existing repo conventions exactly — do not add frameworks.

---

## Scope

- **In:** Solver (Rules 1 + 2), generate-and-fix integration in `initLevel()`, `?oldgen=1` A/B toggle, editor "Check Solvability" button, smoke tests.
- **Out (deferred per discussion):** Rule 3 (set/overlap deduction), difficulty tuning pass, replay/viz mode.

## File Structure

**Create:**
- `src/solver.js` — pure solver + fixup helpers. No imports from `state.js`, no DOM, no side effects on game state.
- `src/editor/solvabilityCheck.js` — thin adapter: editor-shaped level → solver inputs, returns `{ solved }`.

**Modify:**
- `src/gameplay/level.js` — integrate solver+fixup into `initLevel()`, honor `?oldgen=1` param.
- `src/editor/main.js` — wire a "Check Solvability" button handler.
- `src/editor/editorDom.js` — expose the new button element.
- `editor.html` — add the button markup.
- `tests/smoke.js` — add solver + fixup + adapter tests.

**Key design constraints (do not violate):**
1. `src/solver.js` must be pure — operates on plain arrays/objects, does not import `state.js`, does not touch the DOM.
2. The solver only needs to deduce a path to the exit, not solve the full board.
3. Fixup relocates gas, never removes it — preserves density.
4. If fixup fails after `MAX_FIX_ATTEMPTS`, regenerate from scratch; if that fails too, fall through to existing `carvePath()` safety valve. **Never hang.**

---

## Task 0: Verify clean baseline

**Files:** none

- [ ] **Step 1: Start a local server from the worktree**

```bash
cd .worktrees/no-guess-gen
npx serve . -l 3000
```

- [ ] **Step 2: Open smoke tests**

Open `http://localhost:3000/tests/smoke.html`. Confirm "N/N passing" with 0 failures. If any test fails on a fresh checkout, **stop** and report — do not build on a broken baseline.

- [ ] **Step 3: Confirm game still loads**

Open `http://localhost:3000/index.html`. Start a new run, play one level, no console errors. This is the reference "old gen" behavior.

No commit.

---

## Task 1: Solver module skeleton + Rule 1

**Files:**
- Create: `src/solver.js`
- Modify: `tests/smoke.js`

The solver takes a board snapshot + initial revealed/flagged state and returns whether the exit becomes reachable via deduction. It also simulates the player's start-3×3 cascade to match in-game initial reveal.

- [ ] **Step 1: Append the test helper and first Rule-1 test to `tests/smoke.js`**

Append to the end of `tests/smoke.js`, BEFORE the `// Render` block:

```js
// -- solver --
import { solve } from '../src/solver.js';

// Build a solver input from an ASCII spec.
// '.' empty, '#' wall, '*' gas, 'P' player start (empty), 'E' exit (empty).
function buildBoard(rowsStr) {
  const rows = rowsStr.length;
  const cols = rowsStr[0].length;
  const grid = [];
  let player = null, exit = null;
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const ch = rowsStr[r][c];
      if (ch === '#') row.push({ type: 'wall' });
      else if (ch === '*') row.push({ type: 'gas' });
      else {
        row.push({ type: 'empty' });
        if (ch === 'P') player = { r, c };
        if (ch === 'E') exit = { r, c };
      }
    }
    grid.push(row);
  }
  // Adjacency for empty cells.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].type !== 'empty') continue;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          if (grid[nr][nc].type === 'gas') n++;
        }
      }
      grid[r][c].adjacent = n;
    }
  }
  return { grid, rows, cols, player, exit };
}

function emptyGrid(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill(false));
}

test('solver Rule 1: flagged gas lets cascade reach exit', () => {
  // Player at (1,1). NW corner is gas. Pre-flagging NW means Rule 1 fires
  // on the player cell (adj=1, knownGas=1 → remaining unrev are safe), which
  // triggers a cascade reaching the exit (2,2) via 0-adjacency spread.
  const b = buildBoard(['*..', '.P.', '..E']);
  const revealed = emptyGrid(3, 3);
  const flagged  = emptyGrid(3, 3);
  flagged[0][0] = true; // pre-flagged gas
  const res = solve(b.grid, b.rows, b.cols, revealed, flagged, b.player, b.exit);
  assertEq(res.solved, true);
});
```

- [ ] **Step 2: Verify the new test fails**

Reload `tests/smoke.html`. Expected: failure — `solve` is not an exported function (module doesn't exist yet).

- [ ] **Step 3: Create `src/solver.js` with Rule 1 only**

```js
// Pure logical solver. Given a board snapshot + revealed/flagged state,
// determines whether the exit cell becomes reachable via deduction using
// Rule 1 (safe-neighbor elimination). No DOM, no game-state imports.
// Inputs are cloned — the caller's arrays are never mutated.

const DIRS = [
  [-1,-1], [-1, 0], [-1, 1],
  [ 0,-1],          [ 0, 1],
  [ 1,-1], [ 1, 0], [ 1, 1],
];

function cloneMatrix(m) {
  return m.map(row => row.slice());
}

function neighbors(r, c, rows, cols) {
  const out = [];
  for (const [dr, dc] of DIRS) {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
    out.push({ r: nr, c: nc });
  }
  return out;
}

// Mirrors gameplay/interaction.js revealCell on a local `revealed` snapshot.
// Reveal (r,c); if adj=0, spread to 8 neighbors. Skips walls and gas.
function cascadeReveal(r, c, grid, rows, cols, revealed) {
  if (r < 0 || r >= rows || c < 0 || c >= cols) return;
  if (revealed[r][c]) return;
  const start = grid[r][c];
  if (start.type === 'wall' || start.type === 'gas') return;
  const stack = [{ r, c }];
  while (stack.length) {
    const { r: cr, c: cc } = stack.pop();
    if (revealed[cr][cc]) continue;
    const cell = grid[cr][cc];
    if (cell.type === 'wall' || cell.type === 'gas') continue;
    revealed[cr][cc] = true;
    if ((cell.adjacent ?? 0) === 0) {
      for (const n of neighbors(cr, cc, rows, cols)) stack.push(n);
    }
  }
}

export function solve(grid, rows, cols, revealedIn, flaggedIn, player, exit) {
  const revealed = cloneMatrix(revealedIn);
  const flagged  = cloneMatrix(flaggedIn);

  // Seed: start-3x3 cascade, matching in-game behavior.
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      cascadeReveal(player.r + dr, player.c + dc, grid, rows, cols, revealed);
    }
  }

  // Deduction loop, fixed-point on Rule 1.
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!revealed[r][c]) continue;
        const cell = grid[r][c];
        if (cell.type !== 'empty') continue;
        const adj = cell.adjacent ?? 0;
        if (adj === 0) continue;

        let knownGas = 0;
        const unrevealed = [];
        for (const n of neighbors(r, c, rows, cols)) {
          const nc = grid[n.r][n.c];
          if (nc.type === 'wall') continue;
          if (flagged[n.r][n.c] || nc.type === 'detonated') { knownGas++; continue; }
          if (revealed[n.r][n.c]) continue;
          unrevealed.push(n);
        }
        const remaining = adj - knownGas;

        // Rule 1: all gas accounted for → every unrevealed neighbor is safe.
        if (remaining === 0 && unrevealed.length > 0) {
          for (const u of unrevealed) {
            if (!revealed[u.r][u.c]) {
              cascadeReveal(u.r, u.c, grid, rows, cols, revealed);
              changed = true;
            }
          }
        }
      }
    }
  }

  return { solved: !!revealed[exit.r][exit.c], revealed, flagged };
}
```

- [ ] **Step 4: Verify the test passes**

Reload smoke.html. Expected: "solver Rule 1" passes; all prior tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/solver.js tests/smoke.js
git commit -m "solver: Rule 1 safe-neighbor elimination"
```

---

## Task 2: Solver Rule 2 (gas identification)

**Files:**
- Modify: `src/solver.js`
- Modify: `tests/smoke.js`

**Verified test layout:**
```
P#..
*...
.#..
...E
```
- Player (0,0), gas (1,0), exit (3,3). Walls at (0,1), (2,1).
- (0,0) adj=1. After start-3×3 cascade: revealed = {(0,0),(1,1)}. (0,1)=wall skipped; (1,0)=gas skipped.
- (0,0) non-wall neighbors: {(1,0) gas, (1,1) rev}. unrev={(1,0)}, adj=1 → Rule 2 flags (1,0).
- (1,1) adj=1, knownGas=1 (after flag) → Rule 1 reveals (0,2),(1,2),(2,0),(2,2).
- (0,2) adj=0 cascades → reaches row 3, exit (3,3).

- [ ] **Step 1: Append the Rule-2 test**

```js
test('solver Rule 2: pins gas when count == unrevealed', () => {
  // Walls (0,1) & (2,1) constrain the player-cell's unrevealed set to the
  // single gas at (1,0). Rule 2 flags it; then Rule 1 on (1,1) cascades to exit.
  const b = buildBoard([
    'P#..',
    '*...',
    '.#..',
    '...E',
  ]);
  const res = solve(b.grid, b.rows, b.cols, emptyGrid(4, 4), emptyGrid(4, 4), b.player, b.exit);
  assertEq(res.solved, true);
});
```

- [ ] **Step 2: Verify it fails (Rule 2 not implemented yet)**

Reload smoke.html. Expected: FAIL — (1,0) never gets flagged, cascade never fires from (1,1), exit stays unrevealed.

- [ ] **Step 3: Add Rule 2 to `src/solver.js`**

Inside the inner `for (let c = 0; c < cols; c++)` loop in `solve()`, immediately after the Rule-1 block, append:

```js
        // Rule 2: remaining gas == unrevealed count → all unrevealed are gas.
        if (remaining > 0 && remaining === unrevealed.length) {
          for (const u of unrevealed) {
            if (!flagged[u.r][u.c]) {
              flagged[u.r][u.c] = true;
              changed = true;
            }
          }
        }
```

- [ ] **Step 4: Verify the test passes**

Reload smoke.html. Expected: Rule-2 test passes; Rule-1 test still passes.

- [ ] **Step 5: Append the unsolvable-50/50 regression test**

**Verified stuck layout:**
```
P.....
......
......
......
...#.#
...#*E
```
- Player (0,0), exit (5,5). Walls (4,3),(4,5),(5,3). Gas (5,4).
- Cascade reveals all adj=0 cells + adj=1 border. Border cells near gas: (4,4) only — because (4,3),(4,5),(5,3) are walls, they don't participate.
- (4,4) adj=1, unrev = [(5,4) gas, (5,5) E]. knownGas=0, remaining=1, unrev=2 → no rule fires.
- No other revealed cell sees (5,4) or (5,5) (all other approaches walled).
- Solver stalls. solved=false.

```js
test('solver returns unsolved on a genuine 50/50', () => {
  // Walls isolate the gas+exit pair so only (4,4) can observe them, and that
  // observation is ambiguous (1 gas in 2 cells). Rule 1 and Rule 2 both stall.
  const b = buildBoard([
    'P.....',
    '......',
    '......',
    '......',
    '...#.#',
    '...#*E',
  ]);
  const res = solve(b.grid, b.rows, b.cols, emptyGrid(6, 6), emptyGrid(6, 6), b.player, b.exit);
  assertEq(res.solved, false);
});
```

- [ ] **Step 6: Verify — all three solver tests pass**

Reload smoke.html.

- [ ] **Step 7: Commit**

```bash
git add src/solver.js tests/smoke.js
git commit -m "solver: Rule 2 gas identification + 50/50 regression test"
```

---

## Task 3: Fixup helper — relocate frontier gas

**Files:**
- Modify: `src/solver.js`
- Modify: `tests/smoke.js`

`relocateFrontierGas` finds a gas adjacent to the revealed frontier and moves it to a distant empty cell, preserving total gas count. Mutates `grid` in place. Returns `true` if a move happened, `false` otherwise.

**Design note:** the spec says to *prefer* destinations with Chebyshev distance ≥ 4 from the revealed frontier. We implement that as a soft preference: try far cells first, fall back to any empty cell if none qualify. This keeps the helper usable on small test boards where few cells are "far".

- [ ] **Step 1: Append the fixup test**

Uses the same stuck 50/50 layout from Task 2, but validates that after relocation, the board becomes solvable.

```js
import { relocateFrontierGas } from '../src/solver.js';

test('relocateFrontierGas moves frontier gas and preserves gas count', () => {
  const b = buildBoard([
    'P.....',
    '......',
    '......',
    '......',
    '...#.#',
    '...#*E',
  ]);

  // First solve: confirms we start from the stuck state.
  const r1 = solve(b.grid, b.rows, b.cols, emptyGrid(6, 6), emptyGrid(6, 6), b.player, b.exit);
  assertEq(r1.solved, false);

  let gasBefore = 0;
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++)
    if (b.grid[r][c].type === 'gas') gasBefore++;

  const moved = relocateFrontierGas(
    b.grid, b.rows, b.cols, r1.revealed, r1.flagged, b.player, b.exit,
  );
  assertEq(moved, true);

  let gasAfter = 0;
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++)
    if (b.grid[r][c].type === 'gas') gasAfter++;
  assertEq(gasAfter, gasBefore);

  // The old gas location is empty now and exit is reachable via cascade.
  const r2 = solve(b.grid, b.rows, b.cols, emptyGrid(6, 6), emptyGrid(6, 6), b.player, b.exit);
  assertEq(r2.solved, true);
});
```

- [ ] **Step 2: Verify it fails (`relocateFrontierGas` not exported)**

Reload smoke.html. Expected: FAIL — import of `relocateFrontierGas` fails or function is undefined.

- [ ] **Step 3: Append `relocateFrontierGas` to `src/solver.js`**

Add at the bottom of `src/solver.js`:

```js
// Find a gas cell adjacent to the revealed frontier and move it to an empty
// cell far from that frontier (fallback: any empty cell). Mutates `grid` in
// place; returns true on success, false if no valid move exists.
export function relocateFrontierGas(grid, rows, cols, revealed, flagged, player, exit, opts = {}) {
  const FAR = opts.far ?? 4;

  // 1. Candidate sources: unflagged gas cells on the frontier.
  const sources = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].type !== 'gas') continue;
      if (flagged[r][c]) continue;
      let onFrontier = false;
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        if (revealed[nr][nc]) { onFrontier = true; break; }
      }
      if (onFrontier) sources.push({ r, c });
    }
  }
  if (sources.length === 0) return false;

  // 2. Candidate destinations: empty cells, not player/exit. Score by
  //    proximity to existing gas (denser clusters = easier deduction).
  //    Prefer cells with minDist-from-revealed >= FAR; fall back to any.
  const all = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].type !== 'empty') continue;
      if (r === player.r && c === player.c) continue;
      if (r === exit.r && c === exit.c) continue;

      let minDist = Infinity;
      outer: for (let rr = 0; rr < rows; rr++) {
        for (let cc = 0; cc < cols; cc++) {
          if (!revealed[rr][cc]) continue;
          const d = Math.max(Math.abs(r - rr), Math.abs(c - cc));
          if (d < minDist) minDist = d;
          if (minDist === 0) break outer;
        }
      }

      let score = 0;
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        if (grid[nr][nc].type === 'gas') score++;
      }

      all.push({ r, c, score, minDist });
    }
  }
  if (all.length === 0) return false;

  const farCells = all.filter(d => d.minDist >= FAR);
  const pool = farCells.length > 0 ? farCells : all;
  pool.sort((a, b) => b.score - a.score);
  const topScore = pool[0].score;
  const tops = pool.filter(d => d.score === topScore);
  const dest = tops[Math.floor(Math.random() * tops.length)];
  const src  = sources[Math.floor(Math.random() * sources.length)];

  // 3. Swap.
  grid[src.r][src.c].type = 'empty';
  grid[src.r][src.c].adjacent = 0;
  grid[dest.r][dest.c].type = 'gas';

  // 4. Recompute adjacency around both sites.
  recomputeAdjacencyAround(grid, rows, cols, src.r, src.c);
  recomputeAdjacencyAround(grid, rows, cols, dest.r, dest.c);

  return true;
}

function recomputeAdjacencyAround(grid, rows, cols, r, c) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const cell = grid[nr][nc];
      if (cell.type === 'wall' || cell.type === 'gas') continue;
      let n = 0;
      for (const [ddr, ddc] of DIRS) {
        const nnr = nr + ddr, nnc = nc + ddc;
        if (nnr < 0 || nnr >= rows || nnc < 0 || nnc >= cols) continue;
        if (grid[nnr][nnc].type === 'gas') n++;
      }
      cell.adjacent = n;
    }
  }
}
```

- [ ] **Step 4: Verify — all four solver tests pass**

Reload smoke.html.

- [ ] **Step 5: Commit**

```bash
git add src/solver.js tests/smoke.js
git commit -m "solver: relocateFrontierGas for generate-and-fix pipeline"
```

---

## Task 4: Pipeline wrapper — `makeSolvable` (solve + fixup loop)

**Files:**
- Modify: `src/solver.js`
- Modify: `tests/smoke.js`

- [ ] **Step 1: Append the wrapper tests**

```js
import { makeSolvable } from '../src/solver.js';

test('makeSolvable converges on a board that starts unsolvable', () => {
  const b = buildBoard([
    'P.....',
    '......',
    '......',
    '......',
    '...#.#',
    '...#*E',
  ]);
  const res = makeSolvable(
    b.grid, b.rows, b.cols,
    emptyGrid(6, 6), emptyGrid(6, 6),
    b.player, b.exit,
    { maxFixAttempts: 30 },
  );
  assertEq(res.solved, true);
  if (res.fixups < 1) throw new Error(`expected at least one fixup, got ${res.fixups}`);
});

test('makeSolvable returns solved=true with zero fixups on already-solvable board', () => {
  const b = buildBoard([
    'P.....',
    '......',
    '.....E',
  ]);
  const res = makeSolvable(
    b.grid, b.rows, b.cols,
    emptyGrid(3, 6), emptyGrid(3, 6),
    b.player, b.exit,
    { maxFixAttempts: 30 },
  );
  assertEq(res.solved, true);
  assertEq(res.fixups, 0);
});
```

- [ ] **Step 2: Verify both fail (`makeSolvable` not exported)**

Reload smoke.html.

- [ ] **Step 3: Add `makeSolvable` to `src/solver.js`**

Append:

```js
// High-level helper: repeatedly solve + relocate until the exit is reachable
// or maxFixAttempts exhausted. Mutates `grid` in place on each fixup.
export function makeSolvable(grid, rows, cols, revealed, flagged, player, exit, opts = {}) {
  const maxFixAttempts = opts.maxFixAttempts ?? 30;
  let fixups = 0;
  for (let attempt = 0; attempt <= maxFixAttempts; attempt++) {
    const res = solve(grid, rows, cols, revealed, flagged, player, exit);
    if (res.solved) return { solved: true, fixups };
    const moved = relocateFrontierGas(
      grid, rows, cols, res.revealed, res.flagged, player, exit, opts,
    );
    if (!moved) return { solved: false, fixups };
    fixups++;
  }
  return { solved: false, fixups };
}
```

- [ ] **Step 4: Verify — both wrapper tests pass**

Reload smoke.html.

- [ ] **Step 5: Commit**

```bash
git add src/solver.js tests/smoke.js
git commit -m "solver: makeSolvable wrapper"
```

---

## Task 5: A/B toggle — `?oldgen=1` URL flag

**Files:**
- Modify: `src/gameplay/level.js`

- [ ] **Step 1: Add the helper at the top of `src/gameplay/level.js`**

After the existing imports and before `const SAVE_KEY = 'miningCrawler.runState';`, insert:

```js
// A/B toggle: ?oldgen=1 skips the no-guess solver entirely to compare feel.
function isOldGenMode() {
  try {
    return new URLSearchParams(window.location.search).get('oldgen') === '1';
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Verify nothing broke**

Reload smoke.html — still passing. Reload `index.html` — still starts and plays.

- [ ] **Step 3: Commit**

```bash
git add src/gameplay/level.js
git commit -m "level: add isOldGenMode URL toggle helper"
```

---

## Task 6: Integrate solver+fixup into `initLevel()`

**Files:**
- Modify: `src/gameplay/level.js`

Insert the no-guess pass inside the existing `for (let attempt = 0; attempt < maxAttempts && !solved; attempt++)` block, after the `exitReachable && merchantReachable` check succeeds but before we set `solved = true`. If the no-guess pass fails, `continue` to the next attempt (regenerate from scratch).

- [ ] **Step 1: Add import at the top of `src/gameplay/level.js`**

Add to the imports section:

```js
import { makeSolvable } from '../solver.js';
```

- [ ] **Step 2: Modify the inner success branch**

Find in `src/gameplay/level.js`:

```js
    const exitReachable = isReachable(getPlayerRow(), getPlayerCol(), exit.r, exit.c);
    const merchantReachable = !merchantPos || isReachable(getPlayerRow(), getPlayerCol(), merchantPos.r, merchantPos.c);
    if (exitReachable && merchantReachable) {
      if (merchantPos) {
        setMerchant({ r: merchantPos.r, c: merchantPos.c, stock: rollMerchantStock(), rerollCount: 0 });
      }
      solved = true;
    }
```

Replace with:

```js
    const exitReachable = isReachable(getPlayerRow(), getPlayerCol(), exit.r, exit.c);
    const merchantReachable = !merchantPos || isReachable(getPlayerRow(), getPlayerCol(), merchantPos.r, merchantPos.c);
    if (exitReachable && merchantReachable) {
      if (!isOldGenMode()) {
        const probeRevealed = Array.from({ length: getRows() }, () => Array(getCols()).fill(false));
        const probeFlagged  = Array.from({ length: getRows() }, () => Array(getCols()).fill(false));
        const noGuessRes = makeSolvable(
          getGrid(), getRows(), getCols(),
          probeRevealed, probeFlagged,
          { r: getPlayerRow(), c: getPlayerCol() },
          exit,
          { maxFixAttempts: 30 },
        );
        if (!noGuessRes.solved) continue;
      }
      if (merchantPos) {
        setMerchant({ r: merchantPos.r, c: merchantPos.c, stock: rollMerchantStock(), rerollCount: 0 });
      }
      solved = true;
    }
```

- [ ] **Step 3: Manually verify in the browser**

With `npx serve .` running:
1. `http://localhost:3000/index.html` — start a new run. Play 2-3 levels. No console errors.
2. `http://localhost:3000/index.html?oldgen=1` — play 2-3 levels. Should feel like the old generation.

Subjectively note the difference — the later tuning pass will be driven by this.

- [ ] **Step 4: Verify smoke tests still pass**

Reload smoke.html.

- [ ] **Step 5: Commit**

```bash
git add src/gameplay/level.js
git commit -m "level: integrate no-guess solver/fixup into initLevel"
```

---

## Task 7: Metrics logging

**Files:**
- Modify: `src/gameplay/level.js`

Print one `[no-guess]` line per attempt so we can read fixup counts and timing from DevTools during playtest.

- [ ] **Step 1: Instrument the no-guess pass**

Find the block added in Task 6:

```js
      if (!isOldGenMode()) {
        const probeRevealed = Array.from({ length: getRows() }, () => Array(getCols()).fill(false));
        const probeFlagged  = Array.from({ length: getRows() }, () => Array(getCols()).fill(false));
        const noGuessRes = makeSolvable(
          getGrid(), getRows(), getCols(),
          probeRevealed, probeFlagged,
          { r: getPlayerRow(), c: getPlayerCol() },
          exit,
          { maxFixAttempts: 30 },
        );
        if (!noGuessRes.solved) continue;
      }
```

Replace with:

```js
      if (!isOldGenMode()) {
        const probeRevealed = Array.from({ length: getRows() }, () => Array(getCols()).fill(false));
        const probeFlagged  = Array.from({ length: getRows() }, () => Array(getCols()).fill(false));
        const t0 = performance.now();
        const noGuessRes = makeSolvable(
          getGrid(), getRows(), getCols(),
          probeRevealed, probeFlagged,
          { r: getPlayerRow(), c: getPlayerCol() },
          exit,
          { maxFixAttempts: 30 },
        );
        const tMs = Math.round(performance.now() - t0);
        console.info(`[no-guess] attempt=${attempt} fixups=${noGuessRes.fixups} solved=${noGuessRes.solved} t=${tMs}ms`);
        if (!noGuessRes.solved) continue;
      }
```

- [ ] **Step 2: Verify in browser console**

Reload `index.html`, start a run, play 5+ levels. Each level should print one `[no-guess]` line. Note:
- Typical `fixups` value.
- Max `t=NNms`.
- How often `solved=false` appears.

- [ ] **Step 3: Commit**

```bash
git add src/gameplay/level.js
git commit -m "level: log no-guess metrics for tuning"
```

---

## Task 8: Editor adapter — `checkSolvability`

**Files:**
- Create: `src/editor/solvabilityCheck.js`
- Modify: `tests/smoke.js`

Editor-shaped levels have `level.cells[r][c] = { type, goldValue? }` with no pre-computed adjacency. The adapter builds solver inputs, runs `solve`, returns `{ solved }`.

- [ ] **Step 1: Append the adapter tests**

```js
import { checkSolvability } from '../src/editor/solvabilityCheck.js';

test('checkSolvability accepts a solvable editor level', () => {
  const rows = 5, cols = 5;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) row.push({ type: 'empty' });
    cells.push(row);
  }
  const res = checkSolvability({
    rows, cols, cells,
    playerStart: { r: 0, c: 0 },
    exit: { r: 4, c: 4 },
  });
  // All-empty board → cascade reveals everything → exit reachable.
  assertEq(res.solved, true);
});

test('checkSolvability rejects a walled-off editor level', () => {
  const rows = 5, cols = 5;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) row.push({ type: 'empty' });
    cells.push(row);
  }
  cells[3][3] = { type: 'wall' };
  cells[3][4] = { type: 'wall' };
  cells[4][3] = { type: 'wall' };
  const res = checkSolvability({
    rows, cols, cells,
    playerStart: { r: 0, c: 0 },
    exit: { r: 4, c: 4 },
  });
  // Exit is fully walled in — no path exists at all.
  assertEq(res.solved, false);
});
```

- [ ] **Step 2: Verify both fail (module doesn't exist)**

Reload smoke.html.

- [ ] **Step 3: Create `src/editor/solvabilityCheck.js`**

```js
// Adapter: convert an editor-shaped level into solver inputs, run the
// solver, return a render-friendly result.
import { solve } from '../solver.js';

export function checkSolvability(level) {
  const { rows, cols } = level;
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const src = level.cells[r][c];
      if (src.type === 'wall')     row.push({ type: 'wall' });
      else if (src.type === 'gas') row.push({ type: 'gas' });
      else                         row.push({ type: 'empty' }); // empty, gold, etc.
    }
    grid.push(row);
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].type !== 'empty') continue;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          if (grid[nr][nc].type === 'gas') n++;
        }
      }
      grid[r][c].adjacent = n;
    }
  }
  const revealed = Array.from({ length: rows }, () => Array(cols).fill(false));
  const flagged  = Array.from({ length: rows }, () => Array(cols).fill(false));
  const res = solve(grid, rows, cols, revealed, flagged, level.playerStart, level.exit);
  return { solved: res.solved };
}
```

- [ ] **Step 4: Verify both adapter tests pass**

Reload smoke.html.

- [ ] **Step 5: Commit**

```bash
git add src/editor/solvabilityCheck.js tests/smoke.js
git commit -m "editor: solvability adapter + tests"
```

---

## Task 9: Editor — "Check Solvability" button

**Files:**
- Modify: `editor.html`
- Modify: `src/editor/editorDom.js`
- Modify: `src/editor/main.js`

- [ ] **Step 1: Find the Test Play button in `editor.html`**

Grep `editor.html` for `editor-test-play-btn` to locate the line.

- [ ] **Step 2: Add the new button next to it**

Immediately after the `<button id="editor-test-play-btn">...</button>` element, insert:

```html
<button id="editor-solvability-btn" type="button">Check Solvability</button>
```

- [ ] **Step 3: Expose the button element in `src/editor/editorDom.js`**

Append after the line `export const testPlayBtn   = document.getElementById('editor-test-play-btn');`:

```js
export const solvabilityBtn = document.getElementById('editor-solvability-btn');
```

- [ ] **Step 4: Wire the handler in `src/editor/main.js`**

Update the DOM import block:

Find:

```js
import {
  levelNameInput, rowsInput, colsInput, notesTextarea, paletteEl,
  menuBtn, menuDropdown, modalEl, modalContentEl, importInput, testPlayBtn,
} from './editorDom.js';
```

Replace with:

```js
import {
  levelNameInput, rowsInput, colsInput, notesTextarea, paletteEl,
  menuBtn, menuDropdown, modalEl, modalContentEl, importInput, testPlayBtn,
  solvabilityBtn,
} from './editorDom.js';
import { checkSolvability } from './solvabilityCheck.js';
```

Find the line `testPlayBtn.addEventListener('click', testPlayCurrentDraft);` and insert immediately below it:

```js
solvabilityBtn.addEventListener('click', () => {
  const level = toLevel();
  if (!level.playerStart || !level.exit) {
    alert('Set playerStart and exit first.');
    return;
  }
  const res = checkSolvability(level);
  if (res.solved) {
    alert('✓ Solvable — exit is deducible from the player start.');
  } else {
    alert('✗ Not solvable via Rules 1+2. The player will need to guess at least once.');
  }
});
```

- [ ] **Step 5: Manually verify in the editor**

Open `http://localhost:3000/editor.html`. Create a minimal level (drop player, drop exit, nothing else). Click "Check Solvability" — expect alert `✓ Solvable`.

Draw the stuck 50/50 pattern (walls at the exit corner forming the layout from Task 2's regression test). Click "Check Solvability" — expect alert `✗ Not solvable`.

- [ ] **Step 6: Commit**

```bash
git add editor.html src/editor/editorDom.js src/editor/main.js
git commit -m "editor: Check Solvability button"
```

---

## Task 10: Clarify carvePath fallback log

**Files:**
- Modify: `src/gameplay/level.js`

Annotate the existing `console.warn('initLevel: 50 attempts failed...')` so when it fires in no-guess mode we can see whether the solver was to blame. No behavior change.

- [ ] **Step 1: Update the warning string**

Find:

```js
  if (!solved) {
    console.warn('initLevel: 50 attempts failed, carving a guaranteed path from player to exit');
```

Replace with:

```js
  if (!solved) {
    console.warn(`initLevel: 50 attempts failed (noGuess=${!isOldGenMode()}), carving a guaranteed path from player to exit`);
```

- [ ] **Step 2: Verify smoke + game still run**

Reload smoke.html and play 1 level.

- [ ] **Step 3: Commit**

```bash
git add src/gameplay/level.js
git commit -m "level: annotate carvePath fallback log with noGuess mode"
```

---

## Task 11: Final verification + playtest notes

**Files:**
- Create: `docs/superpowers/plans/2026-04-23-no-guess-playtest-notes.md`

- [ ] **Step 1: Full smoke pass**

Reload smoke.html. Write down the passing count (e.g., "54/54 passing"). No failures.

- [ ] **Step 2: Playtest — no-guess mode**

Open `http://localhost:3000/index.html`. Play levels 1-8. Keep DevTools console open. For each level jot down the `fixups` count and `t=NNms`.

- [ ] **Step 3: Playtest — old-gen mode**

Open `http://localhost:3000/index.html?oldgen=1`. Play 3-5 levels. Subjective note: does it feel riskier? More guesses?

- [ ] **Step 4: Write the playtest notes file**

Create `docs/superpowers/plans/2026-04-23-no-guess-playtest-notes.md`:

```markdown
# No-Guess Generation Playtest Notes (2026-04-23)

## Smoke tests
- N/N passing (fill in real number).

## No-guess mode (default)
- Levels played: N
- Fixups per level (from `[no-guess]` logs):
  - median: X
  - max: Y
  - distribution: (level L: F fixups, ...)
- Generation time (t=NNms):
  - median: X ms
  - max: Y ms
- `solved=false` occurrences: N (out of M attempts)
- `initLevel: 50 attempts failed` warnings: N

## Old-gen mode (?oldgen=1)
- Levels played: N
- Subjective: (compare feel to no-guess — fewer deductions? more guesses? different pacing?)

## Decisions informed by this data
- Fixup budget of 30 seems (sufficient / too low / too high): ...
- Gas density of 20% is (appropriate / too high / too low) for no-guess: ...
- Likely follow-ups: (Rule 3? density tune? none?)
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-04-23-no-guess-playtest-notes.md
git commit -m "docs: no-guess gen playtest notes"
```

---

## Self-Review

**Spec coverage:**
- Phase 1 solver (Rules 1 & 2): Tasks 1-2. Rule 3 explicitly out of scope.
- Phase 2 editor check: Tasks 8-9.
- Phase 3 generate-and-fix pipeline: Tasks 3 (relocate), 4 (makeSolvable wrapper), 6 (initLevel integration), 10 (fallback log).
- Phase 4 tuning: out of scope (Task 11 produces the data that informs later tuning).
- Phase 5 viz: out of scope.
- Open question "should solver account for items?": No — solver validates from a pure deduce-only perspective. Items remain optional upside. (Spec's recommended answer.)
- Open question "performance budget < 50ms": Task 7 measures it; Task 11 reports.

**Placeholder scan:** No TBDs, no "similar to Task N", no hand-waves. All code blocks are complete and copy-pasteable. Each test layout is annotated with the deduction chain that validates it.

**Type consistency:**
- `solve(grid, rows, cols, revealed, flagged, player, exit)` — player/exit are `{ r, c }`.
- `relocateFrontierGas(grid, rows, cols, revealed, flagged, player, exit, opts?)` — same shape.
- `makeSolvable(...)` — same shape, returns `{ solved, fixups }`.
- `checkSolvability(level)` — adapter, returns `{ solved }`.
- Grid cells use `{ type, adjacent? }`; `type ∈ { 'empty', 'wall', 'gas', 'detonated' }` (solver treats `detonated` as known gas for counting).

**Noted caveats:**
- The solver validates deducibility from the player-only starting state, ignoring merchant/fountain pre-reveals and anchors. This is more conservative than actual play (real levels have extra info), meaning real play will feel at least as solvable as the solver confirms. Acceptable per spec.
- The solver's cascade treats gas cells as blocking (consistent with in-game `revealCell`). A gas cell is only "accounted for" when flagged — until then it's an ambiguous unrevealed non-wall neighbor. This matches Rule 1/Rule 2 semantics.

---

## Execution

Plan saved to `docs/superpowers/plans/2026-04-23-no-guess-generation.md` in the `feature/no-guess-gen` worktree at `.worktrees/no-guess-gen/`.

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute in this session using executing-plans, batch with checkpoints.

Which approach?
