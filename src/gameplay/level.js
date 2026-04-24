import {
  getState,
  getLevel, getRows, getCols, getGrid, getRevealed,
  getLevelsSinceMerchant, getMerchant, getFountain,
  getRulesetId, getBiomeOverrides, getPlayerRow, getPlayerCol, getExit,
  moveGoldToStash,
  setPlayerPosition, setRevealed, setFlagged, setGameOver, setBusy,
  setExit, setActiveItem, setLevelsSinceMerchant,
  incrementLevelsSinceMerchant, setMerchant, setFountain,
  incrementLevel, setRows, setCols, setRulesetId, setBiomeOverrides,
  resetForNewRun, resetLevelGold, fullHeal,
  getSavePayload, applySavePayload,
} from '../state.js';
import { startBgm } from '../audio.js';
import { playerSprite } from '../ui/dom.js';
import { renderGrid, updateHud, updatePlayerSprite, resetHurtFlash } from '../ui/render.js';
import { getViewportSize, cellCenterPx, setPan } from '../ui/view.js';
import { hideOverlay } from '../ui/overlay.js';
import { RULESETS, weightedPick, resolveRuleset, gridSizeForLevel } from '../rulesets.js';
import {
  pickPlayerStart, pickExit, pickMerchantCorner, isReachable,
} from '../board/layout.js';
import {
  countAdjacentGas, generateGrid, placeAnchors,
  cleanMerchantCell, carvePath,
} from '../board/generation.js';
import { rollMerchantStock } from './merchant.js';
import { collectAt, ensureSafeStart, revealCell } from './interaction.js';
import { makeSolvable } from '../solver.js';

// ============================================================
// LEVEL LIFECYCLE
// ============================================================

// A/B toggle: ?oldgen=1 skips the no-guess solver entirely to compare feel.
function isOldGenMode() {
  try {
    return new URLSearchParams(window.location.search).get('oldgen') === '1';
  } catch {
    return false;
  }
}

const SAVE_KEY = 'miningCrawler.runState';

export function saveRun() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(getSavePayload()));
}

export function loadRun() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

export function initLevel() {
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

  // TEMP: suppress merchant/gold/items/fountain for no-guess playtesting.
  const PLAYTEST_STRIP = true;

  // Decide whether a merchant spawns this level.
  const spawnMerchant = PLAYTEST_STRIP ? false : (getBiomeOverrides()?.suppressMerchant
    ? false
    : (getLevelsSinceMerchant() >= 2 || Math.random() < 0.50));

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
      if (!isOldGenMode()) {
        const probeRevealed = Array.from({ length: getRows() }, () => Array(getCols()).fill(false));
        const probeFlagged  = Array.from({ length: getRows() }, () => Array(getCols()).fill(false));
        const excludeCells = [];
        if (merchantPos) excludeCells.push(merchantPos);
        const t0 = performance.now();
        const noGuessRes = makeSolvable(
          getGrid(), getRows(), getCols(),
          probeRevealed, probeFlagged,
          { r: getPlayerRow(), c: getPlayerCol() },
          exit,
          { maxFixAttempts: 30, exclude: excludeCells },
        );
        const tMs = Math.round(performance.now() - t0);
        console.info(`[no-guess] attempt=${attempt} fixups=${noGuessRes.fixups} solved=${noGuessRes.solved} t=${tMs}ms`);
        if (!noGuessRes.solved) continue;
      }
      if (merchantPos) {
        setMerchant({ r: merchantPos.r, c: merchantPos.c, stock: rollMerchantStock(), rerollCount: 0 });
      }
      solved = true;
    }
  }

  if (!solved) {
    console.warn(`initLevel: 50 attempts failed (noGuess=${!isOldGenMode()}), carving a guaranteed path from player to exit`);
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
  if (!PLAYTEST_STRIP && Math.random() < 0.50) {
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

export function startGame() {
  document.body.classList.add('in-run');
  clearSave();
  resetForNewRun();
  initLevel();
  updatePlayerSprite(true);
  resetHurtFlash();
  playerSprite.textContent = '🙂';
  startBgm();
}

export function resumeGame(save) {
  document.body.classList.add('in-run');
  applySavePayload(save);
  initLevel();
  updatePlayerSprite(true);
  resetHurtFlash();
  playerSprite.textContent = '🙂';
  startBgm();
}

export function nextLevel() {
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

export function retryLevel() {
  resetLevelGold();
  fullHeal();
  initLevel();
  updatePlayerSprite(true);
  resetHurtFlash();
  playerSprite.textContent = '🙂';
}
