import {
  MAX_HP, STEP_MS, CELL_SIZE, CELL_GAP, BOARD_PAD,
  getState,
  getGold, getStashGold, getHp, getLevel, getRows, getCols,
  getGrid, getRevealed, getFlagged, getGameOver, getBusy,
  getPlayerRow, getPlayerCol, getExit, getItems,
  getActiveItem, getLevelsSinceMerchant, getMerchant, getFountain,
  getRulesetId, getBiomeOverrides, getStartCornerIdx,
  addGold, spendGold, moveGoldToStash, damagePlayer,
  addItem, consumeItem,
  setPlayerPosition, setGrid, setRevealed, setFlagged, setGameOver,
  setBusy, setExit, setActiveItem, setLevelsSinceMerchant,
  incrementLevelsSinceMerchant, setMerchant, setFountain, setLevel,
  incrementLevel, setRows, setCols, setRulesetId, setBiomeOverrides,
  setStartCornerIdx, setItems,
  resetForNewRun, resetLevelGold, fullHeal,
  getSavePayload, applySavePayload,
  addToLifetimeGold, getLifetimeGold,
} from './state.js';

import { resumeAudioCtx, playSfx, startBgm, setMusicOn as setAudioMusicOn, setSfxOn as setSfxOnAudio } from './audio.js';
import { settings, saveSettings } from './settings.js';
import { playerSprite, pauseBtn } from './ui/dom.js';
import {
  renderGrid, updateHud, updateItemBar, updatePlayerSprite,
  flashHurtFace, spawnPickupFloat, resetHurtFlash, PICKUP_EMOJI,
  setRenderDeps,
} from './ui/render.js';
import {
  getViewportSize, cellCenterPx,
  setPan, animatePanTo, centerOnCell,
  isCellOutsideCenterRect, autoRecenterOnPlayer,
  applyPan, renderMinimap,
} from './ui/view.js';
import {
  initOverlay, showOverlay, hideOverlay, showEscapedOverlay,
  showDeathOverlay, renderStartMenu, renderPauseMenu, renderRules,
  renderSettings, renderNewRunConfirm,
} from './ui/overlay.js';
import { initShop, showShopOverlay } from './ui/shop.js';
import { initPointer } from './ui/pointer.js';
import {
  rollMerchantStock, buyFromMerchant, rerollMerchant, leaveShop,
} from './gameplay/merchant.js';
import { ITEM_TOOLTIPS, initItems } from './gameplay/items.js';
import {
  RULESETS, weightedPick, resolveRuleset,
  gridSizeForLevel, anchorCountForSize,
} from './rulesets.js';
import {
  STEP_DIRS, findNearCorner, pickPlayerStart, pickExit,
  pickMerchantCorner, hasNonWallNeighbor, isReachable, findPath,
} from './board/layout.js';
import {
  placeWallClumps, countAdjacentGas, generateGrid,
  placeGoldVeins, placeItemDrops, placeAnchors,
  cleanMerchantCell, carvePath,
  setRevealCell,
} from './board/generation.js';

// Cell object shape:
// { type: 'empty' | 'gas' | 'gold' | 'wall' | 'detonated', adjacent: number, goldValue: number, item: null | 'potion' | 'scanner' | 'pickaxe' }
// 'detonated' = a gas cell that was dug into; now passable floor that shows a red cross.
// 'item' = if non-null, the item is visible on the revealed cell and gets
// picked up when the player steps onto the cell (not merely on reveal).

// Sync audio module with persisted settings so its internal flags match on startup.
setAudioMusicOn(settings.musicOn);
setSfxOnAudio(settings.sfxOn);

// Callback for revealCell, removed in Task 17 when revealCell moves out of main.js.
setRevealCell(revealCell);

// Only isAdjacentToPlayer is still injected here — items.js owns the four
// *HasTarget deps. Removed fully in Task 17 when isAdjacentToPlayer moves.
setRenderDeps({
  isAdjacentToPlayer,
});

