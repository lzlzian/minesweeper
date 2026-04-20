# Module Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `game.js` (2476 lines) into focused ES modules under `src/`, enforce a strict state-boundary contract, and add a minimal smoke-test harness — with zero gameplay changes.

**Architecture:** Native ES modules, no build step. Only `state.js` touches `state.*`; every other module reads/writes via exported functions. 13 modules organized as `state.js`/`rulesets.js`/`audio.js`/`settings.js` leaves, `board/*` layer, `ui/*` layer, `gameplay/*` layer, with `main.js` (~50 lines) as entry point. Incremental migration: 19 tasks, each leaves the game playable and produces a rollback point.

**Tech Stack:** Plain HTML/CSS/JS, native ES modules, `npx serve . -l 3000` for local testing, localStorage for persistence, Web Audio API for SFX, HTML5 Audio for BGM.

**Reference spec:** `docs/superpowers/specs/2026-04-19-module-refactor-design.md`

**Ground rules for every task:**
- Read `docs/superpowers/specs/2026-04-19-module-refactor-design.md` before starting.
- Zero gameplay changes. If behavior differs post-task, the extraction is wrong.
- After finishing each task: run the game (`npx serve . -l 3000`, open `http://localhost:3000`), start a run, walk a few cells, open pause menu, quit to menu, continue from save. Run smoke harness (`http://localhost:3000/tests/smoke.html`). If either fails, fix before committing.
- Every step commits separately. Rollback = `git reset --hard HEAD~1`.

---

## Task 1: Flip entry point to ES module

**Goal:** Move `game.js` to `src/main.js` verbatim, switch `index.html` to load it as a module, remove inline `onclick` handlers, scaffold the empty test harness. No code changes beyond the handler swap.

**Files:**
- Create: `src/main.js` (copy of current `game.js`)
- Create: `tests/smoke.html`
- Create: `tests/smoke.js`
- Modify: `index.html`
- Delete: `game.js` (after copy)

- [ ] **Step 1: Create `src/` directory and copy `game.js` to `src/main.js`**

```bash
mkdir -p src tests
cp game.js src/main.js
```

- [ ] **Step 2: Update `index.html` to load `src/main.js` as a module, replace inline `onclick`**

Find in `index.html`:
```html
  <button id="pause-btn" onclick="renderPauseMenu()">⏸️</button>
```

Replace with:
```html
  <button id="pause-btn">⏸️</button>
```

Find in `index.html`:
```html
  <script src="game.js"></script>
```

Replace with:
```html
  <script type="module" src="src/main.js"></script>
```

- [ ] **Step 3: Wire the pause button listener in `src/main.js`**

At the bottom of `src/main.js` (after all function definitions, before the existing bootstrap/initialization code — find where other listeners like `viewportEl.addEventListener('pointerdown', ...)` are wired and add near there):

```js
document.getElementById('pause-btn').addEventListener('click', renderPauseMenu);
```

If there's no existing "wire listeners" section, add one at the very bottom of the file before any kickoff call (like `renderStartMenu()`). Look for the last function definition in `src/main.js` — add after that.

- [ ] **Step 4: Scaffold `tests/smoke.html`**

```html
<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Smoke Tests</title>
  <style>
    body { font-family: monospace; padding: 1em; }
    pre { white-space: pre-wrap; }
    .pass { color: #0a0; }
    .fail { color: #c00; }
  </style>
</head>
<body>
  <h1>Smoke Tests</h1>
  <pre id="out">Running…</pre>
  <script type="module" src="./smoke.js"></script>
</body>
</html>
```

- [ ] **Step 5: Scaffold `tests/smoke.js`**

```js
const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
  } catch (e) {
    results.push({ name, pass: false, err: e.message });
  }
}

function assertEq(a, b, msg) {
  if (a !== b) throw new Error(msg ?? `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertApprox(a, b, epsilon, msg) {
  if (Math.abs(a - b) > epsilon) throw new Error(msg ?? `expected ~${b} (±${epsilon}), got ${a}`);
}

// Tests get added in later tasks.

// Render
const out = document.getElementById('out');
const lines = results.map(r => {
  const status = r.pass ? 'PASS' : 'FAIL';
  const cls = r.pass ? 'pass' : 'fail';
  return `<span class="${cls}">${status}</span>  ${r.name}${r.err ? '  — ' + r.err : ''}`;
});
const summary = `${results.filter(r => r.pass).length}/${results.length} passing`;
out.innerHTML = [summary, '', ...lines].join('\n');
```

- [ ] **Step 6: Delete the old `game.js`**

```bash
rm game.js
```

- [ ] **Step 7: Start dev server and verify**

Run: `npx serve . -l 3000` (run in background or separate terminal)

Open in browser: `http://localhost:3000`

Expected:
- Start menu renders
- "New Run" starts a game
- Walking, digging, opening pause menu, opening shop, quit-to-menu all work identically to before

Open in browser: `http://localhost:3000/tests/smoke.html`

Expected: Page renders "0/0 passing" (no tests yet).

If either page fails to load or shows console errors about modules/imports, stop and diagnose before committing.

- [ ] **Step 8: Commit**

```bash
git add src/ tests/ index.html
git rm game.js
git commit -m "$(cat <<'EOF'
refactor: move game.js to src/main.js as ES module

Phase 0 of module refactor. Entry point is now <script type="module"
src="src/main.js">. Replaces the one inline onclick= handler with
addEventListener. Scaffolds empty tests/smoke.{html,js} harness.

No functional changes.

Ref: docs/superpowers/specs/2026-04-19-module-refactor-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extract `state.js` with strict boundary

**Goal:** Move the `state` singleton, constants, and all mutator functions into `src/state.js`. Introduce getters, setters, and semantic mutators. Replace every `state.*` reference in `src/main.js` with a function call. This is the bulk of the refactor — expect ~388 replacements.

**Files:**
- Create: `src/state.js`
- Modify: `src/main.js` (every function that references `state.*`)
- Modify: `tests/smoke.js`

- [ ] **Step 1: Create `src/state.js`**

```js
// ============================================================
// STATE
// ============================================================

export const MAX_HP = 3;
export const STEP_MS = 80;
export const CELL_SIZE = 40;
export const CELL_GAP = 2;
export const BOARD_PAD = 16;

const state = {
  gold: 0,
  stashGold: 0,
  hp: MAX_HP,
  level: 1,
  rows: 10,
  cols: 10,
  grid: [],
  revealed: [],
  flagged: [],
  gameOver: false,
  busy: false,
  playerRow: 0,
  playerCol: 0,
  exit: { r: 0, c: 0 },
  items: { potion: 0, scanner: 0, pickaxe: 0, row: 0, column: 0, cross: 0 },
  activeItem: null,
  levelsSinceMerchant: 0,
  merchant: null,
  fountain: null,
  rulesetId: null,
  biomeOverrides: null,
};

// Escape hatch — returns the singleton. Prefer typed accessors.
// Any use should be commented with why.
export function getState() { return state; }

// ----- Getters -----
export function getGold() { return state.gold; }
export function getStashGold() { return state.stashGold; }
export function getHp() { return state.hp; }
export function getLevel() { return state.level; }
export function getRows() { return state.rows; }
export function getCols() { return state.cols; }
export function getGrid() { return state.grid; }
export function getRevealed() { return state.revealed; }
export function getFlagged() { return state.flagged; }
export function getGameOver() { return state.gameOver; }
export function getBusy() { return state.busy; }
export function getPlayerRow() { return state.playerRow; }
export function getPlayerCol() { return state.playerCol; }
export function getExit() { return state.exit; }
export function getItems() { return state.items; }
export function getItemCount(key) { return state.items[key]; }
export function getActiveItem() { return state.activeItem; }
export function getLevelsSinceMerchant() { return state.levelsSinceMerchant; }
export function getMerchant() { return state.merchant; }
export function getFountain() { return state.fountain; }
export function getRulesetId() { return state.rulesetId; }
export function getBiomeOverrides() { return state.biomeOverrides; }

// ----- Semantic mutators (enforce invariants) -----
export function addGold(amount) {
  state.gold += amount;
}

export function spendGold(amount) {
  // Deduct from current-level gold first, overflow into stash.
  if (state.gold >= amount) {
    state.gold -= amount;
  } else {
    const remainder = amount - state.gold;
    state.gold = 0;
    state.stashGold -= remainder;
  }
}

export function moveGoldToStash() {
  state.stashGold += state.gold;
  state.gold = 0;
}

export function damagePlayer(amount) {
  state.hp = Math.max(0, state.hp - amount);
  return state.hp;
}

export function healPlayer(amount) {
  state.hp = Math.min(MAX_HP, state.hp + amount);
  return state.hp;
}

export function addItem(key, count = 1) {
  state.items[key] = (state.items[key] ?? 0) + count;
}

export function consumeItem(key) {
  if (state.items[key] <= 0) throw new Error(`cannot consume ${key}: count is ${state.items[key]}`);
  state.items[key]--;
}

// ----- Simple setters (no invariants) -----
export function setPlayerPosition(r, c) {
  state.playerRow = r;
  state.playerCol = c;
}

export function setGrid(grid) { state.grid = grid; }
export function setRevealed(revealed) { state.revealed = revealed; }
export function setFlagged(flagged) { state.flagged = flagged; }
export function setGameOver(v) { state.gameOver = v; }
export function setBusy(v) { state.busy = v; }
export function setExit(exit) { state.exit = exit; }
export function setActiveItem(v) { state.activeItem = v; }
export function setLevelsSinceMerchant(v) { state.levelsSinceMerchant = v; }
export function incrementLevelsSinceMerchant() { state.levelsSinceMerchant++; }
export function setMerchant(m) { state.merchant = m; }
export function setFountain(f) { state.fountain = f; }
export function setLevel(n) { state.level = n; }
export function incrementLevel() { state.level++; }
export function setRows(n) { state.rows = n; }
export function setCols(n) { state.cols = n; }
export function setRulesetId(id) { state.rulesetId = id; }
export function setBiomeOverrides(o) { state.biomeOverrides = o; }
export function setItems(items) { state.items = items; }

// ----- Lifecycle -----
export function resetForNewRun() {
  state.level = 1;
  state.hp = MAX_HP;
  state.gold = 0;
  state.stashGold = 0;
  state.levelsSinceMerchant = 0;
  state.items = { potion: 1, scanner: 1, pickaxe: 1, row: 1, column: 1, cross: 1 };
  state.rulesetId = null;
}

// Used by retryLevel — zero current-level gold (stash untouched).
export function resetLevelGold() { state.gold = 0; }

// Used by retryLevel — restore HP to max regardless of current value.
export function fullHeal() { state.hp = MAX_HP; }

// ----- Save/load -----
export function getSavePayload() {
  return {
    level: state.level,
    stashGold: state.stashGold,
    items: { ...state.items },
    levelsSinceMerchant: state.levelsSinceMerchant,
    rulesetId: state.rulesetId,
    hp: state.hp,
  };
}

