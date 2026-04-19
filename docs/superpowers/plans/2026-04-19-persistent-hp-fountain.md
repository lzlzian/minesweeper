# Persistent HP + Health Fountain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make HP run-scoped (carries between levels) and add a 💧 Health Fountain that spawns with 50% probability per level, pre-revealed, and full-heals the player on step.

**Architecture:** Three independent surfaces to change in `game.js`: (1) HP lifecycle — remove the per-level full heal, add explicit resets on start/retry, persist in save; (2) Fountain placement — add a new `'fountain'` cell type, a new `state.fountain` object, roll+place after merchant in `initLevel`; (3) Fountain interaction/render — branch in `collectAt`, render case in `renderGrid`, marker in minimap, float styles in `style.css`, rules-screen copy.

**Tech Stack:** Plain HTML/CSS/JS (no build step). Manual browser playtest via `npx serve . -l 3000`. No automated test framework in this repo.

Spec: `docs/superpowers/specs/2026-04-19-persistent-hp-fountain-design.md`

---

## File Map

**Modify only:**
- `game.js` — all logic changes (state init, `initLevel`, `renderGrid`, minimap `renderMinimap`, `collectAt`, `saveRun`, `resumeGame`, `retryLevel`, `renderRules`)
- `style.css` — add `.pickup-float.float-heal` and `.pickup-float.float-info` rules

**No new files. No files deleted.**

---

## Task Ordering Rationale

- Tasks 1–2: HP lifecycle first. Each commit leaves a playable game — after Task 1, HP carries over but there's no way to heal without potions. After Task 2, HP persists across save/resume.
- Tasks 3–6: Fountain build-up — state field, spawn/placement, pre-reveal, render, minimap, interaction. Fountain becomes progressively visible and usable.
- Tasks 7–8: CSS float classes and rules-screen copy — pure polish.
- Task 9: Manual playtest verification.

Every commit is independently playable.

---

## Task 1: Remove per-level HP reset, add resets to startGame/retryLevel

**Files:**
- Modify: `game.js` (remove `state.hp = MAX_HP;` in `initLevel`; add explicit resets in `startGame` and `retryLevel`)

**Rationale:** `initLevel` currently force-sets HP to full on every call — at start, retry, descend, and resume. We need it to ONLY reset on a true new run or death-retry. Descend must preserve HP. Resume will be handled in Task 2.

- [ ] **Step 1: Remove the per-level HP reset**

In `game.js`, find this line inside `initLevel` (currently around line 1600):

```js
  state.hp = MAX_HP;
```

Delete that single line. The surrounding code looks like:

```js
  ruleset.prepare?.(state);

  state.hp = MAX_HP;         // ← DELETE THIS LINE
  state.gameOver = false;
  state.busy = false;
```

After the change:

```js
  ruleset.prepare?.(state);

  state.gameOver = false;
  state.busy = false;
```

- [ ] **Step 2: Add HP reset to startGame**

In `game.js`, find `startGame()` (currently around line 1831). The function starts like:

```js
function startGame() {
  document.body.classList.add('in-run');
  clearSave();
  state.level = 1;
  state.gold = 0;
  state.stashGold = 0;
  state.levelsSinceMerchant = 0;
  state.items = { potion: 1, scanner: 1, pickaxe: 1, row: 1, column: 1, cross: 1 };
  state.rulesetId = null;
  initLevel();
```

Add `state.hp = MAX_HP;` after `state.level = 1;` so the block becomes:

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
```

- [ ] **Step 3: Add HP reset to retryLevel**

In `game.js`, find `retryLevel()` (currently around line 1887):

```js
function retryLevel() {
  state.gold = 0;
  initLevel();
  updatePlayerSprite(true);
  hurtFlashToken++;
  playerSprite.textContent = '🙂';
}
```

Add `state.hp = MAX_HP;` after `state.gold = 0;`:

```js
function retryLevel() {
  state.gold = 0;
  state.hp = MAX_HP;
  initLevel();
  updatePlayerSprite(true);
  hurtFlashToken++;
  playerSprite.textContent = '🙂';
}
```

- [ ] **Step 4: Manual verification**

Serve the game: `npx serve . -l 3000` (if not already running).

Open `http://localhost:3000` in a browser. Click **New Run**. Confirm HUD shows 3 ❤️.

