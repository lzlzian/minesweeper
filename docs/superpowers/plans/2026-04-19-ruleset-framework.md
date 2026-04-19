# Ruleset Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a ruleset framework that rolls a weighted ruleset on level 13+ and runs `prepare`/`apply` hooks around the existing level generation. Today only `regular` exists in the registry — zero user-visible change, but future alternative rulesets become single-entry additions.

**Architecture:** Module-scope `RULESETS` array + `weightedPick` helper in `game.js`. A `state.rulesetId` field carries the current level's ruleset. `initLevel` rolls (if not set), looks up the ruleset, calls `prepare` before generation and `apply` after. `nextLevel` and `startGame` clear `state.rulesetId` so the next level rolls fresh; `retryLevel` leaves it alone. Save/load round-trip it through `saveRun`/`resumeGame`.

**Tech Stack:** Plain HTML/CSS/JS, no build tooling. Dev server: `npx serve . -l 3000`. No test runner — each task ends with manual browser verification.

**Reference spec:** `docs/superpowers/specs/2026-04-19-ruleset-framework-design.md`

---

## Task 1: Add registry, weighted picker, and state field

**Files:**
- Modify: `game.js:8-27` (state object — add `rulesetId` field)
- Modify: `game.js` (add new section after state block, around line 28)

- [ ] **Step 1: Add `rulesetId` to state**

In `game.js`, replace lines 8-27 (the `state` object definition) with:

```javascript
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
  activeItem: null, // null | 'pickaxe'
  levelsSinceMerchant: 0, // run-scoped; >=2 forces merchant spawn next level
  merchant: null, // level-scoped; { r, c, rerollCount, stock: [{ type, basePrice, discountKey, price, sold }, ...] } or null
  rulesetId: null, // level-scoped; string id from RULESETS; null => initLevel rolls
};
```

- [ ] **Step 2: Add RULESETS registry and `weightedPick`**

In `game.js`, immediately after the `spendGold` function (it ends around line 38), and before the `gridSizeForLevel` function (starts around line 41), insert a new section:

```javascript

// ============================================================
// RULESETS
// ============================================================
// Registry of level rulesets. Each level rolls one from this list (weighted)
// starting at level 13. Levels 1-12 always use 'regular'.
// Ruleset shape: { id: string, weight: number, prepare?: (state) => void, apply?: (state) => void }
// - prepare runs BEFORE level generation (may set override fields on state).
// - apply runs AFTER level generation (may mutate the finished board/entities).
// Both hooks are optional.
const RULESETS = [
  { id: 'regular', weight: 1, prepare: null, apply: null },
];

function weightedPick(list) {
  const total = list.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const x of list) {
    r -= x.weight;
    if (r < 0) return x;
  }
  return list[list.length - 1]; // fallback
}

function resolveRuleset(id) {
  return RULESETS.find(r => r.id === id) || RULESETS[0];
}
```

- [ ] **Step 3: Manual verify**

Start dev server: `npx serve . -l 3000`, open `http://localhost:3000/` in a browser. In DevTools console:

```js
RULESETS
weightedPick(RULESETS)
resolveRuleset('regular')
resolveRuleset('nonexistent')
state.rulesetId
```

