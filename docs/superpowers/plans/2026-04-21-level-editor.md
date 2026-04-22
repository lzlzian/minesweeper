# Level Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based painter-style level editor for Mining Crawler that produces authored-level JSON, runs inside a dedicated `editor.html` page, and feeds the main game through a new authored-level boot path.

**Architecture:** Two HTML pages. `editor.html` loads `src/editor/main.js` (a new vertical slice with its own state, DOM, renderer, and pointer handling). `index.html` is the existing game, extended with (a) a hash-routed boot that recognizes `#play-authored=<id>`, (b) a `startAuthoredLevel` path in `gameplay/level.js` that replaces procgen for one level, (c) an authored-mode end-of-level overlay and death-retry routing, and (d) a "Play Authored" start-menu entry. The schema parser/validator (`src/editor/schema.js` + `src/editor/validation.js`) is the one shared piece between editor and game.

**Tech Stack:** Plain HTML/CSS/JS (ES modules, no build step). localStorage for drafts. Committed levels in `levels/*.json` served over same-origin `fetch`. Existing browser-based smoke harness at `tests/smoke.html` for unit tests.

**Spec:** `docs/superpowers/specs/2026-04-21-level-editor-design.md`

---

## File Map

**New files:**

- `editor.html` — editor page shell
- `src/editor/main.js` — boot + wiring
- `src/editor/editorState.js` — draft state singleton (grid, placements, drops, brush, etc.)
- `src/editor/editorDom.js` — DOM refs for editor.html
- `src/editor/palette.js` — brush taxonomy + labels
- `src/editor/editorRender.js` — renders grid, palette, inspector
- `src/editor/editorPointer.js` — click/drag/long-press paint handling
- `src/editor/slotStore.js` — localStorage read/write for slots
- `src/editor/schema.js` — `levelToJson` / `jsonToLevel` / `SCHEMA_VERSION`
- `src/editor/validation.js` — `validateLevel` (shared by editor & game)
- `src/editor/testPlay.js` — writes `pendingTestPlay`, navigates to game
- `src/editor/exportFile.js` — triggers JSON download
- `src/gameplay/authored.js` — `startAuthoredLevel`, `loadAuthoredAndStart`, `getCurrentAuthoredData`, `applyAuthoredLevel`
- `levels/` — directory for committed levels (no files yet; created in task that wires fetch)

**Modified files:**

