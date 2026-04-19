# Treasure Chamber Ruleset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `treasure_chamber` — the first alternative ruleset. Sparser walls, sparser gas, more gold, 2 guaranteed items, two 25g chests in off-diagonal corners, no merchant, pity freeze. Weight 1 vs `regular` = 50/50 on levels 13+.

**Architecture:** Plumb six biome-override fields into base code (`placeWallClumps`, `initLevel` gas count, `placeGoldVeins` scatter, `placeItemDrops` count, `initLevel` merchant decision) plus one pity-freeze branch in `nextLevel`. Two hook functions — `prepareTreasureChamber` sets the overrides object, `applyTreasureChamber` stamps both off-diagonal corners as chests. Chests reuse `type: 'gold'` with `goldValue: 25` and a `cell.chest = true` render flag.

**Tech Stack:** Plain HTML/CSS/JS, no build tooling. Dev server: `npx serve . -l 3000`. No test runner — each task ends with manual browser verification (open the server URL, play the relevant scenario, check console where noted).

**Reference spec:** `docs/superpowers/specs/2026-04-19-treasure-chamber-ruleset-design.md`

**Task order rationale:** Each task below leaves the game fully playable. Plumbing tasks (1-5) refactor base-code reads without changing behavior (override is always `undefined` → falls back to literal). Task 6 adds the ruleset entry with hooks still stubbed. Tasks 7-8 add the real hook bodies. Task 9 wires up rendering + pickup. Task 10 finalizes. This means a broken commit in the middle still produces a playable `regular`-only game, which matters because we don't have tests.

---

## Task 1: Plumb `wallDensity` override into `placeWallClumps`

**Files:**
- Modify: `game.js:642`

- [ ] **Step 1: Confirm current state**

Open `game.js` at line 642. Confirm it reads:

```javascript
  const targetWallCount = Math.floor(state.rows * state.cols * 0.25);
```

If the literal is different, stop and re-verify line numbers via `grep -n 'targetWallCount' game.js`.

- [ ] **Step 2: Replace the literal with an override-aware read**

Change line 642 from:

```javascript
  const targetWallCount = Math.floor(state.rows * state.cols * 0.25);
```

to:

```javascript
  const wallDensity = state.biomeOverrides?.wallDensity ?? 0.25;
  const targetWallCount = Math.floor(state.rows * state.cols * wallDensity);
```

- [ ] **Step 3: Verify regular levels still generate normally**

Run dev server: `npx serve . -l 3000`.

Open `http://localhost:3000`. Click **New Run**. Walk through level 1. Open DevTools console and run:

```javascript
state.grid.flat().filter(c => c.type === 'wall').length
```

Expected: roughly `state.rows * state.cols * 0.25` (e.g., 10×10 → ~25). Walls visually look the same density as before. `state.biomeOverrides` is `undefined` — confirm in console: `state.biomeOverrides` → `undefined`.

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "refactor: plumb wallDensity override into placeWallClumps"
```

---

## Task 2: Plumb `gasDensity` override into `initLevel` gas count

**Files:**
- Modify: `game.js:1516`

- [ ] **Step 1: Confirm current state**

Open `game.js` at line 1516. Confirm it reads:

```javascript
    const gasCount = Math.floor(state.rows * state.cols * 0.20);
```

- [ ] **Step 2: Replace the literal with an override-aware read**

Change line 1516 from:

```javascript
    const gasCount = Math.floor(state.rows * state.cols * 0.20);
```

to:

```javascript
    const gasDensity = state.biomeOverrides?.gasDensity ?? 0.20;
    const gasCount = Math.floor(state.rows * state.cols * gasDensity);
```

- [ ] **Step 3: Verify regular levels still generate normally**

Refresh the browser. **New Run**, level 1. Console:

```javascript
state.grid.flat().filter(c => c.type === 'gas').length
```

Expected: roughly `state.rows * state.cols * 0.20` (10×10 → ~20). Some gas cells may have been converted to `detonated` during cascade, so count those too:

```javascript
state.grid.flat().filter(c => c.type === 'gas' || c.type === 'detonated').length
```

This number plus any gas detonated during initial cascade should be ~20 on a fresh level 1.

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "refactor: plumb gasDensity override into initLevel"
```

