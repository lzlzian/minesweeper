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

// -- state round-trip --
import {
  resetForNewRun, getSavePayload, applySavePayload,
  getLevel, getHp, getItems, getStashGold, getRulesetId,
  setLevel, damagePlayer, addGold, moveGoldToStash, consumeItem,
} from '../src/state.js';

test('save/load round-trip preserves run-scoped fields', () => {
  resetForNewRun();
  setLevel(5);
  damagePlayer(1);
  addGold(20);
  moveGoldToStash();
  consumeItem('potion');

  const snap = getSavePayload();

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
  const s1 = gridSizeForLevel(1);
  const s20 = gridSizeForLevel(20);
  if (s1 < 10 || s1 > 12) throw new Error(`level 1 size unexpected: ${s1}`);
  if (s20 < s1) throw new Error(`level 20 should be >= level 1`);
});

test('anchorCountForSize returns expected counts per size bracket', () => {
  assertEq(anchorCountForSize(10), 1);
  assertEq(anchorCountForSize(12), 1);
  assertEq(anchorCountForSize(14), 2);
  // Sizes >= 16 randomise between 2 and 3. Accept either.
  for (const s of [16, 18, 20]) {
    const n = anchorCountForSize(s);
    if (n !== 2 && n !== 3) throw new Error(`size ${s}: expected 2 or 3, got ${n}`);
  }
});

// -- board layout --
import { isReachable, findPath } from '../src/board/layout.js';
import { setGrid, setRows, setCols, setRevealed } from '../src/state.js';

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
  g[1][1].type = 'wall'; g[1][2].type = 'wall'; g[1][3].type = 'wall';
  g[2][1].type = 'wall';                         g[2][3].type = 'wall';
  g[3][1].type = 'wall'; g[3][2].type = 'wall'; g[3][3].type = 'wall';
  setGrid(g);
  if (isReachable(0, 0, 2, 2)) throw new Error('expected unreachable');
});

test('findPath returns a path ending at target', () => {
  setRows(5); setCols(5);
  setGrid(makeEmptyGrid(5, 5));
  // Reveal all cells so findPath can navigate
  const revealed = Array.from({ length: 5 }, () => Array(5).fill(true));
  setRevealed(revealed);
  const path = findPath(0, 0, 2, 2);
  if (!path || path.length === 0) throw new Error('expected path');
  const last = path[path.length - 1];
  if (last.r !== 2 || last.c !== 2) throw new Error('path does not end at target');
});

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

test('rollDiscountTier distribution within +/-5%', () => {
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
    const margin = n * 0.05; // +/-5% of total
    if (Math.abs(actual - expected) > margin) {
      throw new Error(`${tier.key}: expected ~${expected}, got ${actual}`);
    }
  }
});

// -- board generation --
import { countAdjacentGas } from '../src/board/generation.js';

test('countAdjacentGas counts gas and detonated neighbors', () => {
  setRows(3); setCols(3);
  const g = makeEmptyGrid(3, 3);
  g[0][0].type = 'gas';
  g[0][1].type = 'detonated';
  g[2][2].type = 'gas';
  setGrid(g);
  // Center (1,1) has 3 gas-ish neighbors
  assertEq(countAdjacentGas(1, 1), 3);
});

test('countAdjacentGas handles grid edges', () => {
  setRows(3); setCols(3);
  const g = makeEmptyGrid(3, 3);
  g[0][1].type = 'gas';
  setGrid(g);
  // Corner (0,0) has one gas neighbor
  assertEq(countAdjacentGas(0, 0), 1);
});

// -- editor: schema --
import {
  SCHEMA_VERSION, levelToJson, jsonToLevel,
} from '../src/editor/schema.js';
import { validateLevel } from '../src/editor/validation.js';

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
  if (parsed.errors.length === 0) throw new Error('expected errors');
});

test('schema: rejects cells grid size mismatch', () => {
  const lvl = makeMinimalLevel();
  lvl.cols = 7;
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

// -- editor: validation --

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

// -- solver --
import { solve, relocateFrontierGas } from '../src/solver.js';

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

// Render
const out = document.getElementById('out');
const lines = results.map(r => {
  const status = r.pass ? 'PASS' : 'FAIL';
  const cls = r.pass ? 'pass' : 'fail';
  return `<span class="${cls}">${status}</span>  ${r.name}${r.err ? '  — ' + r.err : ''}`;
});
const summary = `${results.filter(r => r.pass).length}/${results.length} passing`;
out.innerHTML = [summary, '', ...lines].join('\n');