Expected:
- `RULESETS` is an array with one entry `{ id: 'regular', weight: 1, prepare: null, apply: null }`.
- `weightedPick(RULESETS)` returns that entry.
- `resolveRuleset('regular')` returns the entry; `resolveRuleset('nonexistent')` also returns the `regular` entry (fallback).
- `state.rulesetId` is `null`.

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "feat: add RULESETS registry, weightedPick, and state.rulesetId"
```

---

## Task 2: Clear `rulesetId` at run/level transitions

**Files:**
- Modify: `game.js:1629-1641` (`startGame`)
- Modify: `game.js:1660-1674` (`nextLevel`)

Rationale: `startGame` starts a fresh run → clear. `nextLevel` advances → clear so the next `initLevel` rolls. `retryLevel` stays untouched so a death keeps you in the same ruleset.

- [ ] **Step 1: Clear in `startGame`**

In `game.js`, replace lines 1629-1641 (the `startGame` function) with:

```javascript
function startGame() {
  clearSave();
  state.level = 1;
  state.gold = 0;
  state.stashGold = 0;
  state.levelsSinceMerchant = 0;
  state.items = { potion: 1, scanner: 1, pickaxe: 1, row: 1, column: 1, cross: 1 };
  state.rulesetId = null;
  initLevel();
  updatePlayerSprite(true);
  hurtFlashToken++;
  playerSprite.textContent = '🙂';
  startBgm();
}
```

- [ ] **Step 2: Clear in `nextLevel`**

In `game.js`, replace lines 1660-1674 (the `nextLevel` function) with:

```javascript
function nextLevel() {
  state.stashGold += state.gold;
  state.gold = 0;
  state.level++;
  if (state.merchant) {
    state.levelsSinceMerchant = 0;
  } else {
    state.levelsSinceMerchant++;
  }
  state.rulesetId = null;
  saveRun();
  initLevel();
  updatePlayerSprite(true);
  hurtFlashToken++;
  playerSprite.textContent = '🙂';
}
```

Note: `state.rulesetId = null` must come BEFORE `saveRun()` — saving the already-cleared id is fine; saving last level's stale id would not be.

- [ ] **Step 3: Manual verify**

Refresh browser. In console:

```js
startGame()
state.rulesetId  // → 'regular' (initLevel will roll; see Task 3 — for now this step just confirms startGame ran without error)
```

For now (before Task 3 wires the roll), `state.rulesetId` will remain `null` after `initLevel` — that's expected. The test here is just that `startGame()` and the existing `nextLevel()` paths don't throw.

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "feat: clear state.rulesetId in startGame and nextLevel"
```

---

## Task 3: Wire roll + prepare + apply in `initLevel`

**Files:**
- Modify: `game.js:1461-1578` (`initLevel`)

- [ ] **Step 1: Add roll + prepare at the top of `initLevel`**

In `game.js`, find the start of `initLevel` (around line 1461). Replace lines 1461-1468 (from `function initLevel() {` through `state.cols = state.rows;`) with:

```javascript
function initLevel() {
  // Roll ruleset if not already set (retries/resumes preserve it).
  if (!state.rulesetId) {
    state.rulesetId = (state.level >= 13 && RULESETS.length > 1)
      ? weightedPick(RULESETS).id
      : 'regular';
  }
  const ruleset = resolveRuleset(state.rulesetId);
  ruleset.prepare?.(state);

  state.hp = MAX_HP;
  state.gameOver = false;
  state.busy = false;
  state.activeItem = null;
  state.merchant = null;
  state.rows = gridSizeForLevel(state.level);
  state.cols = state.rows;
```

- [ ] **Step 2: Add `apply` call at the end of `initLevel`, before `hideOverlay`**

In `game.js`, find the end of `initLevel` (around line 1577-1578). The last three lines before the closing brace currently look like:

```javascript
  setPan(vp.w / 2 - cc.x, vp.h / 2 - cc.y);
  hideOverlay();
}
```

Replace those with:

```javascript
  setPan(vp.w / 2 - cc.x, vp.h / 2 - cc.y);
  ruleset.apply?.(state);
  hideOverlay();
}
```

Rationale: `apply` runs after pan is snapped but before the overlay is hidden. The ruleset sees the finished grid, player/exit/merchant placement, revealed state, and anchors. If it mutates anything visible, it happens before the UI reveals the level.

Edge case covered: if a ruleset's `apply` causes a re-render (e.g. changes a cell type), it can call `renderGrid()` itself — the preceding `renderGrid()` at line 1572 handles the base case.

- [ ] **Step 3: Manual verify level 1-12**

Refresh browser. Click "New Run". Play level 1.

In console:
```js
state.rulesetId  // → 'regular'
state.level      // → 1
```

Advance to next level (reach the exit), check again — `state.rulesetId` should still be `'regular'` at every level 1-12.

- [ ] **Step 4: Manual verify level 13+**

In console (on any active level), skip ahead:

```js
state.level = 12;
state.hp = 99; state.stashGold = 999;  // survive the jump
nextLevel();     // now on level 13
state.rulesetId  // → 'regular' (only entry in registry)
```

