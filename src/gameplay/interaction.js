import {
  STEP_MS,
  getRows, getCols, getGrid, getRevealed, getFlagged,
  getPlayerRow, getPlayerCol, getExit, getFountain, getMerchant, getJoker,
  getGameOver, getBusy, getHp, getGold, getStashGold, getLevel,
  getActiveItem, getRulesetId, getRunGoldEarned, getMaxHp, getItemCount, hasArtifact,
  getOpenContracts,
  setPlayerPosition, setRevealed, setFlagged, setGameOver, setBusy,
  setFountain, setJoker, setActiveItem,
  addGold, addItem, addPaymentDebt, consumeItem, damagePlayer, fullHeal, spendGold,
  recordLevelChestOpened, recordLevelGasTriggered, recordLevelItemUsed,
  addToLifetimeGold,
} from '../state.js';
import { AUTHORED_RULESET_ID } from './authored.js';
import {
  CHEST_ITEM_CHANCE,
  artifactChestGoldAmount,
  artifactContractChoiceCount,
  artifactLabel,
  artifactPawnPrice,
  grantArtifact,
  grantRandomArtifact,
  paidJokerPriceForLevel,
  randomArtifactChoices,
  randomArtifactItemType,
  SCRAP_VOUCHER_GOLD,
  settleEndLevelHeal,
  settleCleanToolsBonus,
  settleDangerDividend,
  settleExitDividend,
  settleFlagBounty,
  settleHazardPay,
} from './artifacts.js';
import { recordRun } from './leaderboard.js';
import { clearSavedRun } from './runSave.js';
import { acceptContract, randomContractChoices, settleOpenContracts } from './contracts.js';
import { playSfx } from '../audio.js';
import { findPath } from '../board/layout.js';
import { countAdjacentGas } from '../board/generation.js';
import {
  renderGrid, updateHud, updateItemBar, updatePlayerSprite,
  flashHurtFace, spawnPickupFloat, PICKUP_EMOJI,
  spawnGoldMagnetFly,
  setRenderDeps,
} from '../ui/render.js';
import { autoRecenterOnPlayer, renderMinimap } from '../ui/view.js';
import { showShopOverlay } from '../ui/shop.js';
import {
  showArtifactChoiceOverlay,
  showArtifactFoundOverlay,
  showBankOverlay,
  showContractBoardOverlay,
  showPaidJokerOverlay,
  showDeathOverlay,
  showEscapedOverlay,
  showAuthoredClearedOverlay,
  showAuthoredDeathOverlay,
} from '../ui/overlay.js';
import { gridSizeForLevel } from '../rulesets.js';
import { paymentAfterNextForLevel } from './quota.js';

// ============================================================
// INTERACTION (walk, reveal, collect, flag, pickaxe targeting)
// ============================================================

let autosaveRun = () => {};

const PAWN_PRICES = {
  potion: 25,
  scanner: 50,
  pickaxe: 45,
  row: 65,
  column: 65,
  cross: 80,
};

export function setInteractionAutosave(fn) {
  autosaveRun = typeof fn === 'function' ? fn : () => {};
}

