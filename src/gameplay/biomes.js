// ============================================================
// BIOMES
// ============================================================

export const COAL_SHAFTS_BIOME_ID = 'coal_shafts';
export const CRYSTAL_VEINS_BIOME_ID = 'crystal_veins';
export const COMPANY_DIG_SITE_BIOME_ID = 'company_dig_site';
export const ENDLESS_DEEP_BIOME_ID = 'endless_deep';

export const BIOMES = [
  {
    id: COAL_SHAFTS_BIOME_ID,
    name: 'Coal Shafts',
    shortName: 'Coal',
    levelStart: 1,
    levelEnd: 15,
    tagline: 'Old tunnels, fresh debts.',
    theme: {
      className: 'biome-coal-shafts',
    },
    generation: {
      layoutProfile: 'coal',
      branchRoomProfile: 'cavern',
      wallMaskProfile: 'rough',
      gasMultiplier: 1,
      spineGasMultiplier: 1,
      branchGasMultiplier: 1,
      goldMultiplier: 1,
      branchCapacityBonus: 0,
      crystalCells: 0,
    },
    features: {
      merchantChance: 0.33,
      fountainChance: 0.50,
      jokerChance: 0.33,
      itemDropChance: 0.50,
      bankChance: 0.20,
      contractChance: 0.10,
    },
    economy: {
      paymentMultiplier: 1,
      spineGoldMultiplier: 1,
      optionalGoldMultiplier: 1,
      featureGoldMultiplier: 1,
      chestGoldMultiplier: 1,
    },
  },
  {
    id: CRYSTAL_VEINS_BIOME_ID,
    name: 'Crystal Veins',
    shortName: 'Crystal',
    levelStart: 16,
    levelEnd: 30,
    tagline: 'Bright clues, brighter bait.',
    theme: {
      className: 'biome-crystal-veins',
    },
    generation: {
      layoutProfile: 'crystal',
      branchRoomProfile: 'geode',
      wallMaskProfile: 'faceted',
      gasMultiplier: 1,
      spineGasMultiplier: 1,
      branchGasMultiplier: 1.30,
      goldMultiplier: 1,
      branchCapacityBonus: 0,
      crystalCells: 4,
      crystalPreviewChance: 1,
      crystalClueCount: 2,
      crystalClueRadius: 2,
    },
    features: {
      merchantChance: 0.40,
      fountainChance: 0.35,
      jokerChance: 0.40,
      itemDropChance: 0.60,
      bankChance: 0.25,
      contractChance: 0.25,
    },
    economy: {
      paymentMultiplier: 1.25,
      spineGoldMultiplier: 0.85,
      optionalGoldMultiplier: 1.25,
      featureGoldMultiplier: 1.15,
      chestGoldMultiplier: 1.25,
      crystalGold: 8,
      goldBranchExtraChestChance: 1,
      goldBranchExtraChestMultiplier: 0.22,
    },
  },
  {
    id: COMPANY_DIG_SITE_BIOME_ID,
    name: 'Company Dig Site',
    shortName: 'Company',
    levelStart: 31,
    levelEnd: 45,
    tagline: 'Company property, company prices.',
    theme: {
      className: 'biome-company-dig-site',
    },
    generation: {
      layoutProfile: 'company',
      branchRoomProfile: 'office',
      wallMaskProfile: 'industrial',
      gasMultiplier: 1.05,
      spineGasMultiplier: 1.05,
      branchGasMultiplier: 1.15,
      goldMultiplier: 1,
      branchCapacityBonus: 1,
      crystalCells: 0,
    },
    features: {
      merchantChance: 0.55,
      fountainChance: 0.25,
      jokerChance: 0.35,
      itemDropChance: 0.45,
      bankChance: 0.80,
      contractChance: 0.75,
    },
    economy: {
      paymentMultiplier: 1.45,
      spineGoldMultiplier: 0.75,
      optionalGoldMultiplier: 1.15,
      featureGoldMultiplier: 1.25,
      chestGoldMultiplier: 1.10,
      contractPayoutMultiplier: 1.35,
      contractDebtMultiplier: 1.35,
    },
  },
  {
    id: ENDLESS_DEEP_BIOME_ID,
    name: 'Endless Deep',
    shortName: 'Deep',
    levelStart: 46,
    levelEnd: Infinity,
    tagline: 'Past the charted mine.',
    theme: {
      className: 'biome-endless-deep',
    },
    generation: {
      layoutProfile: 'deep',
      branchRoomProfile: 'fractured',
      wallMaskProfile: 'deep',
      gasMultiplier: 1,
      spineGasMultiplier: 1,
      branchGasMultiplier: 1,
      goldMultiplier: 1,
      branchCapacityBonus: 0,
      crystalCells: 0,
    },
    features: {
      merchantChance: 0.33,
      fountainChance: 0.50,
      jokerChance: 0.33,
      itemDropChance: 0.50,
      bankChance: 0.25,
      contractChance: 0.25,
    },
    economy: {
      paymentMultiplier: 1.70,
      spineGoldMultiplier: 1,
      optionalGoldMultiplier: 1,
      featureGoldMultiplier: 1,
      chestGoldMultiplier: 1,
    },
  },
];

export const BIOME_BODY_CLASSES = BIOMES
  .map(biome => biome.theme?.className)
  .filter(Boolean);

export function biomeForLevel(level) {
  const found = BIOMES.find(biome => level >= biome.levelStart && level <= biome.levelEnd);
  return found ?? BIOMES[BIOMES.length - 1];
}

export function biomeById(id) {
  return BIOMES.find(biome => biome.id === id) ?? null;
}

export function biomeNameForId(id, fallbackLevel = 1) {
  return (biomeById(id) ?? biomeForLevel(fallbackLevel)).name;
}
