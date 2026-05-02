import {
  addGold,
  getFlagged,
  getGenMeta,
  getGold,
  getGrid,
  getLevel,
  getLevelStats,
  getOpenContracts,
  getRows,
  getCols,
  getStashGold,
  setOpenContracts,
  spendGold,
} from '../state.js';
import { artifactContractBuyIn, artifactContractPayout } from './artifacts.js';
import { biomeForLevel } from './biomes.js';

const CONTRACT_CHOICE_COUNT = 3;
export const CONTRACT_EXPIRES_AFTER = 3;
export const CONTRACT_BUY_IN_RATE = 0.40;

let contractSeq = 0;

function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function cellKey(r, c) {
  return `${r},${c}`;
}

function currentFlagKeys() {
  const keys = [];
  for (let r = 0; r < getRows(); r++) {
    for (let c = 0; c < getCols(); c++) {
      if (getFlagged()[r]?.[c]) keys.push(cellKey(r, c));
    }
  }
  return keys;
}

function branchCellKeySet() {
  const keys = new Set();
  for (const region of getGenMeta()?.regions ?? []) {
    if (region.kind !== 'branch') continue;
    for (const cell of region.cells ?? []) keys.add(cellKey(cell.r, cell.c));
  }
  return keys;
}

function countRemainingChests() {
  let total = 0;
  for (let r = 0; r < getRows(); r++) {
    for (let c = 0; c < getCols(); c++) {
      const cell = getGrid()[r]?.[c];
      if (cell?.type === 'gold' && cell.chest && cell.goldValue > 0) total++;
    }
  }
  return total;
}

function countGasCells({ branchOnly = false } = {}) {
  const branchKeys = branchOnly ? branchCellKeySet() : null;
  let total = 0;
  for (let r = 0; r < getRows(); r++) {
    for (let c = 0; c < getCols(); c++) {
      if (branchKeys && !branchKeys.has(cellKey(r, c))) continue;
      if (getGrid()[r]?.[c]?.type === 'gas') total++;
    }
  }
  return total;
}

function scoreNewFlags(startFlagKeys = []) {
  const baseline = new Set(startFlagKeys);
  const branchKeys = branchCellKeySet();
  const score = {
    flagsPlaced: 0,
    correctFlags: 0,
    wrongFlags: 0,
    branchCorrectFlags: 0,
    branchWrongFlags: 0,
  };

  for (let r = 0; r < getRows(); r++) {
    for (let c = 0; c < getCols(); c++) {
      if (!getFlagged()[r]?.[c]) continue;
      const key = cellKey(r, c);
      if (baseline.has(key)) continue;
      const type = getGrid()[r]?.[c]?.type;
      const correct = type === 'gas' || type === 'detonated';
      const inBranch = branchKeys.has(key);
      score.flagsPlaced++;
      if (correct) {
        score.correctFlags++;
        if (inBranch) score.branchCorrectFlags++;
      } else {
        score.wrongFlags++;
        if (inBranch) score.branchWrongFlags++;
      }
    }
  }
  return score;
}

function payout(base, level, multiplier = 1) {
  const biomeMultiplier = biomeForLevel(level)?.economy?.contractRewardMultiplier ?? 1;
  const levelScale = 1 + Math.max(0, level - 1) * 0.035;
  return Math.max(90, Math.round((base + level * 8) * levelScale * multiplier * biomeMultiplier));
}

function buyInForReward(reward, level) {
  const levelFee = Math.max(0, Math.floor(level / 5) * 5);
  return Math.max(20, Math.round(reward * CONTRACT_BUY_IN_RATE) + levelFee);
}

function withBuyIn(contract, level) {
  const adjustedPayout = artifactContractPayout(contract.payout);
  const expiresAfter = Math.max(1, Math.floor(contract.expiresAfter ?? CONTRACT_EXPIRES_AFTER));
  return {
    ...contract,
    expiresAfter,
    levelsRemaining: expiresAfter,
    payout: adjustedPayout,
    cost: artifactContractBuyIn(buyInForReward(adjustedPayout, level)),
  };
}

function flagTargetForLevel(level, gasCount) {
  return Math.max(1, Math.min(gasCount, Math.max(3, Math.floor(level / 10) + 3)));
}