function autosaveIfActiveRun() {
  if (getRulesetId() === AUTHORED_RULESET_ID || getGameOver()) return;
  autosaveRun();
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function isAdjacentToPlayer(r, c) {
  const dr = Math.abs(r - getPlayerRow());
  const dc = Math.abs(c - getPlayerCol());
  if (dr === 0 && dc === 0) return false;
  return dr <= 1 && dc <= 1;
}

function clearCollectedGoldCell(cell) {
  cell.goldValue = 0;
  cell.chest = false;
  cell.preview = null;
}

function collectGoldCell(r, c) {
  const cell = getGrid()[r][c];
  if (cell.type !== 'gold' || cell.goldValue <= 0) return null;
  const wasChest = !!cell.chest;
  if (wasChest) recordLevelChestOpened();
  if (wasChest && hasArtifact('chest_items') && Math.random() < CHEST_ITEM_CHANCE) {
    const item = randomArtifactItemType();
    addItem(item, 1);
    clearCollectedGoldCell(cell);
    return { kind: 'item', item, chest: true };
  }
  const amount = wasChest ? artifactChestGoldAmount(cell.goldValue) : cell.goldValue;
  addGold(amount);
  clearCollectedGoldCell(cell);
  return { kind: 'gold', amount, chest: wasChest };
}

function activateCrystalCell(r, c) {
  const cell = getGrid()[r]?.[c];
  if (!cell?.crystal || cell.crystalUsed) return null;
  cell.crystalUsed = true;
  if (cell.preview === 'crystal') cell.preview = null;

  const radius = Math.max(1, cell.crystalClueRadius ?? 1);
  const clueCount = Math.max(1, cell.crystalClueCount ?? 1);
  const candidates = [];
  for (let nr = r - radius; nr <= r + radius; nr++) {
    for (let nc = c - radius; nc <= c + radius; nc++) {
      if (nr < 0 || nr >= getRows() || nc < 0 || nc >= getCols()) continue;
      if (nr === r && nc === c) continue;
      if (getRevealed()[nr]?.[nc] || getFlagged()[nr]?.[nc]) continue;
      const target = getGrid()[nr]?.[nc];
      if (!target || target.type === 'wall' || target.type === 'gas') continue;
      if (target.type !== 'empty') continue;
      if (target.item || target.preview || target.crystal) continue;
      if (target.adjacent <= 0) continue;
      candidates.push({ r: nr, c: nc, adjacent: target.adjacent });
    }
  }

  candidates.sort((a, b) => b.adjacent - a.adjacent || Math.random() - 0.5);
  const clues = candidates.slice(0, clueCount);
  for (const clue of clues) {
    getRevealed()[clue.r][clue.c] = true;
  }

  const gold = Math.max(0, cell.crystalGoldValue ?? 0);
  if (gold > 0) addGold(gold);
  const clueLabel = clues.length === 1 ? '1 clue' : `${clues.length} clues`;
  const goldLabel = gold > 0 ? ` +${gold}g` : '';
  spawnPickupFloat(r, c, `💎 ${clueLabel}${goldLabel}`, 'float-info');
  playSfx('crystal');
  if (gold > 0) updateHud();
  return { clues, gold };
}

function grantJokerArtifact(r, c, artifactId) {
  const artifact = grantArtifact(artifactId);
  if (!artifact) return false;
  spawnPickupFloat(r, c, artifactLabel(artifact.id), 'float-info');
  playSfx('reward_unlock');
  showArtifactFoundOverlay(artifact);
  updateHud();
  autosaveIfActiveRun();
  return true;
}

function payOutEmptyJoker(r, c) {
  addGold(75);
  spawnPickupFloat(r, c, 'Joker pays +75', 'float-info');
  playSfx('cash_register');
  updateHud();
  autosaveIfActiveRun();
}

function completeJokerEncounter(r, c) {
  const joker = getJoker();
  if (joker) joker.used = true;
  getGrid()[r][c].preview = null;
}

function offerJokerChoices(r, c, count, options = {}) {
  const choices = randomArtifactChoices(count);
  if (choices.length >= 2) {
    playSfx('artifact_choice');
    showArtifactChoiceOverlay(choices, artifact => {
      grantJokerArtifact(r, c, artifact.id);
    }, options);
  } else if (choices.length === 1) {
    grantJokerArtifact(r, c, choices[0].id);
  } else {
    payOutEmptyJoker(r, c);
  }
}

function grantRandomJokerArtifact(r, c) {
  const artifact = grantRandomArtifact();
  if (artifact) {
    spawnPickupFloat(r, c, artifactLabel(artifact.id), 'float-info');
    playSfx('reward_unlock');
    showArtifactFoundOverlay(artifact);
    updateHud();
    autosaveIfActiveRun();
  } else {
    payOutEmptyJoker(r, c);
  }
}

function openJokerAt(r, c) {
  const joker = getJoker();
  if (!joker || r !== joker.r || c !== joker.c || joker.used) return false;

  if (joker.kind === 'paid') {
    const price = paidJokerPriceForLevel(getLevel());
    const choiceCount = hasArtifact('joker_choice') ? 2 : 0;
    playSfx('card_flip');
    showPaidJokerOverlay({
      price,
      canAfford: getGold() + getStashGold() >= price,
      choiceCount,
    }, () => {
      if (joker.used || getGold() + getStashGold() < price) return;
      spendGold(price);
      completeJokerEncounter(r, c);
      spawnPickupFloat(r, c, `Joker -${price}g`, 'float-info');
      playSfx('cash_register');
      updateHud();
      renderGrid();
      if (choiceCount > 1) {
        offerJokerChoices(r, c, choiceCount, {
          kicker: "Joker's Choice",
          title: `Choose 1 of ${choiceCount}`,
        });
      } else {
        grantRandomJokerArtifact(r, c);
      }
    });
    return true;
  }

  completeJokerEncounter(r, c);
  const choiceCount = hasArtifact('joker_choice') ? 4 : 3;
  offerJokerChoices(r, c, choiceCount, {
    kicker: 'Guaranteed Joker',
    title: `Choose 1 of ${choiceCount}`,
  });
  updateHud();
  renderGrid();
  return true;
}

function openMerchantAt(r, c) {
  const merchant = getMerchant();
  if (!merchant || r !== merchant.r || c !== merchant.c) return false;
  if (r !== getPlayerRow() || c !== getPlayerCol()) return false;
  getGrid()[r][c].preview = null;
  showShopOverlay(true);
  return true;
}

function openBankAt(r, c) {
  const cell = getGrid()[r][c];
  if (!cell?.bank) return false;
  if (r !== getPlayerRow() || c !== getPlayerCol()) return false;
  cell.preview = null;

  const renderBank = () => {
    const dueLevel = paymentAfterNextForLevel(getLevel());
    const pawnItems = Object.entries(PAWN_PRICES)
      .map(([key, price]) => ({
        key,
        price: artifactPawnPrice(price),
        count: getItemCount(key),
        name: key[0].toUpperCase() + key.slice(1),
      }))
      .filter(item => item.count > 0);
    showBankOverlay({
      offer: {
        available: cell.contractPayout > 0 && !cell.contractUsed,
        payout: cell.contractPayout,
        debt: cell.contractDebt,
        dueLevel,
      },
      pawnItems,
    }, () => {
      if (cell.contractUsed || cell.contractPayout <= 0) return;
      cell.contractUsed = true;
      const payout = cell.contractPayout;
      const debt = cell.contractDebt;
      cell.contractPayout = 0;
      cell.contractDebt = 0;
      addGold(payout);
      addPaymentDebt(dueLevel, debt);
      spawnPickupFloat(r, c, `🏦 +${payout}g / L${dueLevel} +${debt}`, 'float-info');
      playSfx('cash_register');
      updateHud();
      renderGrid();
      autosaveIfActiveRun();
      renderBank();
    }, (itemKey) => {
      const price = artifactPawnPrice(PAWN_PRICES[itemKey]);
      if (!price || getItemCount(itemKey) <= 0) return;
      consumeItem(itemKey);
      addGold(price);
      spawnPickupFloat(r, c, `Pawn +${price}g`, 'float-info');
      playSfx('cash_register');
      updateHud();
      renderGrid();
      autosaveIfActiveRun();
      renderBank();
    });
  };

  renderBank();
  return true;
}

function openContractBoardAt(r, c) {
  const cell = getGrid()[r][c];
  if (!cell?.contractBoard) return false;
  if (r !== getPlayerRow() || c !== getPlayerCol()) return false;
  cell.preview = null;

  if (!cell.contractChoices?.length && !cell.contractBoardUsed) {
    cell.contractChoices = randomContractChoices(artifactContractChoiceCount(3));
  }

  playSfx('pen_scratch');
  showContractBoardOverlay({
    choices: cell.contractChoices ?? [],
    openContracts: getOpenContracts(),
  }, contract => {
    const accepted = acceptContract(contract);
    if (!accepted) return;
    cell.contractBoardUsed = true;
    cell.contractChoices = [];
    spawnPickupFloat(r, c, `📋 -${accepted.cost}g · ${accepted.levelsRemaining} clears`, 'float-info');
    playSfx('stamp');
    updateHud();
    renderGrid();
    autosaveIfActiveRun();
  });
  return true;
}

export function collectAt(r, c) {
  const cell = getGrid()[r][c];
  const goldPickup = collectGoldCell(r, c);
  if (goldPickup?.kind === 'gold') {
    playSfx('gold');
    spawnPickupFloat(r, c, `${goldPickup.chest ? '🎁' : '💰'} +${goldPickup.amount}`);
  } else if (goldPickup?.kind === 'item') {
    spawnPickupFloat(r, c, `${PICKUP_EMOJI[goldPickup.item] || ''} +1`, 'float-info');
    playSfx('pickup');
  }
  if (cell.item) {
    addItem(cell.item, 1);
    spawnPickupFloat(r, c, `${PICKUP_EMOJI[cell.item] || ''} +1`);
    cell.item = null;
    playSfx('pickup');
  }
  activateCrystalCell(r, c);
  if (openJokerAt(r, c)) {
    return { kind: 'joker' };
  }
  if (getFountain() &&
      r === getFountain().r &&
      c === getFountain().c &&
      !getFountain().used) {
    if (getHp() >= getMaxHp()) {
      if (hasArtifact('fountain_item')) {
        const item = randomArtifactItemType();
        addItem(item, 1);
        getFountain().used = true;
        cell.preview = null;
        spawnPickupFloat(r, c, `${PICKUP_EMOJI[item] || ''} +1`, 'float-info');
        playSfx('pickup');
      } else {
        spawnPickupFloat(r, c, 'Already at full HP', 'float-info');
      }
    } else {
      fullHeal();
      getFountain().used = true;
      cell.preview = null;
      spawnPickupFloat(r, c, '+❤️', 'float-heal');
      playSfx('drink');
    }
  }
  if (openMerchantAt(r, c)) {
    return { kind: 'merchant' };
  }
  if (openBankAt(r, c)) {
    return { kind: 'bank' };
  }
  if (openContractBoardAt(r, c)) {
    return { kind: 'contract' };
  }
  return null;
}

export function collectRevealedGold({ animate = true } = {}) {
  let total = 0;
  const collected = [];
  const itemPickups = [];
  for (let r = 0; r < getRows(); r++) {
    for (let c = 0; c < getCols(); c++) {
      const cell = getGrid()[r][c];
      if (!getRevealed()[r]?.[c]) continue;
      if (cell.type !== 'gold' || cell.goldValue <= 0) continue;
      if (cell.chest) continue;
      const pickup = collectGoldCell(r, c);
      if (pickup?.kind === 'gold') {
        total += pickup.amount;
        collected.push({ r, c });
      } else if (pickup?.kind === 'item') {
        itemPickups.push(pickup.item);
      }
    }
  }
  if (total > 0) {
    if (animate) {
      collected.forEach((cell, idx) => {
        spawnGoldMagnetFly(cell.r, cell.c, Math.min(idx * 35, 280));
      });
    }
    spawnPickupFloat(getPlayerRow(), getPlayerCol(), `💰 +${total}`);
    playSfx('gold');
  }
  if (itemPickups.length > 0) {
    const label = itemPickups.length === 1
      ? `${PICKUP_EMOJI[itemPickups[0]] || ''} +1`
      : `🎒 +${itemPickups.length}`;
    spawnPickupFloat(getPlayerRow(), getPlayerCol(), label, 'float-info');
    playSfx('pickup');
  }
  if (animate && (total > 0 || itemPickups.length > 0)) {
    setTimeout(() => {
      if (hasRenderableBoardState()) renderGrid();
    }, 620);
  }
  return total;
}

function hasRenderableBoardState() {
  const rows = getRows();
  const cols = getCols();
  const grid = getGrid();
  const revealed = getRevealed();
  const flagged = getFlagged();
  if (grid.length !== rows || revealed.length !== rows || flagged.length !== rows) return false;
  for (let r = 0; r < rows; r++) {
    if (!grid[r] || !revealed[r] || !flagged[r]) return false;
    if (grid[r].length !== cols || revealed[r].length !== cols || flagged[r].length !== cols) return false;
  }
  return true;
}

// Walk from (startR, startC) stepping (dR, dC) each iteration. Skips the
// starting cell (callback fires on each subsequent cell). Stops at the
// first wall or grid boundary. The callback receives (r, c) — return true
// to continue, false to halt (e.g., to stop after a specific event).
export function walkRay(startR, startC, dR, dC, callback) {
  let r = startR + dR;
  let c = startC + dC;
  while (r >= 0 && r < getRows() && c >= 0 && c < getCols()) {
    if (getGrid()[r][c].type === 'wall') return;
    const keepGoing = callback(r, c);
    if (keepGoing === false) return;
    r += dR;
    c += dC;
  }
}

// Dig into a gas cell: mark it as detonated (passable, no icon, leaves a
// red cross marker). Neighbor adjacency numbers are intentionally NOT
// recomputed — a revealed "3" stays "3" even after you detonate one of
// the three gases, preserving the deduction info the player already
// earned.
export function detonateGas(r, c) {
  getGrid()[r][c].type = 'detonated';
  getGrid()[r][c].goldValue = 0;
  recordLevelGasTriggered();
  spawnPickupFloat(r, c, '💀', 'float-danger');
  revealFuseMarkedGas(r, c);
}

function revealFuseMarkedGas(r, c) {
  if (!hasArtifact('fuse_marks')) return null;
  const candidates = [];
  const radius = 2;
  for (let nr = r - radius; nr <= r + radius; nr++) {
    for (let nc = c - radius; nc <= c + radius; nc++) {
      if (nr < 0 || nr >= getRows() || nc < 0 || nc >= getCols()) continue;
      if (nr === r && nc === c) continue;
      if (getRevealed()[nr]?.[nc] || getFlagged()[nr]?.[nc]) continue;
      if (getGrid()[nr]?.[nc]?.type !== 'gas') continue;
      candidates.push({ r: nr, c: nc, dist: Math.abs(nr - r) + Math.abs(nc - c) });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.dist - b.dist || Math.random() - 0.5);
  const pick = candidates[0];
  getRevealed()[pick.r][pick.c] = true;
  spawnPickupFloat(pick.r, pick.c, 'Fuse Marks', 'float-info');
  return pick;
}

function maybeSettleHazardPay(r, c) {
  const hazard = settleHazardPay();
  if (!hazard) return null;
  spawnPickupFloat(r, c, `Hazard Pay +${hazard.amount}`, 'float-info');
  return hazard;
}

// Animate the player along a path of revealed cells. Returns true if the
// walk completed (including winning on the exit); returns false if
// something stopped it (e.g., win handled).
async function animateWalk(path) {
  for (let i = 1; i < path.length; i++) {
    setPlayerPosition(path[i].r, path[i].c);
    playSfx('step');
    updatePlayerSprite();
    autoRecenterOnPlayer();
    renderMinimap();
    await sleep(STEP_MS);
    const pickup = collectAt(path[i].r, path[i].c);
    updateHud();
    if (pickup?.kind === 'merchant' || pickup?.kind === 'bank' || pickup?.kind === 'contract' || pickup?.kind === 'joker') {
      renderGrid();
      autosaveIfActiveRun();
      return false;
    }

    if (path[i].r === getExit().r && path[i].c === getExit().c) {
      playSfx('win');
      setGameOver(true);
      renderGrid();
      if (getRulesetId() === AUTHORED_RULESET_ID) {
        addToLifetimeGold(getGold());
        showAuthoredClearedOverlay(getGold());
      } else {
        const effects = settleClearArtifacts();
        addToLifetimeGold(getGold());
        const nextSize = gridSizeForLevel(getLevel() + 1);
        showEscapedOverlay(getLevel(), getGold(), getStashGold(), nextSize, effects);
      }
      return false;
    }
  }
  renderGrid();
  autosaveIfActiveRun();
  return true;
}

function adjacentCells(r, c) {
  const cells = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= getRows() || nc < 0 || nc >= getCols()) continue;
      cells.push({ r: nr, c: nc });
    }
  }
  return cells;
}