// Inject walkRay / detonateGas / revealCell into items.js until interaction.js
// extracts them in Task 17.
initItems({
  walkRay,
  detonateGas,
  revealCell,
});

// Wire shop callbacks to main.js merchant functions.
initShop({
  onBuy: buyFromMerchant,
  onReroll: rerollMerchant,
  onLeave: leaveShop,
  getTooltipData: (itemKey) => ITEM_TOOLTIPS[itemKey],
});

// Wire overlay callbacks to main.js lifecycle functions.
initOverlay({
  onStartGame: startGame,
  onResumeGame: resumeGame,
  onNextLevel: nextLevel,
  onRetryLevel: retryLevel,
  onSaveRun: saveRun,
  onClearSave: clearSave,
  onLoadRun: loadRun,
  onToggleMusic: setMusicOn,
  onToggleSfx: setSfxOn,
});

document.addEventListener('touchstart', resumeAudioCtx, { once: true });
document.addEventListener('click', resumeAudioCtx, { once: true });

// Wrapper functions that update both audio module and persisted settings.
function setMusicOn(value) {
  settings.musicOn = value;
  saveSettings();
  setAudioMusicOn(value);
}

function setSfxOn(value) {
  settings.sfxOn = value;
  saveSettings();
  setSfxOnAudio(value);
}

function debugRevealAll() {
  for (let r = 0; r < getRows(); r++) {
    for (let c = 0; c < getCols(); c++) {
      getRevealed()[r][c] = true;
    }
  }
  renderGrid();
}

function isAdjacentToPlayer(r, c) {
  const dr = Math.abs(r - getPlayerRow());
  const dc = Math.abs(c - getPlayerCol());
  if (dr === 0 && dc === 0) return false;
  return dr <= 1 && dc <= 1;
}

function collectAt(r, c) {
  const cell = getGrid()[r][c];
  if (cell.type === 'gold' && cell.goldValue > 0) {
    playSfx('gold');
    spawnPickupFloat(r, c, `${cell.chest ? '🎁' : '💰'} +${cell.goldValue}`);
    addGold(cell.goldValue);
    cell.goldValue = 0;
    cell.chest = false;
  }
  if (cell.item) {
    addItem(cell.item, 1);
    spawnPickupFloat(r, c, `${PICKUP_EMOJI[cell.item] || ''} +1`);
    cell.item = null;
    playSfx('pickup');
  }
  if (getFountain() &&
      r === getFountain().r &&
      c === getFountain().c &&
      !getFountain().used) {
    if (getHp() >= MAX_HP) {
      spawnPickupFloat(r, c, 'Already at full HP', 'float-info');
    } else {
      fullHeal();
      getFountain().used = true;
      spawnPickupFloat(r, c, '+❤️', 'float-heal');
      playSfx('drink');
    }
  }
}

// Walk from (startR, startC) stepping (dR, dC) each iteration. Skips the
// starting cell (callback fires on each subsequent cell). Stops at the
// first wall or grid boundary. The callback receives (r, c) — return true
// to continue, false to halt (e.g., to stop after a specific event).
function walkRay(startR, startC, dR, dC, callback) {
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
function detonateGas(r, c) {
  getGrid()[r][c].type = 'detonated';
  getGrid()[r][c].goldValue = 0;
  spawnPickupFloat(r, c, '💀', 'float-danger');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    collectAt(path[i].r, path[i].c);
    updateHud();

    if (path[i].r === getExit().r && path[i].c === getExit().c) {
      playSfx('win');
      setGameOver(true);
      renderGrid();
      addToLifetimeGold(getGold());
      const nextSize = gridSizeForLevel(getLevel() + 1);
      showEscapedOverlay(getLevel(), getGold(), getStashGold(), nextSize);
      return false;
    }
  }
  renderGrid();
  // Open shop if we landed on the merchant.
  if (getMerchant() &&
      getPlayerRow() === getMerchant().r &&
      getPlayerCol() === getMerchant().c) {
    showShopOverlay(true);
  }
  return true;
}

