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

// Render
const out = document.getElementById('out');
const lines = results.map(r => {
  const status = r.pass ? 'PASS' : 'FAIL';
  const cls = r.pass ? 'pass' : 'fail';
  return `<span class="${cls}">${status}</span>  ${r.name}${r.err ? '  — ' + r.err : ''}`;
});
const summary = `${results.filter(r => r.pass).length}/${results.length} passing`;
out.innerHTML = [summary, '', ...lines].join('\n');