function isTriggeredGasMark(pos) {
  if (!getRevealed()[pos.r]?.[pos.c]) return false;
  const type = getGrid()[pos.r]?.[pos.c]?.type;
  return type === 'detonated' || type === 'gas';
}

function tryChordReveal(r, c) {
  if (r !== getPlayerRow() || c !== getPlayerCol()) return false;
  const cell = getGrid()[r][c];
  if (!getRevealed()[r]?.[c] || cell.adjacent <= 0) return false;
  const neighbors = adjacentCells(r, c);
  const markedGas = neighbors.filter(pos =>
    getFlagged()[pos.r]?.[pos.c] || isTriggeredGasMark(pos)
  ).length;
  if (markedGas !== cell.adjacent) return false;

  let changed = false;
  for (const pos of neighbors) {
    if (getFlagged()[pos.r]?.[pos.c] || getRevealed()[pos.r]?.[pos.c]) continue;
    const target = getGrid()[pos.r][pos.c];
    if (target.type === 'wall') continue;
    changed = true;
    if (target.type === 'gas') {
      damagePlayer(1);
      detonateGas(pos.r, pos.c);
      maybeSettleHazardPay(pos.r, pos.c);
      getRevealed()[pos.r][pos.c] = true;
    } else {
      revealCell(pos.r, pos.c);
    }
  }
  if (!changed) return true;
  playSfx('dig');
  renderGrid();
  collectRevealedGold();
  updateHud();
  if (getHp() <= 0) {
    setGameOver(true);
    if (getRulesetId() === AUTHORED_RULESET_ID) {
      showAuthoredDeathOverlay(getGold());
    } else {
      recordRun({
        levelReached: getLevel(),
        totalGold: getRunGoldEarned(),
        cause: 'death',
      });
      clearSavedRun();
      showDeathOverlay(getLevel(), getGold(), getStashGold());
    }
  } else {
    autosaveIfActiveRun();
  }
  return true;
}

