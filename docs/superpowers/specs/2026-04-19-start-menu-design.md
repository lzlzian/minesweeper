# Start Menu, Pause Menu, and Settings — Design

**Date:** 2026-04-19
**Status:** Approved, ready for implementation plan

## Goal

Replace the current single-overlay start screen with a structured menu system:
- A proper **Start Menu** (Continue / New Run / Rules / Settings)
- A **Pause Menu** reachable mid-run (Resume / Rules / Settings / Quit to Menu)
- A shared **Settings** screen with two toggles: Music and Sound Effects
- A shared **Rules** screen, extracted from the current Start overlay text

## Non-goals

- No keyboard shortcuts (Escape to pause, etc.). Can add later.
- No volume sliders. On/off toggles only.
- No theme/color/language settings.
- No confirm on Quit to Menu (runs autosave per level, nothing is lost).
- No overlay stack / navigation manager abstraction — current `showOverlay()` pattern is sufficient.

## Screens

All screens use the existing `showOverlay(html)` / `hideOverlay()` pair. Each screen has its own render function that produces the HTML blob.

### Start Menu — `renderStartMenu()`

Shown on page load and after Quit to Menu.

- Title: **Mining Crawler**
- **Continue (Level N · 💰 X)** — only if a save exists. Primary styling, first in tab order, most prominent.
- **New Run** — secondary styling if Continue exists; primary if not. If a save exists, tapping opens the New Run Confirm overlay; otherwise starts immediately.
- **Rules** — opens Rules overlay with `parent = 'start'`.
- **Settings** — opens Settings overlay with `parent = 'start'`.

The inline rules blob currently on this screen is removed (moved to Rules).

### Pause Menu — `renderPauseMenu()`

Shown when the ⏸️ HUD button is tapped during a run.

- Title: **Paused**
- **Resume** — `hideOverlay()`, returns to game.
- **Rules** — opens Rules overlay with `parent = 'pause'`.
- **Settings** — opens Settings overlay with `parent = 'pause'`.
- **Quit to Menu** — calls `renderStartMenu()`. No extra save call — per-level autosave already persists progress.

### Settings — `renderSettings(parent)`

Opened from Start or Pause.

- Title: **Settings**
- **🎵 Music** toggle (on/off)
- **🔊 Sound Effects** toggle (on/off)
- **Back** — dispatches to `renderStartMenu()` or `renderPauseMenu()` based on `parent`.

Toggles take effect immediately (no "restart to apply").

### Rules — `renderRules(parent)`

Opened from Start or Pause. Contains the existing rules text, lifted verbatim from today's Start overlay:

- "Reach the exit (🚪) to escape."
- "Dig adjacent cells to reveal paths. Numbers count nearby gas."
- "You have 3 ❤️. Digging gas costs 1 ❤️. Gold is optional treasure."
- "Items: 🍺 heal · 🔍 scan 3×3 · ⛏️ break wall · ↔️ row · ↕️ column · ✖️ diagonals"
- "A 🧙 merchant sometimes appears — spend gold for items."
- **Back** — same parent dispatch as Settings.

### New Run Confirm — `renderNewRunConfirm()`

Reached from Start Menu's New Run button only when a save exists.

- Text: "Starting a new run will erase your saved progress. Continue?"
- **Start New Run** — calls `startGame()`.
- **Cancel** — returns to `renderStartMenu()`.

## Pause button (HUD)

Add `<button id="pause-btn">⏸️</button>` as the rightmost element of `#hud`. Styled to match the existing HUD spans (`#16213e` background, same padding, emoji-sized).

**Visibility:** hidden on the Start menu, shown during a run. Implemented by toggling `body.in-run`:
- Added in `startGame()` and `resumeGame()`.
- Removed in `renderStartMenu()`.
- CSS: `body:not(.in-run) #pause-btn { display: none; }`.

Click handler: `renderPauseMenu()`.

## Settings persistence

One key in `localStorage`:

```js
const SETTINGS_KEY = 'miningCrawler.settings';

const settings = loadSettings(); // { musicOn: true, sfxOn: true }

function loadSettings() {
  try {
    return { musicOn: true, sfxOn: true, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch { return { musicOn: true, sfxOn: true }; }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
```

Defaults: both toggles on. Spread order in `loadSettings` ensures missing keys fall back to defaults (forward-compatible with adding more settings).

## Toggle behavior

**Music (`settings.musicOn`):**
- `setMusicOn(true)` → `settings.musicOn = true; saveSettings(); bgm.play().catch(() => {});`
- `setMusicOn(false)` → `settings.musicOn = false; saveSettings(); bgm.pause();`
- `startBgm()` becomes a no-op when `!settings.musicOn`.

**Sound Effects (`settings.sfxOn`):**
- `playSfx(name)` early-returns when `!settings.sfxOn`.
- `setSfxOn(value)` updates the setting and saves; no additional action needed (existing SFX are one-shot, not looping).

## Files changed

- **`index.html`** — add `<button id="pause-btn">⏸️</button>` inside `#hud`.
- **`style.css`** — 
  - Style `#pause-btn` to match HUD spans.
  - `body:not(.in-run) #pause-btn { display: none; }`
  - `.menu-btn-primary` / `.menu-btn-secondary` for Continue/New Run visual hierarchy.
  - `.toggle-row` for Settings rows (label left, toggle button right).
- **`game.js`** —
  - Rename `showStartScreen()` to `renderStartMenu()` (update the single call site at bottom of file).
  - Add `renderPauseMenu()`, `renderSettings(parent)`, `renderRules(parent)`, `renderNewRunConfirm()`.
  - Add `settings`, `loadSettings`, `saveSettings`, `setMusicOn`, `setSfxOn`.
  - Gate `playSfx` and `startBgm` on settings.
  - Add/remove `body.in-run` class in `startGame`, `resumeGame`, `renderStartMenu`.
  - Wire `#pause-btn` click handler.

## Testing (manual playtest)

- Fresh load (no save): Start menu shows New Run (primary), Rules, Settings. No Continue.
- With save: Continue is primary, New Run opens confirm.
- Confirm Cancel returns to Start Menu; Start New Run wipes save and starts.
- Pause button appears only during a run; hidden on Start.
- Tapping ⏸️ mid-run shows Pause Menu.
- Resume closes the overlay.
- Music toggle flips BGM immediately both in-run and on Start menu.
- SFX toggle silences digging/walking immediately when off.
- Settings persist across reload.
- Back from Settings returns to whichever menu opened it.
- Back from Rules returns to whichever menu opened it.
- Quit to Menu from Pause → Start menu shows Continue with the just-abandoned run.
