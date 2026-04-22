# Level Editor — Design

Date: 2026-04-21
Branch: `level-editor`

## Goal

Create a browser-based editor that produces handcrafted levels for Mining Crawler. Primary purpose: test whether a Candy-Crush-style authored campaign is a viable direction for the game, and provide a playground for designing levels that may later seed procgen templates.

This is a direction-test, not a commitment to shipping handcrafted-only gameplay. The editor and the authored-play mode coexist with the existing procgen game — both are reachable from the start menu, and the existing procgen path is untouched.

## Scope

In scope:

- A painter-style level editor on a dedicated page (`editor.html`).
- A JSON schema for authored levels plus round-trip save/load.
- localStorage drafts (working buffer + numbered slots) and JSON export for committed levels.
- A "Play Authored" start-menu entry that lists committed levels (from `levels/index.json`) and localStorage slots.
- Test Play from inside the editor.
- Authored-level boot path on the game side that replaces procgen generation for one level only.

Out of scope:

- Campaign mode (levels played in sequence with persistent HP/stash). Revisit if authored levels prove fun.
- Authoring merchant stock, starter items, or run-level overrides (HP, starting gold). Merchant *position* is authored; stock is still rolled at runtime.
- Editing committed levels in place — export is one-way; to iterate on a committed level, re-import the JSON into a slot and re-export.
- Mobile-optimized editor UI — the editor is a desktop tool.
- Sharing / online storage. Local-only.

## Architecture

Two pages, shared low-level modules, fully separated high-level code.

```
minesweeper-mining/
  index.html                   # game (unchanged)
  editor.html                  # NEW — editor page
  src/
    main.js                    # game boot; MODIFIED to recognize #play-authored=<id>
    state.js                   # game state (unchanged)
    audio.js                   # shared
    settings.js                # shared
    rulesets.js                # shared (editor reads, doesn't hook in)
    board/                     # game-only
      generation.js
      layout.js
    ui/                        # game-only
      dom.js, render.js, view.js, overlay.js, tooltip.js, shop.js, pointer.js
    gameplay/
      level.js                 # MODIFIED — adds startAuthoredLevel
      interaction.js           # MODIFIED — authored-mode end-of-level overlay routing
      items.js                 # shared (editor imports ITEM_TOOLTIPS for palette labels)
      merchant.js              # game-only
    editor/                    # NEW
      main.js                  # editor boot + wiring
      editorState.js           # draft level state singleton
      editorDom.js             # DOM refs for editor.html
      editorRender.js          # paints grid, palette, inspector
      editorPointer.js         # click / drag / long-press paint handling
      palette.js               # brush taxonomy + emoji labels
      slotStore.js             # localStorage read/write for slot N, list slots
      schema.js                # levelToJson / jsonToLevel / schemaVersion / reject helpers
      validation.js            # validate-for-play rules
      testPlay.js              # writes pendingTestPlay, navigates to game
      export.js                # JSON download
  levels/                      # NEW — committed authored levels
    index.json                 # manifest of committed levels
    level-01.json
    ...
  tests/
    smoke.html, smoke.js       # MODIFIED — add schema + validation cases
```

### Dependency rules

The module refactor's dependency direction (`main → gameplay → ui|board → state|audio|rulesets`) is preserved. In addition:

- `editor/*` may import from `state.js` (read-only), `audio.js`, `settings.js`, `items.js` (for `ITEM_TOOLTIPS`), and `rulesets.js` (for the cell-type taxonomy if needed).
- `editor/*` MUST NOT import from `gameplay/*`, `board/*`, or `ui/*`. The editor has its own DOM, its own render, its own pointer handling.
- `gameplay/level.js` MUST NOT import from `editor/*`. The game's awareness of authored levels goes through `schema.js`, which is the one shared piece.

`schema.js` (the schema parser/validator) is the bridge. The editor produces JSON through it; the game consumes JSON through it. One source of truth.

### Entry point

The editor is reachable at `editor.html` (a second page). No start-menu button in the game — players see only the game's normal start menu. You bookmark `editor.html`.

The game recognizes one new hash: `#play-authored=<id>` (where `id` is `draft` for the editor-test-play buffer or a committed level id). On boot, `main.js` inspects the hash and either renders the start menu or boots into an authored level.

## Data model

### Level JSON