- `src/main.js` — hash routing before `renderStartMenu()`
- `src/gameplay/level.js` — export a `retryAuthoredLevel` thin wrapper (or route through `gameplay/authored.js`)
- `src/gameplay/interaction.js` — route exit/death to authored overlays when `rulesetId === 'authored'`
- `src/ui/overlay.js` — `showAuthoredClearedOverlay`, `renderAuthoredList`, "Play Authored" button, Retry routing when authored
- `src/state.js` — (none — authored mode uses existing fields; `rulesetId === 'authored'` is a sentinel string)
- `style.css` — editor CSS (under `body.editor-mode` scoping so it doesn't leak to the game)
- `tests/smoke.js` — schema + validation test cases
- `tests/smoke.html` — no change (no new DOM stubs needed since editor modules are not imported by smoke)

**Out of file map (explicit):**

- No changes to `src/board/generation.js` (reuse `countAdjacentGas`, `cleanMerchantCell` as-is)
- No changes to `src/board/layout.js` (game-only)
- No changes to `src/ui/render.js`, `ui/view.js`, `ui/tooltip.js`, `ui/shop.js`, `ui/pointer.js`, `ui/dom.js`
- No changes to `src/audio.js`, `src/settings.js`, `src/rulesets.js`
- No changes to `src/gameplay/items.js`, `src/gameplay/merchant.js`

---

## Task Ordering Rationale

Tasks are ordered so each leaves the repo in a working state:

1. Schema + validation + unit tests — foundation, pure logic, no UI.
2. Editor page scaffolding — `editor.html` loads, shows an empty grid, no interactivity.
3. Palette + paint (core of the editor) — you can paint a grid.
4. Placements (player/exit/merchant/fountain), item drops, resize, validation display.
5. localStorage slots + export/import.
6. Game-side authored-boot path (standalone — can be tested with a hand-crafted JSON before the editor exists).
7. Test Play wiring (connects editor → game).
8. Play Authored menu (lists slots + committed files).
9. Authored-mode end-of-level / death / retry routing.
10. Smoke-test expansion + manual-checklist dry run.

Undo/redo is the last task so it can be dropped without impacting anything else.

---

## Task 1: Schema module

**Files:**
- Create: `src/editor/schema.js`
- Modify: `tests/smoke.js:215` (append new tests)

- [ ] **Step 1: Write the failing tests**

Append to `tests/smoke.js` (right before the `// Render` block at line ~207):

```js
// -- editor: schema --
import {
  SCHEMA_VERSION, levelToJson, jsonToLevel,
} from '../src/editor/schema.js';

function makeMinimalLevel() {
  const rows = 6, cols = 6;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) row.push({ type: 'empty' });
    cells.push(row);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'test',
    name: 'Test',
    notes: '',
    rows, cols,
    playerStart: { r: 0, c: 0 },
    exit:        { r: 5, c: 5 },
    merchant: null,
    fountain: null,
    cells,
    itemDrops: [],
  };
}

test('schema: round-trip preserves a minimal level', () => {
  const lvl = makeMinimalLevel();
  const json = levelToJson(lvl);
  const parsed = jsonToLevel(json);
  if (!parsed.ok) throw new Error('expected ok, got: ' + JSON.stringify(parsed.errors));
  assertEq(parsed.level.rows, 6);
  assertEq(parsed.level.cols, 6);
  assertEq(parsed.level.playerStart.r, 0);
  assertEq(parsed.level.exit.c, 5);
  assertEq(parsed.level.cells.length, 6);
  assertEq(parsed.level.cells[0].length, 6);
  assertEq(parsed.level.cells[0][0].type, 'empty');
});

test('schema: round-trip preserves gold cells with goldValue', () => {
  const lvl = makeMinimalLevel();
  lvl.cells[1][1] = { type: 'gold', goldValue: 10 };
  lvl.cells[2][2] = { type: 'gold', goldValue: 25 };
  const json = levelToJson(lvl);
  const parsed = jsonToLevel(json);
  if (!parsed.ok) throw new Error('expected ok');
  assertEq(parsed.level.cells[1][1].type, 'gold');
  assertEq(parsed.level.cells[1][1].goldValue, 10);
  assertEq(parsed.level.cells[2][2].goldValue, 25);
});

test('schema: round-trip preserves merchant / fountain / drops', () => {
  const lvl = makeMinimalLevel();
  lvl.merchant = { r: 2, c: 3 };
  lvl.fountain = { r: 4, c: 1 };
  lvl.itemDrops = [
    { r: 1, c: 2, item: 'potion' },
    { r: 3, c: 4, item: 'pickaxe' },
  ];
  const json = levelToJson(lvl);
  const parsed = jsonToLevel(json);
  if (!parsed.ok) throw new Error('expected ok');
  assertEq(parsed.level.merchant.r, 2);
  assertEq(parsed.level.fountain.c, 1);
  assertEq(parsed.level.itemDrops.length, 2);
  assertEq(parsed.level.itemDrops[0].item, 'potion');
});

test('schema: rejects unknown schemaVersion', () => {
  const lvl = makeMinimalLevel();
  const bad = JSON.stringify({ ...lvl, schemaVersion: 999 });
  const parsed = jsonToLevel(bad);
  if (parsed.ok) throw new Error('expected !ok');
  if (!parsed.errors.some(e => e.includes('schemaVersion'))) {
    throw new Error('expected schemaVersion error, got: ' + parsed.errors.join(', '));
  }
});

test('schema: rejects malformed JSON', () => {
  const parsed = jsonToLevel('not-json');
  if (parsed.ok) throw new Error('expected !ok');
});

test('schema: rejects missing required top-level fields', () => {
  const parsed = jsonToLevel(JSON.stringify({ schemaVersion: 1 }));
  if (parsed.ok) throw new Error('expected !ok');
  // Must complain about at least one missing field
  if (parsed.errors.length === 0) throw new Error('expected errors');
});

test('schema: rejects cells grid size mismatch', () => {
  const lvl = makeMinimalLevel();
  lvl.cols = 7; // mismatch with cells[0].length === 6
  const parsed = jsonToLevel(JSON.stringify(lvl));
  if (parsed.ok) throw new Error('expected !ok');
});

test('schema: rejects unknown cell type', () => {
  const lvl = makeMinimalLevel();
  lvl.cells[0][1] = { type: 'lava' };
  const parsed = jsonToLevel(JSON.stringify(lvl));
  if (parsed.ok) throw new Error('expected !ok');
});

test('schema: rejects gold without goldValue', () => {
  const lvl = makeMinimalLevel();
  lvl.cells[0][1] = { type: 'gold' };
  const parsed = jsonToLevel(JSON.stringify(lvl));
  if (parsed.ok) throw new Error('expected !ok');
});
```

- [ ] **Step 2: Run tests, confirm failures**

Open `tests/smoke.html` in a browser (or run `npx serve . -l 3000` then open `http://localhost:3000/tests/smoke.html`). Expected: the new tests all fail with "Failed to resolve module specifier" (the module doesn't exist yet).

- [ ] **Step 3: Create schema.js**

Write `src/editor/schema.js`:

```js
// Schema for authored level JSON. Single source of truth — editor produces
// through this, game consumes through this.

export const SCHEMA_VERSION = 1;

export const VALID_ITEM_KEYS = ['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross'];
export const VALID_CELL_TYPES = ['empty', 'wall', 'gas', 'gold', 'fountain'];

// levelToJson: returns a JSON string of the level object. The level object
// is expected to be well-formed (validation happens via validateLevel in
// validation.js; schema.js only checks structural well-formedness).
export function levelToJson(level) {
  return JSON.stringify(level, null, 2);
}

// jsonToLevel: parses and structurally validates a JSON string.
// Returns { ok: true, level } or { ok: false, errors: string[] }.
export function jsonToLevel(jsonString) {
  let obj;
  try {
    obj = JSON.parse(jsonString);
  } catch (e) {
    return { ok: false, errors: ['JSON parse error: ' + e.message] };
  }
  const errors = [];

  if (obj.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`unsupported schemaVersion: ${obj.schemaVersion} (expected ${SCHEMA_VERSION})`);
  }

  for (const field of ['id', 'name', 'rows', 'cols', 'playerStart', 'exit', 'cells', 'itemDrops']) {
    if (!(field in obj)) errors.push(`missing required field: ${field}`);
  }

  // Early out if structure is broken — downstream checks would NPE.
  if (errors.length) return { ok: false, errors };

  if (typeof obj.rows !== 'number' || typeof obj.cols !== 'number') {
    errors.push('rows and cols must be numbers');
  }
  if (!Array.isArray(obj.cells)) {
    errors.push('cells must be an array');
  } else {
    if (obj.cells.length !== obj.rows) {
      errors.push(`cells.length (${obj.cells.length}) !== rows (${obj.rows})`);
    }
    for (let r = 0; r < obj.cells.length; r++) {
      const row = obj.cells[r];
      if (!Array.isArray(row) || row.length !== obj.cols) {
        errors.push(`cells[${r}].length mismatch`);
        continue;
      }
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (!cell || typeof cell !== 'object' || !VALID_CELL_TYPES.includes(cell.type)) {
          errors.push(`cells[${r}][${c}] invalid type: ${cell?.type}`);
          continue;
        }
        if (cell.type === 'gold') {
          if (typeof cell.goldValue !== 'number' || cell.goldValue <= 0) {
            errors.push(`cells[${r}][${c}] gold missing goldValue`);
          }
        }
      }
    }
  }

  if (!isPos(obj.playerStart)) errors.push('playerStart must be {r,c}');
  if (!isPos(obj.exit)) errors.push('exit must be {r,c}');
  if (obj.merchant !== null && obj.merchant !== undefined && !isPos(obj.merchant)) {
    errors.push('merchant must be null or {r,c}');
  }
  if (obj.fountain !== null && obj.fountain !== undefined && !isPos(obj.fountain)) {
    errors.push('fountain must be null or {r,c}');
  }

  if (!Array.isArray(obj.itemDrops)) {
    errors.push('itemDrops must be an array');
  } else {
    for (let i = 0; i < obj.itemDrops.length; i++) {
      const d = obj.itemDrops[i];
      if (!isPos(d)) errors.push(`itemDrops[${i}] missing r/c`);
      if (!VALID_ITEM_KEYS.includes(d?.item)) errors.push(`itemDrops[${i}] invalid item: ${d?.item}`);
    }
  }

  if (errors.length) return { ok: false, errors };

  const level = {
    schemaVersion: obj.schemaVersion,
    id: String(obj.id),
    name: String(obj.name),
    notes: typeof obj.notes === 'string' ? obj.notes : '',
    rows: obj.rows,
    cols: obj.cols,
    playerStart: { r: obj.playerStart.r, c: obj.playerStart.c },
    exit:        { r: obj.exit.r, c: obj.exit.c },
    merchant: obj.merchant ? { r: obj.merchant.r, c: obj.merchant.c } : null,
    fountain: obj.fountain ? { r: obj.fountain.r, c: obj.fountain.c } : null,
    cells: obj.cells.map(row => row.map(cell =>
      cell.type === 'gold' ? { type: 'gold', goldValue: cell.goldValue } : { type: cell.type }
    )),
    itemDrops: obj.itemDrops.map(d => ({ r: d.r, c: d.c, item: d.item })),
  };
  return { ok: true, level };
}

function isPos(p) {
  return p && typeof p.r === 'number' && typeof p.c === 'number';
}
```

- [ ] **Step 4: Run tests, confirm pass**

Reload `tests/smoke.html`. Expected: all 9 new tests pass, and the existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/editor/schema.js tests/smoke.js
git commit -m "editor: level JSON schema module with round-trip tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Validation module

**Files:**
- Create: `src/editor/validation.js`
- Modify: `tests/smoke.js` (append new tests)

- [ ] **Step 1: Write the failing tests**

Append to `tests/smoke.js` (right after the Task 1 tests, before the `// Render` block):

```js
// -- editor: validation --
import { validateLevel } from '../src/editor/validation.js';

test('validation: minimal valid level passes', () => {
  const lvl = makeMinimalLevel();
  const res = validateLevel(lvl);
  if (!res.ok) throw new Error('expected ok, got: ' + res.errors.join(', '));
});

test('validation: rejects out-of-bounds positions', () => {
  const lvl = makeMinimalLevel();
  lvl.exit = { r: 99, c: 99 };
  const res = validateLevel(lvl);
  if (res.ok) throw new Error('expected !ok');
});

test('validation: rejects player == exit', () => {
  const lvl = makeMinimalLevel();
  lvl.exit = { r: 0, c: 0 };
  const res = validateLevel(lvl);
  if (res.ok) throw new Error('expected !ok');
});

test('validation: rejects shared positions among unique placements', () => {
  const lvl = makeMinimalLevel();
  lvl.merchant = { r: 0, c: 0 }; // collides with playerStart
  const res = validateLevel(lvl);
  if (res.ok) throw new Error('expected !ok');
});

test('validation: rejects drops on unique placements', () => {
  const lvl = makeMinimalLevel();
  lvl.itemDrops = [{ r: 5, c: 5, item: 'potion' }]; // on exit
  const res = validateLevel(lvl);
  if (res.ok) throw new Error('expected !ok');
});

test('validation: rejects player-start on non-empty cell', () => {
  const lvl = makeMinimalLevel();
  lvl.cells[0][0] = { type: 'wall' };
  const res = validateLevel(lvl);
  if (res.ok) throw new Error('expected !ok');
});

test('validation: rejects exit on non-empty cell', () => {
  const lvl = makeMinimalLevel();
  lvl.cells[5][5] = { type: 'gold', goldValue: 10 };
  const res = validateLevel(lvl);
  if (res.ok) throw new Error('expected !ok');
});

test('validation: rejects drop on non-empty cell', () => {
  const lvl = makeMinimalLevel();
  lvl.cells[1][1] = { type: 'gas' };
  lvl.itemDrops = [{ r: 1, c: 1, item: 'potion' }];
  const res = validateLevel(lvl);
  if (res.ok) throw new Error('expected !ok');
});

test('validation: rejects exit unreachable via walls', () => {
  const lvl = makeMinimalLevel();
  // Ring player in with walls so exit is unreachable.
  lvl.cells[0][1] = { type: 'wall' };
  lvl.cells[1][0] = { type: 'wall' };
  lvl.cells[1][1] = { type: 'wall' };
  const res = validateLevel(lvl);
  if (res.ok) throw new Error('expected !ok');
});

test('validation: rejects exit reachable only through gas', () => {
  const lvl = makeMinimalLevel();
  // Gas walls the player in except one gas tile.
  for (let c = 0; c < 6; c++) {
    if (c !== 3) lvl.cells[1][c] = { type: 'wall' };
  }
  lvl.cells[1][3] = { type: 'gas' };
  // Gas under validation is not a valid path — same rule as engine isReachable.
  const res = validateLevel(lvl);
  if (res.ok) throw new Error('expected !ok');
});

test('validation: rows/cols out of range', () => {
  const lvl = makeMinimalLevel();
  lvl.rows = 3; lvl.cols = 3;
  lvl.cells = lvl.cells.slice(0, 3).map(row => row.slice(0, 3));
  lvl.exit = { r: 2, c: 2 };
  const res = validateLevel(lvl);
  if (res.ok) throw new Error('expected !ok');
});
```

- [ ] **Step 2: Run tests, confirm failures**

Reload `tests/smoke.html`. Expected: the 11 new tests all fail with "Failed to resolve module specifier".

- [ ] **Step 3: Create validation.js**

Write `src/editor/validation.js`:

```js
// Validates a level object (post-schema-parse shape) against playability
// rules. Used by the editor (on save/test-play) and the game (on authored
// level load). Does NOT re-check structural shape — that's schema.js.

const MIN_SIZE = 6;
const MAX_SIZE = 20;

const VALID_ITEM_KEYS = ['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross'];

export function validateLevel(level) {
  const errors = [];

  // Rows/cols range.
  if (level.rows < MIN_SIZE || level.rows > MAX_SIZE) {
    errors.push(`rows must be in [${MIN_SIZE}, ${MAX_SIZE}], got ${level.rows}`);
  }
  if (level.cols < MIN_SIZE || level.cols > MAX_SIZE) {
    errors.push(`cols must be in [${MIN_SIZE}, ${MAX_SIZE}], got ${level.cols}`);
  }

  // Positions in bounds.
  const inBounds = (p) => p && p.r >= 0 && p.r < level.rows && p.c >= 0 && p.c < level.cols;
  if (!inBounds(level.playerStart)) errors.push('playerStart out of bounds');
  if (!inBounds(level.exit)) errors.push('exit out of bounds');
  if (level.merchant && !inBounds(level.merchant)) errors.push('merchant out of bounds');
  if (level.fountain && !inBounds(level.fountain)) errors.push('fountain out of bounds');

  // Player != exit.
  if (posEq(level.playerStart, level.exit)) {
    errors.push('playerStart and exit share a position');
  }

  // No two unique placements share a position.
  const placements = [
    ['playerStart', level.playerStart],
    ['exit', level.exit],
    level.merchant ? ['merchant', level.merchant] : null,
    level.fountain ? ['fountain', level.fountain] : null,
  ].filter(Boolean);
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      if (posEq(placements[i][1], placements[j][1])) {
        errors.push(`${placements[i][0]} and ${placements[j][0]} share a position`);
      }
    }
  }

  // Drops don't overlap unique placements.
  for (const d of level.itemDrops) {
    for (const [name, pos] of placements) {
      if (posEq(d, pos)) {
        errors.push(`item drop at (${d.r},${d.c}) overlaps ${name}`);
      }
    }
  }

  // If something is already wrong with geometry, stop before cell-level checks.
  if (errors.length) return { ok: false, errors };

  // Player-start and exit cells must be empty.
  const startCell = level.cells[level.playerStart.r][level.playerStart.c];
  if (startCell.type !== 'empty') {
    errors.push(`playerStart cell must be empty, got ${startCell.type}`);
  }
  const exitCell = level.cells[level.exit.r][level.exit.c];
  if (exitCell.type !== 'empty') {
    errors.push(`exit cell must be empty, got ${exitCell.type}`);
  }

  // Each drop lands on an empty cell, valid item key.
  for (const d of level.itemDrops) {
    if (!VALID_ITEM_KEYS.includes(d.item)) {
      errors.push(`item drop at (${d.r},${d.c}) has invalid item: ${d.item}`);
    }
    const cell = level.cells[d.r][d.c];
    if (cell.type !== 'empty') {
      errors.push(`item drop at (${d.r},${d.c}) lands on non-empty cell (${cell.type})`);
    }
  }

  // Exit reachable from player via non-wall, non-gas cells.
  if (!isReachable(level, level.playerStart, level.exit)) {
    errors.push('exit not reachable from playerStart (non-wall, non-gas path required)');
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

function posEq(a, b) {
  return a && b && a.r === b.r && a.c === b.c;
}

// Chebyshev BFS through non-wall, non-gas cells. Matches engine's
// board/layout.js isReachable, but operates on the JSON-shaped level.
function isReachable(level, from, to) {
  const visited = Array.from({ length: level.rows }, () => Array(level.cols).fill(false));
  const queue = [{ r: from.r, c: from.c }];
  visited[from.r][from.c] = true;
  while (queue.length) {
    const { r, c } = queue.shift();
    if (r === to.r && c === to.c) return true;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= level.rows || nc < 0 || nc >= level.cols) continue;
        if (visited[nr][nc]) continue;
        const t = level.cells[nr][nc].type;
        if (t === 'wall' || t === 'gas') continue;
        visited[nr][nc] = true;
        queue.push({ r: nr, c: nc });
      }
    }
  }
  return false;
}
```

- [ ] **Step 4: Run tests, confirm pass**

Reload `tests/smoke.html`. Expected: all 11 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/editor/validation.js tests/smoke.js
git commit -m "editor: level validation rules (placement, reachability, bounds)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Editor page scaffold

**Files:**
- Create: `editor.html`
- Create: `src/editor/main.js` (stub)
- Create: `src/editor/editorDom.js`
- Create: `src/editor/editorState.js`
- Create: `src/editor/palette.js`
- Modify: `style.css` (append editor styles)

- [ ] **Step 1: Create editor.html**

Write `editor.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Level Editor · Mining Crawler</title>
  <link rel="stylesheet" href="style.css">
</head>
<body class="editor-mode">
  <div id="editor-topbar">
    <button id="editor-menu-btn">☰</button>
    <input id="editor-level-name" type="text" placeholder="Level name">
    <button id="editor-test-play-btn" class="menu-btn-primary">Test Play</button>
    <span id="editor-validation-indicator"></span>
  </div>
  <div id="editor-main">
    <div id="editor-palette"></div>
    <div id="editor-grid-wrap">
      <div id="editor-grid"></div>
    </div>
    <div id="editor-inspector">
      <div class="inspector-section">
        <label>Rows <input id="editor-rows" type="number" min="6" max="20" value="8"></label>
        <label>Cols <input id="editor-cols" type="number" min="6" max="20" value="8"></label>
      </div>
      <div class="inspector-section">
        <label>Notes</label>
        <textarea id="editor-notes"></textarea>
      </div>
      <div class="inspector-section">
        <div id="editor-summary"></div>
      </div>
      <div class="inspector-section">
        <strong>Validation</strong>
        <ul id="editor-validation-list"></ul>
      </div>
    </div>
  </div>
  <div id="editor-menu-dropdown" class="hidden">
    <button data-menu-act="new">New</button>
    <button data-menu-act="load-draft">Load Draft</button>
    <button data-menu-act="load-slot">Load Slot…</button>
    <button data-menu-act="save-slot">Save to Slot…</button>
    <button data-menu-act="import">Import JSON</button>
    <button data-menu-act="export">Export JSON</button>
  </div>
  <div id="editor-modal" class="hidden"><div id="editor-modal-content"></div></div>
  <input id="editor-import-input" type="file" accept=".json" style="display:none">
  <script type="module" src="src/editor/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create src/editor/editorDom.js**

```js
// DOM refs for editor.html. Editor-only — does not overlap with ui/dom.js.

export const topbar        = document.getElementById('editor-topbar');
export const menuBtn       = document.getElementById('editor-menu-btn');
export const menuDropdown  = document.getElementById('editor-menu-dropdown');
export const levelNameInput = document.getElementById('editor-level-name');
export const testPlayBtn   = document.getElementById('editor-test-play-btn');
export const validationIndicator = document.getElementById('editor-validation-indicator');

export const paletteEl     = document.getElementById('editor-palette');
export const gridEl        = document.getElementById('editor-grid');
export const inspectorEl   = document.getElementById('editor-inspector');

export const rowsInput     = document.getElementById('editor-rows');
export const colsInput     = document.getElementById('editor-cols');
export const notesTextarea = document.getElementById('editor-notes');
export const summaryEl     = document.getElementById('editor-summary');
export const validationListEl = document.getElementById('editor-validation-list');

export const modalEl        = document.getElementById('editor-modal');
export const modalContentEl = document.getElementById('editor-modal-content');
export const importInput    = document.getElementById('editor-import-input');
```

- [ ] **Step 3: Create src/editor/palette.js**

```js
// Brush taxonomy. Order here is the order shown in the palette.
// Each brush has a key (unique id), a label (emoji), and a kind
// describing what it paints: 'terrain' (cell.type), 'placement'
// (unique per-level marker: player/exit/merchant/fountain),
// or 'drop' (itemDrops[] entry).

export const BRUSHES = [
  // Terrain
  { key: 'empty',    label: '·',  kind: 'terrain', cellType: 'empty' },
  { key: 'wall',     label: '▓',  kind: 'terrain', cellType: 'wall' },
  { key: 'gas',      label: '💀', kind: 'terrain', cellType: 'gas' },
  { key: 'fountain', label: '💧', kind: 'terrain', cellType: 'fountain' },

  // Gold values — four distinct brushes to keep painting fast.
  { key: 'gold1',  label: '💰1',  kind: 'terrain', cellType: 'gold', goldValue: 1 },
  { key: 'gold5',  label: '💰5',  kind: 'terrain', cellType: 'gold', goldValue: 5 },
  { key: 'gold10', label: '💰10', kind: 'terrain', cellType: 'gold', goldValue: 10 },
  { key: 'gold25', label: '💰25', kind: 'terrain', cellType: 'gold', goldValue: 25 },

  // Unique placements — painting moves the marker.
  { key: 'playerStart', label: '🙂', kind: 'placement', slot: 'playerStart' },
  { key: 'exit',        label: '🚪', kind: 'placement', slot: 'exit' },
  { key: 'merchant',    label: '🧙', kind: 'placement', slot: 'merchant' },

  // Item drops.
  { key: 'drop-potion',  label: '🍺', kind: 'drop', item: 'potion' },
  { key: 'drop-scanner', label: '🔍', kind: 'drop', item: 'scanner' },
  { key: 'drop-pickaxe', label: '⛏️', kind: 'drop', item: 'pickaxe' },
  { key: 'drop-row',     label: '↔️', kind: 'drop', item: 'row' },
  { key: 'drop-column',  label: '↕️', kind: 'drop', item: 'column' },
  { key: 'drop-cross',   label: '✖️', kind: 'drop', item: 'cross' },
];

// Note: fountain has a terrain brush (sets cell.type = 'fountain') AND needs
// to go into level.fountain. We treat fountain specially in the paint
// handler — painting it sets BOTH cell.type and the fountain placement,
// and there can only be one fountain per level.
// This keeps the palette ergonomic while still producing valid schema
// (top-level level.fountain + cells[r][c].type === 'fountain').

export function findBrush(key) {
  return BRUSHES.find(b => b.key === key) || null;
}
```

- [ ] **Step 4: Create src/editor/editorState.js**

```js
// Draft level state singleton for the editor. Separate from the game's
// state.js — the editor never mutates game state.

import { SCHEMA_VERSION } from './schema.js';

const state = {
  rows: 8,
  cols: 8,
  cells: [],        // cells[r][c] = { type } or { type:'gold', goldValue }
  playerStart: null,
  exit:        null,
  merchant:    null,
  fountain:    null,
  itemDrops:   [],  // [ { r, c, item } ]
  name:  '',
  notes: '',
  id:    '',
  brushKey: 'wall',
  loadedSlot: null, // remembers which slot was loaded (for Ctrl+S fast-save)
};

export function getEditorState() { return state; }
export function getBrushKey() { return state.brushKey; }
export function setBrushKey(k) { state.brushKey = k; }
export function getLoadedSlot() { return state.loadedSlot; }
export function setLoadedSlot(n) { state.loadedSlot = n; }

// Produces a plain object matching the JSON schema shape, suitable for
// passing to schema.levelToJson / validation.validateLevel.
export function toLevel() {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: state.id || 'draft',
    name: state.name,
    notes: state.notes,
    rows: state.rows,
    cols: state.cols,
    playerStart: state.playerStart,
    exit:        state.exit,
    merchant:    state.merchant,
    fountain:    state.fountain,
    cells:       state.cells.map(row => row.map(cell =>
      cell.type === 'gold' ? { type: 'gold', goldValue: cell.goldValue } : { type: cell.type }
    )),
    itemDrops:   state.itemDrops.map(d => ({ ...d })),
  };
}

// Replace the current draft with the given level object. Does NOT validate
// — caller is responsible (load paths all run jsonToLevel first).
export function loadLevel(level) {
  state.rows = level.rows;
  state.cols = level.cols;
  state.cells = level.cells.map(row => row.map(cell =>
    cell.type === 'gold' ? { type: 'gold', goldValue: cell.goldValue } : { type: cell.type }
  ));
  state.playerStart = level.playerStart ? { ...level.playerStart } : null;
  state.exit        = level.exit        ? { ...level.exit }        : null;
  state.merchant    = level.merchant    ? { ...level.merchant }    : null;
  state.fountain    = level.fountain    ? { ...level.fountain }    : null;
  state.itemDrops   = level.itemDrops.map(d => ({ ...d }));
  state.name  = level.name || '';
  state.notes = level.notes || '';
  state.id    = level.id || '';
}

// Initialize a blank draft at the given size, or 8x8 if size omitted.
// Leaves playerStart/exit unset — the author must place them.
export function resetDraft(rows = 8, cols = 8) {
  state.rows = rows;
  state.cols = cols;
  state.cells = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ type: 'empty' }))
  );
  state.playerStart = null;
  state.exit        = null;
  state.merchant    = null;
  state.fountain    = null;
  state.itemDrops   = [];
  state.name  = '';
  state.notes = '';
  state.id    = '';
  state.loadedSlot = null;
}
```

- [ ] **Step 5: Create src/editor/main.js (stub)**

```js
// Editor boot. Minimal for this task — full wiring comes in later tasks.
import { resetDraft, getEditorState } from './editorState.js';
import { levelNameInput, rowsInput, colsInput } from './editorDom.js';

