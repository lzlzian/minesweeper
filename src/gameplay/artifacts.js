import {
  addArtifact, addGold, getArtifacts, getFlagged, getGrid, getRows, getCols,
  getDebtCushionUsed, getHazardPayClaimed, getHp, getMaxHp, getLevelStats,
  getLevel,
  hasArtifact, healPlayer, increaseMaxHp, setDebtCushionUsed,
  setHazardPayClaimed, setStashGold, spendGold,
} from '../state.js';

export const ARTIFACT_ITEM_TYPES = ['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross'];
export const ARTIFACT_RARITIES = {
  common: { label: 'Common' },
  uncommon: { label: 'Uncommon' },
  rare: { label: 'Rare' },
};

const ARTIFACT_RARITY_CURVE = [
  { maxLevel: 15, weights: { common: 72, uncommon: 25, rare: 3 } },
  { maxLevel: 30, weights: { common: 60, uncommon: 32, rare: 8 } },
  { maxLevel: 45, weights: { common: 52, uncommon: 36, rare: 12 } },
  { maxLevel: Infinity, weights: { common: 45, uncommon: 38, rare: 17 } },
];

export const ARTIFACTS = [
  {
    id: 'flag_bounty',
    icon: '🚩',
    name: 'Flag Bounty',
    desc: 'At level end, correct gas flags pay 2g and wrong flags cost 2g.',
    rarity: 'common',
  },
  {
    id: 'max_hp',
    icon: '❤️',
    name: 'Spare Heart',
    desc: '+1 max HP immediately.',
    rarity: 'rare',
  },
  {
    id: 'merchant_discount',
    icon: '🏷️',
    name: 'Counterfeit Coupon',
    desc: 'Merchant goods are 5% cheaper.',
    rarity: 'common',
  },
  {
    id: 'pawn_ticket',
    icon: '🎫',
    name: 'Pawn Ticket',
    desc: 'Pawn shops pay 15% more for items.',
    rarity: 'common',
  },
  {
    id: 'clutch_coupon',
    icon: '🧷',
    name: 'Clutch Coupon',
    desc: 'Merchant goods are 10% cheaper while you are at 1 HP.',
    rarity: 'uncommon',
  },
  {
    id: 'gas_survey',
    icon: '📍',
    name: 'Gas Survey',
    desc: 'One random gas tile is revealed at the start of each level.',
    rarity: 'common',
  },
  {
    id: 'field_rations',
    icon: '🥫',
    name: 'Field Rations',
    desc: 'Every third level, start with +1 potion.',
    rarity: 'common',
  },
  {
    id: 'fuse_marks',
    icon: '🧨',
    name: 'Fuse Marks',
    desc: 'Triggering gas reveals one nearby hidden gas tile.',
    rarity: 'common',
  },
  {
    id: 'end_heal',
    icon: '💗',
    name: 'Safety Dividend',
    desc: 'Heal 1 HP after clearing a level.',
    rarity: 'rare',
  },
  {
    id: 'free_reroll',
    icon: '🎲',
    name: 'House Dice',
    desc: 'The first merchant reroll each level is free.',
    rarity: 'uncommon',
  },
  {
    id: 'extra_chest',
    icon: '🎁',
    name: 'Prospector Cache',
    desc: 'Gold branches contain one extra chest.',
    rarity: 'uncommon',
  },
  {
    id: 'payment_discount',
    icon: '📉',
    name: 'Exit Clause',
    desc: 'Exit payments are reduced by 10%.',
    rarity: 'rare',
  },
  {
    id: 'fountain_item',
    icon: '💧',
    name: 'Overflow Flask',
    desc: 'Fountains grant a random item instead if you are already at full HP.',
    rarity: 'common',
  },
  {
    id: 'contract_stamp',
    icon: '📎',
    name: 'Contract Stamp',
    desc: 'Contract buy-ins cost 10% less.',
    rarity: 'common',
  },
  {
    id: 'chest_items',
    icon: '🧰',
    name: 'Mystery Chests',
    desc: 'Chests have a 25% chance to contain a random item instead of gold.',
    rarity: 'uncommon',
  },
  {
    id: 'survey_battery',
    icon: '🔋',
    name: 'Survey Battery',
    desc: 'Every third level, start with +1 scanner.',
    rarity: 'uncommon',
  },
  {
    id: 'clean_tools',
    icon: '🧽',
    name: 'Clean Tools',
    desc: 'Clearing a level without using items grants 35g.',
    rarity: 'uncommon',
  },
  {
    id: 'wide_pockets',
    icon: '🎒',
    name: 'Wide Pockets',
    desc: 'Every third level, start with +1 random basic item.',
    rarity: 'uncommon',
  },
  {
    id: 'contract_form',
    icon: '📑',
    name: 'Long Form Contract',
    desc: 'Contract boards offer 1 extra choice.',
    rarity: 'uncommon',
  },
  {
    id: 'black_market_ledger',
    icon: '📒',
    name: 'Black Market Ledger',
    desc: 'Merchants stock 2 extra item slots.',
    rarity: 'rare',
  },
  {
    id: 'branch_lantern',
    icon: '🏮',
    name: 'Branch Lantern',
    desc: 'The first cell inside each side branch is revealed at level start.',
    rarity: 'common',
  },
  {
    id: 'branch_map',
    icon: '🧭',
    name: 'Branch Map',
    desc: 'At level start, reveal one random safe numbered side-branch cell.',
    rarity: 'common',
  },
  {
    id: 'exit_survey',
    icon: '📐',
    name: 'Exit Survey',
    desc: 'At level start, reveal one random safe numbered cell near the exit.',
    rarity: 'common',
  },
  {
    id: 'pocket_pickaxe',
    icon: '🪓',
    name: 'Pocket Pickaxe',
    desc: 'Every third level, start with +1 pickaxe.',
    rarity: 'common',
  },
  {
    id: 'toolbox_order',
    icon: '📦',
    name: 'Toolbox Order',
    desc: 'Every third level, start with +1 row or column scan.',
    rarity: 'uncommon',
  },
  {
    id: 'scrap_voucher',
    icon: '🔩',
    name: 'Scrap Voucher',
    desc: 'Using a pickaxe grants 10g.',
    rarity: 'common',
  },
  {
    id: 'hazard_pay',
    icon: '☣️',
    name: 'Hazard Pay',
    desc: 'The first gas you trigger each level grants 25g.',
    rarity: 'uncommon',
  },
  {
    id: 'miners_map',
    icon: '🗺️',
    name: "Miner's Map",
    desc: 'At level start, reveal one random safe numbered spine cell.',
    rarity: 'common',
  },
  {
    id: 'lucky_receipt',
    icon: '🧾',
    name: 'Lucky Receipt',
    desc: 'Chests contain 25% more gold.',
    rarity: 'uncommon',
  },
  {
    id: 'scarred_gloves',
    icon: '🧤',
    name: 'Scarred Gloves',
    desc: 'Opening chests while wounded grants +20g.',
    rarity: 'common',
  },
  {
    id: 'exit_dividend',
    icon: '💵',
    name: 'Exit Dividend',
    desc: 'Clearing a level at full HP grants 40g.',
    rarity: 'uncommon',
  },
  {
    id: 'settlement_receipt',
    icon: '📜',
    name: 'Settlement Receipt',
    desc: 'Contract rewards are 10% higher.',
    rarity: 'uncommon',
  },
  {
    id: 'danger_dividend',
    icon: '⚠️',
    name: 'Danger Dividend',
    desc: 'Clearing a level at exactly 1 HP grants 90g.',
    rarity: 'uncommon',
  },
  {
    id: 'volatile_receipt',
    icon: '🧾',
    name: 'Volatile Receipt',
    desc: 'Chests contain 40% more gold after you trigger gas this level.',
    rarity: 'uncommon',
  },
  {
    id: 'debt_cushion',
    icon: '🛟',
    name: 'Debt Cushion',
    desc: 'Once per run, survive a payment shortfall of 50g or less at 0g.',
    rarity: 'rare',
  },
  {
    id: 'joker_choice',
    icon: '🃏',
    name: "Joker's Choice",
    desc: 'Paid Jokers offer 2 artifacts; guaranteed Jokers offer +1 choice.',
    rarity: 'rare',
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
export const PAWN_TICKET_PERCENT = 15;
export const CONTRACT_STAMP_DISCOUNT_PERCENT = 10;
export const CONTRACT_REWARD_BONUS_PERCENT = 10;
export const CONTRACT_FORM_EXTRA_CHOICES = 1;
export const CLUTCH_COUPON_PERCENT = 10;
export const SCRAP_VOUCHER_GOLD = 10;
export const SCARRED_GLOVES_GOLD = 20;
export const CLEAN_TOOLS_GOLD = 35;
export const DANGER_DIVIDEND_GOLD = 90;
export const VOLATILE_RECEIPT_PERCENT = 40;
export const PAID_JOKER_BASE_GOLD = 80;
export const PAID_JOKER_LEVEL_GOLD = 14;

export function artifactById(id) {
  return ARTIFACT_BY_ID.get(id) ?? null;
}

export function artifactRarityLabel(artifactOrId) {
  const artifact = typeof artifactOrId === 'string' ? artifactById(artifactOrId) : artifactOrId;
  return ARTIFACT_RARITIES[artifact?.rarity]?.label ?? ARTIFACT_RARITIES.common.label;
}

export function artifactLabel(id) {
  const artifact = artifactById(id);
  return artifact ? `${artifact.icon} ${artifact.name}` : id;
}

export function merchantArtifactPrice(price) {
  if (price <= 0) return 0;
  let finalPrice = price;
  if (hasArtifact('merchant_discount')) {
    finalPrice = Math.floor(finalPrice * (1 - MERCHANT_DISCOUNT_PERCENT / 100));
  }
  if (hasArtifact('clutch_coupon') && getHp() <= 1) {
    finalPrice = Math.floor(finalPrice * (1 - CLUTCH_COUPON_PERCENT / 100));
  }
  return Math.max(1, finalPrice);
}

export function artifactPaymentAmount(amount) {
  if (!hasArtifact('payment_discount')) return amount;
  if (amount <= 0) return 0;
  return Math.max(1, Math.floor(amount * (1 - PAYMENT_DISCOUNT_PERCENT / 100)));
}

export function artifactChestGoldAmount(amount) {
  if (amount <= 0) return 0;
  let finalAmount = amount;
  if (hasArtifact('lucky_receipt')) {
    finalAmount = Math.floor(finalAmount * (1 + LUCKY_RECEIPT_PERCENT / 100));
  }
  if (hasArtifact('volatile_receipt') && getLevelStats().triggeredGas > 0) {
    finalAmount = Math.floor(finalAmount * (1 + VOLATILE_RECEIPT_PERCENT / 100));
  }
  if (hasArtifact('scarred_gloves') && getHp() < getMaxHp()) {
    finalAmount += SCARRED_GLOVES_GOLD;
  }
  return finalAmount;
}

export function artifactPawnPrice(price) {
  if (!hasArtifact('pawn_ticket')) return price;
  if (price <= 0) return 0;
  return Math.max(1, Math.round(price * (1 + PAWN_TICKET_PERCENT / 100)));
}

export function artifactContractBuyIn(amount) {
  if (!hasArtifact('contract_stamp')) return amount;
  if (amount <= 0) return 0;
  return Math.max(1, Math.floor(amount * (1 - CONTRACT_STAMP_DISCOUNT_PERCENT / 100)));
}

export function artifactContractPayout(amount) {
  if (!hasArtifact('settlement_receipt')) return amount;
  if (amount <= 0) return 0;
  return Math.floor(amount * (1 + CONTRACT_REWARD_BONUS_PERCENT / 100));
}

export function artifactContractChoiceCount(baseCount) {
  return Math.max(0, Math.floor(baseCount ?? 0)) +
    (hasArtifact('contract_form') ? CONTRACT_FORM_EXTRA_CHOICES : 0);
}

export function paidJokerPriceForLevel(level = getLevel()) {
  const scaled = PAID_JOKER_BASE_GOLD + Math.max(1, Math.floor(level ?? 1)) * PAID_JOKER_LEVEL_GOLD;
  return Math.max(50, Math.round(scaled / 5) * 5);
}

export function randomArtifactItemType() {
  return ARTIFACT_ITEM_TYPES[Math.floor(Math.random() * ARTIFACT_ITEM_TYPES.length)];
}

export function randomLineScanItemType() {
  return Math.random() < 0.5 ? 'row' : 'column';
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

function rarityWeightsForLevel(level) {
  return ARTIFACT_RARITY_CURVE.find(entry => level <= entry.maxLevel)?.weights ?? ARTIFACT_RARITY_CURVE[0].weights;
}

function weightedRarityForAvailable(available, level) {
  const weights = rarityWeightsForLevel(level);
  const availableRarities = new Set(available.map(artifact => artifact.rarity ?? 'common'));
  const weighted = Object.entries(weights)
    .filter(([rarity, weight]) => weight > 0 && availableRarities.has(rarity));
  const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return available[0]?.rarity ?? 'common';
  let roll = Math.random() * total;
  for (const [rarity, weight] of weighted) {
    roll -= weight;
    if (roll < 0) return rarity;
  }
  return weighted[weighted.length - 1][0];
}

function pickWeightedArtifact(available, level) {
  const rarity = weightedRarityForAvailable(available, level);
  const tier = available.filter(artifact => (artifact.rarity ?? 'common') === rarity);
  const pool = tier.length ? tier : available;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function randomArtifactChoices(count) {
  const owned = new Set(getArtifacts());
  const available = ARTIFACTS.filter(artifact => !owned.has(artifact.id));
  const choices = [];
  const target = Math.max(0, Math.floor(count ?? 0));
  while (choices.length < target && available.length > 0) {
    const artifact = pickWeightedArtifact(available, getLevel());
    choices.push(artifact);
    available.splice(available.findIndex(candidate => candidate.id === artifact.id), 1);
  }
  return choices;
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

export function settleCleanToolsBonus() {
  if (!hasArtifact('clean_tools')) return null;
  if (getLevelStats().itemsUsed > 0) return null;
  addGold(CLEAN_TOOLS_GOLD);
  return { amount: CLEAN_TOOLS_GOLD };
}

export function settleDangerDividend() {
  if (!hasArtifact('danger_dividend')) return null;
  if (getHp() !== 1) return null;
  addGold(DANGER_DIVIDEND_GOLD);
  return { amount: DANGER_DIVIDEND_GOLD };
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
