import {
  getState,
  getLevel, getRows, getCols, getGrid, getRevealed, getFlagged,
  getLevelsSinceMerchant, getMerchant, getFountain, getJoker,
  getRulesetId, getBiomeOverrides, getPlayerRow, getPlayerCol, getExit,
  getStartCornerIdx, getGameOver, getBiomeId,
  getStashGold, getRunGoldEarned, hasArtifact, moveGoldToStash, spendGold,
  setPlayerPosition, setRevealed, setFlagged, setGameOver, setBusy,
  setGrid, setExit, setActiveItem, setLevelsSinceMerchant,
  incrementLevelsSinceMerchant, setMerchant, setFountain, setJoker,
  incrementLevel, setLevel, setRows, setCols, setRulesetId, setBiomeOverrides,
  setStartCornerIdx, setGenMeta, setBiomeId,
  addItem, resetForNewRun, resetLevelGold, resetLevelArtifactState, fullHeal,
  getSavePayload, applySavePayload,
} from '../state.js';
import { startBgm } from '../audio.js';
import { playerSprite } from '../ui/dom.js';
import { PICKUP_EMOJI, renderGrid, updateHud, updatePlayerSprite, resetHurtFlash, spawnPickupFloat } from '../ui/render.js';
import { getViewportSize, cellCenterPx, setPan } from '../ui/view.js';
import { hideOverlay, showGenerationOverlay, showPaymentFailedOverlay, showRunWonOverlay } from '../ui/overlay.js';
import { RULESETS, weightedPick, resolveRuleset, gridSizeForLevel } from '../rulesets.js';
import {
  pickMerchantCorner, isReachable,
} from '../board/layout.js';
import {
  countAdjacentGas,
  cleanMerchantCell, carvePath,
  generateRegionalGrid, validateRegionalGeneration, getRegionalMetrics,
} from '../board/generation.js';
import { rollMerchantStock } from './merchant.js';
import { recordRun } from './leaderboard.js';
import { isFinalRunLevel, isPostPaymentRewardLevel, paymentAmountForLevel } from './quota.js';
import { BIOME_BODY_CLASSES, biomeById, biomeForLevel } from './biomes.js';
import {
  artifactPaymentAmount,
  isArtifactCadenceLevel,
  randomArtifactItemType,
  useDebtCushion,
} from './artifacts.js';
import { clearSavedRun, loadRunPayload, saveRunPayload } from './runSave.js';
import { collectAt, collectRevealedGold, ensureSafeStart, revealCell } from './interaction.js';
import { makeSolvable, solve, syncRevealedZeroCascades } from '../solver.js';

// ============================================================
// LEVEL LIFECYCLE
// ============================================================

// Keep in sync with authored.js. Duplicated here to avoid turning save helpers
// into part of the authored playback import graph.
const AUTHORED_RULESET_ID = 'authored';

// A/B toggle: ?oldgen=1 skips the no-guess solver entirely to compare feel.
function isOldGenMode() {
  try {
    return new URLSearchParams(window.location.search).get('oldgen') === '1';
  } catch {
    return false;
  }
}

// Minimum deduction steps required per level bracket.
// Boards solved in fewer steps than minSteps are rejected (too trivial).
function stepRange(level, { regional = false } = {}) {
  if (regional) {
    if (level <= 4)  return { min: 2, max: 8 };
    if (level <= 12) return { min: 4, max: 12 };
    return { min: 6, max: Infinity };
  }
  if (level <= 4)  return { min: 3, max: 5 };
  if (level <= 12) return { min: 5, max: 10 };
  return { min: 8, max: Infinity };
}

const MERCHANT_SPAWN_CHANCE = 0.33;
const JOKER_SPAWN_CHANCE = 0.33;