Walk into a gas tile to take 1 damage → HUD should show 2 ❤️.

Reach the exit → Descend button. On the next level, HUD should still show **2 ❤️** (not 3). This is the key behavior change.

Walk into enough gas to die. Click **Retry Level**. HUD should show 3 ❤️.

- [ ] **Step 5: Commit**

```bash
git add game.js
git commit -m "feat: persist HP across levels, reset only on new run/retry"
```

---

## Task 2: Persist HP in save/load

**Files:**
- Modify: `game.js` (`saveRun` adds `hp` field; `resumeGame` reads `save.hp ?? MAX_HP`)

**Rationale:** Task 1 made HP run-scoped in memory, but `saveRun` doesn't store it. Right now, descending writes the save WITHOUT HP; resuming drops back to whatever `state.hp` was before `initLevel` (which without the reset line is undefined on a fresh page load). Must persist.

- [ ] **Step 1: Add hp to saveRun payload**

In `game.js`, find `saveRun()` (currently around line 1801):

```js
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

Add `hp: state.hp,` to the data object:

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

- [ ] **Step 2: Read hp in resumeGame with back-compat fallback**

In `game.js`, find `resumeGame(save)` (currently around line 1847):

```js
function resumeGame(save) {
  document.body.classList.add('in-run');
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
```

Add `state.hp = save.hp ?? MAX_HP;` after the rulesetId line:

```js
  state.rulesetId = save.rulesetId ?? null;
  // Back-compat: saves from before persistent HP lack this key; treat as full HP.
  state.hp = save.hp ?? MAX_HP;
  initLevel();
```

- [ ] **Step 3: Manual verification**

Reload browser, click **New Run**. Take 1 damage. Descend. HUD shows 2 ❤️.

Hit Pause → Quit to Menu. Then click **Continue**. HUD should still show 2 ❤️ (not 3).

Open DevTools → Application → Local Storage → `miningCrawler.runState`. Confirm JSON includes `"hp": 2`.

Old-save back-compat check: in DevTools, edit the stored JSON and delete the `"hp"` key, then reload and click Continue. HUD should show 3 ❤️ (fallback).

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "feat: persist HP in save/load with back-compat fallback"
```

---

## Task 3: Add fountain state field

**Files:**
- Modify: `game.js` (add `fountain: null` to state initializer)

**Rationale:** Prepare the state shape before wiring placement or render logic. This is a pure data-only change — game still runs the same.

- [ ] **Step 1: Add fountain field to state object**

In `game.js`, find the state initializer (starts around line 8):

```js
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
  biomeOverrides: null, // level-scoped; object or null, set by ruleset.prepare
};
```

Add `fountain: null,` immediately after the `merchant:` line:

```js
  merchant: null, // level-scoped; { r, c, rerollCount, stock: [{ type, basePrice, discountKey, price, sold }, ...] } or null
  fountain: null, // level-scoped; { r, c, used: false } or null
  rulesetId: null, // level-scoped; string id from RULESETS; null => initLevel rolls
```

- [ ] **Step 2: Reset fountain at top of initLevel**

In `game.js`, find `initLevel()` (around line 1588). Near the top, after `state.merchant = null;`:

```js
  state.gameOver = false;
  state.busy = false;
  state.activeItem = null;
  state.merchant = null;
  state.rows = gridSizeForLevel(state.level);
  state.cols = state.rows;
```

Add `state.fountain = null;` after the merchant line:

```js
  state.gameOver = false;
  state.busy = false;
  state.activeItem = null;
  state.merchant = null;
  state.fountain = null;
  state.rows = gridSizeForLevel(state.level);
  state.cols = state.rows;
```

- [ ] **Step 3: Manual verification**

Reload browser. Start a new run. Open DevTools console and type `state.fountain`. Expected: `null`.

The game should play identically to before — no visible change yet.

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "refactor: add state.fountain field, cleared per level"
```

---

## Task 4: Roll and place fountain in initLevel

**Files:**
- Modify: `game.js` (`initLevel` — add fountain roll + placement after merchant placement and pre-reveal)

**Rationale:** Place the fountain after merchant resolution, before the existing pre-reveal block. This ensures we can see merchant/chest positions to exclude them from the candidate pool.

- [ ] **Step 1: Add fountain placement block after the solved/fallback branches**

In `game.js`, find the pre-reveal block inside `initLevel` (around line 1694):

```js
  // Pre-reveal exit, start, and merchant cells; start cell cascades for anchor merge-check.
  state.revealed[state.exit.r][state.exit.c] = true;
  state.revealed[state.playerRow][state.playerCol] = true;
  if (state.merchant) {
    state.revealed[state.merchant.r][state.merchant.c] = true;
  }
```

Immediately BEFORE that block, add the fountain placement:

```js
  // Roll fountain (50%, no pity, ruleset-agnostic). Placement is independent
  // of reachability — a walled-off fountain is acceptable.
  if (Math.random() < 0.50) {
    const candidates = [];
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        if (state.grid[r][c].type !== 'empty') continue;
        if (r === state.playerRow && c === state.playerCol) continue;
        if (r === state.exit.r && c === state.exit.c) continue;
        if (state.merchant && r === state.merchant.r && c === state.merchant.c) continue;
        candidates.push({ r, c });
      }
    }
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      state.grid[pick.r][pick.c].type = 'fountain';
      state.fountain = { r: pick.r, c: pick.c, used: false };
    }
  }