export function applySavePayload(save) {
  state.level = save.level;
  state.gold = 0;
  state.stashGold = save.stashGold;
  state.levelsSinceMerchant = save.levelsSinceMerchant;
  state.items = { ...save.items };
  // Back-compat: saves from before line-reveal items lack these keys.
  state.items.row = state.items.row ?? 0;
  state.items.column = state.items.column ?? 0;
  state.items.cross = state.items.cross ?? 0;
  // Back-compat: saves from before the ruleset framework.
  state.rulesetId = save.rulesetId ?? null;
  // Back-compat: saves from before persistent HP.
  state.hp = save.hp ?? MAX_HP;
}
```

- [ ] **Step 2: Update `src/main.js` — remove the now-moved declarations and import from state.js**

At the top of `src/main.js`, find the STATE section (lines starting around line 1-41 of the original):

```js
// ============================================================
// STATE
// ============================================================

const MAX_HP = 3;
const STEP_MS = 80;

const state = {
  // ... big state object ...
};

function spendGold(amount) {
  // ...
}
```

Replace with:

```js
import {
  MAX_HP, STEP_MS, CELL_SIZE, CELL_GAP, BOARD_PAD,
  getState,
  getGold, getStashGold, getHp, getLevel, getRows, getCols,
  getGrid, getRevealed, getFlagged, getGameOver, getBusy,
  getPlayerRow, getPlayerCol, getExit, getItems, getItemCount,
  getActiveItem, getLevelsSinceMerchant, getMerchant, getFountain,
  getRulesetId, getBiomeOverrides,
  addGold, spendGold, moveGoldToStash, damagePlayer, healPlayer,
  addItem, consumeItem,
  setPlayerPosition, setGrid, setRevealed, setFlagged, setGameOver,
  setBusy, setExit, setActiveItem, setLevelsSinceMerchant,
  incrementLevelsSinceMerchant, setMerchant, setFountain, setLevel,
  incrementLevel, setRows, setCols, setRulesetId, setBiomeOverrides,
  setItems,
  resetForNewRun, resetLevelGold, fullHeal,
  getSavePayload, applySavePayload,
} from './state.js';
```

Also remove the duplicate declarations of `CELL_SIZE`, `CELL_GAP`, `BOARD_PAD` further down in `src/main.js` (around line 193-195 of original) — these now come from `state.js`.

- [ ] **Step 3: Replace every `state.*` read with a getter, and every `state.*` write with a mutator**

This is mechanical find-and-replace. Do these substitutions across the entire `src/main.js` file:

**Read replacements (use ripgrep to find all, then substitute one by one):**

| Pattern | Replace with |
|---|---|
| `state.gold` (read only) | `getGold()` |
| `state.stashGold` (read only) | `getStashGold()` |
| `state.hp` (read only) | `getHp()` |
| `state.level` (read only) | `getLevel()` |
| `state.rows` (read only) | `getRows()` |
| `state.cols` (read only) | `getCols()` |
| `state.grid` (read only) | `getGrid()` |
| `state.revealed` (read only) | `getRevealed()` |
| `state.flagged` (read only) | `getFlagged()` |
| `state.gameOver` (read only) | `getGameOver()` |
| `state.busy` (read only) | `getBusy()` |
| `state.playerRow` (read only) | `getPlayerRow()` |
| `state.playerCol` (read only) | `getPlayerCol()` |
| `state.exit` (read only) | `getExit()` |
| `state.items` (read only, when accessed as object) | `getItems()` |
| `state.items[key]` (read only) | `getItemCount(key)` |
| `state.activeItem` (read only) | `getActiveItem()` |
| `state.levelsSinceMerchant` (read only) | `getLevelsSinceMerchant()` |
| `state.merchant` (read only) | `getMerchant()` |
| `state.fountain` (read only) | `getFountain()` |
| `state.rulesetId` (read only) | `getRulesetId()` |
| `state.biomeOverrides` (read only) | `getBiomeOverrides()` |

**Write replacements — ordered by frequency and pattern:**

Specific patterns to replace wholesale:
- `state.gold += X` → `addGold(X)`
- `state.gold = 0` (specifically in `nextLevel` before the `state.level++`) → remove (covered by `moveGoldToStash()` now)
- `state.stashGold += state.gold; state.gold = 0` → `moveGoldToStash()`
- `state.hp -= X` → `damagePlayer(X)`
- `state.hp = Math.min(MAX_HP, state.hp + X)` → `healPlayer(X)`
- `state.items[key]--` → `consumeItem(key)`
- `state.items[key]++` or `state.items[key] = (state.items[key] ?? 0) + 1` → `addItem(key, 1)` (or the count)
- `state.playerRow = r; state.playerCol = c` → `setPlayerPosition(r, c)`
- `state.grid = X` → `setGrid(X)`
- `state.revealed = X` → `setRevealed(X)`
- `state.flagged = X` → `setFlagged(X)`
- `state.gameOver = X` → `setGameOver(X)`
- `state.busy = X` → `setBusy(X)`
- `state.exit = X` → `setExit(X)`
- `state.activeItem = X` → `setActiveItem(X)`
- `state.levelsSinceMerchant = X` → `setLevelsSinceMerchant(X)`
- `state.levelsSinceMerchant++` → `incrementLevelsSinceMerchant()`
- `state.merchant = X` → `setMerchant(X)`
- `state.fountain = X` → `setFountain(X)`
- `state.level = X` → `setLevel(X)`
- `state.level++` → `incrementLevel()`
- `state.rows = X` → `setRows(X)`
- `state.cols = X` → `setCols(X)`
- `state.rulesetId = X` → `setRulesetId(X)`
- `state.biomeOverrides = X` → `setBiomeOverrides(X)`
- `state.items = X` → `setItems(X)`

**Consolidate `startGame`:**

Find:
```js
function startGame() {
  document.body.classList.add('in-run');
  clearSave();
  state.level = 1;
  state.hp = MAX_HP;
  state.gold = 0;
  state.stashGold = 0;
  state.levelsSinceMerchant = 0;
  state.items = { potion: 1, scanner: 1, pickaxe: 1, row: 1, column: 1, cross: 1 };
  state.rulesetId = null;
  initLevel();
  // ...
}
```

Replace with:
```js
function startGame() {
  document.body.classList.add('in-run');
  clearSave();
  resetForNewRun();
  initLevel();
  // ...
}
```

**Consolidate `nextLevel`:**

Find:
```js
function nextLevel() {
  state.stashGold += state.gold;
  state.gold = 0;
  state.level++;
  if (state.biomeOverrides?.freezePityTick) {
    // Freeze pity timer
  } else if (state.merchant) {
    state.levelsSinceMerchant = 0;
  } else {
    state.levelsSinceMerchant++;
  }
  state.rulesetId = null;
  // ...
}
```

Replace with:
```js
function nextLevel() {
  moveGoldToStash();
  incrementLevel();
  const overrides = getBiomeOverrides();
  if (overrides?.freezePityTick) {
    // Freeze pity timer: do not increment levelsSinceMerchant across this level.
  } else if (getMerchant()) {
    setLevelsSinceMerchant(0);
  } else {
    incrementLevelsSinceMerchant();
  }
  setRulesetId(null);
  // ...
}
```

**Consolidate `retryLevel`:**

Find:
```js
function retryLevel() {
  state.gold = 0;
  state.hp = MAX_HP;
  initLevel();
  // ...
}
```

Replace the direct `hp` reset with `healPlayer(MAX_HP)`:
```js
function retryLevel() {
  // reset to full — healPlayer clamps at MAX_HP regardless of current value
  healPlayer(MAX_HP);
  // gold at 0 — zero-out via spend/add combo
  spendGold(getGold());
  initLevel();
  // ...
}
```

Use the `resetLevelGold()` and `fullHeal()` mutators already defined in state.js (Step 1):
```js
function retryLevel() {
  resetLevelGold();
  fullHeal();
  initLevel();
  // ...
}
```

Make sure `resetLevelGold` and `fullHeal` are included in the imports at the top of `src/main.js`.

**Consolidate `saveRun`:**

Find:
```js
function saveRun() {
  const data = {
    level: state.level,
    stashGold: state.stashGold,
    items: { ...state.items },
    levelsSinceMerchant: state.levelsSinceMerchant,
    rulesetId: state.rulesetId,
    hp: state.hp,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}
```

Replace with:
```js
function saveRun() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(getSavePayload()));
}
```

**Consolidate `resumeGame`:**

Replace the entire state-assignment block with `applySavePayload(save)`:
```js
function resumeGame(save) {
  document.body.classList.add('in-run');
  applySavePayload(save);
  initLevel();
  updatePlayerSprite(true);
  hurtFlashToken++;
  playerSprite.textContent = '🙂';
  startBgm();
}
```

**Cell access:** Per the spec, grid cells are "checked out" — `getGrid()[r][c].type = 'empty'` is fine. Do NOT try to route cell mutations through state.js.

- [ ] **Step 4: Remove the `state`-access escape hatch from main.js**

After all replacements, search `src/main.js` for any remaining `state.` references:

```bash
grep -n "state\." src/main.js
```

Expected: only matches inside string literals or comments (e.g., `"state"` in a save key name, `// level-scoped state` comments). If you see actual code references, replace them.

If a reference is genuinely hard to route (rare — but e.g., iterating all keys of `state.items`), use `getState()` with a comment explaining why.

- [ ] **Step 5: Add the save/load round-trip test to smoke harness**

Edit `tests/smoke.js`. Add after the `// Tests get added in later tasks.` comment:

```js
// -- state round-trip --
import {
  resetForNewRun, getSavePayload, applySavePayload,
  getLevel, getHp, getItems, getStashGold, getRulesetId,
  setLevel, damagePlayer, addGold, moveGoldToStash, consumeItem,
} from '../src/state.js';

test('save/load round-trip preserves run-scoped fields', () => {
  resetForNewRun();
  setLevel(5);
  damagePlayer(1); // hp 3 -> 2
  addGold(20);
  moveGoldToStash(); // stash 0 -> 20
  consumeItem('potion'); // potion 1 -> 0

  const snap = getSavePayload();

  // Mutate state after snapshot
  setLevel(99);
  damagePlayer(2);
  addGold(1000);

  applySavePayload(snap);

  assertEq(getLevel(), 5);
  assertEq(getHp(), 2);
  assertEq(getStashGold(), 20);
  assertEq(getItems().potion, 0);
});

test('resetForNewRun restores defaults', () => {
  damagePlayer(2);
  addGold(500);
  resetForNewRun();
  assertEq(getHp(), 3);
  assertEq(getItems().potion, 1);
  assertEq(getStashGold(), 0);
});
```

- [ ] **Step 6: Start dev server and verify game + smoke harness**

Run: `npx serve . -l 3000`

Open `http://localhost:3000`:
- Start menu renders, "New Run" works, walking/digging works, shop opens/buys/rerolls, pause menu works, quit-to-menu + continue works
- HP is deducted on gas detonation, heals via fountain, full-reset on death
- Gold accumulates in HUD, merges into stash on `nextLevel`

Open `http://localhost:3000/tests/smoke.html`:
- Expect `2/2 passing` with both round-trip tests green

If game behavior differs (HP doesn't clamp, gold goes negative, items consumed don't decrement) — the mutator wiring is wrong. Stop and debug before committing.

- [ ] **Step 7: Run enforcement grep**

```bash
grep -rn "state\." src/main.js
```

Any match in executable code is a bug. Matches inside comments (`// run-scoped state`) or strings (`'state.json'`) are OK. Fix any real violations before committing.

- [ ] **Step 8: Commit**