function waitForLoadingPaint() {
  return new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function pickRegionalCorners() {
  const corners = [
    { r: 0, c: 0 },
    { r: 0, c: getCols() - 1 },
    { r: getRows() - 1, c: 0 },
    { r: getRows() - 1, c: getCols() - 1 },
  ];
  const startIdx = Math.floor(Math.random() * 4);
  setStartCornerIdx(startIdx);
  return {
    start: corners[startIdx],
    exit: corners[3 - startIdx],
  };
}

function regionalFeatureCell(genMeta, purpose) {
  const region = genMeta?.regions?.find(r => r.purpose === purpose);
  return region?.featureCell ?? null;
}

function revealRandomGasForSurvey() {
  if (!hasArtifact('gas_survey')) return null;
  const candidates = [];
  for (let r = 0; r < getRows(); r++) {
    for (let c = 0; c < getCols(); c++) {
      if (getRevealed()[r]?.[c]) continue;
      if (getGrid()[r]?.[c]?.type !== 'gas') continue;
      candidates.push({ r, c });
    }
  }
  if (!candidates.length) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  getRevealed()[pick.r][pick.c] = true;
  return pick;
}

function revealBranchLanternCells(genMeta) {
  if (!hasArtifact('branch_lantern')) return 0;
  if (!genMeta?.regions?.length) return 0;
  let revealed = 0;
  for (const branch of genMeta.regions.filter(region => region.kind === 'branch')) {
    const entrance = branch.entrance;
    if (!entrance) continue;
    const cell = getGrid()[entrance.r]?.[entrance.c];
    if (!cell || cell.type === 'gas' || cell.type === 'wall') continue;
    if (!getRevealed()[entrance.r]?.[entrance.c]) revealed++;
    getRevealed()[entrance.r][entrance.c] = true;
  }
  return revealed;
}

function revealMinersMapCell(genMeta) {
  if (!hasArtifact('miners_map')) return null;
  const spine = genMeta?.regions?.find(region => region.kind === 'spine');
  if (!spine) return null;
  const candidates = spine.cells.filter(cell => {
    if (cell.r === getPlayerRow() && cell.c === getPlayerCol()) return false;
    if (cell.r === getExit().r && cell.c === getExit().c) return false;
    if (getRevealed()[cell.r]?.[cell.c]) return false;
    const gridCell = getGrid()[cell.r]?.[cell.c];
    return gridCell?.type === 'empty' && gridCell.adjacent > 0;
  });
  if (!candidates.length) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  getRevealed()[pick.r][pick.c] = true;
  return pick;
}

function applyLevelStartArtifactReveals(genMeta) {
  const lanternCount = revealBranchLanternCells(genMeta);
  const mapCell = revealMinersMapCell(genMeta);
  return { lanternCount, mapCell };
}

function applyLevelStartItemArtifacts() {
  if (!isArtifactCadenceLevel(getLevel())) return [];
  const effects = [];
  if (hasArtifact('wide_pockets')) {
    const item = randomArtifactItemType();
    addItem(item, 1);
    effects.push({ item, label: `${PICKUP_EMOJI[item] || ''} +1` });
  }
  if (hasArtifact('pocket_pickaxe')) {
    addItem('pickaxe', 1);
    effects.push({ item: 'pickaxe', label: `${PICKUP_EMOJI.pickaxe} +1` });
  }
  return effects;
}

function logRegionalAccept(level, attempt, genMeta, solveRes, fixups, tMs, stepNote = '') {
  const metrics = getRegionalMetrics(genMeta, solveRes.revealed);
  genMeta.metrics = metrics;
  console.info(`[regional-gen] level=${level} size=${getRows()} regions=spine:${metrics.spineCells} branch:${metrics.branchCells}`);
  console.info(`[regional-gen] spineGold=${metrics.spineGold} optionalGold=${metrics.optionalGold} gates=${metrics.gates} branchLeak=${metrics.branchLeak.toFixed(2)} attempts=${attempt + 1}`);
  console.info(`[no-guess] attempt=${attempt} ACCEPT steps=${solveRes.steps} need=[${stepRange(level, { regional: true }).min},${stepRange(level, { regional: true }).max}] fixups=${fixups}${stepNote} t=${tMs}ms`);
}

function cloneGrid(grid) {
  return grid.map(row => row.map(cell => ({ ...cell })));
}

function cloneMatrix(matrix) {
  return matrix.map(row => row.slice());
}

function clonePlain(value) {
  return value == null ? null : structuredClone(value);
}

function captureGeneratedCandidate({ genMeta, solveRes, regionalCheck, min, max, reason }) {
  const rewardRevealed = regionalCheck?.issues?.some(issue => issue.includes('reward revealed'));
  if (rewardRevealed) return null;

  const stepShortfall = Math.max(0, min - solveRes.steps);
  const stepOverflow = Number.isFinite(max) ? Math.max(0, solveRes.steps - max) : 0;
  const leakPenalty = regionalCheck?.ok ? 0 : Math.round((regionalCheck?.branchLeak ?? 0) * 100);
  const score =
    (regionalCheck?.ok ? 1000 : 650) +
    Math.min(solveRes.steps, min) * 40 -
    stepShortfall * 140 -
    stepOverflow * 80 -
    leakPenalty;

  return {
    score,
    reason,
    steps: solveRes.steps,
    branchLeak: regionalCheck?.branchLeak ?? 0,
    grid: cloneGrid(getGrid()),
    revealed: cloneMatrix(getRevealed()),
    flagged: cloneMatrix(getFlagged()),
    merchant: clonePlain(getMerchant()),
    fountain: clonePlain(getFountain()),
    joker: clonePlain(getJoker()),
    genMeta: clonePlain(genMeta),
    player: { r: getPlayerRow(), c: getPlayerCol() },
    exit: { ...getExit() },
    startCornerIdx: getStartCornerIdx(),
  };
}

function restoreGeneratedCandidate(candidate) {
  setGrid(cloneGrid(candidate.grid));
  setRevealed(cloneMatrix(candidate.revealed));
  setFlagged(cloneMatrix(candidate.flagged));
  setMerchant(clonePlain(candidate.merchant));
  setFountain(clonePlain(candidate.fountain));
  setJoker(clonePlain(candidate.joker));
  setGenMeta(clonePlain(candidate.genMeta));
  setPlayerPosition(candidate.player.r, candidate.player.c);
  setExit({ ...candidate.exit });
  setStartCornerIdx(candidate.startCornerIdx);
}

const SAVED_LEVEL_VERSION = 1;

function matrixMatchesShape(matrix, rows, cols) {
  if (!Array.isArray(matrix) || matrix.length !== rows) return false;
  return matrix.every(row => Array.isArray(row) && row.length === cols);
}

function hasSavableLevelState() {
  const rows = getRows();
  const cols = getCols();
  if (rows <= 0 || cols <= 0) return false;
  return matrixMatchesShape(getGrid(), rows, cols) &&
    matrixMatchesShape(getRevealed(), rows, cols) &&
    matrixMatchesShape(getFlagged(), rows, cols);
}

export function captureSavedLevelState() {
  if (!hasSavableLevelState()) return null;
  return {
    version: SAVED_LEVEL_VERSION,
    rows: getRows(),
    cols: getCols(),
    grid: cloneGrid(getGrid()),
    revealed: cloneMatrix(getRevealed()),
    flagged: cloneMatrix(getFlagged()),
    player: { r: getPlayerRow(), c: getPlayerCol() },
    exit: { ...getExit() },
    merchant: clonePlain(getMerchant()),
    fountain: clonePlain(getFountain()),
    joker: clonePlain(getJoker()),
    startCornerIdx: getStartCornerIdx(),
    biomeId: getBiomeId(),
    biomeOverrides: clonePlain(getBiomeOverrides()),
  };
}

export function restoreSavedLevelState(levelState) {
  if (!levelState || levelState.version !== SAVED_LEVEL_VERSION) return false;
  const rows = levelState.rows;
  const cols = levelState.cols;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows <= 0 || cols <= 0) return false;
  if (!matrixMatchesShape(levelState.grid, rows, cols)) return false;
  if (!matrixMatchesShape(levelState.revealed, rows, cols)) return false;
  if (!matrixMatchesShape(levelState.flagged, rows, cols)) return false;
  if (!levelState.player || !levelState.exit) return false;

  setRows(rows);
  setCols(cols);
  setGrid(cloneGrid(levelState.grid));
  setRevealed(cloneMatrix(levelState.revealed));
  setFlagged(cloneMatrix(levelState.flagged));
  setPlayerPosition(levelState.player.r, levelState.player.c);
  setExit({ ...levelState.exit });
  setMerchant(clonePlain(levelState.merchant));
  setFountain(clonePlain(levelState.fountain));
  setJoker(clonePlain(levelState.joker));
  setGenMeta(null);
  setStartCornerIdx(levelState.startCornerIdx ?? 0);
  setBiomeId(levelState.biomeId ?? getBiomeId() ?? biomeForLevel(getLevel()).id);
  setBiomeOverrides(clonePlain(levelState.biomeOverrides));
  applyBiomePresentation(activeBiomeForCurrentState());
  setGameOver(false);
  setBusy(false);
  setActiveItem(null);
  return true;
}