function tryFlagRemainingGasNeighbors(r, c) {
  const cell = getGrid()[r][c];
  if (!getRevealed()[r]?.[c] || cell.adjacent <= 0) return false;
  const neighbors = adjacentCells(r, c);
  const knownGas = neighbors.filter(pos =>
    getFlagged()[pos.r]?.[pos.c] || isTriggeredGasMark(pos)
  ).length;
  const remainingGas = cell.adjacent - knownGas;
  if (remainingGas <= 0) return false;

  const candidates = neighbors.filter(pos => {
    if (getFlagged()[pos.r]?.[pos.c] || getRevealed()[pos.r]?.[pos.c]) return false;
    return getGrid()[pos.r]?.[pos.c]?.type !== 'wall';
  });
  if (candidates.length !== remainingGas) return false;

  for (const pos of candidates) {
    getFlagged()[pos.r][pos.c] = true;
  }
  playSfx('mark');
  renderGrid();
  autosaveIfActiveRun();
  return true;
}

function settleClearArtifacts() {
  const dividend = settleExitDividend();
  const danger = settleDangerDividend();
  const cleanTools = settleCleanToolsBonus();
  const bounty = settleFlagBounty();
  const contracts = settleOpenContracts();
  const heal = settleEndLevelHeal();
  const completedContract = contracts.some(contract => contract.status === 'complete');
  const failedContract = contracts.some(contract => contract.status === 'failed');
  const progressedContract = contracts.some(contract => contract.status === 'progress');
  if (completedContract) {
    playSfx('cash_register');
  } else if (failedContract) {
    playSfx('paper_tear');
  } else if (progressedContract) {
    playSfx('pen_scratch');
  } else if (dividend?.amount || danger?.amount || cleanTools?.amount || (bounty?.net ?? 0) > 0) {
    playSfx('cash_register');
  } else if ((bounty?.net ?? 0) < 0) {
    playSfx('payment');
  } else if (heal?.amount) {
    playSfx('drink');
  }
  if (dividend?.amount || danger?.amount || cleanTools?.amount || bounty?.net || contracts.some(contract => contract.payout) || heal?.amount) updateHud();
  return { dividend, danger, cleanTools, bounty, contracts, contract: contracts[0] ?? null, heal };
}