---

## Task 3: Plumb `goldScatterDensity` override into `placeGoldVeins`

**Files:**
- Modify: `game.js:1027`

- [ ] **Step 1: Confirm current state**

Open `game.js` at line 1027. Confirm it reads:

```javascript
      if (state.grid[r][c].type === 'empty' && Math.random() < 0.2) {
```

- [ ] **Step 2: Replace the literal with an override-aware read**

Change lines 1024-1032 (the scatter-gold loop) to lift the density lookup *outside* the inner loop so it's not recomputed per cell:

From:

```javascript
  // Scatter some low-value gold (value 1) on remaining empty cells
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.grid[r][c].type === 'empty' && Math.random() < 0.2) {
        state.grid[r][c].type = 'gold';
        state.grid[r][c].goldValue = 1;
      }
    }
  }
```

to:

```javascript
  // Scatter some low-value gold (value 1) on remaining empty cells
  const scatterDensity = state.biomeOverrides?.goldScatterDensity ?? 0.2;
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.grid[r][c].type === 'empty' && Math.random() < scatterDensity) {
        state.grid[r][c].type = 'gold';
        state.grid[r][c].goldValue = 1;
      }
    }
  }
```

- [ ] **Step 3: Verify regular levels still generate normally**

Refresh the browser. **New Run**, level 1. Console:

```javascript
state.grid.flat().filter(c => c.type === 'gold' && c.goldValue === 1).length
```

Expected: roughly `0.2 * (number of empty cells after veins placed)`. Walk around, collect a bit of gold, confirm gold visuals and pickup floats look normal.

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "refactor: plumb goldScatterDensity override into placeGoldVeins"
```

---

## Task 4: Plumb `guaranteedItemDrops` override into `placeItemDrops`

**Files:**
- Modify: `game.js:1056`

- [ ] **Step 1: Confirm current state**

Open `game.js` at line 1056. Confirm it reads:

```javascript
  const dropCount = Math.min(candidates.length, 1 + Math.floor(Math.random() * 2)); // 1 or 2
```

- [ ] **Step 2: Replace the literal with an override-aware read**

Change line 1056 from:

```javascript
  const dropCount = Math.min(candidates.length, 1 + Math.floor(Math.random() * 2)); // 1 or 2
```

to:

```javascript
  const requestedDrops = state.biomeOverrides?.guaranteedItemDrops ?? (1 + Math.floor(Math.random() * 2));
  const dropCount = Math.min(candidates.length, requestedDrops);
```

- [ ] **Step 3: Verify regular levels still get 1-2 drops**

Refresh the browser. **New Run**. On level 1, console:

```javascript
state.grid.flat().filter(c => c.item).length
```

Expected: 1 or 2 (may be 0 if a drop spawned on the player's start cell — that's fine, existing behavior). Refresh several times; you should see 1-2 consistently on empty candidate terrain.

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "refactor: plumb guaranteedItemDrops override into placeItemDrops"
```

---

## Task 5: Plumb `suppressMerchant` override into the merchant spawn decision

**Files:**
- Modify: `game.js:1508`

- [ ] **Step 1: Confirm current state**

Open `game.js` at line 1508. Confirm it reads:

```javascript
  const spawnMerchant = state.levelsSinceMerchant >= 2 || Math.random() < 0.50;
```

- [ ] **Step 2: Replace with an override-aware read**

Change line 1508 from:

```javascript
  const spawnMerchant = state.levelsSinceMerchant >= 2 || Math.random() < 0.50;
```

to:

```javascript
  const spawnMerchant = state.biomeOverrides?.suppressMerchant
    ? false
    : (state.levelsSinceMerchant >= 2 || Math.random() < 0.50);
```

- [ ] **Step 3: Verify regular levels still roll merchants**