- [ ] **Step 5: Manual verify retry preserves ruleset**

Still on level 13+, in console:

```js
state.rulesetId = 'regular';  // (already is)
retryLevel();
state.rulesetId  // → still 'regular' (retry did not clear)
```

- [ ] **Step 6: Commit**

```bash
git add game.js
git commit -m "feat: roll ruleset + run prepare/apply hooks in initLevel"
```

---

## Task 4: Save/load round-trip

**Files:**
- Modify: `game.js:1600-1608` (`saveRun`)
- Modify: `game.js:1643-1658` (`resumeGame`)

- [ ] **Step 1: Include `rulesetId` in `saveRun`**

In `game.js`, replace lines 1600-1608 (the `saveRun` function) with:

```javascript
function saveRun() {
  const data = {
    level: state.level,
    stashGold: state.stashGold,
    items: { ...state.items },
    levelsSinceMerchant: state.levelsSinceMerchant,
    rulesetId: state.rulesetId,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}
```

- [ ] **Step 2: Read `rulesetId` in `resumeGame`**

In `game.js`, replace lines 1643-1658 (the `resumeGame` function) with:

```javascript
function resumeGame(save) {
  state.level = save.level;
  state.gold = 0;
  state.stashGold = save.stashGold;
  state.levelsSinceMerchant = save.levelsSinceMerchant;
  state.items = { ...save.items };
  // Back-compat: saves from before line-reveal items lack these keys.
  state.items.row = state.items.row ?? 0;
  state.items.column = state.items.column ?? 0;
  state.items.cross = state.items.cross ?? 0;
  // Back-compat: saves from before the ruleset framework lack this key.
  // Leaving it null lets initLevel roll fresh (regular on level <13, uniform on >=13).
  state.rulesetId = save.rulesetId ?? null;
  initLevel();
  updatePlayerSprite(true);
  hurtFlashToken++;
  playerSprite.textContent = '🙂';
  startBgm();
}
```

- [ ] **Step 3: Manual verify save/load with existing save**

In browser, open a run and advance a level or two so a save exists. In DevTools console:

```js
JSON.parse(localStorage.getItem('miningCrawler.runState'))
```