export function randomContractChoices(count = CONTRACT_CHOICE_COUNT) {
  const level = getLevel();
  const gasCount = countGasCells();
  const branchGasCount = countGasCells({ branchOnly: true });
  const remainingChests = countRemainingChests();
  const flagTarget = flagTargetForLevel(level, Math.max(1, gasCount));
  const branchFlagTarget = branchGasCount > 0
    ? Math.max(1, Math.min(branchGasCount, Math.max(2, Math.floor(level / 12) + 2)))
    : 0;
  const chestTarget = remainingChests > 0
    ? Math.max(1, Math.min(4, Math.ceil(remainingChests * 0.65)))
    : 0;

  const choices = [
    {
      id: 'clean_exit',
      goal: 'clean_clear',
      icon: '🧼',
      name: 'Safety Record',
      desc: 'Clear one level without triggering gas. Fails if gas is triggered before it is completed.',
      payout: payout(65, level, 0.85),
      failOnTriggeredGas: true,
      expiresAfter: 3,
    },
    {
      id: 'tool_embargo',
      goal: 'tool_embargo',
      icon: '🧰',
      name: 'Tool Embargo',
      desc: 'Clear one level without using items. Fails if an item is used before it is completed.',
      payout: payout(60, level, 0.75),
      failOnItemsUsed: true,
      expiresAfter: 3,
    },
  ];

  if (gasCount > 0) {
    const cleanTarget = Math.max(1, Math.min(gasCount, Math.max(2, flagTarget - 1)));
    choices.push(
      {
        id: 'precision_quota',
        goal: 'flag_precision',
        icon: '🚩',
        name: 'Precision Quota',
        desc: `End a level with ${flagTarget} new correct gas flags and no more than 1 wrong flag.`,
        payout: payout(80 + flagTarget * 42, level, 1.05),
        target: flagTarget,
        maxWrongFlags: 1,
        failOnWrongFlags: true,
        expiresAfter: 3,
      },
      {
        id: 'risk_audit',
        goal: 'flag_risk',
        icon: '⚠️',
        name: 'Risk Audit',
        desc: `End a level with ${flagTarget} new correct gas flags. Fails if gas is triggered first.`,
        payout: payout(85 + flagTarget * 52, level, 1.20),
        target: flagTarget,
        failOnTriggeredGas: true,
        expiresAfter: 3,
      },
      {
        id: 'clean_paperwork',
        goal: 'flag_precision',
        icon: '📎',
        name: 'Clean Paperwork',
        desc: `End a level with ${cleanTarget} new correct gas flags and 0 wrong flags.`,
        payout: payout(70 + flagTarget * 46, level, 1.15),
        target: cleanTarget,
        maxWrongFlags: 0,
        failOnWrongFlags: true,
        expiresAfter: 3,
      },
    );
  }

  if (branchFlagTarget > 0) {
    choices.push({
      id: 'branch_audit',
      goal: 'branch_flags',
      icon: '📋',
      name: 'Branch Audit',
      desc: `End a level with ${branchFlagTarget} new correct gas flag${branchFlagTarget === 1 ? '' : 's'} inside side branches.`,
      payout: payout(95 + branchFlagTarget * 70, level, 1.20),
      target: branchFlagTarget,
      expiresAfter: 4,
    });
  }

  if (remainingChests > 0) {
    choices.push({
      id: 'chest_quota',
      goal: 'chests',
      icon: '🎁',
      name: 'Chest Audit',
      desc: `Open ${chestTarget} chest${chestTarget === 1 ? '' : 's'} in a single level before this expires.`,
      payout: payout(75 + chestTarget * 70, level, 1),
      target: chestTarget,
      expiresAfter: 3,
    });
  }

  return shuffle(choices.map(choice => withBuyIn(choice, level))).slice(0, Math.max(0, count));
}

export function acceptContract(contract) {
  if (!contract) return null;
  const cost = Math.max(0, Math.round(contract.cost ?? 0));
  if (getGold() + getStashGold() < cost) return null;
  if (cost > 0) spendGold(cost);
  const expiresAfter = Math.max(1, Math.floor(contract.expiresAfter ?? CONTRACT_EXPIRES_AFTER));
  const accepted = {
    ...contract,
    instanceId: contract.instanceId ?? `contract-${getLevel()}-${++contractSeq}`,
    status: 'open',
    cost,
    acceptedLevel: getLevel(),
    expiresAfter,
    levelsRemaining: Math.max(1, Math.floor(contract.levelsRemaining ?? expiresAfter)),
    startStats: getLevelStats(),
    startFlagKeys: currentFlagKeys(),
    lastScore: null,
  };
  setOpenContracts([...getOpenContracts(), accepted]);
  return accepted;
}

