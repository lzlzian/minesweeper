# Start Menu, Pause Menu, and Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-overlay start screen with a structured menu system — Start (Continue / New Run / Rules / Settings), Pause (Resume / Rules / Settings / Quit to Menu), and a shared Settings screen with Music and Sound Effects toggles.

**Architecture:** Keep the existing `showOverlay(html)` / `hideOverlay()` pair. Add per-screen render functions (`renderStartMenu`, `renderPauseMenu`, `renderSettings(parent)`, `renderRules(parent)`, `renderNewRunConfirm`). Add a persisted `settings` object (`{ musicOn, sfxOn }`) in localStorage that gates `playSfx` and `startBgm`. Add a `body.in-run` class toggled on run start/quit to control pause-button visibility. Add `⏸️` button in HUD.

**Tech Stack:** Plain HTML/CSS/JS, no build tooling. Dev server: `npx serve . -l 3000`. No test runner — each task ends with manual browser verification.

**Reference spec:** `docs/superpowers/specs/2026-04-19-start-menu-design.md`

**Task order rationale:** Tasks 1-3 add the settings infrastructure and gate audio on it — `showStartScreen` keeps working. Task 4 splits Start into `renderStartMenu` + helpers for Rules/Settings/Confirm (still callable from the same entry point). Tasks 5-7 add the HUD pause button, `body.in-run` class, and Pause menu. Task 8 wires Quit to Menu. Each task leaves the game playable end-to-end.

---

## Task 1: Add settings module with load/save

**Files:**
- Modify: `game.js` — insert new block just above the audio section (currently line 380, `const SFX_VOLUME = 0.5;`).

- [ ] **Step 1: Confirm insertion point**

Open `game.js`. Confirm line 380 reads:

```javascript
const SFX_VOLUME = 0.5;
```

If it doesn't, locate via `grep -n 'SFX_VOLUME = 0.5' game.js` and adjust the line number below.

- [ ] **Step 2: Insert the settings module**

Insert **above** line 380 (before `const SFX_VOLUME = 0.5;`), adding a blank line after:

```javascript
// ============================================================
// SETTINGS
// ============================================================

const SETTINGS_KEY = 'miningCrawler.settings';

function loadSettings() {
  try {
    return { musicOn: true, sfxOn: true, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch { return { musicOn: true, sfxOn: true }; }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

const settings = loadSettings();

```

- [ ] **Step 3: Verify the game still loads**

Run dev server: `npx serve . -l 3000`.

Open `http://localhost:3000`. Open DevTools console. Confirm:

```javascript
settings
// Expected: { musicOn: true, sfxOn: true }
```

Click **New Run**, walk a few cells, confirm the game still works normally (no console errors).

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "feat: add persisted settings with musicOn/sfxOn"
```

---

## Task 2: Gate `playSfx` on `settings.sfxOn`

**Files:**
- Modify: `game.js:420-427` (the `playSfx` function)

- [ ] **Step 1: Confirm current state**

Open `game.js` at line 420. Confirm it reads:

```javascript
function playSfx(name) {
  const buf = sfxBuffers[name];
  if (!buf) return;
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.connect(sfxGain);
  src.start();
}
```

- [ ] **Step 2: Add the settings gate**

Replace the function body's first line (`const buf = sfxBuffers[name];`) so the full function becomes:

```javascript
function playSfx(name) {
  if (!settings.sfxOn) return;
  const buf = sfxBuffers[name];
  if (!buf) return;
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.connect(sfxGain);
  src.start();
}
```

- [ ] **Step 3: Verify default still plays SFX**

Reload `http://localhost:3000`. Click **New Run**. Walk a cell, dig a cell — confirm you hear step/dig SFX (default `sfxOn: true` still plays).

Then in console:

```javascript
settings.sfxOn = false;
```

Walk another cell. Confirm no step SFX plays. Then:

```javascript
settings.sfxOn = true;
```

Walk another cell. Confirm SFX returns.

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "feat: gate playSfx on settings.sfxOn"
```

---

## Task 3: Gate `startBgm` on `settings.musicOn` and add music control helpers

**Files:**
- Modify: `game.js:433-435` (the `startBgm` function)

- [ ] **Step 1: Confirm current state**

Open `game.js` at line 433. Confirm it reads:

```javascript
function startBgm() {
  bgm.play().catch(() => {});
}
```

- [ ] **Step 2: Replace with a gated version plus setters**

Replace those three lines with:

```javascript
function startBgm() {
  if (!settings.musicOn) return;
  bgm.play().catch(() => {});
}