```jsonc
{
  "schemaVersion": 1,
  "id": "level-01",
  "name": "Intro",
  "notes": "Teaches fountain. 8x8.",
  "rows": 8,
  "cols": 8,

  "playerStart": { "r": 0, "c": 0 },
  "exit":        { "r": 7, "c": 7 },
  "merchant":    { "r": 6, "c": 6 },   // or null
  "fountain":    { "r": 3, "c": 3 },   // or null

  "cells": [
    [ { "type": "empty" }, { "type": "wall" }, ... ],  // length = cols
    ...                                                 // length = rows
  ],

  "itemDrops": [
    { "r": 2, "c": 5, "item": "potion" },
    { "r": 4, "c": 1, "item": "pickaxe" }
  ]
}
```

### Cell specs

```jsonc
{ "type": "empty" }
{ "type": "wall" }
{ "type": "gas" }
{ "type": "gold", "goldValue": 10 }   // goldValue ∈ {1, 5, 10, 25} via palette
{ "type": "fountain" }
```

### Rationale

- `cells` is a dense 2D array — every `(r, c)` has an entry. This matches `state.grid` and keeps the schema explicit (no "default to empty" holes to reason about).
- `itemDrops[]` is separate from cells. Authored items inventory better at a glance when listed, and the authored→engine conversion just walks the list and stamps `cell.item = key`. The engine's runtime cell shape (`cell.item`) is an implementation detail; the JSON keeps item placement tidy.
- Merchant and fountain are top-level, mirroring `state.merchant` / `state.fountain`. Keeps the cells array "what this square is made of."
- No `adjacent`, no `revealed`, no `flagged` in the schema. The engine computes adjacency at load time via the existing `countAdjacentGas` helper; `revealed` / `flagged` are runtime arrays initialized empty on level start.
- No anchors in the schema, and no anchors are placed for authored levels at runtime. The author designs the whole layout — no random reveals beyond the engine's standard 3×3 start area.
- No merchant stock, HP, starter items — per scope decision.
- `schemaVersion: 1`. Any breaking change bumps this; `jsonToLevel` rejects unknown versions with a clear error.

### Validation rules

Enforced in `validation.js`, used by both editor (on save and Test Play) and game (on load):