Refresh the browser. **New Run**. Play 2-3 levels. Confirm a merchant still spawns on at least one of them (pity timer or 50% roll). Console on a merchant level:

```javascript
state.merchant
```

Expected: non-null object with `r`, `c`, `stock`, `rerollCount`.

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "refactor: plumb suppressMerchant override into initLevel"
```

---

## Task 6: Wire `freezePityTick` override into `nextLevel`, add `biomeOverrides` reset to `initLevel`

**Files:**
- Modify: `game.js:1489-1498` (top of `initLevel`)
- Modify: `game.js:1703-1718` (`nextLevel`)

- [ ] **Step 1: Add `biomeOverrides` reset at the top of `initLevel`**

Open `game.js` at line 1489. Currently:

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
```

Change to:

```javascript
function initLevel() {
  // Roll ruleset if not already set (retries/resumes preserve it).
  if (!state.rulesetId) {
    state.rulesetId = (state.level >= 13 && RULESETS.length > 1)
      ? weightedPick(RULESETS).id
      : 'regular';
  }
  // Clear biome overrides from any previous level before prepare sets them again.
  state.biomeOverrides = null;
  const ruleset = resolveRuleset(state.rulesetId);
  ruleset.prepare?.(state);
```

- [ ] **Step 2: Add `freezePityTick` branch in `nextLevel`**

Open `game.js` at line 1703. Currently:

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

Change the pity-update block:

```javascript
function nextLevel() {
  state.stashGold += state.gold;
  state.gold = 0;
  state.level++;
  if (state.biomeOverrides?.freezePityTick) {
    // Freeze pity timer: do not increment levelsSinceMerchant across this level.
  } else if (state.merchant) {
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

Note: `freezePityTick` is read *before* `initLevel` clears `biomeOverrides`, so the current level's flag is what counts. Correct.

- [ ] **Step 3: Verify regular levels are unchanged**

Refresh the browser. **New Run**. Play 3-4 levels. Watch `state.levelsSinceMerchant` in console — it should increment/reset normally (resets to 0 on a merchant level, increments by 1 on a non-merchant level). Watch `state.biomeOverrides` — should be `null` at the start of every level.

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "feat: add biomeOverrides reset and freezePityTick branch"
```

---

## Task 7: Register `treasure_chamber` with stub hooks

**Files:**
- Modify: `game.js:50-52` (RULESETS array)

- [ ] **Step 1: Confirm current RULESETS**

Open `game.js` at line 50. Confirm it reads:

```javascript
const RULESETS = [
  { id: 'regular', weight: 1, prepare: null, apply: null },
];
```

- [ ] **Step 2: Add stub hook functions and registry entry**

Replace lines 50-52 with:

```javascript
const RULESETS = [
  { id: 'regular',          weight: 1, prepare: null,                   apply: null },
  { id: 'treasure_chamber', weight: 1, prepare: prepareTreasureChamber, apply: applyTreasureChamber },
];

function prepareTreasureChamber(state) {
  // Stub — filled in Task 8.
}

function applyTreasureChamber(state) {
  // Stub — filled in Task 9.
}
```

- [ ] **Step 3: Verify game still loads and runs on both rulesets**

Refresh the browser. **New Run**. Play to level 13 (can cheat: in console, `state.level = 13; retryLevel()`). Refresh and retry several times from level 13. Console on each level:

```javascript
state.rulesetId
```