function centerPanOnPlayer() {
  const vp = getViewportSize();
  const cc = cellCenterPx(getPlayerRow(), getPlayerCol());
  setPan(vp.w / 2 - cc.x, vp.h / 2 - cc.y);
}

function applyBiomePresentation(biome) {
  for (const className of BIOME_BODY_CLASSES) {
    document.body.classList.remove(className);
  }
  if (biome?.id) document.body.dataset.biome = biome.id;
  else document.body.removeAttribute('data-biome');
  if (biome?.theme?.className) document.body.classList.add(biome.theme.className);
}

function setActiveBiomeForLevel(level = getLevel()) {
  const biome = biomeForLevel(level);
  setBiomeId(biome.id);
  applyBiomePresentation(biome);
  return biome;
}

function activeBiomeForCurrentState() {
  return biomeById(getBiomeId()) ?? setActiveBiomeForLevel();
}

export function saveRun() {
  if (getRulesetId() === AUTHORED_RULESET_ID || getGameOver()) return;
  const levelState = captureSavedLevelState();
  saveRunPayload(getSavePayload(levelState ? { levelState } : {}));
}

export function loadRun() {
  return loadRunPayload();
}

export function clearSave() {
  clearSavedRun();
}

export async function initLevel() {
  const activeBiome = setActiveBiomeForLevel();
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
  setJoker(null);
  setGenMeta(null);
  resetLevelArtifactState();
  setRows(gridSizeForLevel(getLevel()));
  setCols(getRows());

  // Decide whether a merchant spawns this level.
  const biomeFeatures = activeBiome.features ?? {};
  const spawnMerchant = getBiomeOverrides()?.suppressMerchant
    ? false
    : (getLevelsSinceMerchant() >= 2 || Math.random() < (biomeFeatures.merchantChance ?? MERCHANT_SPAWN_CHANCE));
  const spawnFountain = Math.random() < (biomeFeatures.fountainChance ?? 0.50);
  const spawnJoker = isPostPaymentRewardLevel(getLevel()) || Math.random() < (biomeFeatures.jokerChance ?? JOKER_SPAWN_CHANCE);
  const spawnItemDrop = Math.random() < (biomeFeatures.itemDropChance ?? 0.50);

  const maxAttempts = 500;
  let solved = false;
  let bestCandidate = null;

  for (let attempt = 0; attempt < maxAttempts && !solved; attempt++) {
    // Yield to the event loop periodically so the browser stays responsive.
    if (attempt > 0 && attempt % 10 === 0) {
      await new Promise(r => setTimeout(r, 0));
    }

    setRevealed(Array.from({ length: getRows() }, () => Array(getCols()).fill(false)));
    setFlagged(Array.from({ length: getRows() }, () => Array(getCols()).fill(false)));
    setMerchant(null);
    setFountain(null);
    setJoker(null);
    setGenMeta(null);

    const { start, exit } = pickRegionalCorners();
    setPlayerPosition(start.r, start.c);
    setExit(exit);

    const genMeta = generateRegionalGrid({
      level: getLevel(),
      start,
      exit,
      features: {
        merchant: spawnMerchant,
        fountain: spawnFountain,
        joker: spawnJoker,
        itemDrop: spawnItemDrop,
      },
      biome: activeBiome,
    });
    setGenMeta(genMeta);
    if (!genMeta.regions.some(region => region.kind === 'branch')) continue;
    if (genMeta.failedBranchPlans.includes('gold')) continue;
    const preEntityMetrics = getRegionalMetrics(genMeta);
    if (preEntityMetrics.optionalGold <= preEntityMetrics.spineGold) continue;

    ensureSafeStart(getPlayerRow(), getPlayerCol());
    // Spawn cell auto-reveals; don't grant a free item there.
    getGrid()[getPlayerRow()][getPlayerCol()].item = null;

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
    getGrid()[exit.r][exit.c].crystal = false;
    getGrid()[exit.r][exit.c].crystalUsed = false;

    // Exit cell should not carry gold — keeps the exit cell mechanically clean
    if (getGrid()[exit.r][exit.c].type === 'gold') {
      getGrid()[exit.r][exit.c].type = 'empty';
      getGrid()[exit.r][exit.c].goldValue = 0;
      getGrid()[exit.r][exit.c].chest = false;
      getGrid()[exit.r][exit.c].preview = null;
      getGrid()[exit.r][exit.c].crystal = false;
      getGrid()[exit.r][exit.c].crystalUsed = false;
    }

    // Merchant placement (if this level spawns one).
    let merchantPos = null;
    if (spawnMerchant) {
      merchantPos = regionalFeatureCell(genMeta, 'merchant');
      if (merchantPos &&
          !(merchantPos.r === getPlayerRow() && merchantPos.c === getPlayerCol()) &&
          !(merchantPos.r === exit.r && merchantPos.c === exit.c)) {
        cleanMerchantCell(merchantPos.r, merchantPos.c);
        getGrid()[merchantPos.r][merchantPos.c].preview = 'merchant';
      } else {
        merchantPos = null;
      }
    }

    const exitReachable = isReachable(getPlayerRow(), getPlayerCol(), exit.r, exit.c);
    const merchantReachable = !merchantPos || isReachable(getPlayerRow(), getPlayerCol(), merchantPos.r, merchantPos.c);
    if (!exitReachable || !merchantReachable) continue;

    // Set up merchant state before pre-reveals so fountain placement can see it.
    if (merchantPos) {
      setMerchant({ r: merchantPos.r, c: merchantPos.c, stock: rollMerchantStock(), rerollCount: 0 });
    }

    // Fountain placement (50%, no pity, ruleset-agnostic).
    if (spawnFountain) {
      const pick = regionalFeatureCell(genMeta, 'fountain');
      if (pick) {
        const fountainCell = getGrid()[pick.r][pick.c];
        fountainCell.type = 'fountain';
        fountainCell.goldValue = 0;
        fountainCell.item = null;
        fountainCell.chest = false;
        fountainCell.preview = 'fountain';
        fountainCell.crystal = false;
        fountainCell.crystalUsed = false;
        setFountain({ r: pick.r, c: pick.c, used: false });
      }
    }
    const fountainReachable = !getFountain() || isReachable(getPlayerRow(), getPlayerCol(), getFountain().r, getFountain().c);
    if (!fountainReachable) continue;

    if (spawnJoker) {
      const pick = regionalFeatureCell(genMeta, 'joker');
      if (pick) {
        const jokerCell = getGrid()[pick.r][pick.c];
        jokerCell.type = 'empty';
        jokerCell.goldValue = 0;
        jokerCell.item = null;
        jokerCell.chest = false;
        jokerCell.preview = 'joker';
        jokerCell.crystal = false;
        jokerCell.crystalUsed = false;
        setJoker({ r: pick.r, c: pick.c, used: false });
      }
    }
    const jokerReachable = !getJoker() || isReachable(getPlayerRow(), getPlayerCol(), getJoker().r, getJoker().c);
    if (!jokerReachable) continue;

    // Pre-reveal only the start-side information for validation. The exit is
    // revealed for UI after acceptance, but the no-guess proof must not depend
    // on remote exit-side clues.
    getRevealed()[getPlayerRow()][getPlayerCol()] = true;

    // Reveal the player's start 3×3 so new players see safe ground around them.
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        revealCell(getPlayerRow() + dr, getPlayerCol() + dc);
      }
    }
    syncRevealedZeroCascades(getGrid(), getRows(), getCols(), getRevealed());

    // No-guess solver: feed the real revealed state so step count is accurate.
    if (!isOldGenMode()) {
      const excludeCells = [];
      if (merchantPos) excludeCells.push(merchantPos);
      if (genMeta?.protectedCells) excludeCells.push(...genMeta.protectedCells);
      if (genMeta?.rewardCells) excludeCells.push(...genMeta.rewardCells);
      const t0 = performance.now();
      const noGuessRes = makeSolvable(
        getGrid(), getRows(), getCols(),
        getRevealed(), getFlagged(),
        { r: getPlayerRow(), c: getPlayerCol() },
        exit,
        { maxFixAttempts: 30, exclude: excludeCells },
      );
      const { min, max } = stepRange(getLevel(), { regional: !!genMeta });
      if (!noGuessRes.solved) {
        const tMs = Math.round(performance.now() - t0);
        console.info(`[no-guess] attempt=${attempt} REJECT reason=unsolvable fixups=${noGuessRes.fixups} steps=${noGuessRes.steps} t=${tMs}ms`);
        continue;
      }

      // Gas relocation may have turned previously-numbered cells into adj=0.
      // Re-cascade from all revealed 0-cells so the player doesn't see
      // blank revealed cells surrounded by fog.
      if (noGuessRes.fixups > 0) {
        syncRevealedZeroCascades(getGrid(), getRows(), getCols(), getRevealed());
      }

      // Re-check the exact board state the player will see after the fixup
      // cascade. The original solve may require deductions, while this final
      // revealed graph may already connect to the exit.
      const finalNoGuessRes = solve(
        getGrid(), getRows(), getCols(),
        getRevealed(), getFlagged(),
        { r: getPlayerRow(), c: getPlayerCol() },
        exit,
      );
      const tMs = Math.round(performance.now() - t0);
      const stepNote = finalNoGuessRes.steps === noGuessRes.steps
        ? ''
        : ` preSyncSteps=${noGuessRes.steps}`;
      if (!finalNoGuessRes.solved) {
        console.info(`[no-guess] attempt=${attempt} REJECT reason=post-sync-unsolvable fixups=${noGuessRes.fixups} steps=${finalNoGuessRes.steps}${stepNote} t=${tMs}ms`);
        continue;
      }
      const regionalCheck = validateRegionalGeneration(genMeta, finalNoGuessRes.revealed);
      const candidateFrom = (reason) => {
        const candidate = captureGeneratedCandidate({
          genMeta,
          solveRes: finalNoGuessRes,
          regionalCheck,
          min,
          max,
          reason,
        });
        if (candidate && (!bestCandidate || candidate.score > bestCandidate.score)) {
          bestCandidate = candidate;
        }
      };
      if (!regionalCheck.ok) {
        candidateFrom('regional-near-miss');
        console.info(`[regional-gen] attempt=${attempt} REJECT reason=${regionalCheck.issues.join('|')} leak=${regionalCheck.branchLeak.toFixed(2)}`);
        continue;
      }
      if (finalNoGuessRes.steps < min || finalNoGuessRes.steps > max) {
        candidateFrom('step-near-miss');
        console.info(`[no-guess] attempt=${attempt} REJECT reason=steps steps=${finalNoGuessRes.steps} need=[${min},${max}] fixups=${noGuessRes.fixups}${stepNote} t=${tMs}ms`);
        continue;
      }
      logRegionalAccept(getLevel(), attempt, genMeta, finalNoGuessRes, noGuessRes.fixups, tMs, stepNote);
    }
    solved = true;
  }

  if (!solved && bestCandidate) {
    console.warn(`initLevel: ${maxAttempts} strict attempts missed, using best no-guess candidate reason=${bestCandidate.reason} steps=${bestCandidate.steps} leak=${bestCandidate.branchLeak.toFixed(2)}`);
    restoreGeneratedCandidate(bestCandidate);
    solved = true;
  }

  if (!solved) {
    console.warn(`initLevel: ${maxAttempts} attempts failed (noGuess=${!isOldGenMode()}), carving a guaranteed path from player to exit`);
    setRevealed(Array.from({ length: getRows() }, () => Array(getCols()).fill(false)));
    setFlagged(Array.from({ length: getRows() }, () => Array(getCols()).fill(false)));
    setMerchant(null);
    setFountain(null);
    setJoker(null);
    setGenMeta(null);
    carvePath(getPlayerRow(), getPlayerCol(), getExit().r, getExit().c);
    if (spawnMerchant) {
      const merchantPos = pickMerchantCorner();
      if (merchantPos) {
        cleanMerchantCell(merchantPos.r, merchantPos.c);
        carvePath(getPlayerRow(), getPlayerCol(), merchantPos.r, merchantPos.c);
        setMerchant({ r: merchantPos.r, c: merchantPos.c, stock: rollMerchantStock(), rerollCount: 0 });
      }
    }
    // Pre-reveal and 3×3 cascade for the fallback board.
    getRevealed()[getExit().r][getExit().c] = true;
    getRevealed()[getPlayerRow()][getPlayerCol()] = true;
    if (getMerchant()) {
      getRevealed()[getMerchant().r][getMerchant().c] = true;
    }
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        revealCell(getPlayerRow() + dr, getPlayerCol() + dc);
      }
    }
  }

  getRevealed()[getExit().r][getExit().c] = true;
  applyLevelStartArtifactReveals(getState().genMeta);
  revealRandomGasForSurvey();
  const itemEffects = applyLevelStartItemArtifacts();
  collectAt(getPlayerRow(), getPlayerCol());
  updateHud();
  renderGrid();
  collectRevealedGold();
  updateHud();
  itemEffects.forEach((effect, idx) => {
    spawnPickupFloat(getPlayerRow(), getPlayerCol(), effect.label, 'float-info');
  });
  // Snap pan to center on player at level start (instant, not animated).
  centerPanOnPlayer();
  // Ruleset hooks receive the raw state singleton — see RULESETS contract.
  // Current procedural generation uses the regular regional recipe, but the
  // hook stays as a future extension point.
  ruleset.apply?.(getState());
  renderGrid();
  hideOverlay();
}

