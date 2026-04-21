import {
  MAX_HP, STEP_MS, CELL_SIZE, CELL_GAP, BOARD_PAD,
  getGrid, getRows, getCols, getRevealed, getFlagged,
  getPlayerRow, getPlayerCol, getExit, getFountain, getMerchant,
  getGold, getStashGold, getHp, getLevel, getItems, getActiveItem,
  getItemCount, getGameOver,
} from '../state.js';
import {
  gridContainer, goldDisplay, hpDisplay, levelDisplay,
  playerSprite, itemButtons, itemCounts, board,
} from './dom.js';
import { applyPan, renderMinimap } from './view.js';

// Callback injections for functions whose owners haven't been extracted yet.
// Removed as the modules migrate:
//   isAdjacentToPlayer        — Task 17 (gameplay/interaction.js)
//   scanner/row/column/crossHasTarget — Task 16 (gameplay/items.js)
const alwaysTrue = () => true;
const falseIfUnset = () => false;
let isAdjacentToPlayerImpl = falseIfUnset;
let scannerHasTargetImpl = alwaysTrue;
let rowHasTargetImpl = alwaysTrue;
let columnHasTargetImpl = alwaysTrue;
let crossHasTargetImpl = alwaysTrue;

export function setRenderDeps({
  isAdjacentToPlayer,
  scannerHasTarget,
  rowHasTarget,
  columnHasTarget,
  crossHasTarget,
}) {
  if (isAdjacentToPlayer) isAdjacentToPlayerImpl = isAdjacentToPlayer;
  if (scannerHasTarget) scannerHasTargetImpl = scannerHasTarget;
  if (rowHasTarget) rowHasTargetImpl = rowHasTarget;
  if (columnHasTarget) columnHasTargetImpl = columnHasTarget;
  if (crossHasTarget) crossHasTargetImpl = crossHasTarget;
}

export const PICKUP_EMOJI = { potion: '🍺', scanner: '🔍', pickaxe: '⛏️', row: '↔️', column: '↕️', cross: '✖️' };

export function renderGrid() {
  gridContainer.innerHTML = '';
  gridContainer.style.gridTemplateColumns = `repeat(${getCols()}, 40px)`;

  for (let r = 0; r < getRows(); r++) {
    for (let c = 0; c < getCols(); c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = r;
      cell.dataset.col = c;

      const isAdjacent = isAdjacentToPlayerImpl(r, c);

      if (getGrid()[r][c].type === 'wall') {
        cell.classList.add('wall');
      } else {
        const isExit = (r === getExit().r && c === getExit().c);
        if (isExit) cell.classList.add('exit');

        const isMerchant = getMerchant() && r === getMerchant().r && c === getMerchant().c;
        if (isMerchant) cell.classList.add('merchant');

        if (getRevealed()[r][c]) {
          const g = getGrid()[r][c];
          cell.classList.add('revealed');

          if (g.type === 'gas') cell.classList.add('gas');
          else if (g.type === 'detonated') cell.classList.add('detonated');
          else if (g.type === 'gold' && g.goldValue > 0) cell.classList.add('gold');

          if (g.type === 'detonated') {
            const numSpan = document.createElement('span');
            numSpan.className = 'num cross';
            numSpan.textContent = '✖';
            cell.appendChild(numSpan);
          } else if (g.adjacent > 0 && g.type !== 'gas') {
            cell.dataset.adjacent = g.adjacent;
            const numSpan = document.createElement('span');
            numSpan.className = 'num';
            numSpan.textContent = g.adjacent;
            cell.appendChild(numSpan);
          }

          let icon = null;
          if (g.type === 'gas') icon = '💀';
          else if (g.type === 'gold' && g.goldValue > 0) icon = g.chest ? '🎁' : '💰';
          else if (g.type === 'fountain' && getFountain() && !getFountain().used) icon = '💧';
          else if (g.item) icon = PICKUP_EMOJI[g.item];

          if (icon) {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'icon';
            iconSpan.textContent = icon;
            cell.appendChild(iconSpan);
          }
        } else if (getFlagged()[r][c]) {
          cell.classList.add('flagged');
          if (isAdjacent) cell.classList.add('reachable');
        } else {
          if (isAdjacent) cell.classList.add('reachable');
        }
      }

      gridContainer.appendChild(cell);
    }
  }
  updatePlayerSprite();
  applyPan();
  renderMinimap();
}

let hurtFlashToken = 0;
export function flashHurtFace() {
  playerSprite.textContent = '🤕';
  const token = ++hurtFlashToken;
  setTimeout(() => {
    if (token === hurtFlashToken) {
      playerSprite.textContent = '🙂';
    }
  }, 1000);
}

export function resetHurtFlash() {
  hurtFlashToken++;
}

export function updatePlayerSprite(instant = false) {
  const x = BOARD_PAD + getPlayerCol() * (CELL_SIZE + CELL_GAP);
  const y = BOARD_PAD + getPlayerRow() * (CELL_SIZE + CELL_GAP);
  if (instant) {
    const prev = playerSprite.style.transition;
    playerSprite.style.transition = 'none';
    playerSprite.style.transform = `translate(${x}px, ${y}px)`;
    // Force reflow so the transition reset takes effect before re-enabling
    playerSprite.offsetHeight;
    playerSprite.style.transition = prev;
  } else {
    playerSprite.style.transform = `translate(${x}px, ${y}px)`;
  }
}

export function spawnPickupFloat(r, c, label, extraClass) {
  const x = BOARD_PAD + c * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2;
  const y = BOARD_PAD + r * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2;
  const el = document.createElement('div');
  el.className = 'pickup-float' + (extraClass ? ' ' + extraClass : '');
  el.textContent = label;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  board.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

export function updateHud() {
  goldDisplay.textContent = `💰 ${getGold()} · Stash: ${getStashGold()}`;
  hpDisplay.textContent = '❤️'.repeat(Math.max(0, getHp())) + '🖤'.repeat(Math.max(0, MAX_HP - getHp()));
  levelDisplay.textContent = `Level ${getLevel()}`;
  updateItemBar();
}

export function updateItemBar() {
  for (const key of ['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross']) {
    const count = getItemCount(key);
    itemCounts[key].textContent = count;

    const btn = itemButtons[key];
    let disabled = count === 0 || getGameOver();
    if (key === 'potion' && getHp() >= MAX_HP) disabled = true;
    if (key === 'scanner' && !scannerHasTargetImpl()) disabled = true;
    if (key === 'row' && !rowHasTargetImpl()) disabled = true;
    if (key === 'column' && !columnHasTargetImpl()) disabled = true;
    if (key === 'cross' && !crossHasTargetImpl()) disabled = true;
    btn.disabled = disabled;

    btn.classList.toggle('active', getActiveItem() === key);
  }
}