// Among the 8 neighbors of (tr, tc), find the revealed non-wall cell
// reachable from the player with the shortest path. Returns { r, c, path }
// or null.
function findBestApproach(tr, tc) {
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
    if (cell.type !== 'wall') {
      setActiveItem(null);
      updateItemBar();
      renderGrid();
      return true;
    }
    consumeItem('pickaxe');
    setActiveItem(null);

    // Convert wall to revealed floor. Walls never participated in adjacency
    // counts, so neighbor numbers are already correct — only the new cell
    // needs its adjacency computed.
    cell.type = 'empty';
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
    return true;
  }

  return false;
}

async function handleClick(r, c) {
  if (getGameOver()) return;
  if (getBusy()) return;

  // Re-open shop if player clicks their own cell and it's the merchant.
  if (r === getPlayerRow() && c === getPlayerCol() &&
      getMerchant() && r === getMerchant().r && c === getMerchant().c) {
    showShopOverlay(true);
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
      getRevealed()[r][c] = true;
      setPlayerPosition(r, c);
      updatePlayerSprite();
      flashHurtFace();
      updateHud();
      renderGrid();
      autoRecenterOnPlayer();

      if (getHp() <= 0) {
        setGameOver(true);
        showDeathOverlay(getLevel(), getGold(), getStashGold());
        return;
      }
    } else {
      playSfx('dig');
      revealCell(r, c);
      setPlayerPosition(r, c);
      updatePlayerSprite();
      collectAt(r, c);
      updateHud();
      renderGrid();
      autoRecenterOnPlayer();

      if (r === getExit().r && c === getExit().c) {
        playSfx('win');
        setGameOver(true);
        addToLifetimeGold(getGold());
        const nextSize = gridSizeForLevel(getLevel() + 1);
        showEscapedOverlay(getLevel(), getGold(), getStashGold(), nextSize);
        return;
      }
    }
  } finally {
    setBusy(false);
  }
}

function ensureSafeStart(r, c) {
  // Clear gas and walls from the start cell and its 8 neighbors
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= getRows() || nc < 0 || nc >= getCols()) continue;
      const cell = getGrid()[nr][nc];
      if (cell.type === 'gas') {
        cell.type = 'empty';
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

function revealCell(r, c) {
  if (r < 0 || r >= getRows() || c < 0 || c >= getCols()) return;
  if (getRevealed()[r][c]) return;
  if (getGrid()[r][c].type === 'gas') return;
  if (getGrid()[r][c].type === 'wall') return;

  getRevealed()[r][c] = true;
  const cell = getGrid()[r][c];

  if (cell.adjacent === 0) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        revealCell(r + dr, c + dc);
      }
    }
  }
}


function handleRightClick(r, c) {
  if (getGameOver()) return;
  if (getGrid()[r][c].type === 'wall') return;  // NEW
  if (getRevealed()[r][c]) return;
  getFlagged()[r][c] = !getFlagged()[r][c];
  playSfx(getFlagged()[r][c] ? 'mark' : 'unmark');
  renderGrid();
}





// ============================================================
// INIT
// ============================================================

