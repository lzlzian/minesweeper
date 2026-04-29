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
  getLevel, getHp, getItems, getStashGold, getRunGoldEarned, getRulesetId,
  getDebtCushionUsed, getMaxHp, getArtifacts, getGold, getHazardPayClaimed,
  setLevel, damagePlayer, addGold, moveGoldToStash, consumeItem, setMerchant,
  setHazardPayClaimed, setExit, setGameOver,
} from '../src/state.js';
import {
  captureSavedLevelState,
  clearSave,
  loadRun,
  restoreSavedLevelState,
  saveRun,
} from '../src/gameplay/level.js';
import {
  ARTIFACTS,
  DEBT_CUSHION_GOLD,
  EXIT_DIVIDEND_GOLD,
  FLAG_BOUNTY_GOLD, MERCHANT_DISCOUNT_PERCENT,
  PAYMENT_DISCOUNT_PERCENT,
  artifactById,
  artifactPaymentAmount,
  canUseDebtCushion,
  grantArtifact,
  isArtifactCadenceLevel,
  merchantArtifactPrice,
  randomArtifactChoices,
  settleExitDividend,
  settleEndLevelHeal,
  settleFlagBounty,
  settleHazardPay,
  useDebtCushion,
} from '../src/gameplay/artifacts.js';
import { showShopOverlay } from '../src/ui/shop.js';
import { showArtifactFoundOverlay } from '../src/ui/overlay.js';

test('save/load round-trip preserves run-scoped fields', () => {
  resetForNewRun();
  setLevel(5);
  damagePlayer(1);
  addGold(20);
  moveGoldToStash();
  consumeItem('potion');
  grantArtifact('flag_bounty');

  const snap = getSavePayload();

  setLevel(99);
  damagePlayer(2);
  addGold(1000);

  applySavePayload(snap);

  assertEq(getLevel(), 5);
  assertEq(getHp(), 2);
  assertEq(getStashGold(), 20);
  assertEq(getRunGoldEarned(), 20);
  assertEq(getArtifacts().includes('flag_bounty'), true);
  assertEq(getItems().potion, 0);
});

test('run save includes the active generated level snapshot', () => {
  clearSave();
  resetForNewRun();
  setLevel(2);
  addGold(17);
  setHazardPayClaimed(true);
  setRows(2); setCols(2);
  setPlayerPosition(0, 1);
  setExit({ r: 1, c: 1 });
  const g = makeEmptyGrid(2, 2);
  g[1][1].type = 'gas';
  g[0][1].preview = 'merchant';
  setGrid(g);
  setRevealed([
    [true, true],
    [false, false],
  ]);
  setFlagged([
    [false, false],
    [true, false],
  ]);
  setMerchant({
    r: 0,
    c: 1,
    rerollCount: 1,
    stock: [{ type: 'potion', basePrice: 100, discountKey: 'full', price: 100, sold: true }],
  });

  saveRun();
  const save = loadRun();
  assertEq(save.level, 2);
  assertEq(save.gold, 17);
  assertEq(save.hazardPayClaimed, true);
  assertEq(save.levelState.rows, 2);
  assertEq(save.levelState.player.r, 0);
  assertEq(save.levelState.player.c, 1);
  assertEq(save.levelState.grid[1][1].type, 'gas');
  assertEq(save.levelState.flagged[1][0], true);
  assertEq(save.levelState.merchant.stock[0].sold, true);
  clearSave();
});

test('saved level snapshot restores board state without generation', () => {
  resetForNewRun();
  setRows(2); setCols(2);
  setPlayerPosition(1, 0);
  setExit({ r: 0, c: 1 });
  const g = makeEmptyGrid(2, 2);
  g[0][1].type = 'gold';
  g[0][1].goldValue = 55;
  setGrid(g);
  setRevealed([
    [false, true],
    [true, false],
  ]);
  setFlagged([
    [false, false],
    [false, true],
  ]);
  const snapshot = captureSavedLevelState();

  setRows(1); setCols(1);
  setPlayerPosition(0, 0);
  setExit({ r: 0, c: 0 });
  setGrid(makeEmptyGrid(1, 1));
  setRevealed([[true]]);
  setFlagged([[false]]);

  assertEq(restoreSavedLevelState(snapshot), true);
  assertEq(getGrid().length, 2);
  assertEq(getGrid()[0][1].type, 'gold');
  assertEq(getGrid()[0][1].goldValue, 55);
  assertEq(getRevealed()[0][1], true);
  assertEq(getFlagged()[1][1], true);
});

test('resetForNewRun restores defaults', () => {
  damagePlayer(2);
  addGold(500);
  resetForNewRun();
  assertEq(getHp(), 3);
  assertEq(getItems().potion, 1);
  assertEq(getStashGold(), 0);
  assertEq(getRunGoldEarned(), 0);
  assertEq(getArtifacts().length, 0);
  assertEq(getMaxHp(), 3);
  assertEq(getHazardPayClaimed(), false);
});

test('max HP artifact increases current and max HP', () => {
  resetForNewRun();
  damagePlayer(1);
  const artifact = grantArtifact('max_hp');
  assertEq(artifact.name, 'Spare Heart');
  assertEq(getMaxHp(), 4);
  assertEq(getHp(), 3);
});

test('merchant discount artifact reduces prices by five percent', () => {
  resetForNewRun();
  assertEq(merchantArtifactPrice(100), 100);
  grantArtifact('merchant_discount');
  assertEq(MERCHANT_DISCOUNT_PERCENT, 5);
  assertEq(merchantArtifactPrice(100), 95);
  assertEq(merchantArtifactPrice(1), 1);
});