Expected: alternates between `'regular'` and `'treasure_chamber'` roughly half the time. Levels with `treasure_chamber` currently look identical to `regular` (hooks are stubs). No crashes.

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "feat: register treasure_chamber ruleset with stub hooks"
```

---

## Task 8: Fill in `prepareTreasureChamber`

**Files:**
- Modify: `game.js` (`prepareTreasureChamber` function body)

- [ ] **Step 1: Replace the stub body**

Find `function prepareTreasureChamber(state) {` (added in Task 7). Replace its body so the whole function reads:

```javascript
function prepareTreasureChamber(state) {
  state.biomeOverrides = {
    wallDensity:         0.15,
    gasDensity:          0.12,
    goldScatterDensity:  0.30,
    guaranteedItemDrops: 2,
    suppressMerchant:    true,
    freezePityTick:      true,
  };
}
```

- [ ] **Step 2: Force a chamber and verify densities**

Refresh the browser. **New Run**. In console, force a chamber level for fast iteration:

```javascript
state.level = 13;
state.rulesetId = 'treasure_chamber';
// retryLevel keeps state.rulesetId, so this re-inits on 'treasure_chamber':
retryLevel();
```

Then check each override kicked in:

```javascript
// Walls ≈ 15% of cells
state.grid.flat().filter(c => c.type === 'wall').length / (state.rows * state.cols)
// Expected: ~0.15

// Gas (+ detonated) ≈ 12% of cells
state.grid.flat().filter(c => c.type === 'gas' || c.type === 'detonated').length / (state.rows * state.cols)
// Expected: ~0.12

// Item drops: exactly 2
state.grid.flat().filter(c => c.item).length
// Expected: 2

// No merchant
state.merchant
// Expected: null
```

- [ ] **Step 3: Verify regular-level regression**

Force a regular level:

```javascript
state.rulesetId = 'regular';
retryLevel();
```

Repeat the four console checks above. Expected: wall ~0.25, gas ~0.20, items 1-2, merchant null *or* non-null depending on pity/roll.

- [ ] **Step 4: Verify pity freeze**

```javascript
state.levelsSinceMerchant = 2;
state.rulesetId = 'treasure_chamber';
retryLevel();
// Walk to exit, advance to next level
// (easiest: in console, set state.playerRow = state.exit.r; state.playerCol = state.exit.c;
//  then click the exit cell via DOM: document.querySelector('.cell.exit').click())
// ...or just play through the chamber.
```

After advancing: `state.levelsSinceMerchant` should still be `2` (frozen), not `3`.

- [ ] **Step 5: Commit**

```bash
git add game.js
git commit -m "feat: prepareTreasureChamber sets biome overrides"
```

---

## Task 9: Fill in `applyTreasureChamber` — chest placement

**Files:**
- Modify: `game.js` (`applyTreasureChamber` function body)

- [ ] **Step 1: Replace the stub body**

Find `function applyTreasureChamber(state) {` (added in Task 7). Replace so the whole function reads:

```javascript
function applyTreasureChamber(state) {
  // Compute the two off-diagonal corners (neither player start nor exit).
  const playerIdx = state._startCornerIdx;
  const exitIdx = 3 - playerIdx;
  const offDiagonalIdxs = [0, 1, 2, 3].filter(i => i !== playerIdx && i !== exitIdx);
  const cornerCoords = [
    { r: 0, c: 0 },
    { r: 0, c: state.cols - 1 },
    { r: state.rows - 1, c: 0 },
    { r: state.rows - 1, c: state.cols - 1 },
  ];

  for (const idx of offDiagonalIdxs) {
    const { r, c } = cornerCoords[idx];
    const cell = state.grid[r][c];
    const hadGas = cell.type === 'gas';

    // Overwrite whatever landed here with a chest-gold cell.
    cell.type = 'gold';
    cell.goldValue = 25;
    cell.item = null;
    cell.chest = true;
    cell.adjacent = countAdjacentGas(r, c);

    // If we removed a gas cell, neighbors' adjacency counts need recomputing.
    if (hadGas) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
          const n = state.grid[nr][nc];
          if (n.type !== 'gas' && n.type !== 'wall') {
            n.adjacent = countAdjacentGas(nr, nc);
          }
        }
      }
    }

    // Pre-reveal the chest cell.
    state.revealed[r][c] = true;
  }

  renderGrid();
}
```

Note: we do NOT cascade from a 0-adjacency chest cell. Chests are point-reveals, like the merchant cell. Keeping it simple — if the chest happens to sit on what would have been a cascade pocket, that pocket stays hidden until the player approaches.

- [ ] **Step 2: Verify chests appear in the two off-diagonal corners**

Force a chamber:

```javascript
state.level = 13;
state.rulesetId = 'treasure_chamber';
retryLevel();
```

Look at the board. The two corners that are *not* the player start and *not* the exit should have a cell that's pre-revealed with `goldValue = 25`. Console check:

```javascript
state.grid.flat().filter(c => c.chest === true).length
// Expected: 2