export async function startGame() {
  document.body.classList.add('in-run');
  clearSave();
  resetForNewRun();
  const biome = setActiveBiomeForLevel();
  showGenerationOverlay(biome);
  await waitForLoadingPaint();
  await initLevel();
  saveRun();
  updatePlayerSprite(true);
  resetHurtFlash();
  playerSprite.textContent = '🙂';
  startBgm();
}

export async function resumeGame(save) {
  document.body.classList.add('in-run');
  applySavePayload(save);
  const biome = activeBiomeForCurrentState();
  showGenerationOverlay(biome);
  await waitForLoadingPaint();
  if (restoreSavedLevelState(save?.levelState)) {
    updateHud();
    renderGrid();
    centerPanOnPlayer();
    hideOverlay();
  } else {
    await initLevel();
  }
  saveRun();
  updatePlayerSprite(true);
  resetHurtFlash();
  playerSprite.textContent = '🙂';
  startBgm();
}

async function descendToNextGeneratedLevel() {
  incrementLevel();
  if (getMerchant()) {
    setLevelsSinceMerchant(0);
  } else {
    incrementLevelsSinceMerchant();
  }
  setRulesetId(null);
  const biome = setActiveBiomeForLevel();
  showGenerationOverlay(biome);
  await waitForLoadingPaint();
  await initLevel();
  saveRun();
  updatePlayerSprite(true);
  resetHurtFlash();
  playerSprite.textContent = '🙂';
}