resetDraft(8, 8);

// Wire top-bar inputs to state (trivial two-way binding; render is a no-op
// for now).
const state = getEditorState();
levelNameInput.value = state.name;
rowsInput.value = state.rows;
colsInput.value = state.cols;

levelNameInput.addEventListener('input', () => { state.name = levelNameInput.value; });
rowsInput.addEventListener('change', () => {
  const n = Math.max(6, Math.min(20, parseInt(rowsInput.value, 10) || 8));
  rowsInput.value = n;
});
colsInput.addEventListener('change', () => {
  const n = Math.max(6, Math.min(20, parseInt(colsInput.value, 10) || 8));
  colsInput.value = n;
});

console.log('Level editor boot: grid', state.rows, '×', state.cols);
```

- [ ] **Step 6: Append editor CSS to style.css**

Append to `style.css`:

```css
/* ============================================================
   EDITOR (editor.html) — scoped to body.editor-mode
   ============================================================ */
body.editor-mode {
  align-items: stretch;
  padding: 0;
  display: flex;
  flex-direction: column;
  height: 100dvh;
}

body.editor-mode #editor-topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #0f1a2e;
  border-bottom: 1px solid #2a4060;
  flex-shrink: 0;
}

body.editor-mode #editor-topbar input[type="text"] {
  flex: 1;
  padding: 6px 10px;
  background: #162238;
  color: #eee;
  border: 1px solid #2a4060;
  border-radius: 4px;
  font-size: 14px;
}

body.editor-mode #editor-topbar button {
  padding: 6px 12px;
  background: #253a5a;
  color: #eee;
  border: 1px solid #2a4060;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
}

body.editor-mode #editor-topbar button.menu-btn-primary {
  background: #3562a8;
}

body.editor-mode #editor-validation-indicator {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
}
body.editor-mode #editor-validation-indicator.ok   { background: #1e4630; color: #6adf8f; }
body.editor-mode #editor-validation-indicator.fail { background: #4a1e1e; color: #d86a6a; }

body.editor-mode #editor-main {
  display: grid;
  grid-template-columns: 140px 1fr 220px;
  gap: 8px;
  padding: 8px;
  flex: 1;
  min-height: 0;
}

body.editor-mode #editor-palette {
  background: #0f1a2e;
  border: 1px solid #2a4060;
  border-radius: 4px;
  padding: 6px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

body.editor-mode .palette-section {
  color: #6d87ab;
  font-size: 10px;
  text-transform: uppercase;
  padding: 6px 4px 2px;
}

body.editor-mode .palette-swatch {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: #162238;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  color: #eee;
  font-size: 13px;
}
body.editor-mode .palette-swatch:hover { background: #1d2e4a; }
body.editor-mode .palette-swatch.active { border-color: #3562a8; background: #1d2e4a; }

body.editor-mode #editor-grid-wrap {
  background: #06101c;
  border: 1px solid #2a4060;
  border-radius: 4px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  overflow: auto;
  padding: 12px;
}

body.editor-mode #editor-grid {
  display: grid;
  gap: 2px;
}

body.editor-mode .editor-cell {
  width: 40px;
  height: 40px;
  background: #233a5c;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  font-size: 18px;
  position: relative;
}
body.editor-mode .editor-cell.e-empty    { background: #233a5c; }
body.editor-mode .editor-cell.e-wall     { background: #3b2a1e; }
body.editor-mode .editor-cell.e-gas      { background: #46241e; }
body.editor-mode .editor-cell.e-gold     { background: #4b3b12; }
body.editor-mode .editor-cell.e-fountain { background: #1e3e46; }
body.editor-mode .editor-cell.flash-bad  { animation: editor-flash 240ms; }

@keyframes editor-flash {
  0%   { box-shadow: inset 0 0 0 3px #d86a6a; }
  100% { box-shadow: inset 0 0 0 0 transparent; }
}

body.editor-mode #editor-inspector {
  background: #0f1a2e;
  border: 1px solid #2a4060;
  border-radius: 4px;
  padding: 8px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: #cfe0f5;
  font-size: 13px;
}

body.editor-mode .inspector-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

body.editor-mode .inspector-section label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #9fb5d6;
  font-size: 12px;
}

body.editor-mode .inspector-section input[type="number"] {
  width: 60px;
  padding: 4px;
  background: #162238;
  color: #eee;
  border: 1px solid #2a4060;
  border-radius: 3px;
}

body.editor-mode .inspector-section textarea {
  width: 100%;
  min-height: 60px;
  padding: 6px;
  background: #162238;
  color: #eee;
  border: 1px solid #2a4060;
  border-radius: 3px;
  font-family: inherit;
  font-size: 12px;
  resize: vertical;
}

body.editor-mode #editor-validation-list {
  list-style: none;
  padding: 0;
  font-size: 12px;
}
body.editor-mode #editor-validation-list li.ok   { color: #6adf8f; }
body.editor-mode #editor-validation-list li.fail { color: #d86a6a; }

body.editor-mode #editor-menu-dropdown {
  position: absolute;
  top: 42px;
  left: 12px;
  background: #0f1a2e;
  border: 1px solid #2a4060;
  border-radius: 4px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 10;
}
body.editor-mode #editor-menu-dropdown.hidden { display: none; }
body.editor-mode #editor-menu-dropdown button {
  text-align: left;
  padding: 6px 12px;
  background: transparent;
  color: #eee;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  border-radius: 3px;
}
body.editor-mode #editor-menu-dropdown button:hover { background: #1d2e4a; }

body.editor-mode #editor-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}
body.editor-mode #editor-modal.hidden { display: none; }
body.editor-mode #editor-modal-content {
  background: #0f1a2e;
  border: 1px solid #2a4060;
  border-radius: 6px;
  padding: 16px;
  min-width: 280px;
  max-width: 90vw;
  color: #eee;
}
body.editor-mode #editor-modal-content button {
  padding: 6px 12px;
  background: #253a5a;
  color: #eee;
  border: 1px solid #2a4060;
  border-radius: 4px;
  cursor: pointer;
  margin-right: 6px;
  margin-top: 8px;
  font-family: inherit;
}
```

- [ ] **Step 7: Manual smoke: load editor.html**

Start a local server: `npx serve . -l 3000`. Open `http://localhost:3000/editor.html`. Expected: topbar with level-name input, Test Play button, palette pane (empty), grid pane (empty), inspector with rows/cols/notes. Console shows "Level editor boot: grid 8 × 8". No JS errors.