1. `schemaVersion === 1`.
2. `rows` and `cols` in `[6, 20]`.
3. `cells` is `rows × cols` and every entry is a valid cell spec.
4. Exactly one `playerStart`, exactly one `exit`, both in bounds, `playerStart !== exit`.
5. At most one `merchant`, at most one `fountain`, both in bounds if present.
6. No two of `{playerStart, exit, merchant, fountain}` share a position.
7. No item drop shares a position with `playerStart`, `exit`, `merchant`, or `fountain`.
8. Each `itemDrops[i]` has an in-bounds position, valid item key (`potion | scanner | pickaxe | row | column | cross`), and lands on a cell whose `type === 'empty'`.
9. The player-start cell's `type` is `empty` (anything else — gold, gas, wall, fountain — is disallowed; `collectAt` on spawn would mis-trigger fountains or gold pickups, and walls/gas on spawn make no sense).
10. The exit cell's `type` is `empty`.
11. Exit is reachable from `playerStart` using Chebyshev BFS through non-wall, non-gas cells. This matches the engine's `isReachable` helper in `board/layout.js` exactly — gas blocks the "solvable" test because taking damage to cross gas shouldn't count as a guaranteed path. `validation.js` reimplements the BFS against the JSON model (editor can't import `isReachable` from `board/layout.js` without breaking the editor↛board isolation rule).

For Test Play and committed-level load, all rules are hard requirements. For saving a WIP draft to a slot, the editor offers a "Save anyway" path — useful for parking incomplete drafts. Violations are always shown in the inspector.

### Storage keys

```
localStorage:
  miningCrawler.editor.draft              # the working buffer (auto-saved)
  miningCrawler.editor.slot.<N>           # named slot, same JSON shape, N ∈ 1..10
  miningCrawler.editor.slots              # array of { slot, id, name, updatedAt } for slot-list UI
  miningCrawler.editor.pendingTestPlay    # set by Test Play, consumed + cleared by game on boot
```

Auto-save policy: the working buffer writes on every paint stroke (debounced 500ms). Slots write only on explicit "Save to slot…".

### Committed-level manifest

`levels/index.json`:

```jsonc
[
  { "id": "level-01", "name": "Intro",    "file": "level-01.json" },
  { "id": "level-02", "name": "Corridor", "file": "level-02.json" }
]
```

Play Authored reads the manifest at menu-open time. Missing manifest → silently show only localStorage slots.

## Editor UI behaviors

### Layout — painter model

Top bar (single row): `☰` menu · level-name input · Test Play (primary) · validation indicator (✓ playable / ✗ first-error).

`☰` menu: New · Load draft · Load slot… · Save to slot… · Export JSON · Import JSON.

Left palette (vertical, scrollable):

- **Terrain**: `·` empty, `▓` wall, `💀` gas, `💧` fountain
- **Gold**: `💰 1`, `💰 5`, `💰 10`, `💰 25` (four brushes — keeps painting fast)
- **Placement (unique)**: `🙂` player start, `🚪` exit, `🧙` merchant
- **Item drops**: `🍺` potion, `🔍` scanner, `⛏️` pickaxe, `↔️` row, `↕️` column, `✖️` cross

Clicking a swatch sets `editorState.brushKey`. Active brush has a visible ring.

Grid pane (center):

- 40px cells (same as the game). No pan/minimap — authored levels fit in viewport (max 20×20).
- **Click** paints the current brush onto the cell.
- **Drag** paints continuously (pointerdown → pointermove → pointerup). One undo entry per stroke.
- **Right-click** or **long-press** erases to `{ type: 'empty' }`, independent of current brush.
- **Unique placements** (player/exit/merchant/fountain) move — painting them on a new cell removes the old marker.
- **Paint-blocking cases** flash red and refuse:
  - Paint player-start or exit onto a cell holding another unique placement (exit, merchant, fountain).
  - Paint merchant or fountain on player-start or exit.
  - Paint wall or gas on player-start, exit, merchant, or fountain cells (they live on non-wall, non-gas cells).
  - Paint any non-empty terrain (wall/gas/gold/fountain) on a cell holding an item drop.
  - Paint an item drop on a cell whose type is not empty (drops live on empty cells only).

Right inspector (narrow column):

- Board size: `rows` and `cols` number inputs, min 6, max 20. Resize crops or grows `cells`, preserving overlap content. Resizing down past a unique placement or item drop prompts confirmation.
- Notes textarea (free-form, stored in JSON).
- Summary line: `Gas: N · Walls: N · Gold: N · Items: N`.
- Validation list (always visible): ticks for satisfied rules, crosses for failed ones with short messages.

Keyboard shortcuts (desktop):

- `1`–`9` — select first 9 palette brushes.
- `Z` — undo.
- `Y` — redo.
- `Ctrl+S` — save to the currently loaded slot (if any), else open "Save to slot…".

Undo/redo:

- Snapshot `editorState.cells` + placement refs on every terminal paint action (pointerup, not every pointermove — one entry per stroke).
- Ring buffer, max 50 snapshots.
- Lost on page reload (not persisted).

### Test Play flow

1. Press Test Play.
2. Editor validates (`validation.js`). If invalid, toast first error, abort.
3. Editor writes the full JSON to `miningCrawler.editor.pendingTestPlay`.
4. `window.location.href = 'index.html#play-authored=draft'`.
5. Game's `main.js` parses the hash, reads the level, calls `startAuthoredLevel(data)`.
6. Gameplay — normal interaction, items, merchant, fountain all functional.
7. On death: normal death overlay. "Retry Level" re-runs `startAuthoredLevel(cachedData)`. "New Run" routes to the game's start menu.
8. On reaching exit: authored-level end overlay — "Level cleared! · Collected 💰 N · [Back to Menu]". Back-to-Menu navigates to `index.html` (no hash) → fresh boot into the start menu. Editor tab in another window/tab is unaffected.

No "Next Level" button in authored mode — there is no sequence yet.

## Game-side integration

Three localized changes, no surgery on procgen paths.

### 1. `src/main.js` — hash routing

Before the current `renderStartMenu()` call, check for `#play-authored=<id>`:

```js
const m = location.hash.match(/^#play-authored=(.+)$/);
if (m) {
  loadAuthoredAndStart(decodeURIComponent(m[1]));
} else {
  renderStartMenu();
}
```

`loadAuthoredAndStart(id)` (new function, can live in `gameplay/level.js` or a small new `gameplay/authored.js`):

- `id === 'draft'`: read JSON from `miningCrawler.editor.pendingTestPlay`. Always delete the key after reading, whether the load succeeds or fails — drafts are single-use.
- `id === 'slot-<N>'`: read from `miningCrawler.editor.slot.<N>`.
- Otherwise: `fetch('levels/' + id + '.json')`.
- Validate via `schema.js` + `validation.js`. On failure, show a toast on the start menu and fall through to `renderStartMenu()`.
- On success, call `startAuthoredLevel(data)`.

### 2. `gameplay/level.js` — new `startAuthoredLevel`

Sibling of `startGame`/`resumeGame`. Does not modify them.

```js
let currentAuthoredData = null;  // module-scoped for Retry routing

export function startAuthoredLevel(data) {
  document.body.classList.add('in-run');
  clearSave();               // authored play does not use the procgen save slot
  resetForNewRun();          // default HP, starter items, 0 gold
  currentAuthoredData = data;
  applyAuthoredLevel(data);
  updatePlayerSprite(true);
  resetHurtFlash();
  playerSprite.textContent = '🙂';
  startBgm();
}
```

`applyAuthoredLevel(data)` replaces the procgen body of `initLevel` for authored plays:

- `setRows/setCols` from `data.rows`/`data.cols`.
- Reset transient run state: `setGameOver(false)`, `setBusy(false)`, `setActiveItem(null)`, `setMerchant(null)`, `setFountain(null)`.
- `setRulesetId('authored')` — sentinel. No ruleset hooks run. `setBiomeOverrides(null)`.
- Build `state.grid` from `data.cells`: each cell becomes `{ type, adjacent: 0, goldValue: 0, item: null }`, with `goldValue` set for gold.
- Walk `data.itemDrops[]`, set `grid[r][c].item = drop.item`.
- Set `playerRow/playerCol`, `exit` from JSON.
- If `data.merchant`: `cleanMerchantCell(r, c)` (reusing the existing helper), then `setMerchant({ r, c, stock: rollMerchantStock(), rerollCount: 0 })`.
- If `data.fountain`: `grid[r][c].type = 'fountain'`, `setFountain({ r, c, used: false })`.
- Compute `adjacent` on every non-wall, non-gas cell via `countAdjacentGas`. **Required for number rendering.**
- Init `revealed` / `flagged` as empty 2D arrays.
- Pre-reveal: player cell, exit, merchant cell (if any), fountain cell (if any), and the 3×3 around the player (same as procgen — use the existing reveal-cell logic).
- Force the player cell's item to `null` defensively (engine convention — spawn cell never grants a free pickup; validation should have caught any drop here already).
- **Do NOT** call `placeAnchors`. Authored levels are the whole design — no random reveals.
- `updateHud()`, `renderGrid()`, snap pan to the player cell.

Engineering note: as much as possible, reuse helpers from `board/generation.js` (`countAdjacentGas`, `cleanMerchantCell`) rather than reimplementing them. The authored pathway is a different *caller* of the same primitives, not a different engine.

### 3. `gameplay/interaction.js` — end-of-level routing

Currently, reaching the exit calls `showEscapedOverlay(level, gold, stashGold, nextSize)`. For authored levels, route to a new overlay:

```js
if (getRulesetId() === 'authored') {
  showAuthoredClearedOverlay(getGold());  // new overlay in ui/overlay.js
} else {
  showEscapedOverlay(...);
}
```

`showAuthoredClearedOverlay(gold)` in `ui/overlay.js`:

```html
<h2>Level cleared!</h2>
<p>Collected 💰 N</p>
<button data-act="back-to-menu">Back to Menu</button>
```

Click handler: `window.location.href = 'index.html'` (clears the hash, fresh boot into the start menu).

Death in authored levels: reuse `showDeathOverlay`, but the "Retry Level" handler needs to call `startAuthoredLevel(currentAuthoredData)` instead of `retryLevel()` when in authored mode. Gated on `getRulesetId() === 'authored'`. The module-scoped `currentAuthoredData` in `level.js` holds the cached level.

### 4. `ui/overlay.js` — Play Authored menu

`renderStartMenu()` gains a new button:

```html
<button class="menu-btn-secondary" data-act="play-authored">Play Authored</button>
```

Clicking it opens `renderAuthoredList()`:

- Fetch `levels/index.json`. On 404, the committed section is omitted.
- Read `miningCrawler.editor.slots` for the slot list.
- Render: "Committed" section (from manifest) and "Drafts" section (from slots), each listing name + Play button.
- Play button navigates to `index.html#play-authored=<id>` or `index.html#play-authored=slot-<N>`.
- Back button returns to the start menu.

## Error handling and edge cases

### Loading errors

- **Invalid JSON** (committed, draft, or import): `schema.js` returns `{ ok: false, errors: [...] }`. Editor shows errors in a toast and refuses to load. Game logs to console, shows a toast on the start menu, falls back to `renderStartMenu()`.
- **Missing committed file** (404 on `levels/<id>.json`): "Level not found" toast, return to menu.
- **Missing `levels/index.json`**: silent — menu shows slots only, with a "No committed levels yet" hint if both sections are empty.
- **localStorage unavailable / quota**: editor shows a persistent banner "Drafts won't be saved — Export to download instead." Export still works.
- **Schema version mismatch** on draft load: toast "This draft was made with a different schema version", offer "Clear and start fresh" or "Cancel".
- **`pendingTestPlay` left behind**: deleted by the game after consumption (success or failure). Drafts are single-use.

### Editor paint edge cases

- **Paint any unique placement onto a cell that already holds another unique placement**: block + flash. (A single cell can hold only one of player-start / exit / merchant / fountain.)
- **Paint wall or gas on player-start / exit / merchant / fountain**: block + flash.
- **Paint non-empty terrain (wall/gas/gold/fountain) on a cell holding an item drop**: block + flash.
- **Paint an item drop on a non-empty cell**: block + flash.
- **Resize down past existing placements or drops**: confirmation modal listing what will be lost; on confirm, clear those placements/drops from the draft.

### Engine-side edge cases (robustness, even though the editor prevents most)

- **Item drop on player-start cell**: engine sets `grid[playerStart].item = null` after applying drops, matching the procgen convention.
- **Merchant on a gas cell in imported JSON**: `cleanMerchantCell` already handles scrubbing. Editor can't produce this; imported bad JSON still renders correctly.
- **`goldValue: 10` on a `type: 'empty'` cell**: schema rejects.

## Testing plan

Manual-only, matching the project's current approach. Additions to `tests/smoke.html`:

1. **Schema round-trip**: construct a level in memory, serialize with `levelToJson`, parse with `jsonToLevel`, deep-equal.
2. **Schema rejects**: fixtures for missing required fields, out-of-bounds positions, duplicate placements, unknown `type`, wrong `schemaVersion`.
3. **Validation correctness**: 3–4 curated inputs with expected validation results.

Manual editor smoke checklist:

4. Open `editor.html`, paint a small level (walls, gas, gold, player, exit), save to slot 1, reload the page, load slot 1 — grid matches.
5. Paint blocking: try to overwrite player with wall, try two players, try fountain on exit — all blocked with flash.
6. Resize 10×10 → 8×8 with a placement outside the new bounds — confirmation appears, confirm, placement cleared.
7. Test Play flow: paint a valid level, Test Play, confirm game boots into it, die, confirm Retry replays, clear level, confirm Back-to-Menu lands on start menu.
8. Play Authored menu: drop a fixture `levels/level-test.json` + update `levels/index.json`, open menu, confirm it appears, play it.
9. Game regression: open `index.html` with no hash, start a New Run — procgen behavior identical to before.

Browser compat: no new APIs beyond what the game already uses (`localStorage`, same-origin `fetch`, Pointer Events). Desktop Chrome/Safari/Firefox.

## Open decisions

All resolved during brainstorming:

- **Handcrafted vs. procgen coexistence**: both coexist on this branch. Procgen game is untouched.
- **Storage**: localStorage drafts + JSON export. Committed levels live in `levels/`.
- **Editor layout**: painter (palette + grid + inspector).
- **Scope per level**: geometry + explicit placements. No run-level overrides.
- **Playback**: Test Play from editor, plus Play Authored menu listing committed + slots.
- **Entry**: dedicated `editor.html` page — no game-menu button.
- **Architecture**: two pages, strong isolation. Editor shares `state.js`/`audio.js`/`settings.js`/`items.js`/`rulesets.js` as read-only; no imports from `gameplay/*`, `board/*`, or `ui/*`.
- **Anchors in authored levels**: not placed. Author designs the whole layout.

## Non-goals (explicit)

- No campaign mode yet. Authored levels are played individually.
- No authoring of merchant stock, HP, starter items, or starting gold.
- No committed-level editing from inside the editor (import to a slot, then re-export).
- No mobile editor UI.
- No sharing or cloud storage.