// Among the 8 neighbors of (tr, tc), find the revealed non-wall cell
// reachable from the player with the shortest path. Returns { r, c, path }
// or null.
export function findBestApproach(tr, tc) {
  let best = null;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = tr + dr;
      const nc = tc + dc;
      if (nr < 0 || nr >= getRows() || nc < 0 || nc >= getCols()) continue;
      if (!getRevealed()[nr][nc]) continue;
      const t = getGrid()[nr][nc].type;
      if (t === 'wall' || t === 'gas') continue;
      const path = findPath(getPlayerRow(), getPlayerCol(), nr, nc);
      if (!path) continue;
      if (!best || path.length < best.path.length) {
        best = { r: nr, c: nc, path };
      }
    }
  }
  return best;
}

// Applies the currently-active item to cell (r, c) if valid, or cancels
// targeting if invalid. Returns true if the click was consumed (caller
// should stop); false if no active item (caller proceeds with normal dig).
async function handleItemClick(r, c) {
  if (!getActiveItem()) return false;
  const item = getActiveItem();
  const cell = getGrid()[r][c];

  if (item === 'pickaxe') {
    // Valid target: any wall cell.
    if (cell.type !== 'wall' || cell.void) {
      setActiveItem(null);
      updateItemBar();
      renderGrid();
      return true;
    }
    consumeItem('pickaxe');
    recordLevelItemUsed();
    setActiveItem(null);
    if (hasArtifact('scrap_voucher')) {
      addGold(SCRAP_VOUCHER_GOLD);
      spawnPickupFloat(r, c, `Scrap +${SCRAP_VOUCHER_GOLD}g`, 'float-info');
    }

    // Convert wall to revealed floor. Walls never participated in adjacency
    // counts, so neighbor numbers are already correct — only the new cell
    // needs its adjacency computed.
    cell.type = 'empty';
    cell.void = false;
    cell.goldValue = 0;
    cell.item = null; // defensive: walls shouldn't have items but be safe
    cell.adjacent = countAdjacentGas(r, c);
    getRevealed()[r][c] = true;

    // Cascade if adjacency is 0 — opens a pocket the way a scanner would.
    if (cell.adjacent === 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          revealCell(r + dr, c + dc);
        }
      }
    }

    playSfx('pickaxe');
    updateHud();
    renderGrid();
    autosaveIfActiveRun();
    return true;
  }

  return false;
}