- [ ] **Step 8: Commit**

```bash
git add editor.html src/editor/editorDom.js src/editor/editorState.js src/editor/palette.js src/editor/main.js style.css
git commit -m "editor: page scaffold, state singleton, palette taxonomy

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Editor render (grid, palette, inspector)

**Files:**
- Create: `src/editor/editorRender.js`
- Modify: `src/editor/main.js`

- [ ] **Step 1: Create src/editor/editorRender.js**

```js
import { getEditorState, getBrushKey } from './editorState.js';
import { BRUSHES, findBrush } from './palette.js';
import {
  gridEl, paletteEl, summaryEl, validationListEl, validationIndicator,
  notesTextarea, rowsInput, colsInput, levelNameInput,
} from './editorDom.js';
import { validateLevel } from './validation.js';
import { toLevel } from './editorState.js';

const PICKUP_EMOJI = {
  potion: '🍺', scanner: '🔍', pickaxe: '⛏️',
  row: '↔️', column: '↕️', cross: '✖️',
};

export function renderAll() {
  renderGrid();
  renderPalette();
  renderInspector();
}

export function renderGrid() {
  const state = getEditorState();
  gridEl.innerHTML = '';
  gridEl.style.gridTemplateColumns = `repeat(${state.cols}, 40px)`;
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const cell = state.cells[r][c];
      const el = document.createElement('div');
      el.className = 'editor-cell e-' + cell.type;
      el.dataset.row = r;
      el.dataset.col = c;

      // Terrain icon.
      let icon = '';
      if (cell.type === 'gas')      icon = '💀';
      else if (cell.type === 'gold') icon = cell.goldValue ? `💰${cell.goldValue}` : '💰';
      else if (cell.type === 'fountain') icon = '💧';
      else if (cell.type === 'wall') icon = '▓';

      // Item drops stack on top of the terrain icon — drops only live on empty
      // cells, so there's no collision. Placement icons override terrain.
      const drop = state.itemDrops.find(d => d.r === r && d.c === c);
      if (drop) icon = PICKUP_EMOJI[drop.item] || '?';

      // Unique placements override everything visually.
      if (isAt(state.playerStart, r, c)) icon = '🙂';
      else if (isAt(state.exit, r, c)) icon = '🚪';
      else if (isAt(state.merchant, r, c)) icon = '🧙';
      // fountain already shown via cell.type === 'fountain' above

      if (icon) el.textContent = icon;
      gridEl.appendChild(el);
    }
  }
}

export function renderPalette() {
  paletteEl.innerHTML = '';
  const activeKey = getBrushKey();

  // Section headers help scan the palette.
  const sections = [
    { title: 'Terrain',   keys: ['empty', 'wall', 'gas', 'fountain'] },
    { title: 'Gold',      keys: ['gold1', 'gold5', 'gold10', 'gold25'] },
    { title: 'Placement', keys: ['playerStart', 'exit', 'merchant'] },
    { title: 'Drops',     keys: ['drop-potion', 'drop-scanner', 'drop-pickaxe', 'drop-row', 'drop-column', 'drop-cross'] },
  ];

  for (const section of sections) {
    const header = document.createElement('div');
    header.className = 'palette-section';
    header.textContent = section.title;
    paletteEl.appendChild(header);
    for (const key of section.keys) {
      const brush = findBrush(key);
      if (!brush) continue;
      const el = document.createElement('div');
      el.className = 'palette-swatch' + (key === activeKey ? ' active' : '');
      el.dataset.brushKey = key;
      el.textContent = brush.label;
      paletteEl.appendChild(el);
    }
  }
}

export function renderInspector() {
  const state = getEditorState();
  levelNameInput.value = state.name;
  rowsInput.value = state.rows;
  colsInput.value = state.cols;
  notesTextarea.value = state.notes;

  // Summary counters.
  let walls = 0, gas = 0, gold = 0;
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const t = state.cells[r][c].type;
      if (t === 'wall') walls++;
      else if (t === 'gas') gas++;
      else if (t === 'gold') gold++;
    }
  }
  summaryEl.textContent = `Walls: ${walls} · Gas: ${gas} · Gold: ${gold} · Drops: ${state.itemDrops.length}`;

  // Validation list.
  const res = validateLevel(toLevel());
  validationListEl.innerHTML = '';
  if (res.ok) {
    const li = document.createElement('li');
    li.className = 'ok';
    li.textContent = '✓ Level is playable';
    validationListEl.appendChild(li);
    validationIndicator.className = 'ok';
    validationIndicator.textContent = '✓ Playable';
  } else {
    for (const err of res.errors) {
      const li = document.createElement('li');
      li.className = 'fail';
      li.textContent = '✗ ' + err;
      validationListEl.appendChild(li);
    }
    validationIndicator.className = 'fail';
    validationIndicator.textContent = '✗ ' + res.errors[0];
  }
}

function isAt(pos, r, c) {
  return pos && pos.r === r && pos.c === c;
}
```

- [ ] **Step 2: Update src/editor/main.js to call renderAll on boot and when inputs change**

Replace the entire contents of `src/editor/main.js` with:

```js
import { resetDraft, getEditorState } from './editorState.js';
import {
  levelNameInput, rowsInput, colsInput, notesTextarea, paletteEl,
} from './editorDom.js';
import { renderAll, renderGrid, renderInspector } from './editorRender.js';
import { setBrushKey } from './editorState.js';

resetDraft(8, 8);
renderAll();

const state = getEditorState();

levelNameInput.addEventListener('input', () => {
  state.name = levelNameInput.value;
});

notesTextarea.addEventListener('input', () => {
  state.notes = notesTextarea.value;
});

function resizeDraft(rows, cols) {
  rows = Math.max(6, Math.min(20, rows));
  cols = Math.max(6, Math.min(20, cols));
  const newCells = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      if (r < state.rows && c < state.cols) return state.cells[r][c];
      return { type: 'empty' };
    })
  );
  state.cells = newCells;
  state.rows = rows;
  state.cols = cols;
  // Clear any placements / drops now outside bounds.
  if (state.playerStart && (state.playerStart.r >= rows || state.playerStart.c >= cols)) state.playerStart = null;
  if (state.exit        && (state.exit.r        >= rows || state.exit.c        >= cols)) state.exit = null;
  if (state.merchant    && (state.merchant.r    >= rows || state.merchant.c    >= cols)) state.merchant = null;
  if (state.fountain    && (state.fountain.r    >= rows || state.fountain.c    >= cols)) state.fountain = null;
  state.itemDrops = state.itemDrops.filter(d => d.r < rows && d.c < cols);
  renderAll();
}

rowsInput.addEventListener('change', () => {
  const n = parseInt(rowsInput.value, 10) || 8;
  resizeDraft(n, state.cols);
});

colsInput.addEventListener('change', () => {
  const n = parseInt(colsInput.value, 10) || 8;
  resizeDraft(state.rows, n);
});

// Palette clicks set the active brush.
paletteEl.addEventListener('click', (e) => {
  const el = e.target.closest('.palette-swatch');
  if (!el) return;
  setBrushKey(el.dataset.brushKey);
  renderAll();
});
```

- [ ] **Step 3: Manual smoke: reload editor.html**

Reload `http://localhost:3000/editor.html`. Expected:
- An 8×8 grid of slate-blue "empty" cells.
- Palette populated with four sections (Terrain/Gold/Placement/Drops).
- First "empty" swatch is the default active brush.
- Inspector shows rows=8, cols=8, summary "Walls: 0 · Gas: 0 · Gold: 0 · Drops: 0".
- Validation list shows failures (no player, no exit).
- Changing rows input to 10 grows the grid; changing back to 8 shrinks it.
- Clicking a palette swatch rings it (active style).

- [ ] **Step 4: Commit**

```bash
git add src/editor/editorRender.js src/editor/main.js
git commit -m "editor: grid/palette/inspector renderer + resize wiring

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Painting (click, drag, erase, placement, drops)

**Files:**
- Create: `src/editor/editorPointer.js`
- Modify: `src/editor/main.js`

- [ ] **Step 1: Create src/editor/editorPointer.js**

```js
import { getEditorState, getBrushKey } from './editorState.js';
import { findBrush } from './palette.js';
import { gridEl } from './editorDom.js';
import { renderAll } from './editorRender.js';

// Brush application. Returns true if the cell changed, false if refused.
// On refusal, caller flashes the cell red.
export function applyBrush(r, c, brushKey) {
  const brush = findBrush(brushKey);
  if (!brush) return false;
  const state = getEditorState();
  const cell = state.cells[r][c];

  if (brush.kind === 'terrain') {
    // Block wall/gas on cells that hold a unique placement (player/exit/merchant/fountain).
    if (brush.cellType === 'wall' || brush.cellType === 'gas') {
      if (hasUniquePlacement(state, r, c)) return false;
    }
    // Block any non-empty terrain on a cell holding an item drop.
    if (brush.cellType !== 'empty' && hasDrop(state, r, c)) return false;

    // Fountain is both a cell type AND a unique placement.
    if (brush.cellType === 'fountain') {
      // Can't paint fountain over player/exit/merchant.
      if (isAt(state.playerStart, r, c)) return false;
      if (isAt(state.exit, r, c)) return false;
      if (isAt(state.merchant, r, c)) return false;
      // If there's an existing fountain, clear its old cell back to empty.
      if (state.fountain && !(state.fountain.r === r && state.fountain.c === c)) {
        state.cells[state.fountain.r][state.fountain.c] = { type: 'empty' };
      }
      state.fountain = { r, c };
    } else if (cell.type === 'fountain' && brush.cellType !== 'fountain') {
      // Overpainting the current fountain cell with a different terrain —
      // clear the top-level fountain reference.
      if (state.fountain && state.fountain.r === r && state.fountain.c === c) {
        state.fountain = null;
      }
    }

    if (brush.cellType === 'gold') {
      state.cells[r][c] = { type: 'gold', goldValue: brush.goldValue };
    } else {
      state.cells[r][c] = { type: brush.cellType };
    }
    return true;
  }

  if (brush.kind === 'placement') {
    const slot = brush.slot; // 'playerStart' | 'exit' | 'merchant'
    // Cell must be empty for placement (not wall/gas/gold/fountain).
    if (cell.type !== 'empty') return false;
    // Can't overlap another unique placement.
    for (const otherSlot of ['playerStart', 'exit', 'merchant', 'fountain']) {
      if (otherSlot === slot) continue;
      if (isAt(state[otherSlot], r, c)) return false;
    }
    // Can't overlap an item drop.
    if (hasDrop(state, r, c)) return false;
    // Move the marker.
    state[slot] = { r, c };
    return true;
  }

  if (brush.kind === 'drop') {
    // Drops only land on empty cells.
    if (cell.type !== 'empty') return false;
    // Can't overlap unique placements.
    if (hasUniquePlacement(state, r, c)) return false;
    // Replace any existing drop at this cell.
    state.itemDrops = state.itemDrops.filter(d => !(d.r === r && d.c === c));
    state.itemDrops.push({ r, c, item: brush.item });
    return true;
  }

  return false;
}