```

Then update the pre-reveal block to also pre-reveal the fountain cell:

```js
  // Pre-reveal exit, start, and merchant cells; start cell cascades for anchor merge-check.
  state.revealed[state.exit.r][state.exit.c] = true;
  state.revealed[state.playerRow][state.playerCol] = true;
  if (state.merchant) {
    state.revealed[state.merchant.r][state.merchant.c] = true;
  }
  if (state.fountain) {
    state.revealed[state.fountain.r][state.fountain.c] = true;
  }
```

- [ ] **Step 2: Manual verification (state only)**

Reload browser. Start a new run. Open DevTools console and type `state.fountain`.

Roughly half the time it should be an object like `{ r: 5, c: 3, used: false }`; the other half, `null`.

If you get an object, type `state.grid[state.fountain.r][state.fountain.c].type`. Expected: `"fountain"`.

No visible change in the UI yet (render case not wired).

- [ ] **Step 3: Commit**

```bash
git add game.js
git commit -m "feat: roll fountain at 50% and place on random empty cell"
```

---

## Task 5: Render fountain in grid + minimap

**Files:**
- Modify: `game.js` (`renderGrid` — handle `'fountain'` cell type; `renderMinimap` / `drawMarker` calls — add fountain marker)

**Rationale:** With state populated, make it visible. Fountain renders as 💧 in the grid while unused and as a cyan marker on the minimap.

- [ ] **Step 1: Render fountain cell in the grid**

In `game.js`, find the revealed-cell icon selection inside `renderGrid` (around line 519):

```js
          let icon = null;
          if (g.type === 'gas') icon = '💀';
          else if (g.type === 'gold' && g.goldValue > 0) icon = g.chest ? '🎁' : '💰';
          else if (g.item) icon = PICKUP_EMOJI[g.item];
```

Add a fountain branch before the `g.item` check:

```js
          let icon = null;
          if (g.type === 'gas') icon = '💀';
          else if (g.type === 'gold' && g.goldValue > 0) icon = g.chest ? '🎁' : '💰';
          else if (g.type === 'fountain' && state.fountain && !state.fountain.used) icon = '💧';
          else if (g.item) icon = PICKUP_EMOJI[g.item];