test('baseline conveniences are no longer artifact rewards', () => {
  resetForNewRun();
  assertEq(grantArtifact('gold_magnet'), null);
  assertEq(grantArtifact('chord_reveal'), null);
  assertEq(getArtifacts().length, 0);
});

test('artifact pool includes the expanded non-baseline rewards', () => {
  const ids = new Set(ARTIFACTS.map(artifact => artifact.id));
  assertEq(ARTIFACTS.length, 20);
  for (const id of [
    'wide_pockets',
    'black_market_ledger',
    'branch_lantern',
    'pocket_pickaxe',
    'hazard_pay',
    'miners_map',
    'lucky_receipt',
    'exit_dividend',
    'debt_cushion',
    'joker_choice',
  ]) {
    if (!ids.has(id)) throw new Error(`missing artifact ${id}`);
  }
});

test('Joker choice offers unowned artifact options', () => {
  resetForNewRun();
  grantArtifact('flag_bounty');
  const choices = randomArtifactChoices(2);
  assertEq(choices.length, 2);
  if (choices.some(choice => choice.id === 'flag_bounty')) throw new Error('choice included owned artifact');
});

test('three-level cadence artifacts use levels 1, 4, 7 pattern', () => {
  assertEq(isArtifactCadenceLevel(1), true);
  assertEq(isArtifactCadenceLevel(2), false);
  assertEq(isArtifactCadenceLevel(4), true);
  assertEq(isArtifactCadenceLevel(7), true);
});

test('merchant menu shows Counterfeit Coupon discount', () => {
  resetForNewRun();
  grantArtifact('merchant_discount');
  addGold(1000);
  setMerchant({
    r: 0,
    c: 0,
    rerollCount: 0,
    stock: [{ type: 'potion', basePrice: 100, discountKey: 'full', price: 100, sold: false }],
  });
  showShopOverlay();
  const text = document.getElementById('overlay-content').textContent;
  if (!text.includes('Counterfeit Coupon: -5%')) throw new Error('missing coupon note');
  if (!text.includes('Coupon -5%')) throw new Error('missing per-slot coupon chip');
  if (!text.includes('95g')) throw new Error('missing discounted price');
});

test('artifact HUD renders tooltip-enabled icons', () => {
  resetForNewRun();
  grantArtifact('flag_bounty');
  updateHud();
  const display = document.getElementById('artifact-display');
  const token = display.querySelector('.artifact-token[data-artifact-id="flag_bounty"]');
  if (!token) throw new Error('missing artifact icon token');
  assertEq(token.textContent, '🚩');
  if (!display.textContent.includes('Artifacts:')) throw new Error('missing artifact label');
  if (!token.getAttribute('aria-label').includes('Flag Bounty')) throw new Error('missing artifact aria label');
});

test('artifact found overlay shows gained artifact details', () => {
  showArtifactFoundOverlay(artifactById('flag_bounty'));
  const content = document.getElementById('overlay-content');
  const text = content.textContent;
  if (!text.includes('Artifact found')) throw new Error('missing artifact found kicker');
  if (!text.includes('Flag Bounty')) throw new Error('missing artifact name');
  if (!text.includes('correct gas flags pay 2g')) throw new Error('missing artifact description');
  if (!content.querySelector('[data-act="close-artifact"]')) throw new Error('missing continue button');
});

test('Safety Dividend heals one HP after level clear', () => {
  resetForNewRun();
  damagePlayer(2);
  grantArtifact('end_heal');
  const result = settleEndLevelHeal();
  assertEq(result.amount, 1);
  assertEq(getHp(), 2);
});

test('Hazard Pay pays once per level', () => {
  resetForNewRun();
  grantArtifact('hazard_pay');
  const first = settleHazardPay();
  const second = settleHazardPay();
  assertEq(first.amount, 25);
  assertEq(second, null);
  assertEq(getGold(), 25);
});

test('Exit Dividend pays only when clearing at full HP', () => {
  resetForNewRun();
  grantArtifact('exit_dividend');
  const paid = settleExitDividend();
  assertEq(paid.amount, EXIT_DIVIDEND_GOLD);
  assertEq(getGold(), EXIT_DIVIDEND_GOLD);

  resetForNewRun();
  grantArtifact('exit_dividend');
  damagePlayer(1);
  assertEq(settleExitDividend(), null);
});

test('Debt Cushion covers one small payment shortfall', () => {
  resetForNewRun();
  grantArtifact('debt_cushion');
  assertEq(canUseDebtCushion(DEBT_CUSHION_GOLD), true);
  assertEq(useDebtCushion(DEBT_CUSHION_GOLD), true);
  assertEq(getDebtCushionUsed(), true);
  assertEq(getStashGold(), 0);
  assertEq(useDebtCushion(1), false);

  resetForNewRun();
  grantArtifact('debt_cushion');
  assertEq(canUseDebtCushion(DEBT_CUSHION_GOLD + 1), false);
});

// -- leaderboard --
import { rankLeaderboard } from '../src/gameplay/leaderboard.js';

test('leaderboard ranks by level reached then total gold', () => {
  const ranked = rankLeaderboard([
    { levelReached: 3, totalGold: 900, cause: 'death', endedAt: '2026-01-01T00:00:00.000Z' },
    { levelReached: 5, totalGold: 100, cause: 'death', endedAt: '2026-01-02T00:00:00.000Z' },
  ], {
    levelReached: 5,
    totalGold: 300,
    cause: 'payment',
    endedAt: '2026-01-03T00:00:00.000Z',
  });
  assertEq(ranked[0].levelReached, 5);
  assertEq(ranked[0].totalGold, 300);
  assertEq(ranked[1].levelReached, 5);
  assertEq(ranked[1].totalGold, 100);
  assertEq(ranked[2].levelReached, 3);
});

