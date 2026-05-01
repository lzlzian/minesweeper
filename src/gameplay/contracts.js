import {
  addGold,
  clearActiveContract,
  getActiveContract,
  getFlagged,
  getGrid,
  getGold,
  getLevel,
  getLevelStats,
  getRows,
  getCols,
  getStashGold,
  setActiveContract,
  spendGold,
} from '../state.js';
import { artifactContractBuyIn, artifactContractPayout } from './artifacts.js';

const CONTRACT_CHOICE_COUNT = 3;
export const CONTRACT_REQUIRED_CLEARS = 2;
export const CONTRACT_BUY_IN_RATE = 0.40;

function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
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

function countGasCells() {
  let total = 0;
  for (let r = 0; r < getRows(); r++) {
    for (let c = 0; c < getCols(); c++) {
      if (getGrid()[r]?.[c]?.type === 'gas') total++;
    }
  }
  return total;
}

function countCorrectFlags() {
  let total = 0;
  for (let r = 0; r < getRows(); r++) {
    for (let c = 0; c < getCols(); c++) {
      if (!getFlagged()[r]?.[c]) continue;
      const type = getGrid()[r]?.[c]?.type;
      if (type === 'gas' || type === 'detonated') total++;
    }
  }
  return total;
}

function payout(base, level, multiplier = 1) {
  const levelScale = 1 + Math.max(0, level - 1) * 0.035;
  return Math.max(90, Math.round((base + level * 8) * levelScale * multiplier));
}

function buyInForReward(reward, level) {
  const levelFee = Math.max(0, Math.floor(level / 5) * 5);
  return Math.max(20, Math.round(reward * CONTRACT_BUY_IN_RATE) + levelFee);
}

function withBuyIn(contract, level) {
  const adjustedPayout = artifactContractPayout(contract.payout);
  return {
    ...contract,
    payout: adjustedPayout,
    cost: artifactContractBuyIn(buyInForReward(adjustedPayout, level)),
  };
}

export function randomContractChoices(count = CONTRACT_CHOICE_COUNT) {
  const level = getLevel();
  const gasCount = countGasCells();
  const remainingChests = countRemainingChests();
  const flagTarget = Math.max(4, Math.floor(level / 8) + 4);
  const chestTarget = Math.min(5, Math.max(2, remainingChests + 1));

  const choices = [
    {
      id: 'clean_exit',
      icon: '🧼',
      name: 'Clean Exit',
      desc: 'Clear this level and the next without triggering gas.',
      payout: payout(95, level, 1.25),
    },
    {
      id: 'tool_embargo',
      icon: '🧰',
      name: 'Tool Embargo',
      desc: 'Clear this level and the next without using items.',
      payout: payout(85, level, 1.05),
    },
  ];

  if (gasCount > 0) {
    choices.push({
      id: 'flag_quota',
      icon: '🚩',
      name: 'Flag Quota',
      desc: `Correctly add ${flagTarget} new gas flags across two clears.`,
      payout: payout(55 + flagTarget * 32, level, 1),
      target: flagTarget,
    });
  }

  if (remainingChests > 0) {
    choices.push({
      id: 'chest_quota',
      icon: '🎁',
      name: 'Chest Audit',
      desc: `Open ${chestTarget} chest${chestTarget === 1 ? '' : 's'} across two clears.`,
      payout: payout(70 + chestTarget * 58, level, 1),
      target: chestTarget,
    });
  }

  return shuffle(choices.map(choice => withBuyIn(choice, level))).slice(0, Math.max(0, count));
}

export function acceptContract(contract) {
  if (!contract || getActiveContract()) return null;
  const cost = Math.max(0, Math.round(contract.cost ?? 0));
  if (getGold() + getStashGold() < cost) return null;
  if (cost > 0) spendGold(cost);
  const accepted = {
    ...contract,
    cost,
    acceptedLevel: getLevel(),
    requiredClears: CONTRACT_REQUIRED_CLEARS,
    clearedLevels: 0,
    progress: {
      correctFlags: 0,
      chestsOpened: 0,
    },
    startStats: getLevelStats(),
    startCorrectFlags: countCorrectFlags(),
  };
  setActiveContract(accepted);
  return accepted;
}

function currentLevelDelta(contract) {
  const stats = getLevelStats();
  const start = contract.startStats ?? {};
  return {
    triggeredGas: Math.max(0, (stats.triggeredGas ?? 0) - (start.triggeredGas ?? 0)),
    itemsUsed: Math.max(0, (stats.itemsUsed ?? 0) - (start.itemsUsed ?? 0)),
    chestsOpened: Math.max(0, (stats.chestsOpened ?? 0) - (start.chestsOpened ?? 0)),
    correctFlags: Math.max(0, countCorrectFlags() - (contract.startCorrectFlags ?? 0)),
  };
}

function contractViolated(contract, delta) {
  if (contract.id === 'clean_exit') {
    return delta.triggeredGas > 0;
  }
  if (contract.id === 'tool_embargo') {
    return delta.itemsUsed > 0;
  }
  return false;
}

function contractGoalMet(contract, progress) {
  if (contract.id === 'clean_exit' || contract.id === 'tool_embargo') return true;
  if (contract.id === 'flag_quota') {
    return (progress.correctFlags ?? 0) >= (contract.target ?? 1);
  }
  if (contract.id === 'chest_quota') {
    return (progress.chestsOpened ?? 0) >= (contract.target ?? 1);
  }
  return false;
}

export function settleActiveContract() {
  const contract = getActiveContract();
  if (!contract) return null;
  const delta = currentLevelDelta(contract);
  const progress = {
    correctFlags: (contract.progress?.correctFlags ?? 0) + delta.correctFlags,
    chestsOpened: (contract.progress?.chestsOpened ?? 0) + delta.chestsOpened,
  };
  const requiredClears = contract.requiredClears ?? CONTRACT_REQUIRED_CLEARS;
  const clearedLevels = (contract.clearedLevels ?? 0) + 1;
  const updatedContract = {
    ...contract,
    requiredClears,
    clearedLevels,
    progress,
  };

  if (contractViolated(contract, delta)) {
    clearActiveContract();
    return {
      contract: updatedContract,
      status: 'failed',
      success: false,
      payout: 0,
      clearedLevels,
      requiredClears,
    };
  }

  if (clearedLevels < requiredClears) {
    setActiveContract({
      ...updatedContract,
      startStats: { triggeredGas: 0, itemsUsed: 0, chestsOpened: 0 },
      startCorrectFlags: 0,
    });
    return {
      contract: updatedContract,
      status: 'progress',
      success: null,
      payout: 0,
      clearedLevels,
      requiredClears,
    };
  }

  const success = contractGoalMet(updatedContract, progress);
  if (success) addGold(contract.payout);
  clearActiveContract();
  return {
    contract: updatedContract,
    status: success ? 'complete' : 'failed',
    success,
    payout: success ? contract.payout : 0,
    clearedLevels,
    requiredClears,
  };
}