function setMusicOn(value) {
  settings.musicOn = value;
  saveSettings();
  if (value) {
    bgm.play().catch(() => {});
  } else {
    bgm.pause();
  }
}

function setSfxOn(value) {
  settings.sfxOn = value;
  saveSettings();
}
```

- [ ] **Step 3: Verify music toggle works**

Reload `http://localhost:3000`. Click **New Run**. Confirm music plays.

In console:

```javascript
setMusicOn(false);
```

Confirm music stops immediately. Then:

```javascript
setMusicOn(true);
```

Confirm music resumes. Reload the page, click **New Run**, and confirm music state persisted across reloads (it should — we wrote to localStorage). Reset with `setMusicOn(true)` before moving on.

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "feat: gate startBgm on settings.musicOn and add set helpers"
```

---

## Task 4: Split Start overlay into `renderStartMenu` + `renderRules`/`renderSettings`/`renderNewRunConfirm`

**Files:**
- Modify: `game.js:1687-1702` (`showStartScreen` function)
- Modify: `game.js:2169` (`showStartScreen()` call at bottom of file)

- [ ] **Step 1: Confirm current state**

Open `game.js` at line 1687. Confirm it reads:

```javascript
function showStartScreen() {
  const save = loadRun();
  const resumeBtn = save
    ? `<button onclick="resumeGame(loadRun())">Continue (Level ${save.level} · 💰 ${save.stashGold})</button>`
    : '';
  showOverlay(`
    <h2>Mining Crawler</h2>
    <p>Reach the exit (🚪) to escape.</p>
    <p>Dig adjacent cells to reveal paths. Numbers count nearby gas.</p>
    <p>You have 3 ❤️. Digging gas costs 1 ❤️. Gold is optional treasure.</p>
    <p>Items: 🍺 heal · 🔍 scan 3×3 · ⛏️ break wall · ↔️ row · ↕️ column · ✖️ diagonals</p>
    <p>A 🧙 merchant sometimes appears — spend gold for items.</p>
    ${resumeBtn}
    <button onclick="startGame()">New Run</button>
  `);
}
```

Also confirm line 2169 reads:

```javascript
showStartScreen();
```

- [ ] **Step 2: Replace `showStartScreen` with the new render functions**

Replace the entire `showStartScreen` function (lines 1687-1702) with:

```javascript
function renderStartMenu() {
  const save = loadRun();
  const continueBtn = save
    ? `<button class="menu-btn-primary" onclick="resumeGame(loadRun())">Continue (Level ${save.level} · 💰 ${save.stashGold})</button>`
    : '';
  const newRunOnClick = save ? 'renderNewRunConfirm()' : 'startGame()';
  const newRunClass = save ? 'menu-btn-secondary' : 'menu-btn-primary';
  showOverlay(`
    <h2>Mining Crawler</h2>
    ${continueBtn}
    <button class="${newRunClass}" onclick="${newRunOnClick}">New Run</button>
    <button class="menu-btn-secondary" onclick="renderRules('start')">Rules</button>
    <button class="menu-btn-secondary" onclick="renderSettings('start')">Settings</button>
  `);
}

function renderNewRunConfirm() {
  showOverlay(`
    <h2>New Run?</h2>
    <p>Starting a new run will erase your saved progress.</p>
    <button class="menu-btn-primary" onclick="startGame()">Start New Run</button>
    <button class="menu-btn-secondary" onclick="renderStartMenu()">Cancel</button>
  `);
}

function renderRules(parent) {
  const back = parent === 'pause' ? 'renderPauseMenu()' : 'renderStartMenu()';
  showOverlay(`
    <h2>Rules</h2>
    <p>Reach the exit (🚪) to escape.</p>
    <p>Dig adjacent cells to reveal paths. Numbers count nearby gas.</p>
    <p>You have 3 ❤️. Digging gas costs 1 ❤️. Gold is optional treasure.</p>
    <p>Items: 🍺 heal · 🔍 scan 3×3 · ⛏️ break wall · ↔️ row · ↕️ column · ✖️ diagonals</p>
    <p>A 🧙 merchant sometimes appears — spend gold for items.</p>
    <button class="menu-btn-primary" onclick="${back}">Back</button>
  `);
}