function currentLevelDelta(contract) {
  const stats = getLevelStats();
  const start = contract.startStats ?? {};
  return {
    triggeredGas: Math.max(0, (stats.triggeredGas ?? 0) - (start.triggeredGas ?? 0)),
    itemsUsed: Math.max(0, (stats.itemsUsed ?? 0) - (start.itemsUsed ?? 0)),
    chestsOpened: Math.max(0, (stats.chestsOpened ?? 0) - (start.chestsOpened ?? 0)),
    ...scoreNewFlags(contract.startFlagKeys ?? []),
  };
}

function contractGoalMet(contract, delta) {
  const goal = contract.goal ?? contract.id;
  if (goal === 'clean_clear' || goal === 'clean_exit') {
    return delta.triggeredGas === 0;
  }
  if (goal === 'tool_embargo') {
    return delta.itemsUsed === 0;
  }
  if (goal === 'flag_precision' || goal === 'flag_quota') {
    return (delta.correctFlags ?? 0) >= (contract.target ?? 1) &&
      (delta.wrongFlags ?? 0) <= (contract.maxWrongFlags ?? Infinity);
  }
  if (goal === 'flag_risk') {
    return (delta.correctFlags ?? 0) >= (contract.target ?? 1);
  }
  if (goal === 'branch_flags') {
    return (delta.branchCorrectFlags ?? 0) >= (contract.target ?? 1);
  }
  if (goal === 'chests' || goal === 'chest_quota') {
    return (delta.chestsOpened ?? 0) >= (contract.target ?? 1);
  }
  return false;
}

function contractViolationReason(contract, delta) {
  const goal = contract.goal ?? contract.id;
  if ((contract.failOnTriggeredGas || goal === 'clean_clear' || goal === 'clean_exit') && delta.triggeredGas > 0) return 'gas';
  if ((contract.failOnItemsUsed || goal === 'tool_embargo') && delta.itemsUsed > 0) return 'items';
  if (contract.failOnWrongFlags && delta.wrongFlags > (contract.maxWrongFlags ?? 0)) return 'wrong_flags';
  return null;
}

function refreshContractForNextLevel(contract, delta) {
  return {
    ...contract,
    levelsRemaining: Math.max(0, (contract.levelsRemaining ?? contract.expiresAfter ?? CONTRACT_EXPIRES_AFTER) - 1),
    lastScore: delta,
    startStats: { triggeredGas: 0, itemsUsed: 0, chestsOpened: 0 },
    startFlagKeys: [],
  };
}

function resultFor(contract, status, delta, extras = {}) {
  const success = status === 'complete' ? true : (status === 'failed' ? false : null);
  return {
    contract,
    status,
    success,
    payout: success ? contract.payout : 0,
    levelsRemaining: contract.levelsRemaining ?? 0,
    score: delta,
    ...extras,
  };
}

export function settleOpenContracts() {
  const contracts = getOpenContracts();
  if (!contracts.length) return [];
  const kept = [];
  const results = [];

  for (const contract of contracts) {
    const delta = currentLevelDelta(contract);
    const violation = contractViolationReason(contract, delta);
    if (violation) {
      results.push(resultFor({ ...contract, lastScore: delta }, 'failed', delta, { reason: violation }));
      continue;
    }

    if (contractGoalMet(contract, delta)) {
      addGold(contract.payout);
      results.push(resultFor({ ...contract, lastScore: delta }, 'complete', delta));
      continue;
    }

    const refreshed = refreshContractForNextLevel(contract, delta);
    if (refreshed.levelsRemaining <= 0) {
      results.push(resultFor(refreshed, 'failed', delta, { reason: 'expired' }));
      continue;
    }

    kept.push(refreshed);
    results.push(resultFor(refreshed, 'progress', delta));
  }

  setOpenContracts(kept);
  return results;
}

export function settleActiveContract() {
  return settleOpenContracts()[0] ?? null;
}