state.grid.flat().filter(c => c.chest === true).map(c => c.goldValue)
// Expected: [25, 25]
```

Visually the chest cell still shows the 💰 icon (chest emoji comes in Task 10). That's fine for this task.

- [ ] **Step 3: Verify chest pickup works (uses existing gold path)**

Walk the player to a chest cell (maybe via pickaxe/row-scan to clear path if walled). Confirm:
- `+25` pickup float appears
- `state.gold` increments by 25
- Cell becomes normal revealed floor (`cell.type === 'empty'`, `cell.goldValue === 0`)
- `cell.chest` stays truthy but that's cosmetic until Task 10 clears it

Alternative quick verification: in console, simulate pickup on the nearest chest without walking:

```javascript
const chest = state.grid.flat().find(c => c.chest === true);
const pos = [];
for (let r = 0; r < state.rows; r++) for (let c = 0; c < state.cols; c++) if (state.grid[r][c] === chest) pos.push(r, c);
const before = state.gold;
collectAt(pos[0], pos[1]);
console.log({ before, after: state.gold, delta: state.gold - before });
// Expected: delta = 25
```

- [ ] **Step 4: Verify regular levels have no chests**

```javascript
state.rulesetId = 'regular';
retryLevel();
state.grid.flat().filter(c => c.chest === true).length
// Expected: 0
```

- [ ] **Step 5: Commit**

```bash
git add game.js
git commit -m "feat: applyTreasureChamber stamps chests in off-diagonal corners"
```

---

## Task 10: Render chests as 🎁 and clear `cell.chest` on pickup

**Files:**
- Modify: `game.js:424-434` (icon logic in `renderGrid`)
- Modify: `game.js:1173-1187` (`collectAt` — clear chest flag after gold pickup)

- [ ] **Step 1: Change the gold icon to 🎁 on chest cells**

Open `game.js` at lines 424-428. Currently:

```javascript
          let icon = null;
          if (g.type === 'gas') icon = '💀';
          else if (g.type === 'gold' && g.goldValue > 0) icon = '💰';
          else if (g.item) icon = PICKUP_EMOJI[g.item];
```

Change to:

```javascript
          let icon = null;
          if (g.type === 'gas') icon = '💀';
          else if (g.type === 'gold' && g.goldValue > 0) icon = g.chest ? '🎁' : '💰';
          else if (g.item) icon = PICKUP_EMOJI[g.item];