test('leaderboard keeps only ten entries', () => {
  const entries = [];
  for (let i = 1; i <= 12; i++) {
    entries.push({ levelReached: i, totalGold: i * 10, cause: 'death', endedAt: `2026-01-${String(i).padStart(2, '0')}T00:00:00.000Z` });
  }
  const ranked = rankLeaderboard(entries, { levelReached: 2, totalGold: 999, cause: 'death', endedAt: '2026-02-01T00:00:00.000Z' });
  assertEq(ranked.length, 10);
  assertEq(ranked[0].levelReached, 12);
  assertEq(ranked[9].levelReached, 3);
});

// -- quota --
import {
  isFinalRunLevel,
  isPostPaymentRewardLevel,
  MAX_RUN_LEVEL,
  nextPaymentForLevel,
  paymentAmountForLevel,
} from '../src/gameplay/quota.js';

test('payment schedule charges checkpoint deltas', () => {
  assertEq(paymentAmountForLevel(1), 0);
  assertEq(paymentAmountForLevel(3), 120);
  assertEq(paymentAmountForLevel(6), 240);
  assertEq(paymentAmountForLevel(9), 420);
  assertEq(paymentAmountForLevel(12), 600);
  assertEq(paymentAmountForLevel(15), 780);
  assertEq(paymentAmountForLevel(18), 960);
  assertEq(paymentAmountForLevel(21), 1140);
  assertEq(paymentAmountForLevel(24), 1320);
  assertEq(paymentAmountForLevel(27), 1500);
  assertEq(paymentAmountForLevel(30), 1680);
});

test('Exit Clause reduces payments by ten percent', () => {
  resetForNewRun();
  assertEq(artifactPaymentAmount(120), 120);
  grantArtifact('payment_discount');
  assertEq(PAYMENT_DISCOUNT_PERCENT, 10);
  assertEq(artifactPaymentAmount(120), 108);
  assertEq(artifactPaymentAmount(420), 378);
});

test('next payment display follows the current level bracket', () => {
  assertEq(nextPaymentForLevel(1).level, 3);
  assertEq(nextPaymentForLevel(3).amount, 120);
  assertEq(nextPaymentForLevel(4).level, 6);
  assertEq(nextPaymentForLevel(7).level, 9);
  assertEq(nextPaymentForLevel(19).level, 21);
  assertEq(nextPaymentForLevel(19).amount, 1140);
  assertEq(nextPaymentForLevel(28).level, 30);
  assertEq(nextPaymentForLevel(30).amount, 1680);
});

test('post-payment reward levels line up with guaranteed Joker levels', () => {
  for (const level of [4, 7, 10, 13, 16, 19, 22, 25, 28]) {
    assertEq(isPostPaymentRewardLevel(level), true, `expected level ${level} to be post-payment`);
  }
  for (const level of [1, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15, 30]) {
    assertEq(isPostPaymentRewardLevel(level), false, `expected level ${level} not to be post-payment`);
  }
});

test('run cap is level 30', () => {
  assertEq(MAX_RUN_LEVEL, 30);
  assertEq(isFinalRunLevel(29), false);
  assertEq(isFinalRunLevel(30), true);
  assertEq(isFinalRunLevel(31), true);
});

// -- rulesets --
import { RULESETS, weightedPick, gridSizeForLevel, anchorCountForSize } from '../src/rulesets.js';

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

