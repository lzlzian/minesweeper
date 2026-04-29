// ============================================================
// STATE
// ============================================================

export const MAX_HP = 3;
export const STEP_MS = 80;
export const CELL_SIZE = 40;
export const CELL_GAP = 2;
export const BOARD_PAD = 16;

const state = {
  gold: 0,
  stashGold: 0,
  runGoldEarned: 0,
  maxHp: MAX_HP,
  hp: MAX_HP,
  level: 1,
  rows: 10,
  cols: 10,
  grid: [],
  revealed: [],
  flagged: [],
  gameOver: false,
  busy: false,
  playerRow: 0,
  playerCol: 0,
  exit: { r: 0, c: 0 },
  items: { potion: 0, scanner: 0, pickaxe: 0, row: 0, column: 0, cross: 0 },
  activeItem: null,
  levelsSinceMerchant: 0,
  merchant: null,
  fountain: null,
  joker: null,
  artifacts: [],
  hazardPayClaimed: false,
  debtCushionUsed: false,
  rulesetId: null,
  biomeOverrides: null,
  startCornerIdx: 0,
  genMeta: null,
};

// Escape hatch — returns the singleton. Prefer typed accessors.
export function getState() { return state; }

// ----- Getters -----
export function getGold() { return state.gold; }
export function getStashGold() { return state.stashGold; }
export function getRunGoldEarned() { return state.runGoldEarned; }
export function getMaxHp() { return state.maxHp; }
export function getHp() { return state.hp; }
export function getLevel() { return state.level; }
export function getRows() { return state.rows; }
export function getCols() { return state.cols; }
export function getGrid() { return state.grid; }
export function getRevealed() { return state.revealed; }
export function getFlagged() { return state.flagged; }
export function getGameOver() { return state.gameOver; }
export function getBusy() { return state.busy; }
export function getPlayerRow() { return state.playerRow; }
export function getPlayerCol() { return state.playerCol; }
export function getExit() { return state.exit; }
export function getItems() { return state.items; }
export function getItemCount(key) { return state.items[key]; }
export function getActiveItem() { return state.activeItem; }
export function getLevelsSinceMerchant() { return state.levelsSinceMerchant; }
export function getMerchant() { return state.merchant; }
export function getFountain() { return state.fountain; }
export function getJoker() { return state.joker; }
export function getArtifacts() { return state.artifacts; }
export function hasArtifact(id) { return state.artifacts.includes(id); }
export function getHazardPayClaimed() { return state.hazardPayClaimed; }
export function getDebtCushionUsed() { return state.debtCushionUsed; }
export function getRulesetId() { return state.rulesetId; }
export function getBiomeOverrides() { return state.biomeOverrides; }
export function getStartCornerIdx() { return state.startCornerIdx; }
export function getGenMeta() { return state.genMeta; }

// ----- Semantic mutators -----
export function addGold(amount) {
  state.gold += amount;
  state.runGoldEarned += amount;
}

export function spendGold(amount) {
  if (state.gold >= amount) {
    state.gold -= amount;
  } else {
    const remainder = amount - state.gold;
    state.gold = 0;
    state.stashGold -= remainder;
  }
}

export function moveGoldToStash() {
  state.stashGold += state.gold;
  state.gold = 0;
}

export function damagePlayer(amount) {
  state.hp = Math.max(0, state.hp - amount);
  return state.hp;
}

export function healPlayer(amount) {
  state.hp = Math.min(state.maxHp, state.hp + amount);
  return state.hp;
}

export function increaseMaxHp(amount) {
  state.maxHp += amount;
  state.hp = Math.min(state.maxHp, state.hp + amount);
  return state.maxHp;
}

export function addItem(key, count = 1) {
  state.items[key] = (state.items[key] ?? 0) + count;
}

export function addArtifact(id) {
  if (state.artifacts.includes(id)) return false;
  state.artifacts.push(id);
  return true;
}

export function consumeItem(key) {
  if (state.items[key] <= 0) throw new Error(`cannot consume ${key}: count is ${state.items[key]}`);
  state.items[key]--;
}

// ----- Simple setters -----
export function setPlayerPosition(r, c) {
  state.playerRow = r;
  state.playerCol = c;
}

