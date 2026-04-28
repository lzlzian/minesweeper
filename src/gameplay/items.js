import {
  getGameOver, getBusy, getHp, getRows, getCols, getGrid, getRevealed,
  getItemCount, getActiveItem, setActiveItem, getPlayerRow, getPlayerCol,
  consumeItem, healPlayer, getMaxHp,
} from '../state.js';
import { itemButtons } from '../ui/dom.js';
import {
  renderGrid, updateHud, updateItemBar, setRenderDeps,
} from '../ui/render.js';
import { attachTooltip } from '../ui/tooltip.js';
import { playSfx } from '../audio.js';
import { walkRay, detonateGas, revealCell, collectRevealedGold } from './interaction.js';

// ============================================================
// ITEMS
// ============================================================

export const ITEM_TOOLTIPS = {
  potion:  { name: 'Potion',      desc: 'Restore 1 ❤️.',                                         howto: 'Tap to use instantly.' },
  scanner: { name: 'Scanner',     desc: 'Reveal the 3×3 around you.',                             howto: 'Tap to use instantly.' },
  pickaxe: { name: 'Pickaxe',     desc: 'Break one wall tile.',                                   howto: 'Tap, then select a wall.' },
  row:     { name: 'Row Scan',    desc: 'Reveal along your row until walls stop it.',             howto: 'Tap to use instantly.' },
  column:  { name: 'Column Scan', desc: 'Reveal along your column until walls stop it.',          howto: 'Tap to use instantly.' },
  cross:   { name: 'Cross Scan',  desc: 'Reveal along all four diagonals until walls stop them.', howto: 'Tap to use instantly.' },
};

export function onItemButtonClick(itemKey) {
  const btn = itemButtons[itemKey];
  if (btn && btn._suppressNextClick) {
    btn._suppressNextClick = false;
    return;
  }
  if (getGameOver() || getBusy()) return;
  if (getItemCount(itemKey) <= 0) return;

  if (itemKey === 'potion') {
    useItemPotion();
    return;
  }

  if (itemKey === 'scanner') {
    useItemScanner();
    return;
  }

  if (itemKey === 'row') {
    useItemRow();
    return;
  }

  if (itemKey === 'column') {
    useItemColumn();
    return;
  }

  if (itemKey === 'cross') {
    useItemCross();
    return;
  }

  // Pickaxe: toggle targeting mode.
  if (getActiveItem() === itemKey) {
    setActiveItem(null);
  } else {
    setActiveItem(itemKey);
  }
  updateItemBar();
  renderGrid();
}

function useItemPotion() {
  if (getHp() >= getMaxHp()) return;
  if (getItemCount('potion') <= 0) return;
  consumeItem('potion');
  healPlayer(1);
  playSfx('drink');
  updateHud();
}

// True if the 3×3 around the player contains at least one unrevealed,
// non-wall cell — i.e., scanning would actually do something.
function scannerHasTarget() {
  const pr = getPlayerRow();
  const pc = getPlayerCol();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = pr + dr;
      const c = pc + dc;
      if (r < 0 || r >= getRows() || c < 0 || c >= getCols()) continue;
      if (getRevealed()[r][c]) continue;
      if (getGrid()[r][c].type === 'wall') continue;
      return true;
    }
  }
  return false;
}

// True if the player's row contains at least one unrevealed, non-wall cell
// within wall-bounded range on either side.
function rowHasTarget() {
  const pr = getPlayerRow();
  const pc = getPlayerCol();
  let found = false;
  const check = (r, c) => {
    if (found) return false;
    if (!getRevealed()[r][c]) {
      found = true;
      return false;
    }
  };
  walkRay(pr, pc, 0, -1, check);
  walkRay(pr, pc, 0, 1, check);
  return found;
}

// True if the player's column contains at least one unrevealed, non-wall
// cell within wall-bounded range up or down.
function columnHasTarget() {
  const pr = getPlayerRow();
  const pc = getPlayerCol();
  let found = false;
  const check = (r, c) => {
    if (found) return false;
    if (!getRevealed()[r][c]) {
      found = true;
      return false;
    }
  };
  walkRay(pr, pc, -1, 0, check);
  walkRay(pr, pc, 1, 0, check);
  return found;
}

