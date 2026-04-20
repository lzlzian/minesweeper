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

test('anchorCountForSize monotonic non-decreasing', () => {
  const sizes = [10, 12, 14, 16, 18, 20];
  let prev = -1;
  for (const s of sizes) {
    const n = anchorCountForSize(s);
    if (n < prev) throw new Error(`anchor count decreased at size ${s}`);
    prev = n;
  }
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