```

- [ ] **Step 2: Clear `cell.chest` when the gold is collected**

Open `game.js` at lines 1173-1180. Currently:

```javascript
function collectAt(r, c) {
  const cell = state.grid[r][c];
  if (cell.type === 'gold' && cell.goldValue > 0) {
    playSfx('gold');
    spawnPickupFloat(r, c, `💰 +${cell.goldValue}`);
    state.gold += cell.goldValue;
    cell.goldValue = 0;
  }
```

Change to:

```javascript
function collectAt(r, c) {
  const cell = state.grid[r][c];
  if (cell.type === 'gold' && cell.goldValue > 0) {
    playSfx('gold');
    spawnPickupFloat(r, c, `${cell.chest ? '🎁' : '💰'} +${cell.goldValue}`);
    state.gold += cell.goldValue;
    cell.goldValue = 0;
    cell.chest = false;
  }
```

Note: we also swap the pickup float label to show 🎁 on chest pickup. Consistent with the on-cell icon.

- [ ] **Step 3: Visual verification**

Refresh the browser. Force a chamber:

```javascript
state.level = 13;
state.rulesetId = 'treasure_chamber';
retryLevel();
```

Both off-diagonal corners should render 🎁 instead of 💰. Walk onto a chest — pickup float shows "🎁 +25", cell reverts to a plain revealed floor (no icon), `state.gold` +25.

- [ ] **Step 4: Regression check — regular-level gold still renders 💰**

```javascript
state.rulesetId = 'regular';
retryLevel();
```

Play around; gold piles should still show 💰, pickup floats still read "💰 +N".

- [ ] **Step 5: Commit**

```bash
git add game.js
git commit -m "feat: render chests as 🎁 and clear chest flag on pickup"
```

---

## Task 11: Final playthrough + restore default weight if cheated

**Files:** none (verification only)

- [ ] **Step 1: Restore normal play state**

If you modified `state.level` or `state.rulesetId` in console during testing, refresh the browser and click **New Run** to get a clean state. Confirm you're on level 1.

- [ ] **Step 2: Full regression playtest**

Play levels 1-13 naturally (use pickaxe/scanner liberally; we're not scoring, just observing). Watch for:

- Levels 1-12: always `regular` (confirm `state.rulesetId` in console). Maps look like they always have.
- Level 13+: roughly half the time a chamber rolls. Chamber levels have 🎁 in two corners, noticeably sparser walls and gas, more gold, no merchant.
- Die on a chamber and retry → still a chamber.
- `nextLevel` from a chamber → fresh roll (sometimes regular, sometimes chamber).
- Regular levels right after a chamber → wall/gas density normal, merchant odds normal.
- Refresh mid-chamber and **Continue** → same chamber level reloads, chests still in corners.
- Console at any point: `state.biomeOverrides` is the chamber overrides object on chamber levels, `null` on regular levels.

- [ ] **Step 3: Spot-check walled-chest frequency**

Over 5-10 chambers, count how many have a chest fully walled in (no reachable neighbors). One-in-ten-ish is fine. If it's most chambers, leave a note in memory for a follow-up density tune — don't block this ship.

- [ ] **Step 4: Final commit if no changes needed**

No code changes expected. If you made any (e.g., a density tweak caught during playtest), commit separately.

```bash
# Only if you made changes:
git add game.js
git commit -m "tune: treasure chamber post-playtest adjustment"
```

- [ ] **Step 5: Update memory (optional but recommended)**

If playtest surfaces notable findings (weight feels wrong, chest payout feels off, walled-chest rate problematic), update `project_mining_crawler.md` with the observation. Otherwise skip.

---

## Self-review notes

**Spec coverage:**
- Goal / non-goals: Task 11 playtest confirms coverage. No planned work outside the spec.
- Registry entry: Task 7.
- `state.biomeOverrides` object w/ six fields: Tasks 1-6 add consumers, Task 8 populates.
- `placeWallClumps` override: Task 1.
- Gas override: Task 2.
- `placeGoldVeins` scatter override: Task 3.
- `placeItemDrops` override: Task 4.
- Merchant suppression override: Task 5.
- Pity freeze branch: Task 6.
- `biomeOverrides` reset at `initLevel` top: Task 6.
- `prepareTreasureChamber`: Task 8.
- `applyTreasureChamber` with chest placement (overwrite, re-adjacency, pre-reveal, `renderGrid`): Task 9.
- Render 🎁 on `cell.chest`: Task 10.
- Clear `cell.chest` on pickup: Task 10.
- Save/load unchanged: no task needed (spec documents this).
- Tests: each task has a manual verification step.

**Consistency check:**
- Field names used consistently: `wallDensity`, `gasDensity`, `goldScatterDensity`, `guaranteedItemDrops`, `suppressMerchant`, `freezePityTick` — all match between spec and every task that reads/writes them.
- `state.biomeOverrides` vs any other name: always `biomeOverrides` (no drift).
- `cell.chest` flag name consistent across Tasks 9 and 10.
- Function names `prepareTreasureChamber` / `applyTreasureChamber` match spec and registry entry in Task 7.