export function setGrid(grid) { state.grid = grid; }
export function setRevealed(revealed) { state.revealed = revealed; }
export function setFlagged(flagged) { state.flagged = flagged; }
export function setGameOver(v) { state.gameOver = v; }
export function setBusy(v) { state.busy = v; }
export function setExit(exit) { state.exit = exit; }
export function setActiveItem(v) { state.activeItem = v; }
export function setLevelsSinceMerchant(v) { state.levelsSinceMerchant = v; }
export function incrementLevelsSinceMerchant() { state.levelsSinceMerchant++; }
export function setMerchant(m) { state.merchant = m; }
export function setFountain(f) { state.fountain = f; }
export function setJoker(j) { state.joker = j; }
export function setStashGold(n) { state.stashGold = n; }
export function setHazardPayClaimed(v) { state.hazardPayClaimed = v; }
export function setDebtCushionUsed(v) { state.debtCushionUsed = v; }
export function setLevel(n) { state.level = n; }
export function incrementLevel() { state.level++; }
export function setRows(n) { state.rows = n; }
export function setCols(n) { state.cols = n; }
export function setRulesetId(id) { state.rulesetId = id; }
export function setBiomeOverrides(o) { state.biomeOverrides = o; }
export function setStartCornerIdx(i) { state.startCornerIdx = i; }
export function setItems(items) { state.items = items; }
export function setGenMeta(meta) { state.genMeta = meta; }

// ----- Lifecycle -----
export function resetForNewRun() {
  state.level = 1;
  state.maxHp = MAX_HP;
  state.hp = MAX_HP;
  state.gold = 0;
  state.stashGold = 0;
  state.runGoldEarned = 0;
  state.levelsSinceMerchant = 0;
  state.items = { potion: 1, scanner: 1, pickaxe: 1, row: 1, column: 1, cross: 1 };
  state.merchant = null;
  state.fountain = null;
  state.joker = null;
  state.artifacts = [];
  state.hazardPayClaimed = false;
  state.debtCushionUsed = false;
  state.rulesetId = null;
  state.genMeta = null;
}

export function resetLevelGold() { state.gold = 0; }
export function resetLevelArtifactState() { state.hazardPayClaimed = false; }
export function fullHeal() { state.hp = state.maxHp; }

// ----- Save/load -----
export function getSavePayload(extra = {}) {
  return {
    level: state.level,
    gold: state.gold,
    stashGold: state.stashGold,
    runGoldEarned: state.runGoldEarned,
    maxHp: state.maxHp,
    artifacts: [...state.artifacts],
    hazardPayClaimed: state.hazardPayClaimed,
    debtCushionUsed: state.debtCushionUsed,
    items: { ...state.items },
    levelsSinceMerchant: state.levelsSinceMerchant,
    rulesetId: state.rulesetId,
    hp: state.hp,
    ...extra,
  };
}

export function applySavePayload(save) {
  state.level = save.level;
  state.gold = save.gold ?? 0;
  state.stashGold = save.stashGold;
  state.runGoldEarned = save.runGoldEarned ?? save.stashGold ?? 0;
  state.maxHp = save.maxHp ?? MAX_HP;
  state.levelsSinceMerchant = save.levelsSinceMerchant ?? 0;
  state.artifacts = [...(save.artifacts ?? [])];
  state.hazardPayClaimed = !!save.hazardPayClaimed;
  state.debtCushionUsed = !!save.debtCushionUsed;
  state.items = { ...(save.items ?? {}) };
  state.items.potion = state.items.potion ?? 0;
  state.items.scanner = state.items.scanner ?? 0;
  state.items.pickaxe = state.items.pickaxe ?? 0;
  state.items.row = state.items.row ?? 0;
  state.items.column = state.items.column ?? 0;
  state.items.cross = state.items.cross ?? 0;
  state.rulesetId = save.rulesetId ?? null;
  state.hp = Math.min(save.hp ?? state.maxHp, state.maxHp);
}

// ----- Lifetime gold (persistent) -----
const LIFETIME_GOLD_KEY = 'miningCrawler.lifetimeGold';

export function addToLifetimeGold(amount) {
  const cur = parseInt(localStorage.getItem(LIFETIME_GOLD_KEY) || '0', 10);
  localStorage.setItem(LIFETIME_GOLD_KEY, String(cur + amount));
}

export function getLifetimeGold() {
  return parseInt(localStorage.getItem(LIFETIME_GOLD_KEY) || '0', 10);
}