function renderSettings(parent) {
  const back = parent === 'pause' ? 'renderPauseMenu()' : 'renderStartMenu()';
  const musicLabel = settings.musicOn ? 'On' : 'Off';
  const sfxLabel = settings.sfxOn ? 'On' : 'Off';
  showOverlay(`
    <h2>Settings</h2>
    <div class="toggle-row">
      <span>🎵 Music</span>
      <button class="toggle-btn ${settings.musicOn ? 'toggle-on' : 'toggle-off'}" onclick="setMusicOn(!settings.musicOn); renderSettings('${parent}')">${musicLabel}</button>
    </div>
    <div class="toggle-row">
      <span>🔊 Sound Effects</span>
      <button class="toggle-btn ${settings.sfxOn ? 'toggle-on' : 'toggle-off'}" onclick="setSfxOn(!settings.sfxOn); renderSettings('${parent}')">${sfxLabel}</button>
    </div>
    <button class="menu-btn-primary" onclick="${back}">Back</button>
  `);
}
```

- [ ] **Step 3: Update the bootstrap call at the bottom of the file**

At line 2169, change:

```javascript
showStartScreen();
```

to:

```javascript
renderStartMenu();
```

- [ ] **Step 4: Add styling for primary/secondary menu buttons and settings toggles**

Open `style.css`. Append at the end of the file:

```css
#overlay-content .menu-btn-primary,
#overlay-content .menu-btn-secondary {
  display: block;
  width: 100%;
  margin: 0.4rem 0;
  padding: 0.75rem 1rem;
  font-size: 1.1rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: white;
}

#overlay-content .menu-btn-primary {
  background: #e94560;
  font-weight: bold;
  font-size: 1.2rem;
}

#overlay-content .menu-btn-primary:hover {
  background: #c73e54;
}

#overlay-content .menu-btn-secondary {
  background: #2a3a5a;
}

#overlay-content .menu-btn-secondary:hover {
  background: #3a4a6a;
}

.toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0.75rem 0;
  padding: 0.5rem 0.75rem;
  background: #0f1a30;
  border-radius: 6px;
  font-size: 1.1rem;
}

#overlay-content .toggle-btn {
  margin: 0;
  padding: 0.4rem 1.2rem;
  font-size: 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: white;
  min-width: 4rem;
}

#overlay-content .toggle-btn.toggle-on {
  background: #4ade80;
  color: #0f1a30;
  font-weight: bold;
}

#overlay-content .toggle-btn.toggle-off {
  background: #555;
}
```

- [ ] **Step 5: Verify Start menu, Rules, Settings, and New Run confirm all work**

Reload `http://localhost:3000`. Verify:

1. **Fresh load or save-less:** Start menu shows "Mining Crawler" header, then **New Run** (primary red), **Rules** (secondary dark), **Settings** (secondary dark). No Continue button.
2. Click **Rules** → Rules overlay appears with the 5 rule paragraphs and a **Back** button. Click Back → returns to Start menu.
3. Click **Settings** → Settings overlay shows 🎵 Music [On] and 🔊 Sound Effects [On] toggles and Back. Click 🎵 Music [On] → it becomes [Off] and music stops if playing. Click again → [On]. Click 🔊 Sound Effects → toggles. Click Back → returns to Start menu.
4. **With save:** Click **New Run** first to start a run, reach the exit to advance to Level 2 (this triggers autosave), then refresh the page. Start menu should now show **Continue (Level 2 · 💰 N)** as the primary (prominent) button, **New Run** as secondary, then Rules, Settings. (Tip: if you want to skip the level fast, open DevTools console and run `state.playerHp = 99; nextLevel()` to force-advance.)
5. Click **New Run** (with save present) → confirm overlay "New Run?" with Start New Run / Cancel. Click Cancel → back to Start. Click New Run → Start New Run → starts a fresh run (save wiped).

Open DevTools console. No errors should appear.

- [ ] **Step 6: Commit**

```bash
git add game.js style.css
git commit -m "feat: split start overlay into start/rules/settings/confirm screens"
```

---

## Task 5: Add `body.in-run` class toggled on run start and back on quit

**Files:**
- Modify: `game.js` — `startGame` function (line 1737), `resumeGame` function (line 1752), and `renderStartMenu` (added in Task 4)

- [ ] **Step 1: Confirm current state**

Open `game.js` at line 1737. Confirm `startGame` starts with:

```javascript
function startGame() {
  clearSave();
  state.level = 1;
```

Open `game.js` at line 1752. Confirm `resumeGame` starts with:

```javascript
function resumeGame(save) {
  state.level = save.level;
```

- [ ] **Step 2: Add `document.body.classList.add('in-run')` to both run-start functions**

In `startGame` (line 1737), add as the first line inside the function body:

```javascript
function startGame() {
  document.body.classList.add('in-run');
  clearSave();
  state.level = 1;
  ...
```

In `resumeGame` (line 1752), add as the first line inside the function body:

```javascript
function resumeGame(save) {
  document.body.classList.add('in-run');
  state.level = save.level;
  ...
```

- [ ] **Step 3: Add `document.body.classList.remove('in-run')` at the top of `renderStartMenu`**

Open `game.js` and locate `function renderStartMenu()` (added in Task 4). Add as the first line inside the function body:

```javascript
function renderStartMenu() {
  document.body.classList.remove('in-run');
  const save = loadRun();
  ...
```

- [ ] **Step 4: Verify class is toggled correctly**

Reload `http://localhost:3000`. In DevTools console:

```javascript
document.body.classList.contains('in-run')
// Expected: false (we're on Start menu)
```

Click **New Run**. In console:

```javascript
document.body.classList.contains('in-run')
// Expected: true
```

- [ ] **Step 5: Commit**

```bash
git add game.js
git commit -m "feat: toggle body.in-run class on run start/end"
```

---

## Task 6: Add pause button to HUD (hidden until in-run)

**Files:**
- Modify: `index.html` — `#hud` element (line 16)
- Modify: `style.css` — append pause button styles

- [ ] **Step 1: Confirm current state**

Open `index.html`. Confirm lines 16-20 read:

```html
  <div id="hud">
    <span id="level-display">Level 1</span>
    <span id="hp-display">❤️❤️❤️</span>
    <span id="gold-display">Gold: 0</span>
  </div>
```

- [ ] **Step 2: Add the pause button inside `#hud`**

Change those lines to:

```html
  <div id="hud">
    <span id="level-display">Level 1</span>
    <span id="hp-display">❤️❤️❤️</span>
    <span id="gold-display">Gold: 0</span>
    <button id="pause-btn" onclick="renderPauseMenu()">⏸️</button>
  </div>
```

- [ ] **Step 3: Style the pause button and hide it off-run**

Open `style.css`. Append at the end:

```css
#pause-btn {
  background: #16213e;
  color: #eee;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  font-size: 1.2rem;
  font-weight: bold;
  cursor: pointer;
  line-height: 1;
}

#pause-btn:hover {
  background: #1f2d52;
}

body:not(.in-run) #pause-btn {
  display: none;
}
```

- [ ] **Step 4: Verify visibility gating**

Reload `http://localhost:3000`. On the Start menu, confirm no ⏸️ button is visible in the HUD (the HUD itself is visible behind the overlay — only the ⏸️ should be hidden).

Click **New Run**. Confirm the ⏸️ button now appears in the HUD bar (rightmost).

Click ⏸️ — it will call `renderPauseMenu()` which does not yet exist. Expect a console error: `renderPauseMenu is not defined`. This is fine; Task 7 defines it.

- [ ] **Step 5: Commit**

```bash
git add index.html style.css
git commit -m "feat: add pause button to HUD, hidden until in-run"
```

---

## Task 7: Add `renderPauseMenu` (Resume / Rules / Settings — no Quit yet)

**Files:**
- Modify: `game.js` — add `renderPauseMenu` near the other `render*` functions (right after `renderNewRunConfirm`, added in Task 4)

- [ ] **Step 1: Locate insertion point**

Open `game.js` and find the end of `renderNewRunConfirm` (added in Task 4). It ends with a closing `}` just before `function renderRules(parent) {`.

- [ ] **Step 2: Insert `renderPauseMenu` between `renderNewRunConfirm` and `renderRules`**

Insert this function (leaving blank lines between it and its neighbors):

```javascript
function renderPauseMenu() {
  showOverlay(`
    <h2>Paused</h2>
    <button class="menu-btn-primary" onclick="hideOverlay()">Resume</button>
    <button class="menu-btn-secondary" onclick="renderRules('pause')">Rules</button>
    <button class="menu-btn-secondary" onclick="renderSettings('pause')">Settings</button>
  `);
}
```

- [ ] **Step 3: Verify pause menu round-trip**

Reload `http://localhost:3000`. Click **New Run**. Walk a few cells. Click ⏸️.

