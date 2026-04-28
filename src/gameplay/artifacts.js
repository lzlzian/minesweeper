import {
  addArtifact, addGold, getArtifacts, getFlagged, getGrid, getRows, getCols,
  getDebtCushionUsed, getHazardPayClaimed, getHp, getMaxHp,
  hasArtifact, healPlayer, increaseMaxHp, setDebtCushionUsed,
  setHazardPayClaimed, setStashGold, spendGold,
} from '../state.js';

export const ARTIFACT_ITEM_TYPES = ['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross'];

export const ARTIFACTS = [
  {
    id: 'flag_bounty',
    icon: '🚩',
    name: 'Flag Bounty',
    desc: 'At level end, correct gas flags pay 2g and wrong flags cost 2g.',
  },
  {
    id: 'max_hp',
    icon: '❤️',
    name: 'Spare Heart',
    desc: '+1 max HP immediately.',
  },
  {
    id: 'merchant_discount',
    icon: '🏷️',
    name: 'Counterfeit Coupon',
    desc: 'Merchant goods are 5% cheaper.',
  },
  {
    id: 'gas_survey',
    icon: '📍',
    name: 'Gas Survey',
    desc: 'One random gas tile is revealed at the start of each level.',
  },
  {
    id: 'end_heal',
    icon: '💗',
    name: 'Safety Dividend',
    desc: 'Heal 1 HP after clearing a level.',
  },
  {
    id: 'free_reroll',
    icon: '🎲',
    name: 'House Dice',
    desc: 'The first merchant reroll each level is free.',
  },
  {
    id: 'extra_chest',
    icon: '🎁',
    name: 'Prospector Cache',
    desc: 'Gold branches contain one extra chest.',
  },
  {
    id: 'payment_discount',
    icon: '📉',
    name: 'Exit Clause',
    desc: 'Exit payments are reduced by 10%.',
  },
  {
    id: 'fountain_item',
    icon: '💧',
    name: 'Overflow Flask',
    desc: 'Fountains grant a random item instead if you are already at full HP.',
  },
  {
    id: 'chest_items',
    icon: '🧰',
    name: 'Mystery Chests',
    desc: 'Chests have a 25% chance to contain a random item instead of gold.',
  },
  {
    id: 'wide_pockets',
    icon: '🎒',
    name: 'Wide Pockets',
    desc: 'Every third level, start with +1 random basic item.',
  },
  {
    id: 'black_market_ledger',
    icon: '📒',
    name: 'Black Market Ledger',
    desc: 'Merchants stock 2 extra item slots.',
  },
  {
    id: 'branch_lantern',
    icon: '🏮',
    name: 'Branch Lantern',
    desc: 'The first cell inside each side branch is revealed at level start.',
  },
  {
    id: 'pocket_pickaxe',
    icon: '🪓',
    name: 'Pocket Pickaxe',
    desc: 'Every third level, start with +1 pickaxe.',
  },
  {
    id: 'hazard_pay',
    icon: '☣️',
    name: 'Hazard Pay',
    desc: 'The first gas you trigger each level grants 25g.',
  },
  {
    id: 'miners_map',
    icon: '🗺️',
    name: "Miner's Map",
    desc: 'At level start, reveal one random safe numbered spine cell.',
  },
  {
    id: 'lucky_receipt',
    icon: '🧾',
    name: 'Lucky Receipt',
    desc: 'Chests contain 25% more gold.',
  },
  {
    id: 'exit_dividend',
    icon: '💵',
    name: 'Exit Dividend',
    desc: 'Clearing a level at full HP grants 40g.',
  },
  {
    id: 'debt_cushion',
    icon: '🛟',
    name: 'Debt Cushion',
    desc: 'Once per run, survive a payment shortfall of 50g or less at 0g.',
  },
  {
    id: 'joker_choice',
    icon: '🃏',
    name: "Joker's Choice",
    desc: 'Jokers offer 2 random artifacts and you choose 1.',
  },
];

const ARTIFACT_BY_ID = new Map(ARTIFACTS.map(artifact => [artifact.id, artifact]));
export const FLAG_BOUNTY_GOLD = 2;
export const MERCHANT_DISCOUNT_PERCENT = 5;
export const PAYMENT_DISCOUNT_PERCENT = 10;
export const CHEST_ITEM_CHANCE = 0.25;
export const HAZARD_PAY_GOLD = 25;
export const EXIT_DIVIDEND_GOLD = 40;
export const DEBT_CUSHION_GOLD = 50;
export const LUCKY_RECEIPT_PERCENT = 25;

