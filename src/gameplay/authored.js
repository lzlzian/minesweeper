// Authored level playback. Replaces procgen generation for one level.
// All run-scoped defaults (HP, items, gold) use resetForNewRun.

import {
  getState, setRows, setCols,
  setGameOver, setBusy, setActiveItem, setMerchant, setFountain,
  setRulesetId, setBiomeOverrides,
  setPlayerPosition, setExit, setGrid, setRevealed, setFlagged,
  resetForNewRun,
} from '../state.js';
import { startBgm } from '../audio.js';
import { playerSprite } from '../ui/dom.js';
import { renderGrid, updateHud, updatePlayerSprite, resetHurtFlash } from '../ui/render.js';
import { getViewportSize, cellCenterPx, setPan } from '../ui/view.js';
import { renderStartMenu, hideOverlay } from '../ui/overlay.js';
import { countAdjacentGas, cleanMerchantCell } from '../board/generation.js';
import { rollMerchantStock } from './merchant.js';
import { revealCell } from './interaction.js';
import { jsonToLevel } from '../editor/schema.js';
import { validateLevel } from '../editor/validation.js';
import {
  readAndClearPendingTestPlay, loadFromSlot,
} from '../editor/slotStore.js';

// Sentinel rulesetId used only for authored-mode levels. Gates end-of-level
// / death / retry routing in interaction.js and overlay.js.
export const AUTHORED_RULESET_ID = 'authored';

let currentAuthoredData = null;

export function getCurrentAuthoredData() { return currentAuthoredData; }

export function startAuthoredLevel(level) {
  document.body.classList.add('in-run');
  // Do NOT touch the procgen save — authored mode is a side-trip that
  // must leave the player's procgen run intact.
  resetForNewRun();
  currentAuthoredData = level;
  applyAuthoredLevel(level);
  updatePlayerSprite(true);
  resetHurtFlash();
  playerSprite.textContent = '🙂';
  startBgm();
}

function applyAuthoredLevel(level) {
  setRows(level.rows);
  setCols(level.cols);
  setGameOver(false);
  setBusy(false);
  setActiveItem(null);
  setMerchant(null);
  setFountain(null);
  setRulesetId(AUTHORED_RULESET_ID);  // sentinel — gates end-of-level / retry routing
  setBiomeOverrides(null);

  // Build grid. Authored cells only carry .type and (for gold) .goldValue.
  const grid = [];
  for (let r = 0; r < level.rows; r++) {
    const row = [];
    for (let c = 0; c < level.cols; c++) {
      const src = level.cells[r][c];
      const cell = { type: src.type, adjacent: 0, goldValue: 0, item: null };
      if (src.type === 'gold') cell.goldValue = src.goldValue;
      row.push(cell);
    }
    grid.push(row);
  }
  setGrid(grid);

  // Item drops.
  for (const d of level.itemDrops) {
    grid[d.r][d.c].item = d.item;
  }

  // Player / exit.
  setPlayerPosition(level.playerStart.r, level.playerStart.c);
  setExit({ r: level.exit.r, c: level.exit.c });

  // Merchant.
  if (level.merchant) {
    cleanMerchantCell(level.merchant.r, level.merchant.c);
    setMerchant({
      r: level.merchant.r,
      c: level.merchant.c,
      stock: rollMerchantStock(),
      rerollCount: 0,
    });
  }

  // Fountain.
  if (level.fountain) {
    grid[level.fountain.r][level.fountain.c].type = 'fountain';
    setFountain({ r: level.fountain.r, c: level.fountain.c, used: false });
  }

  // Compute adjacency for non-wall, non-gas cells.
  for (let r = 0; r < level.rows; r++) {
    for (let c = 0; c < level.cols; c++) {
      const cell = grid[r][c];
      if (cell.type === 'wall' || cell.type === 'gas') continue;
      cell.adjacent = countAdjacentGas(r, c);
    }
  }

  // Revealed / flagged arrays.
  setRevealed(Array.from({ length: level.rows }, () => Array(level.cols).fill(false)));
  setFlagged(Array.from({ length: level.rows }, () => Array(level.cols).fill(false)));

  // Pre-reveal.
  const rev = getState().revealed;
  rev[level.playerStart.r][level.playerStart.c] = true;
  rev[level.exit.r][level.exit.c] = true;
  if (level.merchant) rev[level.merchant.r][level.merchant.c] = true;
  if (level.fountain) rev[level.fountain.r][level.fountain.c] = true;

  // 3x3 around player (same as procgen). revealCell handles bounds + wall/gas.
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      revealCell(level.playerStart.r + dr, level.playerStart.c + dc);
    }
  }

  // Defensive: spawn cell never grants a pickup.
  grid[level.playerStart.r][level.playerStart.c].item = null;

  updateHud();
  renderGrid();
  const vp = getViewportSize();
  const cc = cellCenterPx(level.playerStart.r, level.playerStart.c);
  setPan(vp.w / 2 - cc.x, vp.h / 2 - cc.y);
  hideOverlay();
}

// Hash handler — called by main.js on boot when hash matches #play-authored=<id>.
export async function loadAuthoredAndStart(id) {
  let rawJson = null;
  if (id === 'draft') {
    const obj = readAndClearPendingTestPlay();
    rawJson = obj ? JSON.stringify(obj) : null;
  } else if (id.startsWith('slot-')) {
    const n = parseInt(id.slice(5), 10);
    const obj = loadFromSlot(n);
    rawJson = obj ? JSON.stringify(obj) : null;
  } else {
    try {
      const res = await fetch(`levels/${encodeURIComponent(id)}.json`);
      if (!res.ok) throw new Error('fetch failed: ' + res.status);
      rawJson = await res.text();
    } catch (e) {
      console.warn('Authored load failed:', e);
    }
  }

  if (!rawJson) {
    alert(`Authored level "${id}" not found.`);
    renderStartMenu();
    return;
  }

  const parsed = jsonToLevel(rawJson);
  if (!parsed.ok) {
    alert('Authored level invalid:\n' + parsed.errors.join('\n'));
    renderStartMenu();
    return;
  }
  const v = validateLevel(parsed.level);
  if (!v.ok) {
    alert('Authored level fails validation:\n' + v.errors.join('\n'));
    renderStartMenu();
    return;
  }

  startAuthoredLevel(parsed.level);
}