export async function handleClick(r, c) {
  if (getGameOver()) return;
  if (getBusy()) return;

  // Re-open shop if player clicks their own cell and it's the merchant.
  if (r === getPlayerRow() && c === getPlayerCol() && openMerchantAt(r, c)) {
    autosaveIfActiveRun();
    return;
  }

  if (getActiveItem()) {
    await handleItemClick(r, c);
    return;
  }

  if (getGrid()[r][c].type === 'wall') return;

  setBusy(true);
  try {
    // Clicked a revealed cell: just walk to it.
    if (getRevealed()[r][c]) {
      if (tryChordReveal(r, c)) return;
      const path = findPath(getPlayerRow(), getPlayerCol(), r, c);
      if (!path || path.length < 2) return;
      await animateWalk(path);
      return;
    }

    // Clicked an unrevealed cell.
    if (getFlagged()[r][c]) return;

    // If adjacent, dig directly. Otherwise walk to the nearest revealed
    // cell adjacent to the target, then dig.
    if (!isAdjacentToPlayer(r, c)) {
      const approach = findBestApproach(r, c);
      if (!approach) return;
      const walked = await animateWalk(approach.path);
      if (!walked) return;
      await sleep(STEP_MS);
    }

    if (!isAdjacentToPlayer(r, c)) return;

    const cell = getGrid()[r][c];
    if (cell.type === 'gas') {
      playSfx('boom');
      damagePlayer(1);
      detonateGas(r, c);
      maybeSettleHazardPay(r, c);
      getRevealed()[r][c] = true;
      setPlayerPosition(r, c);
      updatePlayerSprite();
      flashHurtFace();
      updateHud();
      renderGrid();
      autoRecenterOnPlayer();

      if (getHp() <= 0) {
        setGameOver(true);
        if (getRulesetId() === AUTHORED_RULESET_ID) {
          showAuthoredDeathOverlay(getGold());
        } else {
          recordRun({
            levelReached: getLevel(),
            totalGold: getRunGoldEarned(),
            cause: 'death',
          });
          clearSavedRun();
          showDeathOverlay(getLevel(), getGold(), getStashGold());
        }
        return;
      }
      autosaveIfActiveRun();
    } else {
      playSfx('dig');
      revealCell(r, c);
      setPlayerPosition(r, c);
      updatePlayerSprite();
      collectAt(r, c);
      updateHud();
      renderGrid();
      autoRecenterOnPlayer();
      collectRevealedGold();
      updateHud();

      if (r === getExit().r && c === getExit().c) {
        playSfx('win');
        setGameOver(true);
        if (getRulesetId() === AUTHORED_RULESET_ID) {
          addToLifetimeGold(getGold());
          showAuthoredClearedOverlay(getGold());
        } else {
          const effects = settleClearArtifacts();
          addToLifetimeGold(getGold());
          const nextSize = gridSizeForLevel(getLevel() + 1);
          showEscapedOverlay(getLevel(), getGold(), getStashGold(), nextSize, effects);
        }
        return;
      }
      autosaveIfActiveRun();
    }
  } finally {
    setBusy(false);
  }
}