// Eraser: sets cell back to 'empty' and removes any drop/placement at this cell.
export function eraseAt(r, c) {
  const state = getEditorState();
  const prev = state.cells[r][c];
  state.cells[r][c] = { type: 'empty' };
  state.itemDrops = state.itemDrops.filter(d => !(d.r === r && d.c === c));
  for (const slot of ['playerStart', 'exit', 'merchant', 'fountain']) {
    if (isAt(state[slot], r, c)) state[slot] = null;
  }
  // If we erased the fountain cell, the slot was already cleared above.
  // If erased cell was not one of the above, prev may have been a fountain
  // (only fountain lives on both cell.type and state.fountain). Safety: if
  // prev.type was fountain and state.fountain still points here, null it.
  if (prev && prev.type === 'fountain' && state.fountain && state.fountain.r === r && state.fountain.c === c) {
    state.fountain = null;
  }
  return true;
}

function isAt(p, r, c) { return p && p.r === r && p.c === c; }
function hasUniquePlacement(state, r, c) {
  return isAt(state.playerStart, r, c) || isAt(state.exit, r, c)
      || isAt(state.merchant, r, c) || isAt(state.fountain, r, c);
}
function hasDrop(state, r, c) {
  return state.itemDrops.some(d => d.r === r && d.c === c);
}

// Pointer handling.
let painting = false;
let paintedThisStroke = new Set(); // "r,c" keys to avoid re-applying during drag

export function initEditorPointer() {
  gridEl.addEventListener('pointerdown', (e) => {
    const cellEl = e.target.closest('.editor-cell');
    if (!cellEl) return;
    const r = parseInt(cellEl.dataset.row, 10);
    const c = parseInt(cellEl.dataset.col, 10);

    if (e.button === 2) {
      // Right-click = erase.
      e.preventDefault();
      eraseAt(r, c);
      renderAll();
      return;
    }

    painting = true;
    paintedThisStroke.clear();
    applyAndFlash(r, c, cellEl);
  });

  gridEl.addEventListener('pointermove', (e) => {
    if (!painting) return;
    const cellEl = e.target.closest('.editor-cell');
    if (!cellEl) return;
    const r = parseInt(cellEl.dataset.row, 10);
    const c = parseInt(cellEl.dataset.col, 10);
    const key = `${r},${c}`;
    if (paintedThisStroke.has(key)) return;
    applyAndFlash(r, c, cellEl);
  });

  const endStroke = () => {
    painting = false;
    paintedThisStroke.clear();
  };
  window.addEventListener('pointerup', endStroke);
  window.addEventListener('pointercancel', endStroke);

  // Suppress context menu on grid so right-click erases cleanly.
  gridEl.addEventListener('contextmenu', (e) => e.preventDefault());
}

function applyAndFlash(r, c, cellEl) {
  const changed = applyBrush(r, c, getBrushKey());
  paintedThisStroke.add(`${r},${c}`);
  if (changed) {
    renderAll();
  } else {
    // Flash red on refusal.
    const el = document.querySelector(`.editor-cell[data-row="${r}"][data-col="${c}"]`) || cellEl;
    el.classList.remove('flash-bad');
    void el.offsetWidth; // retrigger animation
    el.classList.add('flash-bad');
  }
}
```

- [ ] **Step 2: Wire initEditorPointer in main.js**

Edit `src/editor/main.js`, replacing the existing file:

```js
import { resetDraft, getEditorState, setBrushKey } from './editorState.js';
import {
  levelNameInput, rowsInput, colsInput, notesTextarea, paletteEl,
} from './editorDom.js';
import { renderAll } from './editorRender.js';
import { initEditorPointer } from './editorPointer.js';

resetDraft(8, 8);
renderAll();
initEditorPointer();

const state = getEditorState();

levelNameInput.addEventListener('input', () => {
  state.name = levelNameInput.value;
});

notesTextarea.addEventListener('input', () => {
  state.notes = notesTextarea.value;
});

function resizeDraft(rows, cols) {
  rows = Math.max(6, Math.min(20, rows));
  cols = Math.max(6, Math.min(20, cols));
  const newCells = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      if (r < state.rows && c < state.cols) return state.cells[r][c];
      return { type: 'empty' };
    })
  );
  state.cells = newCells;
  state.rows = rows;
  state.cols = cols;
  if (state.playerStart && (state.playerStart.r >= rows || state.playerStart.c >= cols)) state.playerStart = null;
  if (state.exit        && (state.exit.r        >= rows || state.exit.c        >= cols)) state.exit = null;
  if (state.merchant    && (state.merchant.r    >= rows || state.merchant.c    >= cols)) state.merchant = null;
  if (state.fountain    && (state.fountain.r    >= rows || state.fountain.c    >= cols)) state.fountain = null;
  state.itemDrops = state.itemDrops.filter(d => d.r < rows && d.c < cols);
  renderAll();
}

rowsInput.addEventListener('change', () => resizeDraft(parseInt(rowsInput.value, 10) || 8, state.cols));
colsInput.addEventListener('change', () => resizeDraft(state.rows, parseInt(colsInput.value, 10) || 8));

paletteEl.addEventListener('click', (e) => {
  const el = e.target.closest('.palette-swatch');
  if (!el) return;
  setBrushKey(el.dataset.brushKey);
  renderAll();
});
```

- [ ] **Step 3: Manual smoke: paint a level**

Reload editor. Paint the following using the palette and clicking/dragging:

- Select wall brush (▓) → drag across row 2 → row of walls appears.
- Select gas (💀) → click a few cells.
- Select gold-10 → click some → cells show "💰10".
- Select player-start (🙂) → click (0,0) → player icon.
- Click (5,5) with exit brush → exit icon.
- Inspector validation list should now show "✓ Level is playable" if the exit is reachable.
- Right-click any painted cell → returns to empty.
- Try to place a wall on the player cell → red flash, refusal.
- Try to paint another player on (3,3) → player moves there (the old icon goes away).

- [ ] **Step 4: Commit**

```bash
git add src/editor/editorPointer.js src/editor/main.js
git commit -m "editor: click/drag paint with placement, drops, erase, flash refusal

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Slot storage (localStorage persistence)

**Files:**
- Create: `src/editor/slotStore.js`
- Modify: `src/editor/main.js`

- [ ] **Step 1: Create src/editor/slotStore.js**

```js
import { SCHEMA_VERSION } from './schema.js';

const DRAFT_KEY = 'miningCrawler.editor.draft';
const SLOTS_KEY = 'miningCrawler.editor.slots';
const SLOT_KEY = (n) => `miningCrawler.editor.slot.${n}`;
const PENDING_TEST_PLAY_KEY = 'miningCrawler.editor.pendingTestPlay';

// Returns true/false for localStorage availability — set once on first call.
let lsWorks = null;
export function isLocalStorageWorking() {
  if (lsWorks !== null) return lsWorks;
  try {
    localStorage.setItem('miningCrawler.editor._probe', '1');
    localStorage.removeItem('miningCrawler.editor._probe');
    lsWorks = true;
  } catch {
    lsWorks = false;
  }
  return lsWorks;
}

export function saveDraft(level) {
  if (!isLocalStorageWorking()) return false;
  localStorage.setItem(DRAFT_KEY, JSON.stringify(level));
  return true;
}

export function loadDraft() {
  if (!isLocalStorageWorking()) return null;
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function listSlots() {
  if (!isLocalStorageWorking()) return [];
  const raw = localStorage.getItem(SLOTS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function saveToSlot(slotN, level) {
  if (!isLocalStorageWorking()) return false;
  localStorage.setItem(SLOT_KEY(slotN), JSON.stringify(level));
  const slots = listSlots().filter(s => s.slot !== slotN);
  slots.push({
    slot: slotN,
    id: level.id || `slot-${slotN}`,
    name: level.name || `Slot ${slotN}`,
    updatedAt: Date.now(),
  });
  localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
  return true;
}

export function loadFromSlot(slotN) {
  if (!isLocalStorageWorking()) return null;
  const raw = localStorage.getItem(SLOT_KEY(slotN));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function deleteSlot(slotN) {
  if (!isLocalStorageWorking()) return false;
  localStorage.removeItem(SLOT_KEY(slotN));
  const slots = listSlots().filter(s => s.slot !== slotN);
  localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
  return true;
}

export function writePendingTestPlay(level) {
  if (!isLocalStorageWorking()) return false;
  localStorage.setItem(PENDING_TEST_PLAY_KEY, JSON.stringify(level));
  return true;
}

export function readAndClearPendingTestPlay() {
  if (!isLocalStorageWorking()) return null;
  const raw = localStorage.getItem(PENDING_TEST_PLAY_KEY);
  localStorage.removeItem(PENDING_TEST_PLAY_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export { SCHEMA_VERSION };
```

- [ ] **Step 2: Wire draft autosave + menu actions in main.js**

Edit `src/editor/main.js`. Replace the entire file with:

```js
import { resetDraft, getEditorState, setBrushKey, loadLevel, toLevel, setLoadedSlot, getLoadedSlot } from './editorState.js';
import {
  levelNameInput, rowsInput, colsInput, notesTextarea, paletteEl,
  menuBtn, menuDropdown, modalEl, modalContentEl, importInput,
} from './editorDom.js';
import { renderAll } from './editorRender.js';
import { initEditorPointer } from './editorPointer.js';
import { SCHEMA_VERSION, jsonToLevel, levelToJson } from './schema.js';
import {
  saveDraft, loadDraft, listSlots, saveToSlot, loadFromSlot,
  isLocalStorageWorking,
} from './slotStore.js';

// Boot: load draft if present, else blank 8x8.
const saved = loadDraft();
if (saved) {
  const parsed = jsonToLevel(JSON.stringify(saved));
  if (parsed.ok) {
    loadLevel(parsed.level);
  } else {
    console.warn('Editor: saved draft is invalid, starting blank', parsed.errors);
    resetDraft(8, 8);
  }
} else {
  resetDraft(8, 8);
}

renderAll();
initEditorPointer();

const state = getEditorState();

// -- Two-way bindings --

levelNameInput.addEventListener('input', () => {
  state.name = levelNameInput.value;
  scheduleAutosave();
});

notesTextarea.addEventListener('input', () => {
  state.notes = notesTextarea.value;
  scheduleAutosave();
});

function resizeDraft(rows, cols) {
  rows = Math.max(6, Math.min(20, rows));
  cols = Math.max(6, Math.min(20, cols));
  const newCells = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      if (r < state.rows && c < state.cols) return state.cells[r][c];
      return { type: 'empty' };
    })
  );
  state.cells = newCells;
  state.rows = rows;
  state.cols = cols;
  if (state.playerStart && (state.playerStart.r >= rows || state.playerStart.c >= cols)) state.playerStart = null;
  if (state.exit        && (state.exit.r        >= rows || state.exit.c        >= cols)) state.exit = null;
  if (state.merchant    && (state.merchant.r    >= rows || state.merchant.c    >= cols)) state.merchant = null;
  if (state.fountain    && (state.fountain.r    >= rows || state.fountain.c    >= cols)) state.fountain = null;
  state.itemDrops = state.itemDrops.filter(d => d.r < rows && d.c < cols);
  renderAll();
  scheduleAutosave();
}

rowsInput.addEventListener('change', () => resizeDraft(parseInt(rowsInput.value, 10) || 8, state.cols));
colsInput.addEventListener('change', () => resizeDraft(state.rows, parseInt(colsInput.value, 10) || 8));

paletteEl.addEventListener('click', (e) => {
  const el = e.target.closest('.palette-swatch');
  if (!el) return;
  setBrushKey(el.dataset.brushKey);
  renderAll();
});

// -- Autosave --

let autosaveTimer = null;
export function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    saveDraft(toLevel());
  }, 500);
}

// Autosave after every paint stroke too. Easiest hookup: poll renders (called
// by pointer handlers after every stroke). Expose a global hook.
window._editorAutosave = scheduleAutosave;
// And wire it by patching renderAll — every paint calls renderAll().
// Simpler: autosave on pointerup directly.
window.addEventListener('pointerup', scheduleAutosave);

// -- Menu wiring --

menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  menuDropdown.classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
  if (!menuDropdown.contains(e.target) && e.target !== menuBtn) {
    menuDropdown.classList.add('hidden');
  }
});

menuDropdown.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-menu-act]');
  if (!btn) return;
  const act = btn.dataset.menuAct;
  menuDropdown.classList.add('hidden');
  if      (act === 'new')         onNew();
  else if (act === 'load-draft')  onLoadDraft();
  else if (act === 'load-slot')   onLoadSlot();
  else if (act === 'save-slot')   onSaveSlot();
  else if (act === 'import')      importInput.click();
  else if (act === 'export')      onExport();
});

importInput.addEventListener('change', onImportFile);

function onNew() {
  showConfirm('Discard current draft and start fresh?', () => {
    resetDraft(8, 8);
    renderAll();
    scheduleAutosave();
  });
}

function onLoadDraft() {
  const saved = loadDraft();
  if (!saved) { alert('No draft saved.'); return; }
  const parsed = jsonToLevel(JSON.stringify(saved));
  if (!parsed.ok) { alert('Draft invalid: ' + parsed.errors.join(', ')); return; }
  loadLevel(parsed.level);
  setLoadedSlot(null);
  renderAll();
}

function onLoadSlot() {
  const slots = listSlots();
  if (slots.length === 0) { alert('No saved slots.'); return; }
  const rows = slots.map(s => `<li><button data-load-slot="${s.slot}">Slot ${s.slot}: ${escapeHtml(s.name)}</button></li>`).join('');
  showModal(`<h3>Load Slot</h3><ul>${rows}</ul><button data-close>Cancel</button>`);
  modalContentEl.querySelectorAll('button[data-load-slot]').forEach(b => {
    b.addEventListener('click', () => {
      const n = parseInt(b.dataset.loadSlot, 10);
      const saved = loadFromSlot(n);
      if (!saved) { hideModal(); return; }
      const parsed = jsonToLevel(JSON.stringify(saved));
      if (!parsed.ok) { alert('Slot invalid: ' + parsed.errors.join(', ')); return; }
      loadLevel(parsed.level);
      setLoadedSlot(n);
      renderAll();
      hideModal();
    });
  });
  modalContentEl.querySelector('[data-close]').addEventListener('click', hideModal);
}

function onSaveSlot() {
  // Prompt for slot 1..10.
  const buttons = [];
  for (let n = 1; n <= 10; n++) buttons.push(`<button data-save-slot="${n}">${n}</button>`);
  showModal(`<h3>Save to Slot</h3><p>Pick a slot (1–10):</p><div>${buttons.join(' ')}</div><button data-close>Cancel</button>`);
  modalContentEl.querySelectorAll('button[data-save-slot]').forEach(b => {
    b.addEventListener('click', () => {
      const n = parseInt(b.dataset.saveSlot, 10);
      saveToSlot(n, toLevel());
      setLoadedSlot(n);
      hideModal();
      alert(`Saved to slot ${n}.`);
    });
  });
  modalContentEl.querySelector('[data-close]').addEventListener('click', hideModal);
}

function onExport() {
  const level = toLevel();
  level.id = level.id || promptForId();
  const json = levelToJson(level);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `${level.id || 'level'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function promptForId() {
  const v = prompt('Level id (filename slug, e.g. "level-01"):');
  return (v || 'level').replace(/[^a-z0-9-]/gi, '-');
}

function onImportFile(e) {
  const file = e.target.files[0];
  importInput.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const parsed = jsonToLevel(reader.result);
    if (!parsed.ok) { alert('Import failed:\n' + parsed.errors.join('\n')); return; }
    loadLevel(parsed.level);
    setLoadedSlot(null);
    renderAll();
  };
  reader.readAsText(file);
}