```bash
git add src/ tests/
git commit -m "$(cat <<'EOF'
refactor: extract state.js with strict boundary

All state access/mutation now goes through state.js exports. Introduces
semantic mutators (damagePlayer, healPlayer, spendGold, addGold,
moveGoldToStash, addItem, consumeItem, resetForNewRun) alongside
getters for every externally-read field. Save/load consolidated into
getSavePayload/applySavePayload.

main.js no longer references state.* directly. Adds round-trip tests
to smoke harness (2 tests).

Phase 1.2 of module refactor.
Ref: docs/superpowers/specs/2026-04-19-module-refactor-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Extract `audio.js`

**Goal:** Move audio context, SFX buffers, BGM, and audio settings functions into `src/audio.js`.

**Files:**
- Create: `src/audio.js`
- Modify: `src/main.js`

- [ ] **Step 1: Create `src/audio.js` with all audio code**

Copy the "AUDIO" section of `src/main.js` (the block currently starting around the `// AUDIO` banner — lines ~417-491 of the original, covering `SFX_VOLUME`, `BGM_VOLUME`, `audioCtx`, `sfxGain`, `sfxBuffers`, `sfxPaths`, `resumeAudioCtx`, `playSfx`, `bgm`, `startBgm`, `setMusicOn`, `setSfxOn`) into `src/audio.js`.

Prepend an import from `./settings.js`:
```js
import { settings } from './settings.js';
```

Wait — `settings.js` hasn't been extracted yet. For this task, import the settings object from `main.js` via a temporary local reference: have `setMusicOn` and `setSfxOn` take the settings object as a parameter, or access `settings` via a getter passed in. Simplest path: keep `settings` in `main.js` for now, and export `setMusicOn(value, settings)` / `setSfxOn(value, settings)` that take settings as an arg.

Actually simpler: extract audio.js with no dependency on settings — just export the functions that flip internal audio state. Let main.js handle the settings persistence:

```js
// src/audio.js
const SFX_VOLUME = 0.5;
const BGM_VOLUME = 0.15;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const sfxGain = audioCtx.createGain();
sfxGain.gain.value = SFX_VOLUME;
sfxGain.connect(audioCtx.destination);

const sfxBuffers = {};
const sfxPaths = {
  // ...copy the exact object from main.js...
};

// Load all buffers at import time
for (const [name, path] of Object.entries(sfxPaths)) {
  fetch(path)
    .then(r => r.arrayBuffer())
    .then(b => audioCtx.decodeAudioData(b))
    .then(d => { sfxBuffers[name] = d; })
    .catch(() => {});
}

let sfxEnabled = true;
let musicEnabled = true;

export function resumeAudioCtx() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

export function playSfx(name) {
  if (!sfxEnabled) return;
  const buf = sfxBuffers[name];
  if (!buf) return;
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.connect(sfxGain);
  src.start();
}

const bgm = new Audio('assets/sounds/background-music.mp3');
bgm.loop = true;
bgm.volume = BGM_VOLUME;

export function startBgm() {
  if (!musicEnabled) return;
  bgm.play().catch(() => {});
}

export function setMusicOn(value) {
  musicEnabled = value;
  if (value) bgm.play().catch(() => {});
  else bgm.pause();
}

export function setSfxOn(value) {
  sfxEnabled = value;
}
```

Reference the full original code in `src/main.js` for the exact `sfxPaths` object and any details I've abbreviated. Copy verbatim — don't paraphrase.

- [ ] **Step 2: Update `src/main.js` to import from `./audio.js`**

Remove the original AUDIO block from `src/main.js`.

Add to the imports at the top:
```js
import { resumeAudioCtx, playSfx, startBgm, setMusicOn, setSfxOn } from './audio.js';
```

The `settings` object in `src/main.js` handling — `renderSettings` currently does:
```js
toggle.addEventListener('click', () => {
  settings.musicOn = !settings.musicOn;
  saveSettings();
  setMusicOn(settings.musicOn);
  // ...
});
```

This still works — just make sure `setMusicOn` is called with the new value, and the audio module keeps its internal flag in sync.

**Initial sync:** after settings load, explicitly call `setMusicOn(settings.musicOn)` and `setSfxOn(settings.sfxOn)` once at startup so audio module's flags match persisted settings. Add near the top of `src/main.js` after settings loads:

```js
setMusicOn(settings.musicOn);
setSfxOn(settings.sfxOn);
```

Find where `resumeAudioCtx` is called (currently inside the pointer handler) — that still works via the import.

- [ ] **Step 3: Verify**

Run: `npx serve . -l 3000`

Open `http://localhost:3000`:
- Click a grid cell to dig — should hear a sound
- Pick up gold — should hear a different sound
- Background music should play
- Toggle music off in settings — music stops
- Toggle SFX off in settings — clicks are silent

Open `http://localhost:3000/tests/smoke.html`:
- Expect `2/2 passing` (no new tests in this task)

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "$(cat <<'EOF'
refactor: extract audio.js

Moves Web Audio setup, SFX buffer loading, BGM, and on/off toggles into
its own module. main.js now imports from ./audio.js.

Phase 1.3 of module refactor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Extract `settings.js`

**Goal:** Move settings load/save into `src/settings.js`.

**Files:**
- Create: `src/settings.js`
- Modify: `src/main.js`

- [ ] **Step 1: Create `src/settings.js`**

```js
const SETTINGS_KEY = 'miningCrawler.settings';

function loadSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  const defaults = { musicOn: true, sfxOn: true };
  if (!raw) return { ...defaults };
  try {
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

export const settings = loadSettings();

export function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
```

- [ ] **Step 2: Update `src/main.js`**

Remove the original SETTINGS block (the `SETTINGS_KEY`, `loadSettings`, `saveSettings`, and `const settings = loadSettings()` lines).

Add to the imports:
```js
import { settings, saveSettings } from './settings.js';
```

All existing `settings.musicOn` / `settings.sfxOn` reads and writes continue to work via the shared reference.

- [ ] **Step 3: Verify**

Run: `npx serve . -l 3000`

- Toggle music off in settings, refresh the page, verify music stays off
- Toggle music back on, refresh, verify music plays

Open `http://localhost:3000/tests/smoke.html`:
- Expect `2/2 passing`

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "$(cat <<'EOF'
refactor: extract settings.js

Phase 1.4 of module refactor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Extract `rulesets.js`

**Goal:** Move the ruleset registry, `weightedPick`, `resolveRuleset`, `prepare`/`apply` variants, `gridSizeForLevel`, `anchorCountForSize` into `src/rulesets.js`. Add smoke tests for `weightedPick` and `priceFromTier` (note: `priceFromTier` lives in merchant code, extract just its test scaffolding now — actual test will be added in Task 15).

**Files:**
- Create: `src/rulesets.js`
- Modify: `src/main.js`
- Modify: `tests/smoke.js`

- [ ] **Step 1: Create `src/rulesets.js`**

Copy the entire "RULESETS" section from `src/main.js` (currently lines ~45-152 of the original — the `RULESETS` array, `prepareTreasureChamber`, `applyTreasureChamber`, `weightedPick`, `resolveRuleset`, `gridSizeForLevel`, `anchorCountForSize`).

The rulesets reference state — change them to use imports from `./state.js`. Example for `applyTreasureChamber`:

```js
import {
  getGrid, getRows, getCols, setFountain, getFountain,
  // ...any other state accessors this code uses...
} from './state.js';

// Then inside applyTreasureChamber, replace state.grid with getGrid(), state.rows with getRows(), etc.
```

Export every function and the registry:
```js
export const RULESETS = [ /* ... */ ];
export function weightedPick(list) { /* ... */ }
export function resolveRuleset(id) { /* ... */ }
export function gridSizeForLevel(level) { /* ... */ }
export function anchorCountForSize(size) { /* ... */ }
```

`prepareTreasureChamber` and `applyTreasureChamber` don't need to be exported — they're only used by the `RULESETS` registry entry. Keep them module-private.

**Important:** `applyTreasureChamber` currently calls `countAdjacentGas` and `cleanMerchantCell` (per the spec summary, the chamber re-aligns some cells). These functions live in `src/main.js` at this point. Either:
- (A) Move those helpers to `src/board/generation.js` in this same task (expands scope), or
- (B) Pass them in as arguments to the ruleset's `apply` hook (changes ruleset framework contract — bigger), or
- (C) Temporarily `import` them from `./main.js` (creates circular dep).

Best option: **(D)** Leave `applyTreasureChamber` behavior in `src/main.js` for now. In `src/rulesets.js`, have `applyTreasureChamber` be a thin stub that gets assigned from main.js at startup:

```js
// src/rulesets.js
let applyTreasureChamberImpl = () => { throw new Error('ruleset apply not installed'); };
let prepareTreasureChamberImpl = () => {};

export function installRulesetHooks({ prepareTreasureChamber, applyTreasureChamber }) {
  prepareTreasureChamberImpl = prepareTreasureChamber;
  applyTreasureChamberImpl = applyTreasureChamber;
}

export const RULESETS = [
  { id: 'regular', weight: 9, prepare: null, apply: null },
  {
    id: 'treasure_chamber',
    weight: 1,
    prepare: (state) => prepareTreasureChamberImpl(state),
    apply: (state) => applyTreasureChamberImpl(state),
  },
];
```

Then in `src/main.js`, keep `prepareTreasureChamber` and `applyTreasureChamber` in place, and at the top (after imports) call:
```js
import { installRulesetHooks } from './rulesets.js';
// ...
installRulesetHooks({ prepareTreasureChamber, applyTreasureChamber });
```

They'll get cleanly relocated in Task 7 (board/generation extraction) since that's where `countAdjacentGas` lives.

- [ ] **Step 2: Update `src/main.js`**

Remove the RULESETS section (registry + `weightedPick` + `resolveRuleset` + `gridSizeForLevel` + `anchorCountForSize` — but keep `prepareTreasureChamber` and `applyTreasureChamber` for now).

Add to the imports:
```js
import {
  RULESETS, weightedPick, resolveRuleset,
  gridSizeForLevel, anchorCountForSize, installRulesetHooks,
} from './rulesets.js';
```

After the imports, call:
```js
installRulesetHooks({ prepareTreasureChamber, applyTreasureChamber });
```

The hooks get set before `initLevel` runs (since `initLevel` is called from `startGame`/`resumeGame`, which happen after the bootstrap).

- [ ] **Step 3: Add `weightedPick` test to smoke harness**

Edit `tests/smoke.js`. Before the rendering section, add:

```js
// -- rulesets --
import { weightedPick, gridSizeForLevel, anchorCountForSize } from '../src/rulesets.js';

test('weightedPick returns first item when random is 0', () => {
  const orig = Math.random;
  Math.random = () => 0;
  const result = weightedPick([
    { id: 'a', weight: 1 },
    { id: 'b', weight: 9 },
  ]);
  Math.random = orig;
  assertEq(result.id, 'a');
});

test('weightedPick returns last item when random is ~1', () => {
  const orig = Math.random;
  Math.random = () => 0.9999;
  const result = weightedPick([
    { id: 'a', weight: 1 },
    { id: 'b', weight: 9 },
  ]);
  Math.random = orig;
  assertEq(result.id, 'b');
});

test('gridSizeForLevel curve', () => {
  // Actual values depend on current curve; sanity-check a few points.
  const s1 = gridSizeForLevel(1);
  const s20 = gridSizeForLevel(20);
  if (s1 < 10 || s1 > 12) throw new Error(`level 1 size unexpected: ${s1}`);
  if (s20 < s1) throw new Error(`level 20 should be >= level 1`);
});

test('anchorCountForSize monotonic non-decreasing', () => {
  const sizes = [10, 12, 14, 16, 18, 20];
  let prev = -1;
  for (const s of sizes) {
    const n = anchorCountForSize(s);
    if (n < prev) throw new Error(`anchor count decreased at size ${s}`);
    prev = n;
  }
});
```