Expected: the parsed object has a `rulesetId` key set to `'regular'` (from `nextLevel`'s `saveRun` call after Task 3 wired the roll).

Refresh the page. Click Continue. In console:

```js
state.rulesetId  // → 'regular'
```

- [ ] **Step 4: Manual verify legacy save (simulate missing key)**

In DevTools console, hand-edit a save to simulate a pre-framework save:

```js
const s = JSON.parse(localStorage.getItem('miningCrawler.runState'));
delete s.rulesetId;
localStorage.setItem('miningCrawler.runState', JSON.stringify(s));
```

Refresh, click Continue. Expected:
- No console errors.
- `state.rulesetId === 'regular'` (initLevel rolled fresh since the loaded value was null).

- [ ] **Step 5: Commit**

```bash
git add game.js
git commit -m "feat: round-trip rulesetId through save/load"
```

---

## Task 5: Smoke test with dummy ruleset, then revert

**Files:**
- Temporarily modify: `game.js` (the `RULESETS` array added in Task 1)
- No final changes — this task verifies the framework and then reverts the debug entry.

- [ ] **Step 1: Temporarily add a debug ruleset**

In `game.js`, find the `RULESETS` array (added in Task 1). Replace:

```javascript
const RULESETS = [
  { id: 'regular', weight: 1, prepare: null, apply: null },
];
```

with:

```javascript
const RULESETS = [
  { id: 'regular', weight: 1, prepare: null, apply: null },
  { id: 'debug', weight: 1,
    prepare: (s) => console.log('[debug ruleset] prepare on level', s.level),
    apply:   (s) => console.log('[debug ruleset] apply on level', s.level),
  },
];
```

- [ ] **Step 2: Verify uniform roll on level 13+**

Refresh browser. In DevTools console, start a run and fast-forward past level 12:

```js
startGame();
state.level = 12; state.hp = 99; state.stashGold = 999;
nextLevel();  // → level 13
state.rulesetId  // should vary between 'regular' and 'debug' across runs
```

Advance several more levels (use `nextLevel()` and console overrides to survive each). Over 10-20 level advances past 12, confirm you see both `'regular'` and `'debug'` rolls — distribution should feel roughly 50/50, though small sample size will wobble.

Whenever `state.rulesetId === 'debug'`, the console should show both `[debug ruleset] prepare on level N` and `[debug ruleset] apply on level N` log lines for that level.

- [ ] **Step 3: Verify retry keeps the ruleset**

Once you land on a `'debug'` level, in console:

```js
const before = state.rulesetId;  // 'debug'
retryLevel();
state.rulesetId === before  // → true
```

Two more `[debug ruleset] prepare` + `apply` log lines should fire (initLevel ran again).

- [ ] **Step 4: Verify save/resume keeps the ruleset**

On a `'debug'` level, trigger a save by calling `nextLevel()` once (then you'll be on the *next* level; if it also happens to be `'debug'` the test still works; otherwise proceed to the next debug level and save by advancing past it).

Alternatively: on any level, call `saveRun()` directly:

```js
state.rulesetId = 'debug';  // force
saveRun();
JSON.parse(localStorage.getItem('miningCrawler.runState')).rulesetId  // → 'debug'
```

Refresh the page, click Continue. Console should show `[debug ruleset] prepare` and `[debug ruleset] apply` for the resumed level. `state.rulesetId === 'debug'`.

- [ ] **Step 5: Verify unknown id falls back to regular**

In console:

```js
state.rulesetId = 'totally-made-up';
saveRun();
```

Refresh, Continue. Expected:
- No crash.
- `state.rulesetId === 'totally-made-up'` (lossless round-trip on the field).
- `resolveRuleset(state.rulesetId)` returns the `'regular'` entry.
- No `[debug ruleset]` log lines (because resolve fell back to regular).

- [ ] **Step 6: Verify level 1-12 is always regular even with debug registered**

```js
startGame();
state.rulesetId  // → 'regular'
// advance through 10 levels
for (let i = 0; i < 10; i++) {
  state.hp = 99; state.stashGold = 999;
  nextLevel();
  console.log('level', state.level, 'ruleset', state.rulesetId);
}
```

Expected: every `ruleset` logged is `'regular'` for levels 2-11. Level 12 → 13 transition may roll `'debug'`.

- [ ] **Step 7: Revert the debug ruleset**

In `game.js`, restore `RULESETS` to its original single-entry form:

```javascript
const RULESETS = [
  { id: 'regular', weight: 1, prepare: null, apply: null },
];
```

Also clear your save to avoid leaving `rulesetId: 'debug'` stuck in localStorage:

```js
localStorage.removeItem('miningCrawler.runState');
```

- [ ] **Step 8: Final verify baseline unchanged**

Refresh, start a new run, play 2-3 levels normally. Confirm:
- Nothing looks or plays different from before the feature.
- `state.rulesetId === 'regular'` at every level.
- Console has no `[debug ruleset]` log lines.
- `saveRun` → localStorage still contains `rulesetId: 'regular'`.

- [ ] **Step 9: Commit (only the revert)**

```bash
git add game.js
git commit -m "chore: remove debug ruleset after smoke test"
```

---

## Self-review notes

- Spec § Goal (roll on level ≥ 13, regular only today) → Task 3 Step 1 + Task 5 Step 6.
- Spec § Registry shape → Task 1 Step 2.
- Spec § Runtime state `rulesetId` → Task 1 Step 1.
- Spec § Lifecycle (clear on nextLevel + startGame, preserve on retry) → Task 2 (clear) + Task 3 Step 5 (retry preserves).
- Spec § Roll rule (level ≥ 13 + registry length > 1) → Task 3 Step 1.
- Spec § `prepare` before generation + `apply` after → Task 3 Steps 1-2.
- Spec § Save/load round-trip + legacy-save fallback + unknown-id fallback → Task 4 + Task 5 Steps 4-5.
- Spec § Testing (dummy ruleset, retry, resume, fallback) → Task 5.
- Spec § Error handling (unknown id → RULESETS[0]) → `resolveRuleset` in Task 1 + Task 5 Step 5.
- Spec § "no user-visible change today" → Task 5 Step 8 final verify.
