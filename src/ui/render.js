import {
  STEP_MS, CELL_SIZE, CELL_GAP, BOARD_PAD,
  getGrid, getRows, getCols, getRevealed, getFlagged,
  getPlayerRow, getPlayerCol, getExit, getFountain, getMerchant, getJoker,
  getGold, getStashGold, getHp, getLevel, getItems, getActiveItem,
  getItemCount, getGameOver, getMaxHp, getArtifacts, getBiomeId,
} from '../state.js';
import {
  gridContainer, goldDisplay, hpDisplay, levelDisplay,
  quotaDisplay, biomeDisplay, artifactDisplay, playerSprite, itemButtons, itemCounts, board,
} from './dom.js';
import { applyPan, renderMinimap } from './view.js';
import { attachTooltip } from './tooltip.js';
import { nextPaymentForLevel, nextPaymentLevel } from '../gameplay/quota.js';
import { PAYMENT_DISCOUNT_PERCENT, artifactById, artifactPaymentAmount } from '../gameplay/artifacts.js';
import { biomeForLevel, biomeNameForId } from '../gameplay/biomes.js';

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
        const isJoker = getJoker() && r === getJoker().r && c === getJoker().c;

        if (getRevealed()[r][c]) {
          const g = getGrid()[r][c];
          cell.classList.add('revealed');

          if (g.type === 'gas') cell.classList.add('gas');
          else if (g.type === 'detonated') cell.classList.add('detonated');
          else if (g.type === 'gold' && g.goldValue > 0) cell.classList.add('gold');
          else if (g.crystal) cell.classList.add('crystal');

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
          else if (isJoker && !getJoker().used) icon = '🃏';
          else if (g.item) icon = PICKUP_EMOJI[g.item];
          else if (g.crystal) icon = g.crystalUsed ? '✦' : '💎';

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
          const preview = getGrid()[r][c].preview;
          const previewIcons = { chest: '🎁', fountain: '💧', item: '🎒', joker: '🃏', crystal: '💎' };
          if (previewIcons[preview]) {
            cell.classList.add('preview');
            const iconSpan = document.createElement('span');
            iconSpan.className = 'icon preview-icon';
            iconSpan.textContent = previewIcons[preview];
            cell.appendChild(iconSpan);
          }
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

export function spawnGoldMagnetFly(r, c, delayMs = 0) {
  const startX = BOARD_PAD + c * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2;
  const startY = BOARD_PAD + r * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2;
  const endX = BOARD_PAD + getPlayerCol() * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2;
  const endY = BOARD_PAD + getPlayerRow() * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2;
  const el = document.createElement('div');
  el.className = 'magnet-gold';
  el.textContent = '💰';
  el.style.left = `${startX}px`;
  el.style.top = `${startY}px`;
  el.style.setProperty('--dx', `${endX - startX}px`);
  el.style.setProperty('--dy', `${endY - startY}px`);
  el.style.animationDelay = `${delayMs}ms`;
  board.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

export function updateHud() {
  goldDisplay.textContent = `💰 ${getGold()} · Stash: ${getStashGold()}`;
  const dueLevel = nextPaymentLevel(getLevel());
  const payment = nextPaymentForLevel(getLevel(), biomeForLevel(dueLevel).economy);
  const paymentAmount = artifactPaymentAmount(payment.amount);
  const paymentDiscount = paymentAmount < payment.amount
    ? ` (-${PAYMENT_DISCOUNT_PERCENT}% from ${payment.amount}g)`
    : '';
  quotaDisplay.textContent = `Payment due end of Level ${payment.level}: ${paymentAmount}g${paymentDiscount}`;
  if (biomeDisplay) biomeDisplay.textContent = biomeNameForId(getBiomeId(), getLevel());
  hpDisplay.textContent = '❤️'.repeat(Math.max(0, getHp())) + '🖤'.repeat(Math.max(0, getMaxHp() - getHp()));
  levelDisplay.textContent = `Level ${getLevel()}`;
  renderArtifactDisplay();
  updateItemBar();
}

function renderArtifactDisplay() {
  const artifacts = getArtifacts()
    .map(id => ({ id, artifact: artifactById(id) }))
    .filter(entry => entry.artifact);
  artifactDisplay.replaceChildren();

  const label = document.createElement('span');
  label.className = 'artifact-label';
  label.textContent = artifacts.length ? 'Artifacts:' : 'Artifacts: none';
  artifactDisplay.appendChild(label);

  if (!artifacts.length) return;

  const list = document.createElement('span');
  list.className = 'artifact-list';
  artifactDisplay.appendChild(list);

  for (const { id, artifact } of artifacts) {
    const token = document.createElement('button');
    token.type = 'button';
    token.className = 'artifact-token';
    token.dataset.artifactId = id;
    token.setAttribute('aria-label', `${artifact.name}: ${artifact.desc}`);
    token.textContent = artifact.icon;
    attachTooltip(token, {
      name: `${artifact.icon} ${artifact.name}`,
      desc: artifact.desc,
    });
    list.appendChild(token);
  }
}

export function updateItemBar() {
  for (const key of ['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross']) {
    const count = getItemCount(key);
    itemCounts[key].textContent = count;

    const btn = itemButtons[key];
    let disabled = count === 0 || getGameOver();
    if (key === 'potion' && getHp() >= getMaxHp()) disabled = true;
    if (key === 'scanner' && !scannerHasTargetImpl()) disabled = true;
    if (key === 'row' && !rowHasTargetImpl()) disabled = true;
    if (key === 'column' && !columnHasTargetImpl()) disabled = true;
    if (key === 'cross' && !crossHasTargetImpl()) disabled = true;
    btn.disabled = disabled;

    btn.classList.toggle('active', getActiveItem() === key);
  }
}