function finishRunWon(clearedLevel) {
  setGameOver(true);
  recordRun({
    levelReached: clearedLevel,
    totalGold: getRunGoldEarned(),
    cause: 'win',
  });
  clearSavedRun();
  showRunWonOverlay(clearedLevel, getRunGoldEarned(), getStashGold());
}

export async function nextLevel() {
  const clearedLevel = getLevel();
  moveGoldToStash();
  const paymentDue = artifactPaymentAmount(paymentAmountForLevel(clearedLevel));
  if (paymentDue > 0) {
    const totalBeforePayment = getStashGold();
    const shortfall = paymentDue - totalBeforePayment;
    if (useDebtCushion(shortfall)) {
      updateHud();
      if (isFinalRunLevel(clearedLevel)) {
        finishRunWon(clearedLevel);
        return;
      }
      await descendToNextGeneratedLevel();
      return;
    }
    spendGold(paymentDue);
    updateHud();
    if (getStashGold() < 0) {
      setGameOver(true);
      recordRun({
        levelReached: clearedLevel,
        totalGold: getRunGoldEarned(),
        cause: 'payment',
      });
      clearSavedRun();
      showPaymentFailedOverlay(clearedLevel, paymentDue, totalBeforePayment);
      return;
    }
  }
  if (isFinalRunLevel(clearedLevel)) {
    finishRunWon(clearedLevel);
    return;
  }
  await descendToNextGeneratedLevel();
}