export function artifactById(id) {
  return ARTIFACT_BY_ID.get(id) ?? null;
}

export function artifactLabel(id) {
  const artifact = artifactById(id);
  return artifact ? `${artifact.icon} ${artifact.name}` : id;
}

export function merchantArtifactPrice(price) {
  if (!hasArtifact('merchant_discount')) return price;
  if (price <= 0) return 0;
  return Math.max(1, Math.floor(price * (1 - MERCHANT_DISCOUNT_PERCENT / 100)));
}

export function artifactPaymentAmount(amount) {
  if (!hasArtifact('payment_discount')) return amount;
  if (amount <= 0) return 0;
  return Math.max(1, Math.floor(amount * (1 - PAYMENT_DISCOUNT_PERCENT / 100)));
}

export function artifactChestGoldAmount(amount) {
  if (!hasArtifact('lucky_receipt')) return amount;
  if (amount <= 0) return 0;
  return Math.floor(amount * (1 + LUCKY_RECEIPT_PERCENT / 100));
}

export function randomArtifactItemType() {
  return ARTIFACT_ITEM_TYPES[Math.floor(Math.random() * ARTIFACT_ITEM_TYPES.length)];
}

export function isArtifactCadenceLevel(level) {
  return level > 0 && (level - 1) % 3 === 0;
}

export function grantArtifact(id) {
  const artifact = artifactById(id);
  if (!artifact) return null;
  if (!addArtifact(id)) return null;
  if (id === 'max_hp') increaseMaxHp(1);
  return artifact;
}

export function grantRandomArtifact() {
  const artifact = randomArtifactChoices(1)[0];
  return artifact ? grantArtifact(artifact.id) : null;
}

export function randomArtifactChoices(count) {
  const owned = new Set(getArtifacts());
  const available = ARTIFACTS.filter(artifact => !owned.has(artifact.id));
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  return available.slice(0, Math.max(0, count));
}

export function settleFlagBounty() {
  if (!hasArtifact('flag_bounty')) return null;
  let correct = 0;
  let incorrect = 0;
  for (let r = 0; r < getRows(); r++) {
    for (let c = 0; c < getCols(); c++) {
      if (!getFlagged()[r]?.[c]) continue;
      const type = getGrid()[r]?.[c]?.type;
      if (type === 'gas') correct++;
      else incorrect++;
    }
  }
  const net = (correct - incorrect) * FLAG_BOUNTY_GOLD;
  if (net > 0) addGold(net);
  else if (net < 0) spendGold(-net);
  return {
    correct,
    incorrect,
    earned: correct * FLAG_BOUNTY_GOLD,
    penalty: incorrect * FLAG_BOUNTY_GOLD,
    perFlag: FLAG_BOUNTY_GOLD,
    net,
  };
}

export function settleEndLevelHeal() {
  if (!hasArtifact('end_heal')) return null;
  const before = getHp();
  healPlayer(1);
  const healed = getHp() - before;
  if (healed <= 0) return null;
  return {
    amount: healed,
    hp: getHp(),
    maxHp: getMaxHp(),
  };
}

export function settleHazardPay() {
  if (!hasArtifact('hazard_pay')) return null;
  if (getHazardPayClaimed()) return null;
  setHazardPayClaimed(true);
  addGold(HAZARD_PAY_GOLD);
  return { amount: HAZARD_PAY_GOLD };
}

export function settleExitDividend() {
  if (!hasArtifact('exit_dividend')) return null;
  if (getHp() < getMaxHp()) return null;
  addGold(EXIT_DIVIDEND_GOLD);
  return { amount: EXIT_DIVIDEND_GOLD };
}

export function canUseDebtCushion(shortfall) {
  return hasArtifact('debt_cushion') &&
    !getDebtCushionUsed() &&
    shortfall > 0 &&
    shortfall <= DEBT_CUSHION_GOLD;
}

export function useDebtCushion(shortfall) {
  if (!canUseDebtCushion(shortfall)) return false;
  setDebtCushionUsed(true);
  setStashGold(0);
  return true;
}