function initLevel() {
  // Roll ruleset if not already set (retries/resumes preserve it).
  if (!getRulesetId()) {
    setRulesetId((getLevel() >= 13 && RULESETS.length > 1)
      ? weightedPick(RULESETS).id
      : 'regular');
  }
  // Clear biome overrides from any previous level before prepare sets them again.
  setBiomeOverrides(null);
  const ruleset = resolveRuleset(getRulesetId());
  // Ruleset hooks receive the raw state singleton as their parameter — see
  // the RULESETS contract at the top of this file.
  ruleset.prepare?.(getState());

  setGameOver(false);
  setBusy(false);
  setActiveItem(null);
  setMerchant(null);
  setFountain(null);
  setRows(gridSizeForLevel(getLevel()));
  setCols(getRows());

  // Decide whether a merchant spawns this level.
  const spawnMerchant = getBiomeOverrides()?.suppressMerchant
    ? false
    : (getLevelsSinceMerchant() >= 2 || Math.random() < 0.50);

  const maxAttempts = 50;
  let solved = false;

  for (let attempt = 0; attempt < maxAttempts && !solved; attempt++) {
    setRevealed(Array.from({ length: getRows() }, () => Array(getCols()).fill(false)));
    setFlagged(Array.from({ length: getRows() }, () => Array(getCols()).fill(false)));
    const gasDensity = getBiomeOverrides()?.gasDensity ?? 0.20;
    const gasCount = Math.floor(getRows() * getCols() * gasDensity);
    generateGrid(gasCount);

    const start = pickPlayerStart();
    if (!start) continue;
    setPlayerPosition(start.r, start.c);
    ensureSafeStart(getPlayerRow(), getPlayerCol());
    // Spawn cell auto-reveals; don't grant a free item there.
    getGrid()[getPlayerRow()][getPlayerCol()].item = null;

    const exit = pickExit(getPlayerRow(), getPlayerCol());
    if (!exit) continue;
    setExit(exit);

    // Exit cell itself must not be gas
    if (getGrid()[exit.r][exit.c].type === 'gas') {
      getGrid()[exit.r][exit.c].type = 'empty';
      // recompute adjacency for neighbors (a gas was removed)
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = exit.r + dr;
          const nc = exit.c + dc;
          if (nr < 0 || nr >= getRows() || nc < 0 || nc >= getCols()) continue;
          const c2 = getGrid()[nr][nc];
          if (c2.type !== 'gas' && c2.type !== 'wall') {
            c2.adjacent = countAdjacentGas(nr, nc);
          }
        }
      }
    }
    // Exit cell stays mechanically clean — no item drop there either.
    getGrid()[exit.r][exit.c].item = null;

    // Exit cell should not carry gold — keeps the exit cell mechanically clean
    if (getGrid()[exit.r][exit.c].type === 'gold') {
      getGrid()[exit.r][exit.c].type = 'empty';
      getGrid()[exit.r][exit.c].goldValue = 0;
    }

    // Merchant placement (if this level spawns one).
    let merchantPos = null;
    if (spawnMerchant) {
      merchantPos = pickMerchantCorner();
      if (!merchantPos) continue;
      if (merchantPos.r === getPlayerRow() && merchantPos.c === getPlayerCol()) continue;
      if (merchantPos.r === exit.r && merchantPos.c === exit.c) continue;
      cleanMerchantCell(merchantPos.r, merchantPos.c);
    }

    const exitReachable = isReachable(getPlayerRow(), getPlayerCol(), exit.r, exit.c);
    const merchantReachable = !merchantPos || isReachable(getPlayerRow(), getPlayerCol(), merchantPos.r, merchantPos.c);
    if (exitReachable && merchantReachable) {
      if (merchantPos) {
        setMerchant({ r: merchantPos.r, c: merchantPos.c, stock: rollMerchantStock(), rerollCount: 0 });
      }
      solved = true;
    }
  }

  if (!solved) {
    console.warn('initLevel: 50 attempts failed, carving a guaranteed path from player to exit');
    carvePath(getPlayerRow(), getPlayerCol(), getExit().r, getExit().c);
    if (spawnMerchant) {
      // Place merchant at its corner anchor (may have been unreachable) and carve a path to it.
      const merchantPos = pickMerchantCorner();
      if (merchantPos) {
        cleanMerchantCell(merchantPos.r, merchantPos.c);
        carvePath(getPlayerRow(), getPlayerCol(), merchantPos.r, merchantPos.c);
        setMerchant({ r: merchantPos.r, c: merchantPos.c, stock: rollMerchantStock(), rerollCount: 0 });
      }
    }
  }

  // Roll fountain (50%, no pity, ruleset-agnostic). Placement is independent
  // of reachability — a walled-off fountain is acceptable.
  if (Math.random() < 0.50) {
    const candidates = [];
    for (let r = 0; r < getRows(); r++) {
      for (let c = 0; c < getCols(); c++) {
        if (getGrid()[r][c].type !== 'empty') continue;
        if (getGrid()[r][c].item) continue;
        if (r === getPlayerRow() && c === getPlayerCol()) continue;
        if (r === getExit().r && c === getExit().c) continue;
        if (getMerchant() && r === getMerchant().r && c === getMerchant().c) continue;
        candidates.push({ r, c });
      }
    }
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      getGrid()[pick.r][pick.c].type = 'fountain';
      setFountain({ r: pick.r, c: pick.c, used: false });
    }
  }

  // Pre-reveal exit, start, and merchant cells; start cell cascades for anchor merge-check.
  getRevealed()[getExit().r][getExit().c] = true;
  getRevealed()[getPlayerRow()][getPlayerCol()] = true;
  if (getMerchant()) {
    getRevealed()[getMerchant().r][getMerchant().c] = true;
  }
  if (getFountain()) {
    getRevealed()[getFountain().r][getFountain().c] = true;
  }

  // Reveal the player's start 3×3 so new players see safe ground around them.
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      revealCell(getPlayerRow() + dr, getPlayerCol() + dc);
    }
  }

  placeAnchors();

  collectAt(getPlayerRow(), getPlayerCol());

  updateHud();
  renderGrid();
  // Snap pan to center on player at level start (instant, not animated).
  const vp = getViewportSize();
  const cc = cellCenterPx(getPlayerRow(), getPlayerCol());
  setPan(vp.w / 2 - cc.x, vp.h / 2 - cc.y);
  // Ruleset hooks receive the raw state singleton — see RULESETS contract.
  // Hooks may mutate the grid (e.g., treasure_chamber overwrites corner cells),
  // so re-render after they run.
  ruleset.apply?.(getState());
  renderGrid();
  hideOverlay();
}