function showModal(html) {
  modalContentEl.innerHTML = html;
  modalEl.classList.remove('hidden');
}
function hideModal() {
  modalEl.classList.add('hidden');
}
function showConfirm(msg, onYes) {
  showModal(`<p>${escapeHtml(msg)}</p><button data-yes>Yes</button><button data-no>No</button>`);
  modalContentEl.querySelector('[data-yes]').addEventListener('click', () => { onYes(); hideModal(); });
  modalContentEl.querySelector('[data-no]').addEventListener('click', hideModal);
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

// localStorage banner on failure.
if (!isLocalStorageWorking()) {
  const banner = document.createElement('div');
  banner.style.cssText = 'background:#4a1e1e;color:#d86a6a;padding:8px;text-align:center;';
  banner.textContent = 'Drafts will not be saved — localStorage unavailable. Use Export to download.';
  document.body.insertBefore(banner, document.body.firstChild);
}
```

- [ ] **Step 3: Manual smoke: save and reload**

Reload `editor.html`. Paint a small level. Click `☰` → `Save to Slot…` → 1. Reload the page. Expected: the draft autosave restored most recent edit (since autosave fires on pointerup). Click `☰` → `Load Slot…` → `Slot 1: …` — should restore what you saved. Click `☰` → `New` → confirm → blank grid. Click `☰` → `Export JSON` → prompts for id → downloads a `level-XX.json`.

- [ ] **Step 4: Commit**

```bash
git add src/editor/slotStore.js src/editor/main.js
git commit -m "editor: localStorage draft autosave, slot load/save, JSON import/export

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Game-side authored-level boot path

**Files:**
- Create: `src/gameplay/authored.js`
- Modify: `src/main.js`

- [ ] **Step 1: Create src/gameplay/authored.js**

```js
// Authored level playback. Replaces procgen generation for one level.
// All run-scoped defaults (HP, items, gold) use resetForNewRun.

import {
  getState, setRows, setCols,
  setGameOver, setBusy, setActiveItem, setMerchant, setFountain,
  setRulesetId, setBiomeOverrides,
  setPlayerPosition, setExit, setGrid, setRevealed, setFlagged,
  resetForNewRun,
} from '../state.js';
import { startBgm } from '../audio.js';
import { playerSprite } from '../ui/dom.js';
import { renderGrid, updateHud, updatePlayerSprite, resetHurtFlash } from '../ui/render.js';
import { getViewportSize, cellCenterPx, setPan } from '../ui/view.js';
import { renderStartMenu } from '../ui/overlay.js';
import { hideOverlay } from '../ui/overlay.js';
import { countAdjacentGas, cleanMerchantCell } from '../board/generation.js';
import { rollMerchantStock } from './merchant.js';
import { revealCell } from './interaction.js';
import { clearSave } from './level.js';
import { jsonToLevel } from '../editor/schema.js';
import { validateLevel } from '../editor/validation.js';
import {
  readAndClearPendingTestPlay, loadFromSlot,
} from '../editor/slotStore.js';

let currentAuthoredData = null;

export function getCurrentAuthoredData() { return currentAuthoredData; }

export function startAuthoredLevel(level) {
  document.body.classList.add('in-run');
  clearSave();
  resetForNewRun();
  currentAuthoredData = level;
  applyAuthoredLevel(level);
  updatePlayerSprite(true);
  resetHurtFlash();
  playerSprite.textContent = '🙂';
  startBgm();
}

function applyAuthoredLevel(level) {
  setRows(level.rows);
  setCols(level.cols);
  setGameOver(false);
  setBusy(false);
  setActiveItem(null);
  setMerchant(null);
  setFountain(null);
  setRulesetId('authored');  // sentinel — gates end-of-level / retry routing
  setBiomeOverrides(null);

  // Build grid. Authored cells only carry .type and (for gold) .goldValue.
  const grid = [];
  for (let r = 0; r < level.rows; r++) {
    const row = [];
    for (let c = 0; c < level.cols; c++) {
      const src = level.cells[r][c];
      const cell = { type: src.type, adjacent: 0, goldValue: 0, item: null };
      if (src.type === 'gold') cell.goldValue = src.goldValue;
      row.push(cell);
    }
    grid.push(row);
  }
  setGrid(grid);

  // Item drops.
  for (const d of level.itemDrops) {
    grid[d.r][d.c].item = d.item;
  }

  // Player / exit.
  setPlayerPosition(level.playerStart.r, level.playerStart.c);
  setExit({ r: level.exit.r, c: level.exit.c });

  // Merchant.
  if (level.merchant) {
    cleanMerchantCell(level.merchant.r, level.merchant.c);
    setMerchant({
      r: level.merchant.r,
      c: level.merchant.c,
      stock: rollMerchantStock(),
      rerollCount: 0,
    });
  }

  // Fountain.
  if (level.fountain) {
    grid[level.fountain.r][level.fountain.c].type = 'fountain';
    setFountain({ r: level.fountain.r, c: level.fountain.c, used: false });
  }

  // Compute adjacency for non-wall, non-gas cells.
  for (let r = 0; r < level.rows; r++) {
    for (let c = 0; c < level.cols; c++) {
      const cell = grid[r][c];
      if (cell.type === 'wall' || cell.type === 'gas') continue;
      cell.adjacent = countAdjacentGas(r, c);
    }
  }

  // Revealed / flagged arrays.
  setRevealed(Array.from({ length: level.rows }, () => Array(level.cols).fill(false)));
  setFlagged(Array.from({ length: level.rows }, () => Array(level.cols).fill(false)));

  // Pre-reveal.
  const rev = getState().revealed;
  rev[level.playerStart.r][level.playerStart.c] = true;
  rev[level.exit.r][level.exit.c] = true;
  if (level.merchant) rev[level.merchant.r][level.merchant.c] = true;
  if (level.fountain) rev[level.fountain.r][level.fountain.c] = true;

  // 3x3 around player (same as procgen). revealCell handles bounds + wall/gas.
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      revealCell(level.playerStart.r + dr, level.playerStart.c + dc);
    }
  }

  // Defensive: spawn cell never grants a pickup.
  grid[level.playerStart.r][level.playerStart.c].item = null;

  updateHud();
  renderGrid();
  const vp = getViewportSize();
  const cc = cellCenterPx(level.playerStart.r, level.playerStart.c);
  setPan(vp.w / 2 - cc.x, vp.h / 2 - cc.y);
  hideOverlay();
}

// Hash handler — called by main.js on boot when hash matches #play-authored=<id>.
export async function loadAuthoredAndStart(id) {
  let rawJson = null;
  if (id === 'draft') {
    const obj = readAndClearPendingTestPlay();
    rawJson = obj ? JSON.stringify(obj) : null;
  } else if (id.startsWith('slot-')) {
    const n = parseInt(id.slice(5), 10);
    const obj = loadFromSlot(n);
    rawJson = obj ? JSON.stringify(obj) : null;
  } else {
    try {
      const res = await fetch(`levels/${encodeURIComponent(id)}.json`);
      if (!res.ok) throw new Error('fetch failed: ' + res.status);
      rawJson = await res.text();
    } catch (e) {
      console.warn('Authored load failed:', e);
    }
  }

  if (!rawJson) {
    alert(`Authored level "${id}" not found.`);
    renderStartMenu();
    return;
  }

  const parsed = jsonToLevel(rawJson);
  if (!parsed.ok) {
    alert('Authored level invalid:\n' + parsed.errors.join('\n'));
    renderStartMenu();
    return;
  }
  const v = validateLevel(parsed.level);
  if (!v.ok) {
    alert('Authored level fails validation:\n' + v.errors.join('\n'));
    renderStartMenu();
    return;
  }

  startAuthoredLevel(parsed.level);
}
```

- [ ] **Step 2: Wire hash route in src/main.js**

Edit `src/main.js`. Replace the final `renderStartMenu()` call at the bottom with:

```js
const authoredMatch = location.hash.match(/^#play-authored=(.+)$/);
if (authoredMatch) {
  const { loadAuthoredAndStart } = await import('./gameplay/authored.js');
  await loadAuthoredAndStart(decodeURIComponent(authoredMatch[1]));
} else {
  renderStartMenu();
}
```

The top-level file needs `await`, which requires top-level-await (supported in ES modules). If the bundler complains, wrap in an async IIFE:

```js
(async () => {
  const authoredMatch = location.hash.match(/^#play-authored=(.+)$/);
  if (authoredMatch) {
    const { loadAuthoredAndStart } = await import('./gameplay/authored.js');
    await loadAuthoredAndStart(decodeURIComponent(authoredMatch[1]));
  } else {
    renderStartMenu();
  }
})();
```

Use the IIFE form — safer across browser ES-module quirks.

- [ ] **Step 3: Manual smoke: authored-level load via direct hash**

Create a test fixture file `levels/test-authored.json`:

```json
{
  "schemaVersion": 1,
  "id": "test-authored",
  "name": "Test",
  "notes": "",
  "rows": 8,
  "cols": 8,
  "playerStart": { "r": 0, "c": 0 },
  "exit": { "r": 7, "c": 7 },
  "merchant": null,
  "fountain": { "r": 3, "c": 3 },
  "cells": [
    [{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"}],
    [{"type":"empty"},{"type":"wall"},{"type":"wall"},{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"}],
    [{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"gas"},{"type":"empty"},{"type":"empty"},{"type":"empty"}],
    [{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"fountain"},{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"}],
    [{"type":"empty"},{"type":"gold","goldValue":10},{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"}],
    [{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"}],
    [{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"}],
    [{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"},{"type":"empty"}]
  ],
  "itemDrops": [
    { "r": 5, "c": 5, "item": "potion" }
  ]
}
```

Open `http://localhost:3000/index.html#play-authored=test-authored`. Expected: game boots directly into the authored level. Player at (0,0), exit at (7,7), fountain at (3,3), gold-10 at (4,1), gas at (2,4), wall pair at (1,1)-(1,2). Adjacency numbers show around the gas. Walking to the gold collects +10. Walking to the fountain heals. Reaching exit — in the next task we'll fix the overlay; for now, confirm the game shows the normal "Escaped" overlay (will be routed to a custom one in Task 8).

**Important check:** open `http://localhost:3000/index.html` (no hash) and confirm the regular game still boots into the normal start menu, unaffected.

- [ ] **Step 4: Commit**

```bash
git add src/gameplay/authored.js src/main.js levels/test-authored.json
git commit -m "game: authored-level boot path + hash route handler

Adds #play-authored=<id> route that fetches from levels/<id>.json,
reads from localStorage slots (slot-N), or from a pending draft
(from editor Test Play). Validates via shared schema+validation
modules and starts a one-off level with authored geometry,
placements, and drops. Ruleset id 'authored' is a sentinel so
no runtime hooks fire.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Authored-mode overlays (cleared / death / retry)

**Files:**
- Modify: `src/ui/overlay.js`
- Modify: `src/gameplay/interaction.js`

- [ ] **Step 1: Add showAuthoredClearedOverlay to ui/overlay.js**

Edit `src/ui/overlay.js`. At the top, update the import to:

```js
import {
  startGame, resumeGame, nextLevel, retryLevel,
  saveRun, loadRun,
} from '../gameplay/level.js';
```

Then add after `showDeathOverlay` + `wireDeathOverlay` (around line 66):

```js
export function showAuthoredClearedOverlay(gold) {
  showOverlay(`
    <h2>Level cleared!</h2>
    <p>Collected 💰 ${gold}</p>
    <button data-act="back-to-menu">Back to Menu</button>
  `);
  overlayContent.querySelector('[data-act="back-to-menu"]').addEventListener('click', menuClick(() => {
    window.location.href = 'index.html';
  }));
}

export function showAuthoredDeathOverlay(gold) {
  showOverlay(`
    <h2>You died.</h2>
    <p>Collected before dying: 💰 ${gold}</p>
    <button data-act="retry-authored">Retry Level</button>
    <button data-act="back-to-menu">Back to Menu</button>
  `);
  overlayContent.querySelector('[data-act="retry-authored"]').addEventListener('click', menuClick(async () => {
    const { getCurrentAuthoredData, startAuthoredLevel } = await import('../gameplay/authored.js');
    const data = getCurrentAuthoredData();
    if (data) startAuthoredLevel(data);
  }));
  overlayContent.querySelector('[data-act="back-to-menu"]').addEventListener('click', menuClick(() => {
    window.location.href = 'index.html';
  }));
}
```

(The dynamic `import('../gameplay/authored.js')` avoids a static cycle between overlay.js and authored.js.)

- [ ] **Step 2: Route exit and death in interaction.js**

Edit `src/gameplay/interaction.js`:

a) Update import at line 22:

```js
import { showDeathOverlay, showEscapedOverlay, showAuthoredClearedOverlay, showAuthoredDeathOverlay } from '../ui/overlay.js';
```

b) Add import right after:

```js
import { getRulesetId } from '../state.js';
```

Wait — `getRulesetId` is already imported at the top via the long state import block. Confirm it's there and add it if missing.

c) Two places call `showEscapedOverlay` — line ~117 (in `animateWalk`) and line ~278 (in `handleClick`). Wrap each with a ruleset check. Replace line 117 area:

Find:
```js
    if (path[i].r === getExit().r && path[i].c === getExit().c) {
      playSfx('win');
      setGameOver(true);
      renderGrid();
      addToLifetimeGold(getGold());
      const nextSize = gridSizeForLevel(getLevel() + 1);
      showEscapedOverlay(getLevel(), getGold(), getStashGold(), nextSize);
      return false;
    }
```

Replace with:
```js
    if (path[i].r === getExit().r && path[i].c === getExit().c) {
      playSfx('win');
      setGameOver(true);
      renderGrid();
      addToLifetimeGold(getGold());
      if (getRulesetId() === 'authored') {
        showAuthoredClearedOverlay(getGold());
      } else {
        const nextSize = gridSizeForLevel(getLevel() + 1);
        showEscapedOverlay(getLevel(), getGold(), getStashGold(), nextSize);
      }
      return false;
    }
```

Find the second (in `handleClick`, ~line 273):
```js
      if (r === getExit().r && c === getExit().c) {
        playSfx('win');
        setGameOver(true);
        addToLifetimeGold(getGold());
        const nextSize = gridSizeForLevel(getLevel() + 1);
        showEscapedOverlay(getLevel(), getGold(), getStashGold(), nextSize);
        return;
      }
```

Replace with:
```js
      if (r === getExit().r && c === getExit().c) {
        playSfx('win');
        setGameOver(true);
        addToLifetimeGold(getGold());
        if (getRulesetId() === 'authored') {
          showAuthoredClearedOverlay(getGold());
        } else {
          const nextSize = gridSizeForLevel(getLevel() + 1);
          showEscapedOverlay(getLevel(), getGold(), getStashGold(), nextSize);
        }
        return;
      }
```

d) Death overlay. Find the `if (getHp() <= 0)` block (~line 258):
```js
      if (getHp() <= 0) {
        setGameOver(true);
        showDeathOverlay(getLevel(), getGold(), getStashGold());
        return;
      }
```

Replace with:
```js
      if (getHp() <= 0) {
        setGameOver(true);
        if (getRulesetId() === 'authored') {
          showAuthoredDeathOverlay(getGold());
        } else {
          showDeathOverlay(getLevel(), getGold(), getStashGold());
        }
        return;
      }
```

- [ ] **Step 3: Manual smoke: play through authored level end-to-end**

Open `http://localhost:3000/index.html#play-authored=test-authored`. Walk to exit at (7,7). Expected: "Level cleared!" overlay with "Back to Menu" button. Clicking it navigates to `index.html` → start menu.

Reload `http://localhost:3000/index.html#play-authored=test-authored`. This time, walk INTO the gas at (2,4) to get damage. Repeat stepping into gas until you die. Expected: "You died." overlay with Retry Level / Back to Menu. Retry → authored level resets (player back at 0,0, full HP, full items).

Verify regular game: open `http://localhost:3000/index.html` → start menu → New Run → complete a level. The normal "Escaped" overlay still appears. Die on a regular level — normal death overlay.

- [ ] **Step 4: Commit**

```bash
git add src/ui/overlay.js src/gameplay/interaction.js
git commit -m "game: authored-mode end-of-level and death overlays with retry

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Test Play button wiring

**Files:**
- Create: `src/editor/testPlay.js`
- Modify: `src/editor/main.js`

- [ ] **Step 1: Create src/editor/testPlay.js**

```js
import { toLevel } from './editorState.js';
import { validateLevel } from './validation.js';
import { writePendingTestPlay } from './slotStore.js';

export function testPlayCurrentDraft() {
  const level = toLevel();
  const res = validateLevel(level);
  if (!res.ok) {
    alert('Cannot test play:\n' + res.errors.join('\n'));
    return;
  }
  writePendingTestPlay(level);
  window.location.href = 'index.html#play-authored=draft';
}
```

- [ ] **Step 2: Wire testPlayBtn in main.js**

Edit `src/editor/main.js`. Add this import at the top:

```js
import { testPlayCurrentDraft } from './testPlay.js';
```

Add this import for the button:

```js
import {
  levelNameInput, rowsInput, colsInput, notesTextarea, paletteEl,
  menuBtn, menuDropdown, modalEl, modalContentEl, importInput,
  testPlayBtn,
} from './editorDom.js';
```

Then after the palette click handler, add:

```js
testPlayBtn.addEventListener('click', testPlayCurrentDraft);
```

- [ ] **Step 3: Manual smoke: test play from editor**

Open `http://localhost:3000/editor.html`. Paint a level: player start at (0,0), exit at (5,5), a few walls, a fountain, an item drop. Click Test Play. Expected: the page navigates to `index.html#play-authored=draft`, the game boots into your painted level, you can play it. Walk to exit → "Level cleared!" overlay → Back to Menu → start menu.

Reload the editor with `http://localhost:3000/editor.html`. Expected: the draft is still there (autosaved). Test Play again — same flow, works.

Try Test Play with an invalid draft (e.g., no exit placed). Expected: alert with validation errors, no navigation.

- [ ] **Step 4: Commit**

```bash
git add src/editor/testPlay.js src/editor/main.js
git commit -m "editor: Test Play button with validation + navigation to game

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Play Authored menu entry

**Files:**
- Modify: `src/ui/overlay.js`
- Create: `levels/index.json`

- [ ] **Step 1: Add renderAuthoredList to ui/overlay.js**

Edit `src/ui/overlay.js`. Find `renderStartMenu` (around line 68) and modify to add a new button:

```js
export function renderStartMenu() {
  document.body.classList.remove('in-run');
  const save = loadRun();
  const continueBtn = save
    ? `<button class="menu-btn-primary" data-act="continue">Continue (Level ${save.level} · 💰 ${save.stashGold})</button>`
    : '';
  const newRunClass = save ? 'menu-btn-secondary' : 'menu-btn-primary';
  const newRunAct = save ? 'confirm-new-run' : 'start-new-run';
  showOverlay(`
    <h2>Mining Crawler</h2>
    ${continueBtn}
    <button class="${newRunClass}" data-act="${newRunAct}">New Run</button>
    <button class="menu-btn-secondary" data-act="play-authored">Play Authored</button>
    <button class="menu-btn-secondary" data-act="rules">Rules</button>
    <button class="menu-btn-secondary" data-act="settings">Settings</button>
  `);
  wireStartMenu(save);
}
```

Find `wireStartMenu` and add the new handler:

```js
function wireStartMenu(save) {
  const q = (act) => overlayContent.querySelector(`[data-act="${act}"]`);
  q('continue')?.addEventListener('click', menuClick(() => resumeGame(loadRun())));
  q('start-new-run')?.addEventListener('click', menuClick(() => startGame()));
  q('confirm-new-run')?.addEventListener('click', menuClick(() => renderNewRunConfirm()));
  q('play-authored')?.addEventListener('click', menuClick(() => renderAuthoredList()));
  q('rules')?.addEventListener('click', menuClick(() => renderRules('start')));
  q('settings')?.addEventListener('click', menuClick(() => renderSettings('start')));
}
```

Add a new function `renderAuthoredList`:

```js
export async function renderAuthoredList() {
  let committed = [];
  try {
    const res = await fetch('levels/index.json');
    if (res.ok) committed = await res.json();
  } catch { /* manifest missing — fine */ }

  // List committed.
  const committedRows = committed.map(c =>
    `<button class="menu-btn-secondary" data-authored-id="${escapeAttr(c.id)}">${escapeHtml(c.name)}</button>`
  ).join('');

  // List slots.
  let slotRows = '';
  try {
    const rawSlots = localStorage.getItem('miningCrawler.editor.slots');
    if (rawSlots) {
      const slots = JSON.parse(rawSlots);
      slotRows = slots.map(s =>
        `<button class="menu-btn-secondary" data-authored-slot="${s.slot}">Slot ${s.slot}: ${escapeHtml(s.name)}</button>`
      ).join('');
    }
  } catch { /* ignore */ }

  const body = [];
  if (committedRows) body.push(`<p><strong>Committed</strong></p>${committedRows}`);
  if (slotRows)      body.push(`<p><strong>Drafts</strong></p>${slotRows}`);
  if (!body.length)  body.push(`<p>No authored levels yet. Open the editor at <code>editor.html</code>.</p>`);

  showOverlay(`
    <h2>Play Authored</h2>
    ${body.join('')}
    <button class="menu-btn-primary" data-act="back">Back</button>
  `);
  overlayContent.querySelectorAll('[data-authored-id]').forEach(btn => {
    btn.addEventListener('click', menuClick(() => {
      window.location.href = `index.html#play-authored=${encodeURIComponent(btn.dataset.authoredId)}`;
    }));
  });
  overlayContent.querySelectorAll('[data-authored-slot]').forEach(btn => {
    btn.addEventListener('click', menuClick(() => {
      window.location.href = `index.html#play-authored=slot-${btn.dataset.authoredSlot}`;
    }));
  });
  overlayContent.querySelector('[data-act="back"]').addEventListener('click', menuClick(() => renderStartMenu()));
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function escapeAttr(s) { return escapeHtml(s); }
```

- [ ] **Step 2: Create levels/index.json**

Write `levels/index.json`:

```json
[
  { "id": "test-authored", "name": "Test Authored", "file": "test-authored.json" }
]
```

- [ ] **Step 3: Manual smoke: Play Authored menu**

Open `http://localhost:3000/index.html` → Start menu. Click "Play Authored". Expected: sublist with "Committed" section listing "Test Authored". Click it → navigates to the authored play page, boots into level.

Go back to Play Authored. If you saved a slot earlier, it shows under "Drafts". Click it → plays your saved draft.

Click Back → back to start menu.

- [ ] **Step 4: Commit**

```bash
git add src/ui/overlay.js levels/index.json
git commit -m "game: Play Authored menu entry with committed + slot listings

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Keyboard shortcuts (numbers, undo/redo, Ctrl+S)

**Files:**
- Modify: `src/editor/main.js`
- Modify: `src/editor/editorState.js`

- [ ] **Step 1: Add undo/redo stack to editorState.js**

Append to `src/editor/editorState.js`:

```js
// Undo/redo — ring buffer of deep-clones of { rows, cols, cells, playerStart,
// exit, merchant, fountain, itemDrops }. One entry per terminal paint action.

const undoStack = [];
const redoStack = [];
const MAX_UNDO = 50;

function snapshot() {
  return {
    rows: state.rows, cols: state.cols,
    cells: state.cells.map(row => row.map(cell =>
      cell.type === 'gold' ? { type: 'gold', goldValue: cell.goldValue } : { type: cell.type })),
    playerStart: state.playerStart ? { ...state.playerStart } : null,
    exit:        state.exit        ? { ...state.exit }        : null,
    merchant:    state.merchant    ? { ...state.merchant }    : null,
    fountain:    state.fountain    ? { ...state.fountain }    : null,
    itemDrops:   state.itemDrops.map(d => ({ ...d })),
  };
}

function restore(snap) {
  state.rows = snap.rows;
  state.cols = snap.cols;
  state.cells = snap.cells.map(row => row.map(cell =>
    cell.type === 'gold' ? { type: 'gold', goldValue: cell.goldValue } : { type: cell.type }));
  state.playerStart = snap.playerStart ? { ...snap.playerStart } : null;
  state.exit        = snap.exit        ? { ...snap.exit }        : null;
  state.merchant    = snap.merchant    ? { ...snap.merchant }    : null;
  state.fountain    = snap.fountain    ? { ...snap.fountain }    : null;
  state.itemDrops   = snap.itemDrops.map(d => ({ ...d }));
}

export function pushUndo() {
  undoStack.push(snapshot());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
}

export function undo() {
  if (!undoStack.length) return false;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  return true;
}

export function redo() {
  if (!redoStack.length) return false;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  return true;
}
```

- [ ] **Step 2: Hook pushUndo on pointerup in editorPointer.js**

Edit `src/editor/editorPointer.js`. At the top, add:

```js
import { pushUndo } from './editorState.js';
```

In `initEditorPointer`, modify the pointerdown handler: call `pushUndo()` before the first paint:

```js
gridEl.addEventListener('pointerdown', (e) => {
  const cellEl = e.target.closest('.editor-cell');
  if (!cellEl) return;
  const r = parseInt(cellEl.dataset.row, 10);
  const c = parseInt(cellEl.dataset.col, 10);

  pushUndo();  // <-- snapshot before mutation

  if (e.button === 2) {
    e.preventDefault();
    eraseAt(r, c);
    renderAll();
    return;
  }

  painting = true;
  paintedThisStroke.clear();
  applyAndFlash(r, c, cellEl);
});
```

- [ ] **Step 3: Wire keyboard shortcuts in main.js**

Edit `src/editor/main.js`. Add imports:

```js
import { undo, redo } from './editorState.js';
import { BRUSHES } from './palette.js';
import { saveToSlot } from './slotStore.js';
```

Add a keyboard listener (near the bottom, after all other wiring):

```js
document.addEventListener('keydown', (e) => {
  // Don't hijack inputs.
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    const slot = getLoadedSlot();
    if (slot !== null) {
      saveToSlot(slot, toLevel());
      console.log('Saved to slot', slot);
    } else {
      onSaveSlot();
    }
    return;
  }

  if (e.key === 'z' || e.key === 'Z') {
    if (undo()) renderAll();
    return;
  }
  if (e.key === 'y' || e.key === 'Y') {
    if (redo()) renderAll();
    return;
  }

  // Number keys 1-9 select first 9 brushes (in palette order).
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 9 && BRUSHES[n - 1]) {
    setBrushKey(BRUSHES[n - 1].key);
    renderAll();
  }
});
```

- [ ] **Step 4: Manual smoke: keyboard shortcuts**

Open editor. Paint a few cells. Press `Z` — last stroke undoes. `Y` redoes. `Z` `Z` — two undos. Press `1` — first brush (empty) selected. `2` — wall. `5` — gold-1. Ctrl+S — saves to current slot (or prompts slot picker if none loaded).

- [ ] **Step 5: Commit**

```bash
git add src/editor/editorState.js src/editor/editorPointer.js src/editor/main.js
git commit -m "editor: undo/redo stack, number-key brush selection, Ctrl+S save

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Final checklist + regression sweep