// True if any of the four diagonal rays from the player contains at least
// one unrevealed, non-wall cell within wall-bounded range.
function crossHasTarget() {
  const pr = getPlayerRow();
  const pc = getPlayerCol();
  let found = false;
  const check = (r, c) => {
    if (found) return false;
    if (!getRevealed()[r][c]) {
      found = true;
      return false;
    }
  };
  walkRay(pr, pc, -1, -1, check);
  walkRay(pr, pc, -1, 1, check);
  walkRay(pr, pc, 1, -1, check);
  walkRay(pr, pc, 1, 1, check);
  return found;
}

// Reveal the 3×3 area centered on the player. Gas in range detonates
// harmlessly (red cross, no HP cost); walls stay walls; empty cells reveal
// and cascade on 0 adjacency via revealCell.
function useItemScanner() {
  if (getItemCount('scanner') <= 0) return;
  if (!scannerHasTarget()) return;
  consumeItem('scanner');

  const pr = getPlayerRow();
  const pc = getPlayerCol();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = pr + dr;
      const c = pc + dc;
      if (r < 0 || r >= getRows() || c < 0 || c >= getCols()) continue;
      if (getRevealed()[r][c]) continue;
      const cell = getGrid()[r][c];
      if (cell.type === 'wall') continue;
      if (cell.type === 'gas') {
        detonateGas(r, c);
        getRevealed()[r][c] = true;
      } else {
        revealCell(r, c);
      }
    }
  }

  finishRevealItem();
}

// Shared ray-reveal loop used by row/column/cross. For each cell along the
// ray: if gas, detonate and mark revealed; otherwise call revealCell
// (which handles cascade + pickup logic). Walls were already filtered by
// walkRay itself.
function revealAlongRay(startR, startC, dR, dC) {
  walkRay(startR, startC, dR, dC, (r, c) => {
    if (getRevealed()[r][c]) return true;
    const cell = getGrid()[r][c];
    if (cell.type === 'gas') {
      detonateGas(r, c);
      getRevealed()[r][c] = true;
    } else {
      revealCell(r, c);
    }
    return true;
  });
}

function finishRevealItem() {
  playSfx('scan');
  renderGrid();
  collectRevealedGold();
  updateHud();
  updateItemBar();
}

// Reveal the player's row — two rays (west, east), stop at walls, gas
// detonates harmlessly, empty cells may cascade via revealCell.
function useItemRow() {
  if (getItemCount('row') <= 0) return;
  if (!rowHasTarget()) return;
  consumeItem('row');
  const pr = getPlayerRow();
  const pc = getPlayerCol();
  revealAlongRay(pr, pc, 0, -1);
  revealAlongRay(pr, pc, 0, 1);
  finishRevealItem();
}

// Reveal the player's column — two rays (north, south), stop at walls.
function useItemColumn() {
  if (getItemCount('column') <= 0) return;
  if (!columnHasTarget()) return;
  consumeItem('column');
  const pr = getPlayerRow();
  const pc = getPlayerCol();
  revealAlongRay(pr, pc, -1, 0);
  revealAlongRay(pr, pc, 1, 0);
  finishRevealItem();
}

// Reveal the four diagonals from the player — four rays, stop at walls.
function useItemCross() {
  if (getItemCount('cross') <= 0) return;
  if (!crossHasTarget()) return;
  consumeItem('cross');
  const pr = getPlayerRow();
  const pc = getPlayerCol();
  revealAlongRay(pr, pc, -1, -1);
  revealAlongRay(pr, pc, -1, 1);
  revealAlongRay(pr, pc, 1, -1);
  revealAlongRay(pr, pc, 1, 1);
  finishRevealItem();
}

// Give render.js the disable-state predicates for the item bar.
// isAdjacentToPlayer is still injected separately from main.js until Task 17.
setRenderDeps({
  scannerHasTarget,
  rowHasTarget,
  columnHasTarget,
  crossHasTarget,
});

// Wire item-bar buttons and tooltips.
for (const key of ['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross']) {
  itemButtons[key].addEventListener('click', () => onItemButtonClick(key));
  attachTooltip(itemButtons[key], ITEM_TOOLTIPS[key]);
}

// Escape cancels any active targeting mode.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && getActiveItem()) {
    setActiveItem(null);
    updateItemBar();
    renderGrid();
  }
});