const SAVE_KEY = 'miningCrawler.runState';

function saveRun() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(getSavePayload()));
}

function loadRun() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

function startGame() {
  document.body.classList.add('in-run');
  clearSave();
  resetForNewRun();
  initLevel();
  updatePlayerSprite(true);
  resetHurtFlash();
  playerSprite.textContent = '🙂';
  startBgm();
}

function resumeGame(save) {
  document.body.classList.add('in-run');
  applySavePayload(save);
  initLevel();
  updatePlayerSprite(true);
  resetHurtFlash();
  playerSprite.textContent = '🙂';
  startBgm();
}

function nextLevel() {
  moveGoldToStash();
  incrementLevel();
  const overrides = getBiomeOverrides();
  if (overrides?.freezePityTick) {
    // Freeze pity timer: do not increment levelsSinceMerchant across this level.
  } else if (getMerchant()) {
    setLevelsSinceMerchant(0);
  } else {
    incrementLevelsSinceMerchant();
  }
  setRulesetId(null);
  saveRun();
  initLevel();
  updatePlayerSprite(true);
  resetHurtFlash();
  playerSprite.textContent = '🙂';
}

function retryLevel() {
  resetLevelGold();
  fullHeal();
  initLevel();
  updatePlayerSprite(true);
  resetHurtFlash();
  playerSprite.textContent = '🙂';
}

// Wire pointer arbiter callbacks to gameplay handlers.
initPointer({
  onCellTap: handleClick,
  onCellLongPress: handleRightClick,
});

pauseBtn.addEventListener('click', renderPauseMenu);

// Register service worker so Android Chrome offers install.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

renderStartMenu();