- [ ] **Step 4: Verify**

Run: `npx serve . -l 3000`

Open `http://localhost:3000`:
- Start a run, progress to level 13+, verify treasure chamber levels occasionally appear (10% rate, may need many levels)
- Verify game plays identically on `regular` levels

Open `http://localhost:3000/tests/smoke.html`:
- Expect `6/6 passing` (2 previous + 4 new)

- [ ] **Step 5: Commit**

```bash
git add src/ tests/
git commit -m "$(cat <<'EOF'
refactor: extract rulesets.js

RULESETS registry and helpers moved to rulesets.js. Treasure chamber
apply/prepare functions stay in main.js temporarily (they call
countAdjacentGas which lives in main.js until board/generation
extraction). Hook-injection pattern (installRulesetHooks) bridges them
until then.

Adds weightedPick, gridSizeForLevel, anchorCountForSize tests.

Phase 1.5 of module refactor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Extract `src/board/layout.js`

**Goal:** Move pathing, corner selection, reachability, and carving into `src/board/layout.js`. Add `findPath` and `isReachable` tests.

**Files:**
- Create: `src/board/layout.js`
- Modify: `src/main.js`
- Modify: `tests/smoke.js`

- [ ] **Step 1: Create `src/board/layout.js`**

```bash
mkdir -p src/board
```

Copy these functions from `src/main.js` into `src/board/layout.js`:
- `findNearCorner(anchorR, anchorC)`
- `pickPlayerStart()`
- `pickExit(playerR, playerC)`
- `pickMerchantCorner()`
- `cleanMerchantCell(r, c)` — NOTE: currently calls `countAdjacentGas` (lives in `main.js`). Leave `cleanMerchantCell` in `main.js` for now, move it in Task 7.
- `hasNonWallNeighbor(r, c)`
- `isReachable(fromR, fromC, toR, toC)`
- `carvePath(fromR, fromC, toR, toC)` — NOTE: calls `countAdjacentGas`. Leave in `main.js` for Task 7 too.
- `findPath(fromR, fromC, toR, toC)`
- `STEP_DIRS` constant

Revised list for this task (skip anything that calls countAdjacentGas):
- `findNearCorner`
- `pickPlayerStart`
- `pickExit`
- `pickMerchantCorner`
- `hasNonWallNeighbor`
- `isReachable`
- `findPath`
- `STEP_DIRS`

Add state imports:
```js
import { getGrid, getRows, getCols } from '../state.js';
```

Export everything:
```js
export const STEP_DIRS = [ /* ... */ ];
export function findNearCorner(anchorR, anchorC) { /* ... */ }
// ...etc
```

Replace `state.grid` → `getGrid()`, `state.rows` → `getRows()`, `state.cols` → `getCols()` inside these functions.

- [ ] **Step 2: Update `src/main.js`**

Remove the moved functions. Add imports:
```js
import {
  STEP_DIRS, findNearCorner, pickPlayerStart, pickExit,
  pickMerchantCorner, hasNonWallNeighbor, isReachable, findPath,
} from './board/layout.js';
```

- [ ] **Step 3: Add path tests to smoke harness**

Edit `tests/smoke.js`. Add:

```js
// -- board layout --
import { isReachable, findPath } from '../src/board/layout.js';
import { setGrid, setRows, setCols } from '../src/state.js';

function makeEmptyGrid(rows, cols) {
  const g = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push({ type: 'empty', adjacent: 0, goldValue: 0, item: null });
    }
    g.push(row);
  }
  return g;
}

test('isReachable finds path in empty grid', () => {
  setRows(5); setCols(5);
  setGrid(makeEmptyGrid(5, 5));
  if (!isReachable(0, 0, 4, 4)) throw new Error('expected reachable');
});

test('isReachable returns false through wall ring', () => {
  setRows(5); setCols(5);
  const g = makeEmptyGrid(5, 5);
  // Ring walls around (2,2), surround it
  g[1][1].type = 'wall'; g[1][2].type = 'wall'; g[1][3].type = 'wall';
  g[2][1].type = 'wall';                         g[2][3].type = 'wall';
  g[3][1].type = 'wall'; g[3][2].type = 'wall'; g[3][3].type = 'wall';
  setGrid(g);
  if (isReachable(0, 0, 2, 2)) throw new Error('expected unreachable');
});

test('findPath returns a path of adjacent cells', () => {
  setRows(5); setCols(5);
  setGrid(makeEmptyGrid(5, 5));
  const path = findPath(0, 0, 2, 2);
  if (!path || path.length === 0) throw new Error('expected path');
  // Verify first cell is start-adjacent, last is target
  const last = path[path.length - 1];
  if (last.r !== 2 || last.c !== 2) throw new Error('path does not end at target');
});
```

- [ ] **Step 4: Verify**

Run: `npx serve . -l 3000`

Open `http://localhost:3000`:
- Start a run, walk around (walking uses `findPath`)
- Complete a level (exit uses `pickExit`)
- Observe a merchant level — merchant spawn uses `pickMerchantCorner`

Open `http://localhost:3000/tests/smoke.html`:
- Expect `9/9 passing`

- [ ] **Step 5: Commit**

```bash
git add src/ tests/
git commit -m "$(cat <<'EOF'
refactor: extract board/layout.js

Moves corner/path/reachability helpers to board/layout.js. cleanMerchantCell
and carvePath stay in main.js for Task 7 (need countAdjacentGas).

Adds 3 path tests to smoke harness.

Phase 2.6 of module refactor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Extract `src/board/generation.js`

**Goal:** Move wall/gas/grid generation, gold veins, item drops, anchors, `countAdjacentGas`, `cleanMerchantCell`, `carvePath`, `prepareTreasureChamber`, `applyTreasureChamber` into `src/board/generation.js`. Add `countAdjacentGas` test. Remove the `installRulesetHooks` temporary plumbing.

**Files:**
- Create: `src/board/generation.js`
- Modify: `src/main.js`
- Modify: `src/rulesets.js`
- Modify: `tests/smoke.js`

- [ ] **Step 1: Create `src/board/generation.js`**

Copy these functions from `src/main.js`:
- `placeWallClumps`
- `countAdjacentGas`
- `generateGrid`
- `placeGoldVeins`
- `placeItemDrops`
- `placeAnchors`
- The anchor distance constants (`ANCHOR_MIN_DIST_START`, `ANCHOR_MIN_DIST_EXIT`, `ANCHOR_MIN_DIST_BETWEEN`)
- `cleanMerchantCell`
- `carvePath`
- `prepareTreasureChamber`
- `applyTreasureChamber`

Add imports:
```js
import {
  getGrid, getRows, getCols, setBiomeOverrides,
  getFountain, setFountain,
  // ...any other state the moved functions use...
} from '../state.js';
```

Export every function that main.js or rulesets.js needs:
```js
export function placeWallClumps() { /* ... */ }
export function countAdjacentGas(r, c) { /* ... */ }
export function generateGrid(gasCount) { /* ... */ }
export function placeGoldVeins() { /* ... */ }
export function placeItemDrops() { /* ... */ }
export function placeAnchors() { /* ... */ }
export function cleanMerchantCell(r, c) { /* ... */ }
export function carvePath(fromR, fromC, toR, toC) { /* ... */ }
export function prepareTreasureChamber(state) { /* ... */ }
export function applyTreasureChamber(state) { /* ... */ }
```

Replace `state.X` references with the corresponding getter/setter calls from `state.js`.

- [ ] **Step 2: Simplify `src/rulesets.js` — import directly now**

Remove `installRulesetHooks`, `applyTreasureChamberImpl`, `prepareTreasureChamberImpl`. Replace with direct imports:

```js
import { prepareTreasureChamber, applyTreasureChamber } from './board/generation.js';

export const RULESETS = [
  { id: 'regular', weight: 9, prepare: null, apply: null },
  {
    id: 'treasure_chamber',
    weight: 1,
    prepare: prepareTreasureChamber,
    apply: applyTreasureChamber,
  },
];
```

- [ ] **Step 3: Update `src/main.js`**

Remove:
- The generation functions
- `prepareTreasureChamber`, `applyTreasureChamber`
- The `installRulesetHooks` import and call

Add:
```js
import {
  placeWallClumps, countAdjacentGas, generateGrid,
  placeGoldVeins, placeItemDrops, placeAnchors,
  cleanMerchantCell, carvePath,
} from './board/generation.js';
```

- [ ] **Step 4: Add `countAdjacentGas` test**

Edit `tests/smoke.js`. Add:

```js
// -- board generation --
import { countAdjacentGas } from '../src/board/generation.js';

test('countAdjacentGas counts gas and detonated neighbors', () => {
  setRows(3); setCols(3);
  const g = makeEmptyGrid(3, 3);
  g[0][0].type = 'gas';
  g[0][1].type = 'detonated';
  g[2][2].type = 'gas';
  setGrid(g);
  // Center cell (1,1) has 3 neighbors that count as gas-ish
  assertEq(countAdjacentGas(1, 1), 3);
});

test('countAdjacentGas handles grid edges', () => {
  setRows(3); setCols(3);
  const g = makeEmptyGrid(3, 3);
  g[0][1].type = 'gas';
  setGrid(g);
  // Corner (0,0) only has one gas neighbor
  assertEq(countAdjacentGas(0, 0), 1);
});
```

- [ ] **Step 5: Verify**

Run: `npx serve . -l 3000`

Open `http://localhost:3000`:
- Full playthrough: start run, walk, dig, visit merchant, complete levels
- Play long enough to see a treasure chamber level (level 13+) — chests should appear in off-diagonal corners
- Fountain should sometimes spawn; step on it to heal

Open `http://localhost:3000/tests/smoke.html`:
- Expect `11/11 passing`

- [ ] **Step 6: Commit**

```bash
git add src/ tests/
git commit -m "$(cat <<'EOF'
refactor: extract board/generation.js

Moves all generation (walls, gas, grid, gold, items, anchors,
countAdjacentGas, cleanMerchantCell, carvePath) and the
treasure_chamber ruleset hooks to board/generation.js. rulesets.js
now imports prepare/apply directly — removes the install-hooks
bridge from Task 5.

Adds 2 countAdjacentGas tests.

Phase 2.7 of module refactor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Extract `src/ui/dom.js`

**Goal:** Move all `document.getElementById(...)` lookups into `src/ui/dom.js` as named exports.

**Files:**
- Create: `src/ui/dom.js`
- Modify: `src/main.js`

- [ ] **Step 1: Create `src/ui/dom.js`**

```bash
mkdir -p src/ui
```

```js
export const board = document.getElementById('board');
export const gridContainer = document.getElementById('grid-container');
export const goldDisplay = document.getElementById('gold-display');
export const hpDisplay = document.getElementById('hp-display');
export const levelDisplay = document.getElementById('level-display');
export const playerSprite = document.getElementById('player-sprite');
export const overlay = document.getElementById('overlay');
export const overlayContent = document.getElementById('overlay-content');
export const itemBar = document.getElementById('item-bar');
export const viewportEl = document.getElementById('viewport');
export const minimapEl = document.getElementById('minimap');
export const tooltipEl = document.getElementById('tooltip');
export const pauseBtn = document.getElementById('pause-btn');