```

- [ ] **Step 2: Draw fountain marker on minimap**

In `game.js`, find the minimap marker block (around line 342):

```js
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

Add a fountain marker before the player marker (so player still draws on top if overlapping):

```js
  // Exit (always pre-revealed).
  drawMarker(state.exit.r, state.exit.c, '#33ff33');

  // Merchant (if spawned; always pre-revealed).
  if (state.merchant) {
    drawMarker(state.merchant.r, state.merchant.c, '#ff33ff');
  }

  // Fountain (if spawned and unused; always pre-revealed).
  if (state.fountain && !state.fountain.used) {
    drawMarker(state.fountain.r, state.fountain.c, '#33ccff');
  }

  // Player last so it's always visible.
  drawMarker(state.playerRow, state.playerCol, '#ffdd00');
}
```

- [ ] **Step 3: Manual verification**

Reload browser. Start new runs until one has a fountain (should be roughly 1 in 2).

Confirm visible behavior:
- 💧 icon is drawn on a single revealed cell somewhere on the board
- Cyan square marker appears on the minimap at that cell's position
- Adjacency number shows on the fountain cell if any neighbor has gas
- 3×3 around the fountain stays unrevealed (no cascade)

On runs where no fountain spawned, there should be no 💧 and no cyan marker.

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "feat: render fountain as 💧 in grid and cyan marker on minimap"
```

---

## Task 6: Handle fountain pickup in collectAt

**Files:**
- Modify: `game.js` (`collectAt` — add fountain branch)

**Rationale:** Walking onto the fountain cell triggers the heal logic. At full HP it shows an info float and preserves the fountain; otherwise it heals to MAX_HP and consumes the fountain.

- [ ] **Step 1: Add fountain branch to collectAt**

In `game.js`, find `collectAt(r, c)` (around line 1271):

```js
function collectAt(r, c) {
  const cell = state.grid[r][c];
  if (cell.type === 'gold' && cell.goldValue > 0) {
    playSfx('gold');
    spawnPickupFloat(r, c, `${cell.chest ? '🎁' : '💰'} +${cell.goldValue}`);
    state.gold += cell.goldValue;
    cell.goldValue = 0;
    cell.chest = false;
  }
  if (cell.item) {
    state.items[cell.item]++;
    spawnPickupFloat(r, c, `${PICKUP_EMOJI[cell.item] || ''} +1`);
    cell.item = null;
    playSfx('pickup');
  }
}
```

Add a fountain branch at the end:

```js
function collectAt(r, c) {
  const cell = state.grid[r][c];
  if (cell.type === 'gold' && cell.goldValue > 0) {
    playSfx('gold');
    spawnPickupFloat(r, c, `${cell.chest ? '🎁' : '💰'} +${cell.goldValue}`);
    state.gold += cell.goldValue;
    cell.goldValue = 0;
    cell.chest = false;
  }
  if (cell.item) {
    state.items[cell.item]++;
    spawnPickupFloat(r, c, `${PICKUP_EMOJI[cell.item] || ''} +1`);
    cell.item = null;
    playSfx('pickup');
  }
  if (state.fountain &&
      r === state.fountain.r &&
      c === state.fountain.c &&
      !state.fountain.used) {
    if (state.hp >= MAX_HP) {
      spawnPickupFloat(r, c, 'Already at full HP', 'float-info');
    } else {
      state.hp = MAX_HP;
      state.fountain.used = true;
      spawnPickupFloat(r, c, '+❤️', 'float-heal');
      playSfx('drink');
    }
  }
}
```

- [ ] **Step 2: Manual verification**

Reload browser. Start runs until you find a fountain. Make sure you have not taken damage.

**Full-HP case:** Walk onto the fountain cell. Expected: white/neutral "Already at full HP" float rises and fades; 💧 remains on the cell; minimap marker remains; HUD still 3 ❤️. You can walk off and back on — it still shows the message.

**Damaged case:** Walk into gas to take 1 damage (HUD shows 2 ❤️). Walk onto the fountain. Expected: green "+❤️" float rises; HUD jumps to 3 ❤️; 💧 icon disappears on next render; minimap cyan marker disappears; `drink` SFX plays.

**Consumed case:** After drinking, walk off and back onto the cell. Expected: no float, no heal. Fountain is spent.

Note: the floats may look plain white until Task 7 adds the color CSS. That's fine for now.

- [ ] **Step 3: Commit**

```bash
git add game.js
git commit -m "feat: fountain heals on step, defers if player is at full HP"
```

---

## Task 7: Add CSS for heal and info float classes

**Files:**
- Modify: `style.css` (add `.pickup-float.float-heal` and `.pickup-float.float-info` rules)

**Rationale:** Task 6 applies `float-heal` and `float-info` classes but no CSS defines their colors. Without these rules, both render in the default gold color.

- [ ] **Step 1: Add the two float color variants**

In `style.css`, find the existing `.pickup-float.float-danger` block (around line 75):

```css
.pickup-float.float-danger {
  color: #ff4444;
}
```

Add two sibling rules right after it:

```css
.pickup-float.float-danger {
  color: #ff4444;
}