export async function retryLevel() {
  resetLevelGold();
  fullHeal();
  const biome = setActiveBiomeForLevel();
  showGenerationOverlay(biome);
  await waitForLoadingPaint();
  await initLevel();
  updatePlayerSprite(true);
  resetHurtFlash();
  playerSprite.textContent = '🙂';
}

export async function devTeleportToLevel(level, { freshRun = false } = {}) {
  const targetLevel = Math.floor(Number(level));
  if (!Number.isFinite(targetLevel) || targetLevel < 1) {
    throw new Error(`invalid dev teleport level: ${level}`);
  }

  const shouldStartFresh = freshRun || !document.body.classList.contains('in-run') || getGameOver();
  document.body.classList.add('in-run');
  if (shouldStartFresh) {
    clearSave();
    resetForNewRun();
  } else {
    resetLevelGold();
    setGameOver(false);
    setBusy(false);
    setActiveItem(null);
  }

  setLevel(targetLevel);
  setRulesetId(null);
  setBiomeOverrides(null);
  setLevelsSinceMerchant(0);

  const biome = setActiveBiomeForLevel(targetLevel);
  showGenerationOverlay(biome);
  await waitForLoadingPaint();
  await initLevel();
  saveRun();
  updatePlayerSprite(true);
  resetHurtFlash();
  playerSprite.textContent = '🙂';
  startBgm();

  return {
    level: getLevel(),
    biomeId: getBiomeId(),
    biomeName: activeBiomeForCurrentState().name,
  };
}