export function ensureSafeStart(r, c) {
  // Clear gas and walls from the start cell and its 8 neighbors
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= getRows() || nc < 0 || nc >= getCols()) continue;
      const cell = getGrid()[nr][nc];
      if (cell.type === 'gas') {
        cell.type = 'empty';
        cell.void = false;
        cell.goldValue = 0;
        // Relocate gas to a distant cell
        let relocated = false;
        let attempts = 0;
        while (!relocated && attempts < 500) {
          attempts++;
          const rr = Math.floor(Math.random() * getRows());
          const rc = Math.floor(Math.random() * getCols());
          const dist = Math.abs(rr - r) + Math.abs(rc - c);
          if (getGrid()[rr][rc].type === 'empty' && dist > 3) {
            getGrid()[rr][rc].type = 'gas';
            relocated = true;
          }
        }
      }
      if (cell.type === 'wall') {
        cell.type = 'empty';
        cell.void = false;
      }
    }
  }
  // Recalculate adjacency for all non-gas, non-wall cells
  for (let row = 0; row < getRows(); row++) {
    for (let col = 0; col < getCols(); col++) {
      const c2 = getGrid()[row][col];
      if (c2.type !== 'gas' && c2.type !== 'wall') {
        c2.adjacent = countAdjacentGas(row, col);
      }
    }
  }
}