.pickup-float.float-heal {
  color: #55ee77;
}

.pickup-float.float-info {
  color: #e0e0e0;
}
```

- [ ] **Step 2: Manual verification**

Reload browser. Find a fountain and trigger both paths:
- Full HP: "Already at full HP" float should now be light gray (`#e0e0e0`)
- Damaged: "+❤️" float should now be green (`#55ee77`)

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "style: add float-heal (green) and float-info (gray) colors"
```

---

## Task 8: Add fountain to rules overlay

**Files:**
- Modify: `game.js` (`renderRules` — add 💧 Health Fountain bullet)

**Rationale:** Surface the new mechanic to players in the Rules screen.

- [ ] **Step 1: Add fountain bullet to the items list**

In `game.js`, find `renderRules(parent)` (around line 1758). The items list looks like:

```js
    <ul class="rules-items">
      <li>🍺 <strong>Potion</strong> — restore 1 ❤️</li>
      <li>🔍 <strong>Scanner</strong> — reveal the 3×3 around you</li>
      <li>⛏️ <strong>Pickaxe</strong> — break one wall tile</li>
      <li>↔️ <strong>Row Scan</strong> — reveal along your row until walls stop it</li>
      <li>↕️ <strong>Column Scan</strong> — reveal along your column until walls stop it</li>
      <li>✖️ <strong>Cross Scan</strong> — reveal along all four diagonals until walls stop them</li>
    </ul>
    <p>A 🧙 merchant sometimes appears — spend gold for items at varying discounts.</p>
```

The fountain is a map feature, not an inventory item. Add its own paragraph after the merchant paragraph:

```js
    <ul class="rules-items">
      <li>🍺 <strong>Potion</strong> — restore 1 ❤️</li>
      <li>🔍 <strong>Scanner</strong> — reveal the 3×3 around you</li>
      <li>⛏️ <strong>Pickaxe</strong> — break one wall tile</li>
      <li>↔️ <strong>Row Scan</strong> — reveal along your row until walls stop it</li>
      <li>↕️ <strong>Column Scan</strong> — reveal along your column until walls stop it</li>
      <li>✖️ <strong>Cross Scan</strong> — reveal along all four diagonals until walls stop them</li>
    </ul>
    <p>A 🧙 merchant sometimes appears — spend gold for items at varying discounts.</p>
    <p>💧 A <strong>Health Fountain</strong> sometimes appears — step on it to heal to full. Single use.</p>
```

Also update the earlier HP-carry line if needed. The current text says:

```js
    <p>You have 3 ❤️. Hitting gas damages you for 1 ❤️. Dying forfeits your current-level gold, but stash and items are safe.</p>
```

Revise it to reflect the new carry behavior:

```js
    <p>You have 3 ❤️. Hitting gas damages you for 1 ❤️. HP carries between levels — dying forfeits your current-level gold, but stash and items are safe.</p>