test('rulesets registry excludes legacy treasure chamber map', () => {
  if (RULESETS.some(r => r.id === 'treasure_chamber')) {
    throw new Error('legacy treasure_chamber ruleset should not run on regional boards');
  }
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
import {
  getGrid, getRevealed, getFlagged,
  setGrid, setRows, setCols, setRevealed, setFlagged,
  setBiomeOverrides, setFountain, setPlayerPosition,
} from '../src/state.js';
import { collectAt, collectRevealedGold, handleRightClick } from '../src/gameplay/interaction.js';
import { renderGrid, updateHud } from '../src/ui/render.js';

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

test('revealed loose gold flies to player, but revealed chests stay put', () => {
  resetForNewRun();
  setRows(2); setCols(3);
  setPlayerPosition(0, 0);
  const g = makeEmptyGrid(2, 3);
  g[1][1].type = 'gold';
  g[1][1].goldValue = 10;
  g[1][2].type = 'gold';
  g[1][2].goldValue = 30;
  g[1][2].chest = true;
  setGrid(g);
  setRevealed([
    [true, false, false],
    [false, true, true],
  ]);
  setFlagged([
    [false, false, false],
    [false, false, false],
  ]);
  renderGrid();
  if (!document.querySelector('.cell.gold')) throw new Error('expected revealed gold before magnet pickup');
  const total = collectRevealedGold();
  assertEq(total, 10);
  if (!document.querySelector('.magnet-gold')) throw new Error('expected flying magnet gold element');
  assertEq(getGold(), 10);
  assertEq(getGrid()[1][1].goldValue, 0);
  assertEq(getGrid()[1][2].goldValue, 30);
  assertEq(getGrid()[1][2].chest, true);
  document.querySelectorAll('.magnet-gold').forEach(el => el.remove());
});

test('Mystery Chests can contain an item instead of gold', () => {
  resetForNewRun();
  setRows(1); setCols(1);
  setPlayerPosition(0, 0);
  const g = makeEmptyGrid(1, 1);
  g[0][0].type = 'gold';
  g[0][0].goldValue = 25;
  g[0][0].chest = true;
  setGrid(g);
  grantArtifact('chest_items');
  const orig = Math.random;
  Math.random = () => 0;
  try {
    collectAt(0, 0);
  } finally {
    Math.random = orig;
  }
  assertEq(getGold(), 0);
  assertEq(getItems().potion, 2);
  assertEq(getGrid()[0][0].goldValue, 0);
});

test('Lucky Receipt increases chest gold by twenty-five percent', () => {
  resetForNewRun();
  setRows(1); setCols(1);
  setPlayerPosition(0, 0);
  const g = makeEmptyGrid(1, 1);
  g[0][0].type = 'gold';
  g[0][0].goldValue = 100;
  g[0][0].chest = true;
  setGrid(g);
  grantArtifact('lucky_receipt');
  collectAt(0, 0);
  assertEq(getGold(), 125);
  assertEq(getGrid()[0][0].goldValue, 0);
});

test('Overflow Flask makes full-HP fountain grant an item instead', () => {
  resetForNewRun();
  setRows(1); setCols(1);
  const g = makeEmptyGrid(1, 1);
  g[0][0].type = 'fountain';
  setGrid(g);
  setFountain({ r: 0, c: 0, used: false });
  grantArtifact('fountain_item');
  const orig = Math.random;
  Math.random = () => 0;
  try {
    collectAt(0, 0);
  } finally {
    Math.random = orig;
  }
  assertEq(getItems().potion, 2);
  assertEq(getGrid()[0][0].type, 'fountain');
});

test('stepping onto a branch merchant opens the shop overlay', () => {
  resetForNewRun();
  setRows(1); setCols(1);
  setPlayerPosition(0, 0);
  const g = makeEmptyGrid(1, 1);
  g[0][0].preview = 'merchant';
  setGrid(g);
  setMerchant({
    r: 0,
    c: 0,
    rerollCount: 0,
    stock: [{ type: 'potion', basePrice: 100, discountKey: 'full', price: 100, sold: false }],
  });
  const result = collectAt(0, 0);
  assertEq(result.kind, 'merchant');
  const text = document.getElementById('overlay-content').textContent;
  if (!text.includes('Merchant')) throw new Error('expected merchant shop overlay');
  assertEq(getGrid()[0][0].preview, null);
});

// -- merchant --
import {
  priceFromTier, rollDiscountTier, DISCOUNT_TIERS,
  merchantEffectiveRerollCost, merchantRerollCost, rollMerchantStock,
} from '../src/gameplay/merchant.js';

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

test('merchantRerollCost scales as a serious gold sink', () => {
  assertEq(merchantRerollCost(0), 40);
  assertEq(merchantRerollCost(1), 80);
  assertEq(merchantRerollCost(2), 120);
  assertEq(merchantRerollCost(3), 160);
});

test('House Dice makes the first merchant reroll free', () => {
  resetForNewRun();
  assertEq(merchantEffectiveRerollCost(0), 40);
  grantArtifact('free_reroll');
  assertEq(merchantEffectiveRerollCost(0), 0);
  assertEq(merchantEffectiveRerollCost(1), 80);
});

test('Black Market Ledger adds two merchant stock slots', () => {
  resetForNewRun();
  assertEq(rollMerchantStock().length, 10);
  grantArtifact('black_market_ledger');
  assertEq(rollMerchantStock().length, 12);
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
import {
  countAdjacentGas,
  generateRegionalGrid, countBranchEntrances, validateRegionalGeneration,
  getRegionalMetrics, regionalGoldBudgetsForLevel,
} from '../src/board/generation.js';

function solveRegionalBoard(meta, start, exit, rows, cols) {
  const revealed = emptyGrid(rows, cols);
  const flagged = emptyGrid(rows, cols);
  revealed[start.r][start.c] = true;
  syncRevealedZeroCascades(getGrid(), rows, cols, revealed);
  const exclude = [
    ...(meta.protectedCells || []),
    ...(meta.rewardCells || []),
  ];
  const repaired = makeSolvable(getGrid(), rows, cols, revealed, flagged, start, exit, {
    maxFixAttempts: 30,
    exclude,
  });
  if (repaired.fixups > 0) {
    syncRevealedZeroCascades(getGrid(), rows, cols, revealed);
  }
  const solved = solve(getGrid(), rows, cols, revealed, flagged, start, exit);
  return { repaired, solved };
}

function branchTargetReachable(branch) {
  const target = branch.rewardCells[0] ?? branch.featureCell;
  if (!branch.entrance || !target) return true;
  const keys = new Set(branch.cells.map(cell => `${cell.r},${cell.c}`));
  const visited = new Set([`${branch.entrance.r},${branch.entrance.c}`]);
  const queue = [branch.entrance];
  while (queue.length) {
    const current = queue.shift();
    if (current.r === target.r && current.c === target.c) return true;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = current.r + dr;
        const nc = current.c + dc;
        const key = `${nr},${nc}`;
        if (!keys.has(key) || visited.has(key)) continue;
        const cell = getGrid()[nr][nc];
        if (cell.type === 'wall' || cell.type === 'gas') continue;
        visited.add(key);
        queue.push({ r: nr, c: nc });
      }
    }
  }
  return false;
}

function branchCellDepth(branch, cell) {
  if (!branch.root || !branch.entrance || !cell) return 0;
  const dir = {
    r: Math.sign(branch.entrance.r - branch.root.r),
    c: Math.sign(branch.entrance.c - branch.root.c),
  };
  if (dir.r !== 0) return (cell.r - branch.root.r) * dir.r;
  return (cell.c - branch.root.c) * dir.c;
}

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

test('right-clicking a solved number flags all remaining hidden gas cells', () => {
  resetForNewRun();
  setGameOver(false);
  setRows(3); setCols(3);
  const g = makeEmptyGrid(3, 3);
  g[1][1].adjacent = 2;
  g[0][0].type = 'gas';
  g[2][2].type = 'gas';
  setGrid(g);
  setRevealed([
    [false, true, true],
    [true, true, true],
    [true, true, false],
  ]);
  setFlagged([
    [false, false, false],
    [false, false, false],
    [false, false, false],
  ]);
  handleRightClick(1, 1);
  assertEq(getFlagged()[0][0], true);
  assertEq(getFlagged()[2][2], true);
});

test('right-click flag shortcut counts triggered gas as known gas', () => {
  resetForNewRun();
  setGameOver(false);
  setRows(3); setCols(3);
  const g = makeEmptyGrid(3, 3);
  g[1][1].adjacent = 2;
  g[0][0].type = 'detonated';
  g[0][1].type = 'gas';
  setGrid(g);
  setRevealed([
    [true, false, true],
    [true, true, true],
    [true, true, true],
  ]);
  setFlagged([
    [false, false, false],
    [false, false, false],
    [false, false, false],
  ]);
  handleRightClick(1, 1);
  assertEq(getFlagged()[0][0], false);
  assertEq(getFlagged()[0][1], true);
});

test('regional gold budgets scale into late game', () => {
  assertEq(regionalGoldBudgetsForLevel(1).optional, 52);
  assertEq(regionalGoldBudgetsForLevel(5).optional, 78);
  assertEq(regionalGoldBudgetsForLevel(9).optional, 100);
  assertEq(regionalGoldBudgetsForLevel(12).optional, 135);
  assertEq(regionalGoldBudgetsForLevel(21).optional, 240);
  assertEq(regionalGoldBudgetsForLevel(30).optional, 345);
  assertEq(regionalGoldBudgetsForLevel(30).feature, 106);
});

test('flag bounty artifact pays correct flags and charges wrong flags', () => {
  resetForNewRun();
  setRows(2); setCols(2);
  const g = makeEmptyGrid(2, 2);
  g[0][0].type = 'gas';
  g[1][0].type = 'gas';
  setGrid(g);
  setFlagged([
    [true, true],
    [true, false],
  ]);
  grantArtifact('flag_bounty');
  addGold(20);
  const result = settleFlagBounty();
  assertEq(FLAG_BOUNTY_GOLD, 2);
  assertEq(result.correct, 2);
  assertEq(result.incorrect, 1);
  assertEq(result.earned, 4);
  assertEq(result.penalty, 2);
  assertEq(result.net, 2);
  assertEq(getGold(), 22);
  assertEq(getRunGoldEarned(), 22);
});

test('regional generator creates connected spine and one branch entrance', () => {
  setRows(10); setCols(10);
  setBiomeOverrides({ guaranteedItemDrops: 0 });
  const start = { r: 0, c: 0 };
  const exit = { r: 9, c: 9 };
  try {
    let accepted = null;
    for (let attempt = 0; attempt < 30 && !accepted; attempt++) {
      const meta = generateRegionalGrid({ level: 1, start, exit });
      const branch = meta.regions.find(region => region.kind === 'branch');
      if (!branch) continue;
      const { repaired, solved } = solveRegionalBoard(meta, start, exit, 10, 10);
      if (repaired.solved && solved.solved) accepted = { meta, branch };
    }
    if (!accepted) throw new Error('expected deducible start-to-exit spine');
    const { meta, branch } = accepted;
    assertEq(countBranchEntrances(meta, branch), 1);
    const entranceCell = getGrid()[branch.entrance.r][branch.entrance.c];
    if (entranceCell.adjacent <= 0) throw new Error('expected numbered airlock entrance');
  } finally {
    setBiomeOverrides(null);
  }
});

test('regional generator caps compact branch pressure by priority', () => {
  setRows(10); setCols(10);
  setBiomeOverrides(null);
  try {
    const meta = generateRegionalGrid({
      level: 1,
      start: { r: 0, c: 0 },
      exit: { r: 9, c: 9 },
      features: {
        merchant: true,
        fountain: true,
        joker: true,
        itemDropCount: 1,
      },
    });
    assertEq(meta.branchCapacity, 2);
    assertEq(meta.activeFeatures.joker, true);
    assertEq(meta.activeFeatures.merchant, true);
    assertEq(meta.activeFeatures.fountain, false);
    assertEq(meta.activeFeatures.itemDrop, false);
    assertEq(meta.requestedItemDrops, 0);
    if (!meta.suppressedBranchPlans.includes('fountain')) throw new Error('expected fountain to be suppressed');
    if (!meta.suppressedBranchPlans.includes('item')) throw new Error('expected item to be suppressed');
    if (!meta.regions.some(region => region.purpose === 'gold')) throw new Error('missing gold branch');
  } finally {
    setBiomeOverrides(null);
  }
});

test('regional generator prioritizes gold and joker under branch pressure', () => {
  setRows(10); setCols(10);
  setBiomeOverrides(null);
  try {
    let accepted = null;
    for (let attempt = 0; attempt < 30 && !accepted; attempt++) {
      const meta = generateRegionalGrid({
        level: 1,
        start: { r: 0, c: 0 },
        exit: { r: 9, c: 9 },
        features: {
          merchant: true,
          fountain: true,
          joker: true,
          itemDropCount: 1,
        },
      });
      const purposes = new Set(meta.regions.map(region => region.purpose));
      if (purposes.has('gold') && purposes.has('joker')) accepted = meta;
    }
    if (!accepted) throw new Error('expected gold and joker branches to fit compact board');
  } finally {
    setBiomeOverrides(null);
  }
});

test('regional validation rejects branch reward revealed by spine solve', () => {
  setRows(10); setCols(10);
  setBiomeOverrides({ guaranteedItemDrops: 0 });
  try {
    let meta = null;
    let branch = null;
    for (let attempt = 0; attempt < 30 && !branch; attempt++) {
      meta = generateRegionalGrid({
        level: 1,
        start: { r: 0, c: 0 },
        exit: { r: 9, c: 9 },
      });
      branch = meta.regions.find(region => region.kind === 'branch');
    }
    if (!branch) throw new Error('expected branch region');
    const revealed = emptyGrid(10, 10);
    const reward = branch.rewardCells[0];
    revealed[reward.r][reward.c] = true;
    const res = validateRegionalGeneration(meta, revealed);
    if (res.ok) throw new Error('expected reward leak rejection');
  } finally {
    setBiomeOverrides(null);
  }
});

test('regional generator validates mirrored corners and optional gold bias', () => {
  setBiomeOverrides({ guaranteedItemDrops: 0 });
  try {
    for (const size of [10, 14, 20]) {
      const starts = [
        { r: 0, c: 0 },
        { r: 0, c: size - 1 },
        { r: size - 1, c: 0 },
        { r: size - 1, c: size - 1 },
      ];
      for (const start of starts) {
        const exit = { r: size - 1 - start.r, c: size - 1 - start.c };
        let accepted = null;
        for (let attempt = 0; attempt < 180 && !accepted; attempt++) {
          setRows(size); setCols(size);
          const level = size <= 10 ? 1 : (size <= 14 ? 5 : 13);
          const meta = generateRegionalGrid({ level, start, exit });
          if (!meta.regions.some(region => region.purpose === 'gold')) continue;
          const { repaired, solved } = solveRegionalBoard(meta, start, exit, size, size);
          const check = validateRegionalGeneration(meta, solved.revealed);
          if (repaired.solved && solved.solved && check.ok) accepted = { meta, solved };
        }
        if (!accepted) throw new Error(`expected solved spine for ${size} ${start.r},${start.c}`);
        const metrics = getRegionalMetrics(accepted.meta, accepted.solved.revealed);
        if (metrics.optionalGold <= metrics.spineGold) {
          throw new Error(`expected optional gold > spine gold, got ${metrics.optionalGold} <= ${metrics.spineGold}`);
        }
      }
    }
  } finally {
    setBiomeOverrides(null);
  }
});

test('regional generator expands lone gold branch on large boards', () => {
  setRows(20); setCols(20);
  setBiomeOverrides({ guaranteedItemDrops: 0 });
  try {
    let largest = 0;
    for (let attempt = 0; attempt < 20; attempt++) {
      const meta = generateRegionalGrid({
        level: 13,
        start: { r: 0, c: 0 },
        exit: { r: 19, c: 19 },
      });
      const gold = meta.regions.find(region => region.purpose === 'gold');
      largest = Math.max(largest, gold?.cells.length ?? 0);
    }
    if (largest < 40) {
      throw new Error(`expected expanded large-board gold branch, largest=${largest}`);
    }
  } finally {
    setBiomeOverrides(null);
  }
});

test('Prospector Cache adds an extra chest to gold branches', () => {
  resetForNewRun();
  grantArtifact('extra_chest');
  setRows(20); setCols(20);
  setBiomeOverrides({ guaranteedItemDrops: 0 });
  try {
    let accepted = null;
    for (let attempt = 0; attempt < 30 && !accepted; attempt++) {
      const meta = generateRegionalGrid({
        level: 13,
        start: { r: 0, c: 0 },
        exit: { r: 19, c: 19 },
      });
      const branch = meta.regions.find(region => region.purpose === 'gold');
      if (!branch) continue;
      const chests = branch.cells.filter(cell => getGrid()[cell.r][cell.c].chest).length;
      if (chests >= 2) accepted = { branch, chests };
    }
    if (!accepted) throw new Error('expected gold branch with at least two chests');
  } finally {
    setBiomeOverrides(null);
    resetForNewRun();
  }
});

test('regional generator structures large branch interiors', () => {
  setRows(20); setCols(20);
  setBiomeOverrides({ guaranteedItemDrops: 0 });
  try {
    let accepted = null;
    for (let attempt = 0; attempt < 30 && !accepted; attempt++) {
      const meta = generateRegionalGrid({
        level: 13,
        start: { r: 0, c: 0 },
        exit: { r: 19, c: 19 },
      });
      const branch = meta.regions.find(region => region.purpose === 'gold');
      if (!branch || branch.cells.length < 40) continue;
      let walls = 0;
      let gas = 0;
      for (const cell of branch.cells) {
        const type = getGrid()[cell.r][cell.c].type;
        if (type === 'wall') walls++;
        if (type === 'gas') gas++;
      }
      if (walls >= 6 && gas >= 5 && branchTargetReachable(branch)) {
        accepted = { branch, walls, gas };
      }
    }
    if (!accepted) {
      throw new Error('expected large branch with internal walls, gas, and reachable reward');
    }
  } finally {
    setBiomeOverrides(null);
  }
});

test('regional generator keeps branch entry safe and pushes risk deeper', () => {
  setRows(20); setCols(20);
  setBiomeOverrides({ guaranteedItemDrops: 0 });
  try {
    let accepted = null;
    for (let attempt = 0; attempt < 40 && !accepted; attempt++) {
      const meta = generateRegionalGrid({
        level: 13,
        start: { r: 0, c: 0 },
        exit: { r: 19, c: 19 },
      });
      const branch = meta.regions.find(region => region.purpose === 'gold');
      if (!branch || branch.cells.length < 40 || (branch.tags?.branch_foyer?.length ?? 0) < 2) continue;
      const entryDepth = (branch.sizePlan?.corridorLen ?? 1) + 1;
      const entryClear = branch.cells
        .filter(cell => branchCellDepth(branch, cell) <= entryDepth)
        .every(cell => {
          const type = getGrid()[cell.r][cell.c].type;
          return type !== 'gas' && type !== 'wall';
        });
      const internalGas = branch.internalGasCells ?? [];
      const deepGas = internalGas.length >= 3 &&
        internalGas.every(cell => branchCellDepth(branch, cell) > entryDepth);
      if (entryClear && deepGas) accepted = branch;
    }
    if (!accepted) {
      throw new Error('expected branch with clear entry foyer and deeper internal gas');
    }
  } finally {
    setBiomeOverrides(null);
  }
});

test('regional generator gives merchant and fountain isolated branches', () => {
  setBiomeOverrides({ guaranteedItemDrops: 0 });
  try {
    const size = 14;
    const start = { r: 0, c: 0 };
    const exit = { r: size - 1, c: size - 1 };
    let accepted = null;
    for (let attempt = 0; attempt < 120 && !accepted; attempt++) {
      setRows(size); setCols(size);
      const meta = generateRegionalGrid({
        level: 5,
        start,
        exit,
        features: { merchant: true, fountain: true },
      });
      if (meta.failedBranchPlans.includes('merchant') || meta.failedBranchPlans.includes('fountain')) continue;
      const { repaired, solved } = solveRegionalBoard(meta, start, exit, size, size);
      const check = validateRegionalGeneration(meta, solved.revealed);
      if (repaired.solved && solved.solved && check.ok) accepted = { meta, solved };
    }
    if (!accepted) throw new Error('expected merchant/fountain branch layout');
    for (const purpose of ['merchant', 'fountain']) {
      const branch = accepted.meta.regions.find(region => region.purpose === purpose);
      if (!branch) throw new Error(`missing ${purpose} branch`);
      assertEq(countBranchEntrances(accepted.meta, branch), 1);
      if (!branch.featureCell) throw new Error(`missing ${purpose} feature cell`);
      if (accepted.meta.spineCells.has(`${branch.featureCell.r},${branch.featureCell.c}`)) {
        throw new Error(`${purpose} feature landed on spine`);
      }
      if (accepted.solved.revealed[branch.featureCell.r][branch.featureCell.c]) {
        throw new Error(`${purpose} feature revealed by spine solve`);
      }
    }
  } finally {
    setBiomeOverrides(null);
  }
});

test('regional generator gives joker an isolated branch', () => {
  setBiomeOverrides({ guaranteedItemDrops: 0 });
  try {
    const size = 14;
    const start = { r: 0, c: 0 };
    const exit = { r: size - 1, c: size - 1 };
    let accepted = null;
    for (let attempt = 0; attempt < 120 && !accepted; attempt++) {
      setRows(size); setCols(size);
      const meta = generateRegionalGrid({
        level: 5,
        start,
        exit,
        features: { joker: true },
      });
      if (meta.failedBranchPlans.includes('joker')) continue;
      const { repaired, solved } = solveRegionalBoard(meta, start, exit, size, size);
      const check = validateRegionalGeneration(meta, solved.revealed);
      if (repaired.solved && solved.solved && check.ok) accepted = { meta, solved };
    }
    if (!accepted) throw new Error('expected joker branch layout');
    const branch = accepted.meta.regions.find(region => region.purpose === 'joker');
    if (!branch) throw new Error('missing joker branch');
    assertEq(countBranchEntrances(accepted.meta, branch), 1);
    if (!branch.featureCell) throw new Error('missing joker feature cell');
    if (accepted.meta.spineCells.has(`${branch.featureCell.r},${branch.featureCell.c}`)) {
      throw new Error('joker feature landed on spine');
    }
    if (accepted.solved.revealed[branch.featureCell.r][branch.featureCell.c]) {
      throw new Error('joker feature revealed by spine solve');
    }
  } finally {
    setBiomeOverrides(null);
  }
});

test('regional generator puts item drops in an isolated branch', () => {
  setBiomeOverrides({ guaranteedItemDrops: 0 });
  try {
    const size = 14;
    const start = { r: 0, c: 0 };
    const exit = { r: size - 1, c: size - 1 };
    let accepted = null;
    for (let attempt = 0; attempt < 50 && !accepted; attempt++) {
      setRows(size); setCols(size);
      const meta = generateRegionalGrid({
        level: 5,
        start,
        exit,
        features: { itemDropCount: 1 },
      });
      if (meta.failedBranchPlans.includes('item')) continue;
      const { repaired, solved } = solveRegionalBoard(meta, start, exit, size, size);
      const check = validateRegionalGeneration(meta, solved.revealed);
      if (repaired.solved && solved.solved && check.ok) accepted = { meta, solved };
    }
    if (!accepted) throw new Error('expected item branch layout');
    const branch = accepted.meta.regions.find(region => region.purpose === 'item');
    if (!branch) throw new Error('missing item branch');
    assertEq(countBranchEntrances(accepted.meta, branch), 1);
    const feature = branch.featureCell;
    if (!feature) throw new Error('missing item feature cell');
    const cell = getGrid()[feature.r][feature.c];
    if (!cell.item) throw new Error('expected item on item branch feature cell');
    assertEq(cell.preview, 'item');
    if (accepted.meta.spineCells.has(`${feature.r},${feature.c}`)) {
      throw new Error('item feature landed on spine');
    }
    if (accepted.solved.revealed[feature.r][feature.c]) {
      throw new Error('item feature revealed by spine solve');
    }
  } finally {
    setBiomeOverrides(null);
  }
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
import {
  solve, relocateFrontierGas, makeSolvable, syncRevealedZeroCascades,
} from '../src/solver.js';

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
    'P.......',
    '........',
    '........',
    '........',
    '...#.###',
    '...#*E##',
    '########',
    '........',
  ]);

  // First solve: confirms we start from the stuck state.
  const r1 = solve(b.grid, b.rows, b.cols, emptyGrid(b.rows, b.cols), emptyGrid(b.rows, b.cols), b.player, b.exit);
  assertEq(r1.solved, false);

  let gasBefore = 0;
  for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++)
    if (b.grid[r][c].type === 'gas') gasBefore++;

  const moved = relocateFrontierGas(
    b.grid, b.rows, b.cols, r1.revealed, r1.flagged, b.player, b.exit,
  );
  if (!moved) {
    const revealedRows = r1.revealed.map(row => row.map(v => v ? '1' : '.').join('')).join('/');
    const gasCells = [];
    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        if (b.grid[r][c].type === 'gas') gasCells.push(`${r},${c}`);
      }
    }
    throw new Error(`expected frontier gas move; solved=${r1.solved} steps=${r1.steps} gas=${gasCells.join(';')} revealed=${revealedRows}`);
  }

  let gasAfter = 0;
  for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++)
    if (b.grid[r][c].type === 'gas') gasAfter++;
  assertEq(gasAfter, gasBefore);

  // The old gas location is empty now and exit is reachable via cascade.
  const r2 = solve(b.grid, b.rows, b.cols, emptyGrid(b.rows, b.cols), emptyGrid(b.rows, b.cols), b.player, b.exit);
  assertEq(r2.solved, true);
});