export const itemButtons = {
  potion: document.getElementById('item-potion'),
  scanner: document.getElementById('item-scanner'),
  pickaxe: document.getElementById('item-pickaxe'),
  row: document.getElementById('item-row'),
  column: document.getElementById('item-column'),
  cross: document.getElementById('item-cross'),
};

export const itemCounts = {
  potion: document.getElementById('item-potion-count'),
  scanner: document.getElementById('item-scanner-count'),
  pickaxe: document.getElementById('item-pickaxe-count'),
  row: document.getElementById('item-row-count'),
  column: document.getElementById('item-column-count'),
  cross: document.getElementById('item-cross-count'),
};
```

- [ ] **Step 2: Update `src/main.js`**

Remove the original DOM lookup lines (the `const board = document.getElementById(...)` block around lines 158-181 of the original, plus `viewportEl`, `minimapEl`, `tooltipEl` declared elsewhere).

Add:
```js
import {
  board, gridContainer, goldDisplay, hpDisplay, levelDisplay,
  playerSprite, overlay, overlayContent, itemBar, viewportEl,
  minimapEl, tooltipEl, pauseBtn, itemButtons, itemCounts,
} from './ui/dom.js';
```

Replace the `document.getElementById('pause-btn').addEventListener(...)` from Task 1 with:
```js
pauseBtn.addEventListener('click', renderPauseMenu);
```

- [ ] **Step 3: Verify**

Run: `npx serve . -l 3000`

- Game renders, HUD shows stats, pause button works, item bar shows, tooltip appears on item hover

Open `http://localhost:3000/tests/smoke.html`:
- Expect `11/11 passing`

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "$(cat <<'EOF'
refactor: extract ui/dom.js

Phase 3.8 of module refactor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Extract `src/ui/render.js`

**Goal:** Move grid rendering, HUD updates, item bar rendering, player sprite updates, hurt flash, and pickup float spawning into `src/ui/render.js`.

**Files:**
- Create: `src/ui/render.js`
- Modify: `src/main.js`

- [ ] **Step 1: Create `src/ui/render.js`**

Copy these functions from `src/main.js`:
- `renderGrid()`
- `flashHurtFace()` (and the `hurtFlashToken` variable)
- `updatePlayerSprite(instant)`
- `PICKUP_EMOJI` constant
- `spawnPickupFloat(r, c, label, extraClass)`
- `updateHud()`
- `updateItemBar()`

Add imports:
```js
import {
  getGrid, getRows, getCols, getRevealed, getFlagged,
  getPlayerRow, getPlayerCol, getExit, getFountain, getMerchant,
  getGold, getStashGold, getHp, getLevel, getItems, getActiveItem,
  MAX_HP, STEP_MS, CELL_SIZE, CELL_GAP, BOARD_PAD,
} from '../state.js';
import {
  gridContainer, goldDisplay, hpDisplay, levelDisplay,
  playerSprite, itemButtons, itemCounts, board,
} from './dom.js';
```

Export everything used by other modules:
```js
export function renderGrid() { /* ... */ }
export function updateHud() { /* ... */ }
export function updateItemBar() { /* ... */ }
export function updatePlayerSprite(instant = false) { /* ... */ }
export function flashHurtFace() { /* ... */ }
export function spawnPickupFloat(r, c, label, extraClass) { /* ... */ }
```

Note: `hurtFlashToken` is accessed directly from `startGame`/`nextLevel`/`retryLevel` in main.js. Export a `resetHurtFlash()` function:
```js
let hurtFlashToken = 0;
export function resetHurtFlash() {
  hurtFlashToken++;
}
// ...inside flashHurtFace, use the local hurtFlashToken
```

Replace `state.X` with the state getters.

- [ ] **Step 2: Update `src/main.js`**

Remove the moved functions and the `hurtFlashToken` variable. Replace every `hurtFlashToken++` in main.js with `resetHurtFlash()`.

Add:
```js
import {
  renderGrid, updateHud, updateItemBar, updatePlayerSprite,
  flashHurtFace, spawnPickupFloat, resetHurtFlash,
} from './ui/render.js';
```

- [ ] **Step 3: Verify**

Run: `npx serve . -l 3000`

- Grid renders, HUD shows correct numbers, item bar shows counts
- Gold pickup spawns floating label
- Gas detonation spawns red skull float
- Hurt face flash on damage

Open `http://localhost:3000/tests/smoke.html`: `11/11 passing`.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "$(cat <<'EOF'
refactor: extract ui/render.js

Phase 3.9 of module refactor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Extract `src/ui/view.js` (pan + minimap)

**Goal:** Move the pan system, viewport helpers, and minimap rendering into `src/ui/view.js`.

**Files:**
- Create: `src/ui/view.js`
- Modify: `src/main.js`

- [ ] **Step 1: Create `src/ui/view.js`**

Copy these from `src/main.js`:
- `pan` object + `panAnimId` variable
- `getViewportSize()`
- `getBoardSize()`
- `cellCenterPx(r, c)`
- `clampPan(x, y)`
- `applyPan()`
- `setPan(x, y)`
- `animatePanTo(targetX, targetY, durationMs)`
- `centerOnCell(r, c, durationMs)`
- `isCellOutsideCenterRect(r, c)`
- `autoRecenterOnPlayer()`
- `renderMinimap()`

Add imports:
```js
import {
  getGrid, getRows, getCols, getPlayerRow, getPlayerCol,
  getRevealed, getExit, getMerchant, getFountain,
  CELL_SIZE, CELL_GAP, BOARD_PAD,
} from '../state.js';
import { viewportEl, minimapEl, board } from './dom.js';
```

Export:
```js
export function getViewportSize() { /* ... */ }
export function getBoardSize() { /* ... */ }
export function cellCenterPx(r, c) { /* ... */ }
export function applyPan() { /* ... */ }
export function setPan(x, y) { /* ... */ }
export function animatePanTo(targetX, targetY, durationMs = 200) { /* ... */ }
export function centerOnCell(r, c, durationMs = 200) { /* ... */ }
export function isCellOutsideCenterRect(r, c) { /* ... */ }
export function autoRecenterOnPlayer() { /* ... */ }
export function renderMinimap() { /* ... */ }

// If `pan` object is accessed externally, export it:
export const pan = { x: 0, y: 0, userPannedAt: 0 };
```

`clampPan` is internal — no export needed unless `setPan` uses it (in which case keep both in the same file, no export for `clampPan`).

- [ ] **Step 2: Update `src/main.js`**

Remove the moved code. Add:
```js
import {
  getViewportSize, getBoardSize, cellCenterPx, applyPan, setPan,
  animatePanTo, centerOnCell, isCellOutsideCenterRect,
  autoRecenterOnPlayer, renderMinimap, pan,
} from './ui/view.js';
```

- [ ] **Step 3: Verify**

Run: `npx serve . -l 3000`

- Pan the board with pointer drag — works, clamps at edges
- Minimap renders top-right, shows player/exit/walls
- Tap minimap to recenter — animates to player
- Walk to the edge — camera auto-recenters

Smoke: `11/11 passing`.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "$(cat <<'EOF'
refactor: extract ui/view.js

Phase 3.10 of module refactor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Extract `src/ui/tooltip.js`

**Goal:** Move tooltip system into `src/ui/tooltip.js`.

**Files:**
- Create: `src/ui/tooltip.js`
- Modify: `src/main.js`

- [ ] **Step 1: Create `src/ui/tooltip.js`**

Copy from `src/main.js`:
- The tooltip constants: `TOOLTIP_HOVER_DELAY_MS`, `TOOLTIP_LONG_PRESS_MS`, `TOOLTIP_MOVE_THRESHOLD`, `TOOLTIP_GAP`
- `tooltipShownFor` module-scope variable
- `hideTooltip()`
- `showTooltip(triggerEl, itemKey)`
- `positionTooltip(triggerEl)`
- `attachTooltip(el, itemKey)`

Note: `ITEM_TOOLTIPS` is the data source — that belongs in `gameplay/items.js` (Task 16). For this task, either:
- (A) Export `ITEM_TOOLTIPS` from `main.js` temporarily, imported here
- (B) Keep `ITEM_TOOLTIPS` in `main.js` and pass a `getTooltipData(itemKey)` callback to `attachTooltip`

Best: pass the data at attach time.

Change `attachTooltip` signature:
```js
export function attachTooltip(el, data) {
  // data is { name, description, howTo } — resolved by caller from ITEM_TOOLTIPS
  // ...
}
```

Callers (main.js) need to read from `ITEM_TOOLTIPS[itemKey]` and pass the object in. Update the existing call sites in main.js.

Add import:
```js
import { tooltipEl } from './dom.js';
```

Export:
```js
export function hideTooltip() { /* ... */ }
export function attachTooltip(el, data) { /* ... */ }
```

(`showTooltip` and `positionTooltip` are internal helpers.)

Wire scroll + resize listeners at module top:
```js
window.addEventListener('scroll', hideTooltip, { capture: true });
window.addEventListener('resize', hideTooltip);
```

- [ ] **Step 2: Update `src/main.js`**

Remove the moved code. Add:
```js
import { attachTooltip, hideTooltip } from './ui/tooltip.js';
```

Update all `attachTooltip(el, itemKey)` call sites to `attachTooltip(el, ITEM_TOOLTIPS[itemKey])`.

- [ ] **Step 3: Verify**

Run: `npx serve . -l 3000`

- Hover over item buttons — tooltip appears after 300ms with name + description + how-to
- Long-press item on mobile (or simulate via devtools) — tooltip appears, release does NOT use item
- Open shop — tooltips attach to shop slots
- Navigate away — tooltip hides

Smoke: `11/11 passing`.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "$(cat <<'EOF'
refactor: extract ui/tooltip.js

attachTooltip now takes a resolved data object instead of an item key,
decoupling it from ITEM_TOOLTIPS which stays in main.js until Task 16.

Phase 3.11 of module refactor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Extract `src/ui/overlay.js` with callback injection

**Goal:** Move overlay and menu rendering into `src/ui/overlay.js`. Since overlays trigger `startGame`/`resumeGame`/`nextLevel` (which extract later), use callback injection.

**Files:**
- Create: `src/ui/overlay.js`
- Modify: `src/main.js`

- [ ] **Step 1: Create `src/ui/overlay.js`**

Copy from `src/main.js`:
- `showOverlay(html)`
- `hideOverlay()`
- `showEscapedOverlay()`
- `showDeathOverlay()`
- `renderStartMenu()`
- `renderPauseMenu()`
- `renderRules(parent)`
- `renderSettings(parent)`
- `renderNewRunConfirm()`

These call upward into `startGame`/`resumeGame`/`nextLevel`/`retryLevel`/`saveRun`/`clearSave`/`loadRun`/`getLifetimeGold`/`setMusicOn`/`setSfxOn`. Define a callback-injection module init:

```js
import { overlay, overlayContent } from './dom.js';
import { hideTooltip } from './tooltip.js';
import { settings, saveSettings } from '../settings.js';
import { setMusicOn, setSfxOn } from '../audio.js';
import { getLifetimeGold } from '../state.js';  // NOTE: not yet in state.js as of Task 12

// getLifetimeGold currently lives in main.js. For Task 12, add it to state.js
// as a thin wrapper, OR keep it in main.js and pass via init hooks.

let hooks = {
  onStartGame: () => {},
  onResumeGame: () => {},
  onNextLevel: () => {},
  onRetryLevel: () => {},
  onSaveRun: () => {},
  onClearSave: () => {},
  onLoadRun: () => null,
};

export function initOverlay(injected) {
  hooks = { ...hooks, ...injected };
}

export function showOverlay(html) { /* ... */ }

export function hideOverlay() {
  hideTooltip();
  overlay.classList.add('hidden');
  overlayContent.innerHTML = '';
}

export function showEscapedOverlay() { /* ... */ }
export function showDeathOverlay() {
  // ...uses hooks.onRetryLevel...
}

export function renderStartMenu() {
  // ...uses hooks.onStartGame, hooks.onResumeGame, hooks.onLoadRun...
}
export function renderNewRunConfirm() { /* ... */ }
export function renderPauseMenu() { /* ... */ }
export function renderRules(parent) { /* ... */ }
export function renderSettings(parent) {
  // ...uses setMusicOn, setSfxOn, saveSettings...
}
```

**For `getLifetimeGold`:** It reads `localStorage` and is stateless. Simplest path: move it to `state.js` as a standalone export:

```js
// In src/state.js
export function getLifetimeGold() {
  return parseInt(localStorage.getItem('miningCrawler.lifetimeGold') || '0', 10);
}

export function addToLifetimeGold(amount) {
  const cur = getLifetimeGold();
  localStorage.setItem('miningCrawler.lifetimeGold', String(cur + amount));
}
```