export function revealCell(r, c) {
  if (r < 0 || r >= getRows() || c < 0 || c >= getCols()) return;
  if (getRevealed()[r][c]) return;
  const start = getGrid()[r][c];
  if (start.type === 'gas' || start.type === 'wall') return;

  const stack = [{ r, c }];
  const revealedCrystals = [];
  while (stack.length) {
    const { r: cr, c: cc } = stack.pop();
    if (cr < 0 || cr >= getRows() || cc < 0 || cc >= getCols()) continue;
    if (getRevealed()[cr][cc]) continue;
    const cell = getGrid()[cr][cc];
    if (cell.type === 'gas' || cell.type === 'wall') continue;
    getRevealed()[cr][cc] = true;
    if (cell.crystal && !cell.crystalUsed) revealedCrystals.push({ r: cr, c: cc });
    if (cell.adjacent === 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          stack.push({ r: cr + dr, c: cc + dc });
        }
      }
    }
  }
  for (const crystal of revealedCrystals) {
    activateCrystalCell(crystal.r, crystal.c);
  }
}

export function handleRightClick(r, c) {
  if (getGameOver()) return;
  if (getGrid()[r][c].type === 'wall') return;
  if (getRevealed()[r][c]) {
    tryFlagRemainingGasNeighbors(r, c);
    return;
  }
  getFlagged()[r][c] = !getFlagged()[r][c];
  playSfx(getFlagged()[r][c] ? 'mark' : 'unmark');
  renderGrid();
  autosaveIfActiveRun();
}

export function debugRevealAll() {
  for (let r = 0; r < getRows(); r++) {
    for (let c = 0; c < getCols(); c++) {
      getRevealed()[r][c] = true;
    }
  }
  renderGrid();
}

// Wire cross-module dependencies at module load.
setRenderDeps({ isAdjacentToPlayer });