Expect:
- Overlay shows "Paused" with Resume (primary), Rules (secondary), Settings (secondary).
- Click **Resume** → overlay hides, game resumes.
- Click ⏸️ again → Pause menu.
- Click **Rules** → Rules overlay with Back. Click Back → returns to Pause menu (NOT Start menu).
- Click **Settings** → Settings overlay. Toggle music and SFX. Click Back → returns to Pause menu.
- Click **Resume** → game resumes, ⏸️ still visible in HUD.

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "feat: add pause menu with resume/rules/settings"
```

---

## Task 8: Add Quit to Menu button to pause menu

**Files:**
- Modify: `game.js` — `renderPauseMenu` (added in Task 7)

- [ ] **Step 1: Confirm current state**

Open `game.js` and locate `renderPauseMenu` (added in Task 7). Confirm it reads:

```javascript
function renderPauseMenu() {
  showOverlay(`
    <h2>Paused</h2>
    <button class="menu-btn-primary" onclick="hideOverlay()">Resume</button>
    <button class="menu-btn-secondary" onclick="renderRules('pause')">Rules</button>
    <button class="menu-btn-secondary" onclick="renderSettings('pause')">Settings</button>
  `);
}
```

- [ ] **Step 2: Add the Quit to Menu button**

Replace the function body with:

```javascript
function renderPauseMenu() {
  showOverlay(`
    <h2>Paused</h2>
    <button class="menu-btn-primary" onclick="hideOverlay()">Resume</button>
    <button class="menu-btn-secondary" onclick="renderRules('pause')">Rules</button>
    <button class="menu-btn-secondary" onclick="renderSettings('pause')">Settings</button>
    <button class="menu-btn-secondary" onclick="renderStartMenu()">Quit to Menu</button>
  `);
}
```

- [ ] **Step 3: Verify Quit to Menu round-trip**

Reload `http://localhost:3000`.

Scenario 1 — quitting preserves save:
1. Click **New Run**. Reach the exit to advance to Level 2 (this triggers autosave via `nextLevel`). (Tip: in DevTools console, `nextLevel()` force-advances.)
2. Click ⏸️ → **Quit to Menu**.
3. Start menu should appear with a **Continue (Level 2 · 💰 N)** button. Click **Continue** → game resumes at Level 2.

Scenario 2 — pause button hides after quit:
1. During a run, click ⏸️ → **Quit to Menu** → Start menu.
2. Confirm ⏸️ is no longer visible in the HUD (body no longer has `in-run`).

Scenario 3 — console quiet:
- Open DevTools console. No errors during any pause/resume/quit cycle.

- [ ] **Step 4: Commit**

```bash
git add game.js
git commit -m "feat: add quit to menu button on pause screen"
```

---

## Task 9: Full manual regression pass

**Files:** None modified.

- [ ] **Step 1: Settings persistence across reload**

Reload `http://localhost:3000`. Open Settings from Start menu. Toggle **Music** to Off, **Sound Effects** to Off. Click Back. Reload page. Open Settings again → both should still show **Off**. Reset both to **On** for subsequent tests.

- [ ] **Step 2: Music toggle from Pause menu**

Click New Run. Confirm music plays. Click ⏸️ → Settings → Music Off → music stops. Settings → Music On → music resumes. Back → Resume → music still plays in-game. Click ⏸️ again to confirm state.

- [ ] **Step 3: SFX toggle from Pause menu**

Click ⏸️ → Settings → Sound Effects Off. Back → Resume. Walk and dig cells — no step/dig SFX. Click ⏸️ → Settings → Sound Effects On. Back → Resume. Walk → SFX returns.

- [ ] **Step 4: New Run confirm Cancel**

From a save-state Start menu (Continue visible), click **New Run** → **Cancel**. Confirm save is still intact (Continue button still shows the same level/gold).

- [ ] **Step 5: New Run confirm Start New Run**

From save-state Start menu, click **New Run** → **Start New Run**. Confirm run starts at level 1 with fresh stash, items reset (1 each), and save was wiped (reload page → Continue button shows fresh level 1 state).

- [ ] **Step 6: Rules from Pause returns to Pause, not Start**

Start a run. ⏸️ → Rules → Back. Should return to Pause menu (NOT Start menu). Resume → game continues.

- [ ] **Step 7: Rules from Start returns to Start, not Pause**

Quit to Menu. On Start menu, click Rules → Back. Should return to Start menu.

- [ ] **Step 8: Pause button only shown during a run**

Start menu (no save): confirm no ⏸️ visible. Click **New Run** → ⏸️ appears. Click ⏸️ → **Quit to Menu** → ⏸️ disappears.

- [ ] **Step 9: No layout breakage on mobile width**

In DevTools, toggle Device Toolbar. Pick iPhone 12 Pro or similar. Reload. Start menu, Rules, Settings, Pause menu all fit within the viewport, buttons are tappable, text is readable. Toggles on Settings display inline (label + On/Off button in one row).

- [ ] **Step 10: If all scenarios pass, no commit needed (regression pass, no code change)**

If any issue surfaced, note it and fix in a follow-up task. Otherwise the feature is done.