(Move the `LIFETIME_GOLD_KEY` constant along with them — inline or exported, doesn't matter.)

Remove these from `main.js` and import them. `overlay.js` can then `import { getLifetimeGold } from '../state.js'` directly.

- [ ] **Step 2: Update `src/main.js`**

Remove the moved overlay/menu functions. Add imports and call `initOverlay` after the function definitions:

```js
import {
  initOverlay, showOverlay, hideOverlay, showEscapedOverlay,
  showDeathOverlay, renderStartMenu, renderPauseMenu, renderRules,
  renderSettings, renderNewRunConfirm,
} from './ui/overlay.js';

// ...after startGame/resumeGame/nextLevel/retryLevel/saveRun/clearSave/loadRun are defined...

initOverlay({
  onStartGame: startGame,
  onResumeGame: resumeGame,
  onNextLevel: nextLevel,
  onRetryLevel: retryLevel,
  onSaveRun: saveRun,
  onClearSave: clearSave,
  onLoadRun: loadRun,
});
```

Move lifetime-gold functions to state.js and update `main.js` to import them.

Update `pauseBtn.addEventListener('click', renderPauseMenu)` still works since `renderPauseMenu` is now an import.

- [ ] **Step 3: Verify**

Run: `npx serve . -l 3000`

- Start menu shows Continue/New Run/Rules/Settings
- Start New Run, open pause menu, click Resume — works
- Quit to Menu, click Continue — resumes correctly
- Rules overlay renders
- Settings toggles work (music on/off, SFX on/off)
- Death overlay appears on HP=0 with Retry button

Smoke: `11/11 passing`.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "$(cat <<'EOF'
refactor: extract ui/overlay.js with callback injection

Menus and overlay rendering moved to overlay.js. Upward calls to
startGame/resumeGame/nextLevel/retryLevel/saveRun/clearSave/loadRun
go through an initOverlay({...}) hook object to avoid circular imports.
Lifetime-gold helpers moved to state.js along the way.

Phase 3.12 of module refactor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Extract `src/ui/shop.js`

**Goal:** Move `showShopOverlay` into `src/ui/shop.js`. It uses merchant logic (`rollMerchantStock`, `DISCOUNT_TIERS`, `MERCHANT_PRICES`, `buyFromMerchant`, `rerollMerchant`, `leaveShop`) which lives in main.js until Task 15. Use callback injection for buy/reroll/leave actions.

**Files:**
- Create: `src/ui/shop.js`
- Modify: `src/main.js`

- [ ] **Step 1: Create `src/ui/shop.js`**

```js
import { overlay, overlayContent } from './dom.js';
import { attachTooltip, hideTooltip } from './tooltip.js';
import { getMerchant, getGold, getStashGold } from '../state.js';

let hooks = {
  onBuy: () => {},
  onReroll: () => {},
  onLeave: () => {},
  getTooltipData: () => null,
};

export function initShop(injected) {
  hooks = { ...hooks, ...injected };
}

export function showShopOverlay(playWelcome = false) {
  hideTooltip();
  // ... copy existing showShopOverlay body, replacing:
  //   - buyFromMerchant(idx) calls with hooks.onBuy(idx)
  //   - rerollMerchant() with hooks.onReroll()
  //   - leaveShop() with hooks.onLeave()
  //   - ITEM_TOOLTIPS[slot.type] with hooks.getTooltipData(slot.type)
}
```

Ensure that at the end of `showShopOverlay`, the `attachTooltip(slotEl, tooltipData)` calls use `hooks.getTooltipData(slot.type)` for the data argument.

- [ ] **Step 2: Update `src/main.js`**

Remove `showShopOverlay`. Add:

```js
import { initShop, showShopOverlay } from './ui/shop.js';

// ...after buyFromMerchant, rerollMerchant, leaveShop are defined...
initShop({
  onBuy: buyFromMerchant,
  onReroll: rerollMerchant,
  onLeave: leaveShop,
  getTooltipData: (itemKey) => ITEM_TOOLTIPS[itemKey],
});
```

- [ ] **Step 3: Verify**

Run: `npx serve . -l 3000`

- Enter a merchant level, step onto merchant tile — shop opens with 10 slots
- Verify discount badges, strike-through prices, free tier rainbow badge
- Hover shop slot — tooltip shows item info
- Buy an item — stock updates, gold deducts
- Reroll — new slots, cost scales (10/20/30)
- Leave — shop closes, game resumes

Smoke: `11/11 passing`.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "$(cat <<'EOF'
refactor: extract ui/shop.js with callback injection

Phase 3.13 of module refactor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Extract `src/ui/pointer.js`

**Goal:** Move the viewport pointer arbiter into `src/ui/pointer.js`. It dispatches to walk/reveal/flag/use-pickaxe, which live in interaction/items code. Use callback injection.

**Files:**
- Create: `src/ui/pointer.js`
- Modify: `src/main.js`

- [ ] **Step 1: Create `src/ui/pointer.js`**

Copy from `src/main.js`:
- Constants: `DRAG_THRESHOLD_PX`, `LONG_PRESS_MS`
- Module-scope vars: `activePointer`, `lastLongPressAt`
- `cellFromClientPoint(clientX, clientY)`
- `onViewportPointerDown`/`Move`/`Up`/`Cancel`
- The `lastLongPressAt` export / handling for synthetic contextmenu

Add:
```js
import {
  getPlayerRow, getPlayerCol, getGrid, getActiveItem,
  getGameOver, getBusy,
} from '../state.js';
import { viewportEl } from './dom.js';
import { setPan, pan, applyPan } from './view.js';
import { resumeAudioCtx } from '../audio.js';

let hooks = {
  onCellTap: () => {},
  onCellLongPress: () => {},
  onPickaxeTarget: () => {},
};

export function initPointer(injected) {
  hooks = { ...hooks, ...injected };
}

// export lastLongPressAt accessor for the contextmenu suppressor
export function getLastLongPressAt() { /* ... */ }

// Attach listeners to viewport
viewportEl.addEventListener('pointerdown', onViewportPointerDown);
// ... etc
```

Export `initPointer`. Pointer handlers call `hooks.onCellTap(r, c)`, `hooks.onCellLongPress(r, c)`, `hooks.onPickaxeTarget(r, c)` instead of the in-file functions.

Note: the contextmenu suppressor (`if (e.button !== 0)` and `lastLongPressAt`) should stay local to this module. The only thing main.js needs is to initialize hooks.

- [ ] **Step 2: Update `src/main.js`**

Remove the moved code. Add:

```js
import { initPointer } from './ui/pointer.js';

// After revealCell, handleRightClick, and pickaxe-targeting code are defined:
initPointer({
  onCellTap: (r, c) => {
    const activeItem = getActiveItem();
    if (activeItem === 'pickaxe') {
      // pickaxe targeting logic (likely calls useItemPickaxeAt(r, c) or similar)
      useItemPickaxeAt(r, c);
    } else {
      // regular walk/reveal
      walkToAndReveal(r, c);  // whatever the current entry point is
    }
  },
  onCellLongPress: (r, c) => {
    handleRightClick(r, c);
  },
  onPickaxeTarget: (r, c) => {
    useItemPickaxeAt(r, c);
  },
});
```

Note: Walk-to-cell logic may be inline in the current `onViewportPointerUp`. Refactor it into a named function `walkToAndReveal(r, c)` in main.js and call it from both the pointer handler's callback and anywhere else needed. Keep `walkToAndReveal` definition in main.js for now — it'll move to `gameplay/interaction.js` in Task 17.

If the pickaxe targeting code is currently inline in the pointer handler, extract it into a named function (`useItemPickaxeAt(r, c)`) and keep it in main.js for now. It'll move to `gameplay/items.js` in Task 16.

- [ ] **Step 3: Verify**

Run: `npx serve . -l 3000`

- Tap a cell — walks to it and digs
- Drag — pans the board
- Long-press a cell — toggles flag
- Click pickaxe item, then tap a wall — wall converts to revealed
- Right-click a cell — toggles flag (no double-toggle via synthetic contextmenu)

Smoke: `11/11 passing`.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "$(cat <<'EOF'
refactor: extract ui/pointer.js with callback injection

Viewport pointer arbiter moved to pointer.js. Callbacks dispatch cell
tap / long-press / pickaxe-target back to main.js (gameplay code
extracted later).

Phase 3.14 of module refactor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Extract `src/gameplay/merchant.js`

**Goal:** Move merchant logic into `src/gameplay/merchant.js`. Add `priceFromTier` and `rollDiscountTier` distribution tests.

**Files:**
- Create: `src/gameplay/merchant.js`
- Modify: `src/main.js`
- Modify: `tests/smoke.js`

- [ ] **Step 1: Create `src/gameplay/merchant.js`**

```bash
mkdir -p src/gameplay
```

Copy from `src/main.js`:
- `MERCHANT_PRICES`
- `DISCOUNT_TIERS`
- `rollDiscountTier()`
- `priceFromTier(basePrice, tier)`
- `rollMerchantStock()`
- `buyFromMerchant(idx)`
- `rerollMerchant()`
- `leaveShop()`

Add imports:
```js
import {
  getMerchant, setMerchant, getGold, getStashGold, spendGold,
  addItem, setActiveItem, getActiveItem,
} from '../state.js';
import { playSfx } from '../audio.js';
import { showShopOverlay } from '../ui/shop.js';
import { updateHud, updateItemBar } from '../ui/render.js';
import { hideOverlay } from '../ui/overlay.js';
```

Export:
```js
export const MERCHANT_PRICES = { /* ... */ };
export const DISCOUNT_TIERS = [ /* ... */ ];
export function rollDiscountTier() { /* ... */ }
export function priceFromTier(basePrice, tier) { /* ... */ }
export function rollMerchantStock() { /* ... */ }
export function buyFromMerchant(idx) { /* ... */ }
export function rerollMerchant() { /* ... */ }
export function leaveShop() { /* ... */ }
```

- [ ] **Step 2: Update `src/main.js`**

Remove the moved code. Add:
```js
import {
  MERCHANT_PRICES, DISCOUNT_TIERS, rollDiscountTier, priceFromTier,
  rollMerchantStock, buyFromMerchant, rerollMerchant, leaveShop,
} from './gameplay/merchant.js';
```

`initShop({ onBuy: buyFromMerchant, ... })` still works — these are now imports.

- [ ] **Step 3: Add merchant tests**

Edit `tests/smoke.js`:

```js
// -- merchant --
import { priceFromTier, rollDiscountTier, DISCOUNT_TIERS } from '../src/gameplay/merchant.js';

test('priceFromTier free', () => {
  assertEq(priceFromTier(20, { key: 'free', mult: 0 }), 0);
});

test('priceFromTier full', () => {
  assertEq(priceFromTier(20, { key: 'full', mult: 1.0 }), 20);
});

test('priceFromTier d50', () => {
  assertEq(priceFromTier(20, { key: 'd50', mult: 0.5 }), 10);
});

test('priceFromTier d90 floors to 1 minimum', () => {
  // base 5 at mult 0.10 = 0.5 → rounds to 1 (Math.max guard)
  assertEq(priceFromTier(5, { key: 'd90', mult: 0.10 }), 1);
});

test('rollDiscountTier distribution within ±5%', () => {
  const n = 10000;
  const counts = {};
  for (let i = 0; i < n; i++) {
    const t = rollDiscountTier();
    counts[t.key] = (counts[t.key] || 0) + 1;
  }
  const totalWeight = DISCOUNT_TIERS.reduce((s, t) => s + t.weight, 0);
  for (const tier of DISCOUNT_TIERS) {
    const expected = (tier.weight / totalWeight) * n;
    const actual = counts[tier.key] || 0;
    const margin = n * 0.05; // ±5% of total
    if (Math.abs(actual - expected) > margin) {
      throw new Error(`${tier.key}: expected ~${expected}, got ${actual}`);
    }
  }
});
```

- [ ] **Step 4: Verify**

Run: `npx serve . -l 3000`

- Visit merchant, buy items, reroll — all works
- Discount badges render correctly
- Free tier rainbow badge animates

Open smoke harness: `16/16 passing`.

- [ ] **Step 5: Commit**

```bash
git add src/ tests/
git commit -m "$(cat <<'EOF'
refactor: extract gameplay/merchant.js

Adds priceFromTier (4 tests) and rollDiscountTier distribution test
(±5% tolerance across 10k rolls).

Phase 4.15 of module refactor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Extract `src/gameplay/items.js`

**Goal:** Move item usage, targeting helpers, `ITEM_TOOLTIPS`, `PICKUP_EMOJI` into `src/gameplay/items.js`.

**Files:**
- Create: `src/gameplay/items.js`
- Modify: `src/main.js`

- [ ] **Step 1: Create `src/gameplay/items.js`**

Copy from `src/main.js`:
- `ITEM_TOOLTIPS` constant
- `onItemButtonClick(itemKey)`
- `useItemPotion()`
- `scannerHasTarget()`, `rowHasTarget()`, `columnHasTarget()`, `crossHasTarget()`
- `useItemScanner()`, `useItemRow()`, `useItemColumn()`, `useItemCross()`
- `revealAlongRay(startR, startC, dR, dC)`
- `useItemPickaxeAt(r, c)` (if extracted during Task 14; otherwise move it now)

Note: `PICKUP_EMOJI` currently sits near render — if the render module took it, leave it there. If items.js references it, import from render.js.

Add imports:
```js
import {
  getItemCount, consumeItem, getActiveItem, setActiveItem,
  getGameOver, getBusy, getHp, healPlayer, getGrid, getRows, getCols,
  getPlayerRow, getPlayerCol,
} from '../state.js';
import { itemButtons } from '../ui/dom.js';
import { updateItemBar, updateHud, renderGrid, spawnPickupFloat } from '../ui/render.js';
import { playSfx } from '../audio.js';
import { walkRay, detonateGas } from './interaction.js';  // will exist after Task 17 — for now, keep these helpers in main.js and pass via DI
```

Since `walkRay` and `detonateGas` haven't been extracted yet, use callback injection or keep scanner/row/column/cross functions in main.js temporarily. Simplest: inject via `initItems({ walkRay, detonateGas, ...otherHelpers })`:

```js
let hooks = {
  walkRay: () => {},
  detonateGas: () => {},
  revealCell: () => {},
};

export function initItems(injected) {
  hooks = { ...hooks, ...injected };
}
```

Use `hooks.walkRay(...)` inside the item implementations.

Export:
```js
export const ITEM_TOOLTIPS = { /* ... */ };
export function onItemButtonClick(itemKey) { /* ... */ }
export function useItemPickaxeAt(r, c) { /* ... */ }  // if targeting helper lives here
// helpers like scannerHasTarget etc can be module-private if not used externally
```

- [ ] **Step 2: Update `src/main.js`**

Remove the moved code. Add:
```js
import { ITEM_TOOLTIPS, onItemButtonClick, useItemPickaxeAt, initItems } from './gameplay/items.js';

// After walkRay, detonateGas, revealCell are defined:
initItems({
  walkRay,
  detonateGas,
  revealCell,
});
```

Update `initShop({ getTooltipData: (key) => ITEM_TOOLTIPS[key] })` so the import works.

Update `attachTooltip(el, ITEM_TOOLTIPS[itemKey])` call sites — these already use the imported `ITEM_TOOLTIPS`.

Wire item button clicks:
```js
for (const [key, btn] of Object.entries(itemButtons)) {
  btn.addEventListener('click', () => onItemButtonClick(key));
}
```

(Check where this wiring currently happens — if inline in an IIFE or similar, update accordingly.)

- [ ] **Step 3: Verify**

Run: `npx serve . -l 3000`

- Click each item — potion heals (if damaged), scanner reveals 3x3, pickaxe activates targeting, row/column/cross scan
- Hover items — tooltips show correct name/description/how-to
- Item counts decrement on use

Smoke: `16/16 passing`.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "$(cat <<'EOF'
refactor: extract gameplay/items.js

Item usage, targeting checks, ITEM_TOOLTIPS moved to items.js. Uses
initItems({...}) hook to inject walkRay/detonateGas/revealCell until
interaction.js extracted next task.

Phase 4.16 of module refactor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Extract `src/gameplay/interaction.js`

**Goal:** Move cell reveal, collection, gas detonation, walking, and targeting into `src/gameplay/interaction.js`. Remove the `initItems` hook injection added in Task 16 — import directly now.

**Files:**
- Create: `src/gameplay/interaction.js`
- Modify: `src/main.js`
- Modify: `src/gameplay/items.js`

- [ ] **Step 1: Create `src/gameplay/interaction.js`**

Copy from `src/main.js`:
- `sleep(ms)`
- `isAdjacentToPlayer(r, c)`
- `collectAt(r, c)`
- `walkRay(startR, startC, dR, dC, callback)`
- `detonateGas(r, c)`
- `findBestApproach(tr, tc)`
- `ensureSafeStart(r, c)`
- `revealCell(r, c)`
- `handleRightClick(r, c)`
- `debugRevealAll()`
- `walkToAndReveal(r, c)` (extracted in Task 14, if still in main.js)

Add imports:
```js
import {
  getGrid, getRows, getCols, getPlayerRow, getPlayerCol,
  setPlayerPosition, getRevealed, getFlagged, getExit, getFountain,
  setFountain, getHp, damagePlayer, healPlayer, addGold, addItem,
  consumeItem, getItemCount, getGameOver, setGameOver, getBusy,
  setBusy, getActiveItem, setActiveItem, getMerchant, MAX_HP, STEP_MS,
} from '../state.js';
import {
  renderGrid, updateHud, updatePlayerSprite, flashHurtFace,
  spawnPickupFloat, resetHurtFlash,
} from '../ui/render.js';
import {
  centerOnCell, autoRecenterOnPlayer, renderMinimap, cellCenterPx,
} from '../ui/view.js';
import { playSfx } from '../audio.js';
import { findPath, isReachable } from '../board/layout.js';
import { countAdjacentGas } from '../board/generation.js';
import { showShopOverlay } from '../ui/shop.js';
import { showDeathOverlay, showEscapedOverlay, hideOverlay } from '../ui/overlay.js';
```

Export:
```js
export function sleep(ms) { /* ... */ }
export function isAdjacentToPlayer(r, c) { /* ... */ }
export function collectAt(r, c) { /* ... */ }
export function walkRay(startR, startC, dR, dC, callback) { /* ... */ }
export function detonateGas(r, c) { /* ... */ }
export function findBestApproach(tr, tc) { /* ... */ }
export function ensureSafeStart(r, c) { /* ... */ }
export function revealCell(r, c) { /* ... */ }
export function handleRightClick(r, c) { /* ... */ }
export function walkToAndReveal(r, c) { /* ... */ }
export function debugRevealAll() { /* ... */ }
```

- [ ] **Step 2: Simplify `src/gameplay/items.js` — drop the hooks**

Replace the `hooks`/`initItems` injection with direct imports:
```js
import { walkRay, detonateGas, revealCell } from './interaction.js';
```

Remove `initItems` export and the `hooks` object. Call `walkRay(...)` etc directly.

- [ ] **Step 3: Update `src/main.js`**

Remove the moved code. Add:
```js
import {
  sleep, isAdjacentToPlayer, collectAt, walkRay, detonateGas,
  findBestApproach, ensureSafeStart, revealCell, handleRightClick,
  walkToAndReveal, debugRevealAll,
} from './gameplay/interaction.js';
```

Remove the `initItems({ ... })` call from main.js.

Update `initPointer({ onCellTap: walkToAndReveal, onCellLongPress: handleRightClick, onPickaxeTarget: useItemPickaxeAt })` — all imports now.

- [ ] **Step 4: Verify**

Run: `npx serve . -l 3000`

- Walk to a distant cell — player animates along path
- Step on gold, items, fountain, merchant — all collect / trigger correctly
- Detonate gas — correct damage, red skull float
- Die on HP=0 — death overlay, retry works
- Right-click to flag — works
- Pickaxe on wall — works

Smoke: `16/16 passing`.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "$(cat <<'EOF'
refactor: extract gameplay/interaction.js

Walking, reveal, collect, detonate, flag, and pickaxe-target moved
to interaction.js. items.js now imports walkRay/detonateGas/revealCell
directly — initItems hook removed.

Phase 4.17 of module refactor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Extract `src/gameplay/level.js`

**Goal:** Move `initLevel`, `startGame`, `resumeGame`, `nextLevel`, `retryLevel`, save/load helpers into `src/gameplay/level.js`. Replace the `initOverlay` callback injection with direct imports now that both modules exist.

**Files:**
- Create: `src/gameplay/level.js`
- Modify: `src/main.js`
- Modify: `src/ui/overlay.js`

- [ ] **Step 1: Create `src/gameplay/level.js`**

Copy from `src/main.js`:
- `SAVE_KEY`, `LIFETIME_GOLD_KEY` (if not already moved to state.js)
- `saveRun()`, `loadRun()`, `clearSave()`
- `initLevel()`
- `startGame()`, `resumeGame()`, `nextLevel()`, `retryLevel()`

Add imports:
```js
import {
  MAX_HP, STEP_MS,
  getLevel, getRows, getCols, getPlayerRow, getPlayerCol,
  setLevel, incrementLevel, setRows, setCols, setPlayerPosition,
  setExit, setGrid, setRevealed, setFlagged, setMerchant, setFountain,
  setBiomeOverrides, getBiomeOverrides, setRulesetId, getRulesetId,
  setGameOver, setBusy, setActiveItem, getLevelsSinceMerchant,
  setLevelsSinceMerchant, incrementLevelsSinceMerchant, getMerchant,
  resetForNewRun, applySavePayload, getSavePayload,
  getHp, healPlayer, getGold, addGold, moveGoldToStash, resetLevelGold,
  fullHeal, getItems, setItems,
} from '../state.js';
import { gridSizeForLevel, anchorCountForSize, RULESETS, weightedPick, resolveRuleset } from '../rulesets.js';
import {
  placeWallClumps, countAdjacentGas, generateGrid,
  placeGoldVeins, placeItemDrops, placeAnchors,
  cleanMerchantCell, carvePath,
} from '../board/generation.js';
import {
  pickPlayerStart, pickExit, pickMerchantCorner,
  isReachable, findPath,
} from '../board/layout.js';
import {
  renderGrid, updateHud, updateItemBar, updatePlayerSprite,
  resetHurtFlash,
} from '../ui/render.js';
import { playerSprite } from '../ui/dom.js';
import { setPan, renderMinimap, centerOnCell } from '../ui/view.js';
import { startBgm } from '../audio.js';
import { hideOverlay } from '../ui/overlay.js';

const SAVE_KEY = 'miningCrawler.runState';

export function saveRun() { /* ... */ }
export function loadRun() { /* ... */ }
export function clearSave() { /* ... */ }
export function initLevel() { /* ... */ }
export function startGame() { /* ... */ }
export function resumeGame(save) { /* ... */ }
export function nextLevel() { /* ... */ }
export function retryLevel() { /* ... */ }
```

- [ ] **Step 2: Remove the `initOverlay` callback plumbing — overlay.js imports directly**

Edit `src/ui/overlay.js`:

Replace the hooks pattern with direct imports:
```js
import {
  startGame, resumeGame, nextLevel, retryLevel,
  saveRun, clearSave, loadRun,
} from '../gameplay/level.js';
```

Remove `initOverlay` export and the `hooks` object. Use the imports directly.

**Note on circularity:** `overlay.js` imports `level.js`, and `level.js` imports `hideOverlay` from `overlay.js`. This is a cycle — but ES modules allow it as long as no code runs at module load that depends on the other being initialized. Since all imports are used inside functions (not at the top level), this is fine.

Verify by grepping that neither file uses the imports at module load time:
```bash
grep -n "^hideOverlay\|^startGame\|^resumeGame\|^retryLevel\|^nextLevel\|^saveRun\|^clearSave\|^loadRun" src/gameplay/level.js src/ui/overlay.js
```

Expected: no matches (these names only appear inside function bodies).

- [ ] **Step 3: Update `src/main.js`**

Remove moved code. Add:
```js
import {
  saveRun, loadRun, clearSave, initLevel,
  startGame, resumeGame, nextLevel, retryLevel,
} from './gameplay/level.js';
```

Remove the `initOverlay({...})` call — overlay.js no longer needs hooks.

At this point `main.js` should be ~50-80 lines: imports + a few listener wirings + kickoff call. Check its size:

```bash
wc -l src/main.js
```

If it's still over 100 lines, look for anything that can be moved.

- [ ] **Step 4: Verify**

Run: `npx serve . -l 3000`

Full playthrough test:
- Start menu → New Run
- Walk, dig, collect gold, collect items
- Visit merchant, buy, reroll, leave
- Complete level → next level
- Take damage → HP persists into next level
- Find fountain → heal
- Die → retry (HP resets)
- Quit to Menu → state persists
- Continue → resumes mid-run
- Reach level 13+ → occasional treasure chamber

Smoke: `16/16 passing`.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "$(cat <<'EOF'
refactor: extract gameplay/level.js

Level initialization, run orchestration (start/resume/next/retry),
and save/load moved to level.js. overlay.js now imports these directly
— initOverlay hook pattern removed. Remaining cycle (overlay ↔ level)
is safe: all imports are used inside function bodies only.

main.js is now a thin entry point.

Phase 4.18 of module refactor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: Enforcement grep + full playtest + cleanup

**Goal:** Verify the state-boundary contract holds, confirm `main.js` is ~50 lines, run a comprehensive manual playtest, fix any issues found.

**Files:**
- Potentially modify: any file found in violation

- [ ] **Step 1: Run the enforcement grep**

```bash
grep -rn "state\." src/ --include="*.js" | grep -v "src/state.js"
```

Filter out false positives:
- Matches inside comments (`// level-scoped state`)
- Matches inside string literals (`'miningCrawler.runState'`)
- Matches inside import/export statements that reference `state.js` (none should exist at this pattern; imports use `./state.js` not `state.`)

Any real match is a violation. Route it through a state.js function and fix.

Also run:
```bash
grep -rn "^const state\|^let state\|^var state" src/ --include="*.js" | grep -v "src/state.js"
```

Expected: empty. If any file has its own `state` variable, that's probably fine (local scope), but the singleton should only live in `state.js`.

- [ ] **Step 2: Verify `main.js` is thin**

```bash
wc -l src/main.js
```

Target: ~50 lines. Acceptable up to ~100. If larger, look at what's still there:
- Imports (OK)
- Listener wirings (OK)
- Kickoff call (e.g., `renderStartMenu()`) — OK
- Anything else — should probably be in a module

- [ ] **Step 3: Full manual playtest checklist**

With `npx serve . -l 3000` running, work through every feature:

**Start menu**
- [ ] Fresh load → shows New Run / Rules / Settings
- [ ] With save → shows Continue (primary) + New Run / Rules / Settings
- [ ] Click Rules → rules overlay renders, Back returns to start menu
- [ ] Click Settings → settings overlay, Back returns to start menu
- [ ] Settings: toggle music off, refresh page → music stays off
- [ ] Settings: toggle SFX off, start run, click → silent
- [ ] New Run with save → confirm overlay appears; Cancel returns, Confirm starts new

**In-run**
- [ ] Walk to adjacent cell — dig sound, reveals
- [ ] Walk to distant cell — animates along path, dig sounds
- [ ] Gold pickup — float label, gold updates in HUD
- [ ] Item pickup — float label, item count increments
- [ ] Gas detonation — red skull float, HP decrements, hurt flash
- [ ] Right-click or long-press cell — flag toggles
- [ ] Pan board — moves smoothly, clamps at edges
- [ ] Minimap — shows player/exit/walls, tap recenters
- [ ] Auto-recenter — walk to edge, camera follows

**Items**
- [ ] Potion: damaged → heals, at full HP → info float "Already at full HP" and no consume
- [ ] Scanner: reveals 3×3 around player
- [ ] Pickaxe: targeting mode, click wall → wall becomes floor, cascades on 0-adj
- [ ] Row/Column/Cross: rays along axes, stops at walls, gas detonates harmlessly
- [ ] Tooltips: hover each item-bar button → correct info
- [ ] Long-press item (mobile/devtools emulation) → tooltip shows, release does NOT use

**Merchant**
- [ ] Spawn on merchant level (every 2-3 levels with pity)
- [ ] Step onto merchant → shop opens with 10 slots, 2×5 grid
- [ ] Each slot has discount badge, strike-through price, correct emoji
- [ ] Free tier shows rainbow badge
- [ ] Hover shop slot → tooltip with item info
- [ ] Buy item → stock updates, gold deducts, item count increments, sold slot dims
- [ ] Reroll (10/20/30g per merchant) → new stock, sold state wiped
- [ ] Leave → shop closes
- [ ] Shop tooltip hides when re-rendering on buy/reroll

**Treasure chamber**
- [ ] Reach level 13+, play ~10 levels → should see ~1 treasure chamber
- [ ] Two 🎁 chests in off-diagonal corners
- [ ] Step on chest → 25g, float label
- [ ] No merchant appears on this level
- [ ] Pity timer does NOT tick (next-next level still has merchant on schedule)
- [ ] 2 guaranteed item drops scatter on the map

**Fountain**
- [ ] Play several levels, verify 💧 shows on minimap sometimes (pre-revealed cyan marker)
- [ ] Step on fountain at < full HP → heals to max, green +❤️ float, `used = true`
- [ ] Step on fountain at full HP → gray "Already at full HP" float, fountain NOT consumed
- [ ] Step on used fountain again → nothing

**Save/resume**
- [ ] Complete a level → save writes
- [ ] Take damage mid-level → quit to menu → continue → HP still damaged
- [ ] Die → retry → new level, HP restored, current-level gold forfeited, stash intact

**Pause menu**
- [ ] Click ⏸️ → pause overlay: Resume / Rules / Settings / Quit to Menu
- [ ] Resume → back to game
- [ ] Quit to Menu → autosaves, returns to start menu

**Death**
- [ ] HP = 0 → death overlay: Retry / Quit to Menu
- [ ] Retry → same level, full HP, current-level gold forfeited
- [ ] Quit to Menu → back to start, Continue works

- [ ] **Step 4: Run smoke harness**

Open `http://localhost:3000/tests/smoke.html`.

Expected: all tests passing (target ~16 total depending on what got added).

- [ ] **Step 5: Final state**

```bash
git log --oneline | head -25
wc -l src/*.js src/*/*.js tests/*.js
ls src/ src/board/ src/gameplay/ src/ui/ tests/
```

Confirm file layout matches the spec. If any cleanup commit is needed (stray TODOs, leftover comments), commit them now:

```bash
git add src/ tests/
git commit -m "$(cat <<'EOF'
refactor: final cleanup of module refactor

Phase 5.19 wrap-up of module refactor.

main.js: ~50 lines (target met).
13 modules + 1 entry + 2 test files.
All state access routed through state.js (enforced via grep).
Smoke harness: N tests passing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If nothing to clean up, skip this commit.

---

## Post-refactor notes

- **State boundary enforcement:** When touching any file in `src/` in future feature work, run `grep -rn "state\." src/ --include="*.js" | grep -v "src/state.js"` before committing. Any new violation means a new getter/setter is needed in `state.js`.
- **Adding new items:** Update `ITEM_TOOLTIPS` in `src/gameplay/items.js`, add the item's behavior in the same file, add emoji/count IDs to `index.html` + `src/ui/dom.js`, wire the button click in `main.js`.
- **Adding new rulesets:** See `docs/superpowers/rulesets.md`. Add `prepare`/`apply` to `src/board/generation.js`, register in `src/rulesets.js`.
- **Cycle caveat:** `overlay.js ↔ level.js` cycle is safe only because imports are used inside function bodies. If a future edit puts one of these imports at module load scope (e.g., destructuring at the top), the cycle breaks. Keep the indirection inside functions.