test('makeSolvable converges on a board that starts unsolvable', () => {
  const b = buildBoard([
    'P.......',
    '........',
    '........',
    '........',
    '...#.###',
    '...#*E##',
    '########',
    '........',
  ]);
  const res = makeSolvable(
    b.grid, b.rows, b.cols,
    emptyGrid(b.rows, b.cols), emptyGrid(b.rows, b.cols),
    b.player, b.exit,
    { maxFixAttempts: 30 },
  );
  assertEq(res.solved, true);
  if (res.fixups < 1) throw new Error(`expected at least one fixup, got ${res.fixups}`);
});

test('makeSolvable returns solved=true with zero fixups on already-solvable board', () => {
  const b = buildBoard([
    'P.....',
    '......',
    '.....E',
  ]);
  const res = makeSolvable(
    b.grid, b.rows, b.cols,
    emptyGrid(3, 6), emptyGrid(3, 6),
    b.player, b.exit,
    { maxFixAttempts: 30 },
  );
  assertEq(res.solved, true);
  assertEq(res.fixups, 0);
});

test('syncRevealedZeroCascades expands stale revealed zeros before step validation', () => {
  const b = buildBoard([
    'P.*..',
    '.....',
    '....E',
    '.....',
    '.....',
  ]);
  const revealed = emptyGrid(5, 5);
  const flagged = emptyGrid(5, 5);

  // Mimic a post-fixup board where cells were already visible as numbers, then
  // became zeros after gas relocation. Before syncing zero cascades, the exit
  // is not actually connected through the visible graph.
  for (let r = 0; r <= 1; r++) {
    for (let c = 0; c <= 1; c++) {
      revealed[r][c] = true;
    }
  }
  revealed[2][2] = true;

  const before = solve(b.grid, b.rows, b.cols, revealed, flagged, b.player, b.exit);
  if (before.solved && before.steps === 0) {
    throw new Error('expected stale zero state not to be immediately solved before sync');
  }

  syncRevealedZeroCascades(b.grid, b.rows, b.cols, revealed);
  const after = solve(b.grid, b.rows, b.cols, revealed, flagged, b.player, b.exit);
  assertEq(after.solved, true);
  assertEq(after.steps, 0);
});

// -- editor: solvability --
import { checkSolvability } from '../src/editor/solvabilityCheck.js';

test('checkSolvability accepts a solvable editor level', () => {
  const rows = 5, cols = 5;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) row.push({ type: 'empty' });
    cells.push(row);
  }
  const res = checkSolvability({
    rows, cols, cells,
    playerStart: { r: 0, c: 0 },
    exit: { r: 4, c: 4 },
  });
  // All-empty board → cascade reveals everything → exit reachable.
  assertEq(res.solved, true);
});

test('checkSolvability rejects a walled-off editor level', () => {
  const rows = 5, cols = 5;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) row.push({ type: 'empty' });
    cells.push(row);
  }
  cells[3][3] = { type: 'wall' };
  cells[3][4] = { type: 'wall' };
  cells[4][3] = { type: 'wall' };
  const res = checkSolvability({
    rows, cols, cells,
    playerStart: { r: 0, c: 0 },
    exit: { r: 4, c: 4 },
  });
  // Exit is fully walled in — no path exists at all.
  assertEq(res.solved, false);
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