**Files:**
- None modified — this is a verification-only task.

- [ ] **Step 1: Confirm all smoke tests pass**

Open `http://localhost:3000/tests/smoke.html`. Expected: all tests pass (previous tests + 9 schema + 11 validation).

- [ ] **Step 2: Regression — procgen game still works**

Open `http://localhost:3000/index.html`. Boot into start menu. Start a new run. Clear a level. Die on a level. Use items. Visit a merchant. Confirm regular gameplay is identical to master.

- [ ] **Step 3: Regression — in-progress save still works**

Start a procgen run, clear level 1, quit to menu mid-level 2. Return to menu — "Continue" should appear with the correct level number. Resume — loads into level 2.

- [ ] **Step 4: Full authored flow**

Open `editor.html`. Create a new level (8×8, sparse walls, gas, a fountain, an item drop, player + exit). Save to slot 1. Hit Test Play. Play through. Return to menu. Click Play Authored → Drafts → Slot 1 → play again.

- [ ] **Step 5: Manual edge cases**

- Open editor, paint player-start, then try to overwrite that cell with a wall — red flash.
- Paint exit on another cell — it moves.
- Paint a second player — first one moves.
- Paint gas on a cell with an item drop — refused.
- Reduce grid size 10 → 6 with placements outside bounds — placements silently drop (TODO: confirmation modal is OK to leave simple; the spec mentions it but UI silent-drop is a reasonable first cut). Refresh page; confirm draft persists.

- [ ] **Step 6: Commit the fixture directory layout**

`git status` — confirm nothing pending. Everything is already committed from prior tasks.

- [ ] **Step 7: Final commit — handoff note**

Create `docs/superpowers/plans/2026-04-21-level-editor-handoff.md`:

```markdown
# Level Editor — Handoff

Shipped on branch `level-editor`. Spec: `docs/superpowers/specs/2026-04-21-level-editor-design.md`.

## What shipped
- `editor.html` + `src/editor/*` — painter-style level editor.
- `src/gameplay/authored.js` — authored-level boot path on the game side.
- `src/ui/overlay.js` — "Play Authored" start-menu entry + authored-mode cleared/death overlays.
- `levels/` — directory for committed level JSON; `levels/index.json` manifest.
- `tests/smoke.js` — 20 new tests covering schema + validation.

## How to use
- Open `editor.html` → paint → Save to Slot → Test Play.
- Commit a polished level: Export JSON from editor → save into `levels/level-XX.json` → add an entry to `levels/index.json`.

## Known limitations
- Resize-down silently drops out-of-bounds placements (no confirmation modal — spec proposed one, first cut skipped it for brevity).
- No keyboard shortcut for switching tools 10+.
- Editor is desktop-only (no mobile paint ergonomics).
- Schema is v1; any breaking change must bump `SCHEMA_VERSION` in `src/editor/schema.js`.

## Next steps (if authored direction is kept)
- Campaign mode: play levels in sequence with persistent HP/stash.
- Per-level overrides (starter items, HP, merchant stock).
- Level palette preview / thumbnails.
- Editor resize-confirmation modal.
```

```bash
git add docs/superpowers/plans/2026-04-21-level-editor-handoff.md
git commit -m "docs: level editor handoff

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**

- Goal ✓ (Tasks 3–9 build editor; 7–10 integrate with game).
- Scope / architecture ✓ (Task 3 creates editor.html + editor/* isolation; Task 7 adds gameplay/authored.js).
- Data model (JSON schema) ✓ (Task 1: schema.js with round-trip tests).
- Validation rules ✓ (Task 2: all 11 rules from spec covered).
- Editor painter layout ✓ (Task 3: page scaffold; Task 4: render; Task 5: paint).
- localStorage slots + export/import ✓ (Task 6).
- Test Play flow ✓ (Task 9).
- Game hash-routed boot ✓ (Task 7).
- `startAuthoredLevel` ✓ (Task 7).
- Authored-mode end-of-level + death + retry ✓ (Task 8).
- Play Authored menu + `levels/index.json` ✓ (Task 10).
- Keyboard shortcuts + undo/redo ✓ (Task 11).
- Testing plan ✓ (Task 1/2 add smoke tests; Task 12 runs manual checklist).

**2. Placeholder scan:** no "TBD", "handle edge cases", or "similar to X" sloppy references. Each step has the code.

**3. Type consistency:**
- `jsonToLevel` returns `{ ok, level }` or `{ ok, errors }` consistently in tasks 1, 2, 7, 9, 10.
- `validateLevel` returns `{ ok }` or `{ ok: false, errors }` consistently in tasks 2, 7, 9.
- `toLevel()` function signature consistent across editor modules.
- `startAuthoredLevel(level)` takes the parsed level object (not JSON string) — consistent in Tasks 7, 8, 9.
- `readAndClearPendingTestPlay()` returns a parsed object in Task 6, consumed in Task 7.

**4. One issue I'll flag:** Task 11's undo/redo is marked as potentially-cuttable. If the user wants to trim scope, drop Task 11 entirely — it's a self-contained addition and nothing later depends on it. The keyboard shortcuts for numbers + Ctrl+S can still be added without the undo stack, but not cutting the whole task keeps the plan simple.

**5. Task 3 CSS additions** to `style.css` — I scoped everything under `body.editor-mode` to avoid leaks, but this is a moderately large CSS chunk. In review I'd consider splitting `style.css` into `style.css` + `editor.css` — but that's a pattern change from the current single-sheet approach, so leaving as-is per "follow established patterns."

**6. Task 7's top-level import in main.js** — the existing `src/main.js` already uses ES modules and imports at the top; adding one more dynamic import inside an async IIFE is low-risk. Confirmed this pattern is supported by the existing browser targets.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-21-level-editor.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