```

- [ ] **Step 2: Manual verification**

Reload browser. From the start menu, click **Rules**. Confirm:
- HP line mentions "HP carries between levels"
- The 💧 Health Fountain bullet appears after the merchant paragraph

Click **Back** → **New Run** → in-run pause menu → Rules — same text shows. **Back** returns to pause menu.

- [ ] **Step 3: Commit**

```bash
git add game.js
git commit -m "feat: add fountain and HP-carry notes to rules screen"
```

---

## Task 9: End-to-end playtest

**Files:** none — verification only.

**Rationale:** Cover all behaviors from the spec's testing plan in one pass. Log results; fix any regressions before declaring done.

- [ ] **Step 1: Run through spec test checklist**

Serve the game: `npx serve . -l 3000`.

For each item below, note pass/fail:

1. [ ] Start new run, take 1 damage on level 1, descend → HUD shows 2/3 on level 2 (NOT 3/3).
2. [ ] Find a fountain at <3 HP → heal to 3/3, 💧 disappears, cell shows plain revealed floor (with adjacency if applicable).
3. [ ] Find a fountain at 3/3 HP → "Already at full HP" float appears (gray); 💧 stays. Take 1 damage, return → heal works; 💧 then disappears.
4. [ ] Play several levels without a fountain → no 💧 anywhere, no cyan minimap marker.
5. [ ] Save mid-run at 1/3 HP (Pause → Quit to Menu), reload browser, click Continue → HUD shows 1/3 HP.
6. [ ] Simulate old save: DevTools → Application → Local Storage → edit `miningCrawler.runState`, delete `"hp"` key, reload → Continue loads with 3/3.
7. [ ] Die at 0 HP, click Retry Level → HP resets to 3/3.
8. [ ] Eyeball ~10 level transitions — fountain should spawn roughly half the time. Log actual ratio (e.g., "5/10").
9. [ ] Reach level 13+ and hit a Treasure Chamber level. Confirm fountain can still roll (the chamber doesn't block it). Fountain should never land on a 🎁 chest cell.
10. [ ] On a level with both merchant 🧙 and fountain 💧, confirm they're different cells and both work as expected.

- [ ] **Step 2: If all pass, write a one-line summary commit**

If anything failed, investigate and fix (likely a one-line adjustment to the relevant task's code). Re-run that specific test. Then:

```bash
git log --oneline -10
```

Confirm 8 feat/refactor/style commits from tasks 1-8 are present.

No additional commit needed — the playtest itself produces no file changes. Report results to the user.

---

## Self-Review Checklist

All spec requirements mapped to tasks:
- HP carry-over across levels → Task 1 (remove reset, add explicit resets)
- HP persisted in save/load with back-compat → Task 2
- New `state.fountain` field → Task 3
- 50% spawn roll, random empty cell, exclusions, no reachability carve → Task 4
- Pre-reveal fountain cell only (no 3×3 cascade) → Task 4 Step 1 (just `state.revealed[r][c] = true`)
- 💧 grid render + cyan minimap marker (when unused) → Task 5
- `collectAt` branch: full-HP gate (float-info + persist) vs heal (float-heal + consume + SFX) → Task 6
- `.float-heal` and `.float-info` CSS → Task 7
- Rules screen update (HP-carry note + fountain bullet) → Task 8
- Ruleset-agnostic spawn (including Treasure Chamber) → Task 4 (no ruleset check in the placement code; Task 9 Step 1 item 9 verifies)
- Fountain not persisted in save → already handled; `saveRun` doesn't touch `state.fountain`, and `initLevel` clears it. No task needed.

Placeholder scan: no TBD/TODO; every code step has full code; every test has concrete verification steps.

Type/naming consistency: `state.fountain`, `state.fountain.used`, `state.fountain.r`, `state.fountain.c`, `'fountain'` cell type, `'float-heal'`, `'float-info'`, `playSfx('drink')` — all consistent across tasks.
