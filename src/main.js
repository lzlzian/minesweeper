import {
  MAX_HP, STEP_MS, CELL_SIZE, CELL_GAP, BOARD_PAD,
  getState,
  getGold, getStashGold, getHp, getLevel, getRows, getCols,
  getGrid, getRevealed, getFlagged, getGameOver, getBusy,
  getPlayerRow, getPlayerCol, getExit, getItems, getItemCount,
  getActiveItem, getLevelsSinceMerchant, getMerchant, getFountain,
  getRulesetId, getBiomeOverrides, getStartCornerIdx,
  addGold, spendGold, moveGoldToStash, damagePlayer, healPlayer,
  addItem, consumeItem,
  setPlayerPosition, setGrid, setRevealed, setFlagged, setGameOver,
  setBusy, setExit, setActiveItem, setLevelsSinceMerchant,
  incrementLevelsSinceMerchant, setMerchant, setFountain, setLevel,
  incrementLevel, setRows, setCols, setRulesetId, setBiomeOverrides,
  setStartCornerIdx, setItems,
  resetForNewRun, resetLevelGold, fullHeal,
  getSavePayload, applySavePayload,
} from './state.js';

import { resumeAudioCtx, playSfx, startBgm, setMusicOn as setAudioMusicOn, setSfxOn as setSfxOnAudio } from './audio.js';
import { settings, saveSettings } from './settings.js';
import {
  board, gridContainer, goldDisplay, hpDisplay, levelDisplay,
  playerSprite, overlay, overlayContent, itemBar, viewportEl,
  minimapEl, tooltipEl, pauseBtn, itemButtons, itemCounts,
} from './ui/dom.js';
import {
  renderGrid, updateHud, updateItemBar, updatePlayerSprite,
  flashHurtFace, spawnPickupFloat, resetHurtFlash, PICKUP_EMOJI,
  setRenderDeps,
} from './ui/render.js';
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

const ITEM_TOOLTIPS = {
  potion:  { name: 'Potion',      desc: 'Restore 1 ❤️.',                                         howto: 'Tap to use instantly.' },
  scanner: { name: 'Scanner',     desc: 'Reveal the 3×3 around you.',                             howto: 'Tap to use instantly.' },
  pickaxe: { name: 'Pickaxe',     desc: 'Break one wall tile.',                                   howto: 'Tap, then select a wall.' },
  row:     { name: 'Row Scan',    desc: 'Reveal along your row until walls stop it.',             howto: 'Tap to use instantly.' },
  column:  { name: 'Column Scan', desc: 'Reveal along your column until walls stop it.',          howto: 'Tap to use instantly.' },
  cross:   { name: 'Cross Scan',  desc: 'Reveal along all four diagonals until walls stop them.', howto: 'Tap to use instantly.' },
};

// ============================================================
// VIEWPORT / PAN
// ============================================================

const pan = {
  x: 0,
  y: 0,
  lastManualPanAt: 0, // timestamp ms; auto-recenter skips within 2000ms of this
};

function getViewportSize() {
  return { w: viewportEl.clientWidth, h: viewportEl.clientHeight };
}

function getBoardSize() {
  const gridW = getCols() * (CELL_SIZE + CELL_GAP) - CELL_GAP;
  const gridH = getRows() * (CELL_SIZE + CELL_GAP) - CELL_GAP;
  return { w: gridW + BOARD_PAD * 2, h: gridH + BOARD_PAD * 2 };
}

function cellCenterPx(r, c) {
  return {
    x: BOARD_PAD + c * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2,
    y: BOARD_PAD + r * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2,
  };
}

function clampPan(x, y) {
  const { w: vw, h: vh } = getViewportSize();
  const { w: bw, h: bh } = getBoardSize();
  const overshootX = vw * 0.5;
  const overshootY = vh * 0.5;

  let clampedX, clampedY;
  if (bw >= vw) {
    clampedX = Math.max(vw - bw - overshootX, Math.min(overshootX, x));
  } else {
    clampedX = (vw - bw) / 2;
  }
  if (bh >= vh) {
    clampedY = Math.max(vh - bh - overshootY, Math.min(overshootY, y));
  } else {
    clampedY = (vh - bh) / 2;
  }
  return { x: clampedX, y: clampedY };
}

function applyPan() {
  board.style.transform = `translate(${pan.x}px, ${pan.y}px)`;
}

function setPan(x, y) {
  const clamped = clampPan(x, y);
  pan.x = clamped.x;
  pan.y = clamped.y;
  applyPan();
}

// Animate pan from current position to (targetX, targetY) over durationMs.
let panAnimId = 0;
function animatePanTo(targetX, targetY, durationMs = 200) {
  const clamped = clampPan(targetX, targetY);
  const startX = pan.x;
  const startY = pan.y;
  const dx = clamped.x - startX;
  const dy = clamped.y - startY;
  const startTime = performance.now();
  const myId = ++panAnimId;

  function step(now) {
    if (myId !== panAnimId) return; // cancelled by newer animation
    const t = Math.min(1, (now - startTime) / durationMs);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
    pan.x = startX + dx * eased;
    pan.y = startY + dy * eased;
    applyPan();
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// Center main viewport on a specific board (row, col), animated.
function centerOnCell(r, c, durationMs = 200) {
  const { w: vw, h: vh } = getViewportSize();
  const cc = cellCenterPx(r, c);
  animatePanTo(vw / 2 - cc.x, vh / 2 - cc.y, durationMs);
}

function isCellOutsideCenterRect(r, c) {
  const { w: vw, h: vh } = getViewportSize();
  const cc = cellCenterPx(r, c);
  const screenX = cc.x + pan.x;
  const screenY = cc.y + pan.y;
  return (
    screenX < vw * 0.2 || screenX > vw * 0.8 ||
    screenY < vh * 0.2 || screenY > vh * 0.8
  );
}

function autoRecenterOnPlayer() {
  // Honor manual scouting: skip if user panned within the last 2s.
  if (performance.now() - pan.lastManualPanAt < 2000) return;
  if (isCellOutsideCenterRect(getPlayerRow(), getPlayerCol())) {
    centerOnCell(getPlayerRow(), getPlayerCol(), 200);
  }
}

function renderMinimap() {
  if (!getGrid() || !getGrid().length) return;
  const dpr = window.devicePixelRatio || 1;
  const cssSize = 100;
  // Resize backing store for crisp rendering on high-DPI displays.
  if (minimapEl.width !== cssSize * dpr) {
    minimapEl.width = cssSize * dpr;
    minimapEl.height = cssSize * dpr;
  }
  const ctx = minimapEl.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Pixel-per-cell, use the larger board dimension so the board fits.
  const boardDim = Math.max(getRows(), getCols());
  const pxPerCell = Math.floor(cssSize / boardDim);
  const drawW = pxPerCell * getCols();
  const drawH = pxPerCell * getRows();
  const offsetX = (cssSize - drawW) / 2;
  const offsetY = (cssSize - drawH) / 2;

  // Background (fully opaque so unrevealed area is visibly dark even over faint BG).
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, cssSize, cssSize);

  // Draw each cell.
  for (let r = 0; r < getRows(); r++) {
    for (let c = 0; c < getCols(); c++) {
      const x = offsetX + c * pxPerCell;
      const y = offsetY + r * pxPerCell;
      const cell = getGrid()[r][c];

      if (!getRevealed()[r][c]) {
        ctx.fillStyle = '#222';
      } else if (cell.type === 'wall') {
        ctx.fillStyle = '#333';
      } else {
        ctx.fillStyle = '#666';
      }
      ctx.fillRect(x, y, pxPerCell, pxPerCell);
    }
  }

  // Special markers (drawn on top).
  const markerSize = Math.max(2, Math.floor(pxPerCell * 0.6));

  function drawMarker(r, c, color) {
    const x = offsetX + c * pxPerCell + (pxPerCell - markerSize) / 2;
    const y = offsetY + r * pxPerCell + (pxPerCell - markerSize) / 2;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, markerSize, markerSize);
  }

  // Exit (always pre-revealed).
  drawMarker(getExit().r, getExit().c, '#33ff33');

  // Merchant (if spawned; always pre-revealed).
  if (getMerchant()) {
    drawMarker(getMerchant().r, getMerchant().c, '#ff33ff');
  }

  // Fountain (if spawned and unused; always pre-revealed).
  if (getFountain() && !getFountain().used) {
    drawMarker(getFountain().r, getFountain().c, '#33ccff');
  }

  // Player last so it's always visible.
  drawMarker(getPlayerRow(), getPlayerCol(), '#ffdd00');
}

minimapEl.addEventListener('click', (e) => {
  const rect = minimapEl.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;
  const cssSize = 100;
  const boardDim = Math.max(getRows(), getCols());
  const pxPerCell = Math.floor(cssSize / boardDim);
  const drawW = pxPerCell * getCols();
  const drawH = pxPerCell * getRows();
  const offsetX = (cssSize - drawW) / 2;
  const offsetY = (cssSize - drawH) / 2;
  const c = Math.floor((clickX - offsetX) / pxPerCell);
  const r = Math.floor((clickY - offsetY) / pxPerCell);
  if (r < 0 || r >= getRows() || c < 0 || c >= getCols()) return;
  pan.lastManualPanAt = performance.now(); // treat as manual pan
  centerOnCell(r, c, 200);
});

window.addEventListener('resize', () => {
  setPan(pan.x, pan.y); // re-clamp under new viewport size
  renderMinimap();
});

// Sync audio module with persisted settings so its internal flags match on startup.
setAudioMusicOn(settings.musicOn);
setSfxOnAudio(settings.sfxOn);

// Callback for revealCell, removed in Task 17 when revealCell moves out of main.js.
setRevealCell(revealCell);

// Dependencies render.js needs that haven't moved out of main.js yet.
// Removed as each owner migrates: view (Task 10), items (Task 16), interaction (Task 17).
setRenderDeps({
  isAdjacentToPlayer,
  applyPan,
  renderMinimap,
  scannerHasTarget,
  rowHasTarget,
  columnHasTarget,
  crossHasTarget,
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

// ============================================================
// RENDERING
// ============================================================

function showOverlay(html) {
  overlayContent.innerHTML = html;
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  hideTooltip();
  overlay.classList.add('hidden');
}

function showEscapedOverlay() {
  const nextSize = gridSizeForLevel(getLevel() + 1);
  showOverlay(`
    <h2>Escaped!</h2>
    <p>Level ${getLevel()} cleared · +💰 ${getGold()}</p>
    <p>Stash: 💰 ${getStashGold() + getGold()}</p>
    <p>Next: Level ${getLevel() + 1} (${nextSize}×${nextSize})</p>
    <button onclick="nextLevel()">Descend</button>
  `);
}

function showDeathOverlay() {
  showOverlay(`
    <h2>You died.</h2>
    <p>Level ${getLevel()} · Forfeited 💰 ${getGold()}</p>
    <p>Stash: 💰 ${getStashGold()}</p>
    <button onclick="retryLevel()">Retry Level</button>
    <button onclick="startGame()">New Run</button>
  `);
}

function showShopOverlay(playWelcome = false) {
  if (!getMerchant()) return;
  hideTooltip();
  // Clear any active item targeting before opening the shop.
  setActiveItem(null);
  updateItemBar();
  if (playWelcome) playSfx('welcome');

  const totalGold = getGold() + getStashGold();
  const itemEmoji = { potion: '🍺', pickaxe: '⛏️', scanner: '🔍', row: '↔️', column: '↕️', cross: '✖️' };
  const itemName = { potion: 'Potion', pickaxe: 'Pickaxe', scanner: 'Scanner', row: 'Row Scan', column: 'Column Scan', cross: 'Cross Scan' };

  const slotsHtml = getMerchant().stock.map((slot, idx) => {
    const canAfford = totalGold >= slot.price;
    const disabled = slot.sold || !canAfford;
    const label = slot.sold ? 'Sold' : 'Buy';

    let badgeHtml = '';
    if (slot.discountKey !== 'full') {
      const badgeText = slot.discountKey === 'free' ? 'FREE'
                      : slot.discountKey === 'd90' ? '-90%'
                      : slot.discountKey === 'd75' ? '-75%'
                      : slot.discountKey === 'd50' ? '-50%'
                      : '-25%';
      badgeHtml = `<div class="shop-badge shop-badge-${slot.discountKey}">${badgeText}</div>`;
    }

    let priceHtml;
    if (slot.price === 0) {
      priceHtml = `<div class="shop-slot-price shop-slot-price-free">FREE</div>`;
    } else if (slot.discountKey !== 'full') {
      priceHtml = `<div class="shop-slot-price"><s>${slot.basePrice}g</s> ${slot.price}g</div>`;
    } else {
      priceHtml = `<div class="shop-slot-price">${slot.price}g</div>`;
    }

    return `
      <div class="shop-slot ${slot.sold ? 'sold' : ''}">
        ${badgeHtml}
        <div class="shop-slot-icon">${itemEmoji[slot.type]}</div>
        <div class="shop-slot-name">${itemName[slot.type]}</div>
        ${priceHtml}
        <button onclick="buyFromMerchant(${idx})" ${disabled ? 'disabled' : ''}>${label}</button>
      </div>
    `;
  }).join('');

  const rerollCost = 10 * (getMerchant().rerollCount + 1);
  const canAffordReroll = totalGold >= rerollCost;

  showOverlay(`
    <h2>🧙 Merchant</h2>
    <p>💰 Gold: ${getGold()} · Stash: ${getStashGold()}</p>
    <div class="shop-slots">${slotsHtml}</div>
    <div class="shop-actions">
      <button onclick="rerollMerchant()" ${canAffordReroll ? '' : 'disabled'}>🎲 Reroll (${rerollCost}g)</button>
      <button onclick="leaveShop()">Leave</button>
    </div>
  `);

  // Wire tooltips onto each shop slot (slots re-render per buy/reroll).
  const slotEls = document.querySelectorAll('#overlay-content .shop-slot');
  getMerchant().stock.forEach((slot, idx) => {
    const el = slotEls[idx];
    if (!el) return;
    attachTooltip(el, slot.type);
  });
}

function buyFromMerchant(idx) {
  const slotEl = document.querySelectorAll('#overlay-content .shop-slot')[idx];
  if (slotEl && slotEl._suppressNextClick) {
    slotEl._suppressNextClick = false;
    return;
  }
  if (!getMerchant()) return;
  const slot = getMerchant().stock[idx];
  if (!slot || slot.sold) return;
  const totalGold = getGold() + getStashGold();
  if (totalGold < slot.price) return;
  spendGold(slot.price);
  addItem(slot.type, 1);
  slot.sold = true;
  playSfx('payment');
  updateHud();
  showShopOverlay(); // re-render with updated state
}

function rerollMerchant() {
  if (!getMerchant()) return;
  const cost = 10 * (getMerchant().rerollCount + 1);
  const totalGold = getGold() + getStashGold();
  if (totalGold < cost) return;
  spendGold(cost);
  getMerchant().rerollCount++;
  getMerchant().stock = rollMerchantStock();
  playSfx('payment');
  updateHud();
  showShopOverlay(); // re-render with new stock and new reroll cost
}

function leaveShop() {
  hideOverlay();
}

// ============================================================
// MERCHANT
// ============================================================


const MERCHANT_PRICES = { potion: 10, pickaxe: 15, scanner: 20, row: 25, column: 25, cross: 30 };

// Discount distribution: weights sum to 100.
// Each slot's discount is rolled independently.
const DISCOUNT_TIERS = [
  { key: 'free', weight: 1,  mult: 0 },
  { key: 'd90',  weight: 3,  mult: 0.10 },
  { key: 'd75',  weight: 15, mult: 0.25 },
  { key: 'd50',  weight: 15, mult: 0.50 },
  { key: 'd25',  weight: 20, mult: 0.75 },
  { key: 'full', weight: 46, mult: 1.00 },
];

function rollDiscountTier() {
  const total = DISCOUNT_TIERS.reduce((s, t) => s + t.weight, 0); // 100
  let r = Math.random() * total;
  for (const tier of DISCOUNT_TIERS) {
    r -= tier.weight;
    if (r < 0) return tier;
  }
  return DISCOUNT_TIERS[DISCOUNT_TIERS.length - 1]; // fallback (shouldn't hit)
}

function priceFromTier(basePrice, tier) {
  if (tier.key === 'free') return 0;
  if (tier.key === 'full') return basePrice;
  return Math.max(1, Math.round(basePrice * tier.mult));
}

function rollMerchantStock() {
  const itemTypes = ['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross'];
  const stock = [];
  for (let i = 0; i < 10; i++) {
    const type = itemTypes[Math.floor(Math.random() * itemTypes.length)];
    const basePrice = MERCHANT_PRICES[type];
    const tier = rollDiscountTier();
    const price = priceFromTier(basePrice, tier);
    stock.push({ type, basePrice, discountKey: tier.key, price, sold: false });
  }
  return stock;
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
      showEscapedOverlay();
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
        showDeathOverlay();
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
        showEscapedOverlay();
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

function renderStartMenu() {
  document.body.classList.remove('in-run');
  const save = loadRun();
  const continueBtn = save
    ? `<button class="menu-btn-primary" onclick="resumeGame(loadRun())">Continue (Level ${save.level} · 💰 ${save.stashGold})</button>`
    : '';
  const newRunOnClick = save ? 'renderNewRunConfirm()' : 'startGame()';
  const newRunClass = save ? 'menu-btn-secondary' : 'menu-btn-primary';
  showOverlay(`
    <h2>Mining Crawler</h2>
    ${continueBtn}
    <button class="${newRunClass}" onclick="${newRunOnClick}">New Run</button>
    <button class="menu-btn-secondary" onclick="renderRules('start')">Rules</button>
    <button class="menu-btn-secondary" onclick="renderSettings('start')">Settings</button>
  `);
}

function renderNewRunConfirm() {
  showOverlay(`
    <h2>New Run?</h2>
    <p>Starting a new run will erase your saved progress.</p>
    <button class="menu-btn-primary" onclick="startGame()">Start New Run</button>
    <button class="menu-btn-secondary" onclick="renderStartMenu()">Cancel</button>
  `);
}

function renderPauseMenu() {
  showOverlay(`
    <h2>Paused</h2>
    <button class="menu-btn-primary" onclick="hideOverlay()">Resume</button>
    <button class="menu-btn-secondary" onclick="renderRules('pause')">Rules</button>
    <button class="menu-btn-secondary" onclick="renderSettings('pause')">Settings</button>
    <button class="menu-btn-secondary" onclick="saveRun(); renderStartMenu()">Quit to Menu</button>
  `);
}

function renderRules(parent) {
  const back = parent === 'pause' ? 'renderPauseMenu()' : 'renderStartMenu()';
  showOverlay(`
    <h2>Rules</h2>
    <p>Reach the exit (🚪) to escape to the next level.</p>
    <p>Dig adjacent cells to reveal paths. Numbers count gas tiles in the 8 surrounding cells.</p>
    <p>You have 3 ❤️. Hitting gas damages you for 1 ❤️. HP carries between levels — dying forfeits your current-level gold, but stash and items are safe.</p>
    <p>Gold (💰) is optional — step onto revealed gold to collect it.</p>
    <p>A 🧙 merchant sometimes appears — spend gold for items at varying discounts.</p>
    <p>💧 A <strong>Health Fountain</strong> sometimes appears — step on it to heal to full. Single use.</p>
    <button class="menu-btn-primary" onclick="${back}">Back</button>
  `);
}

function renderSettings(parent) {
  const back = parent === 'pause' ? 'renderPauseMenu()' : 'renderStartMenu()';
  const musicLabel = settings.musicOn ? 'On' : 'Off';
  const sfxLabel = settings.sfxOn ? 'On' : 'Off';
  showOverlay(`
    <h2>Settings</h2>
    <div class="toggle-row">
      <span>🎵 Music</span>
      <button class="toggle-btn ${settings.musicOn ? 'toggle-on' : 'toggle-off'}" onclick="setMusicOn(!settings.musicOn); renderSettings('${parent}')">${musicLabel}</button>
    </div>
    <div class="toggle-row">
      <span>🔊 Sound Effects</span>
      <button class="toggle-btn ${settings.sfxOn ? 'toggle-on' : 'toggle-off'}" onclick="setSfxOn(!settings.sfxOn); renderSettings('${parent}')">${sfxLabel}</button>
    </div>
    <button class="menu-btn-primary" onclick="${back}">Back</button>
  `);
}

const SAVE_KEY = 'miningCrawler.runState';
const LIFETIME_GOLD_KEY = 'miningCrawler.lifetimeGold';

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

function addToLifetimeGold(amount) {
  const cur = parseInt(localStorage.getItem(LIFETIME_GOLD_KEY) || '0', 10);
  localStorage.setItem(LIFETIME_GOLD_KEY, String(cur + amount));
}

function getLifetimeGold() {
  return parseInt(localStorage.getItem(LIFETIME_GOLD_KEY) || '0', 10);
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

// ============================================================
// ITEM USAGE
// ============================================================

function onItemButtonClick(itemKey) {
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
  if (getHp() >= MAX_HP) return;
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

  playSfx('scan');
  updateHud();
  updateItemBar();
  renderGrid();
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
  playSfx('scan');
  updateHud();
  updateItemBar();
  renderGrid();
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
  playSfx('scan');
  updateHud();
  updateItemBar();
  renderGrid();
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
  playSfx('scan');
  updateHud();
  updateItemBar();
  renderGrid();
}

// Cancel any active targeting mode on Escape.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && getActiveItem()) {
    setActiveItem(null);
    updateItemBar();
    renderGrid();
  }
});

// ============================================================
// POINTER ARBITER (tap / long-press / drag)
// ============================================================

const DRAG_THRESHOLD_PX = 8;
const LONG_PRESS_MS = 400;

// One active pointer at a time. Multi-touch is ignored for gameplay.
let activePointer = null;
// Timestamp of the last long-press flag. Android fires a native contextmenu
// after a touch long-press, so the contextmenu handler must suppress itself
// when our timer already fired the flag.
let lastLongPressAt = 0;
// { id, startX, startY, lastX, lastY, startTime, cellR, cellC, state: 'pending'|'drag', longPressFired, longPressTimer }

function cellFromClientPoint(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el) return null;
  const cell = el.closest('.cell');
  if (!cell) return null;
  const r = parseInt(cell.dataset.row);
  const c = parseInt(cell.dataset.col);
  if (isNaN(r) || isNaN(c)) return null;
  return { r, c };
}

function onViewportPointerDown(e) {
  if (activePointer !== null) return; // ignore secondary pointers
  // Non-primary mouse buttons (right-click, middle-click) are handled by the
  // contextmenu listener; don't let them arm the tap/long-press/drag machine.
  if (e.button !== 0) return;
  const hit = cellFromClientPoint(e.clientX, e.clientY);
  activePointer = {
    id: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    lastX: e.clientX,
    lastY: e.clientY,
    startTime: performance.now(),
    cellR: hit ? hit.r : undefined,
    cellC: hit ? hit.c : undefined,
    state: 'pending',
    longPressFired: false,
    longPressTimer: null,
  };
  viewportEl.setPointerCapture(e.pointerId);

  // Long-press timer fires flag if still pending at 400ms.
  activePointer.longPressTimer = setTimeout(() => {
    if (activePointer && activePointer.state === 'pending' &&
        activePointer.cellR !== undefined && activePointer.cellC !== undefined) {
      activePointer.longPressFired = true;
      lastLongPressAt = performance.now();
      handleRightClick(activePointer.cellR, activePointer.cellC);
    }
  }, LONG_PRESS_MS);
}

function onViewportPointerMove(e) {
  if (!activePointer || e.pointerId !== activePointer.id) return;

  const dx = e.clientX - activePointer.startX;
  const dy = e.clientY - activePointer.startY;
  const dist = Math.hypot(dx, dy);

  if (activePointer.state === 'pending' && dist > DRAG_THRESHOLD_PX) {
    activePointer.state = 'drag';
    clearTimeout(activePointer.longPressTimer);
  }

  if (activePointer.state === 'drag') {
    const deltaX = e.clientX - activePointer.lastX;
    const deltaY = e.clientY - activePointer.lastY;
    setPan(pan.x + deltaX, pan.y + deltaY);
    pan.lastManualPanAt = performance.now();
  }

  activePointer.lastX = e.clientX;
  activePointer.lastY = e.clientY;
}

function onViewportPointerUp(e) {
  if (!activePointer || e.pointerId !== activePointer.id) return;
  clearTimeout(activePointer.longPressTimer);

  if (activePointer.state === 'pending' && !activePointer.longPressFired) {
    // Tap: invoke the cell click handler if we had a valid cell.
    if (activePointer.cellR !== undefined && activePointer.cellC !== undefined) {
      handleClick(activePointer.cellR, activePointer.cellC);
    }
  }
  // If state was 'drag', pan already happened in pointermove.
  // If longPressFired, handleRightClick already ran.

  try { viewportEl.releasePointerCapture(e.pointerId); } catch (_) {}
  activePointer = null;
}

function onViewportPointerCancel(e) {
  if (!activePointer || e.pointerId !== activePointer.id) return;
  clearTimeout(activePointer.longPressTimer);
  try { viewportEl.releasePointerCapture(e.pointerId); } catch (_) {}
  activePointer = null;
}

viewportEl.addEventListener('pointerdown', onViewportPointerDown);
viewportEl.addEventListener('pointermove', onViewportPointerMove);
viewportEl.addEventListener('pointerup', onViewportPointerUp);
viewportEl.addEventListener('pointercancel', onViewportPointerCancel);

// Prevent native contextmenu (desktop right-click) from showing the browser menu.
// We keep desktop right-click-to-flag by handling it explicitly.
// Suppress firing if our long-press timer already handled this touch — Android
// Chrome fires a synthetic contextmenu after a long-press which would otherwise
// toggle the flag right back off.
viewportEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (performance.now() - lastLongPressAt < 1000) return;
  const hit = cellFromClientPoint(e.clientX, e.clientY);
  if (hit) {
    handleRightClick(hit.r, hit.c);
  }
});

// ============================================================
// ITEM TOOLTIPS
// ============================================================

const TOOLTIP_HOVER_DELAY_MS = 300;
const TOOLTIP_LONG_PRESS_MS = 400;
const TOOLTIP_MOVE_THRESHOLD = 8;
const TOOLTIP_GAP = 8;

let tooltipShownFor = null; // element currently showing tooltip, or null

function hideTooltip() {
  tooltipEl.classList.add('hidden');
  tooltipEl.classList.remove('tooltip-below');
  tooltipEl.style.setProperty('--tooltip-tail-x', '50%');
  tooltipShownFor = null;
}

function showTooltip(triggerEl, itemKey) {
  const data = ITEM_TOOLTIPS[itemKey];
  if (!data) return;
  tooltipEl.innerHTML =
    '<div class="tooltip-name">' + data.name + '</div>' +
    '<div class="tooltip-desc">' + data.desc + '</div>' +
    '<div class="tooltip-howto">' + data.howto + '</div>';
  tooltipEl.classList.remove('hidden');
  tooltipEl.classList.remove('tooltip-below');
  positionTooltip(triggerEl);
  tooltipShownFor = triggerEl;
}

function positionTooltip(triggerEl) {
  const trigRect = triggerEl.getBoundingClientRect();
  const tipRect = tooltipEl.getBoundingClientRect();
  const vw = window.innerWidth;

  // Preferred: above trigger
  let top = trigRect.top - tipRect.height - TOOLTIP_GAP;
  let flipBelow = false;
  if (top < TOOLTIP_GAP) {
    top = trigRect.bottom + TOOLTIP_GAP;
    flipBelow = true;
  }

  // Horizontal center on trigger, clamped to viewport
  const trigCenterX = trigRect.left + trigRect.width / 2;
  const preferredLeft = trigCenterX - tipRect.width / 2;
  const clampedLeft = Math.max(
    TOOLTIP_GAP,
    Math.min(preferredLeft, vw - tipRect.width - TOOLTIP_GAP)
  );

  // Tail stays centered on the trigger, even if tooltip is clamped
  const tailX = trigCenterX - clampedLeft;
  tooltipEl.style.setProperty('--tooltip-tail-x', tailX + 'px');

  tooltipEl.style.left = clampedLeft + 'px';
  tooltipEl.style.top = top + 'px';

  if (flipBelow) {
    tooltipEl.classList.add('tooltip-below');
  }
}

function attachTooltip(el, itemKey) {
  let startX = 0;
  let startY = 0;
  let pending = false;
  let timer = null;

  const clearTimer = () => {
    if (timer) { clearTimeout(timer); timer = null; }
  };

  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      showTooltip(el, itemKey);
    }, TOOLTIP_HOVER_DELAY_MS);
  });

  el.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimer();
    if (tooltipShownFor === el) hideTooltip();
  });

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    startX = e.clientX;
    startY = e.clientY;
    pending = true;
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      if (!pending) return;
      el._suppressNextClick = true;
      showTooltip(el, itemKey);
    }, TOOLTIP_LONG_PRESS_MS);
  });

  el.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') return;
    if (!pending) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (dx * dx + dy * dy > TOOLTIP_MOVE_THRESHOLD * TOOLTIP_MOVE_THRESHOLD) {
      pending = false;
      clearTimer();
    }
  });

  el.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') return;
    pending = false;
    clearTimer();
    if (tooltipShownFor === el) hideTooltip();
  });

  el.addEventListener('pointercancel', (e) => {
    if (e.pointerType === 'mouse') return;
    pending = false;
    clearTimer();
    if (tooltipShownFor === el) hideTooltip();
  });
}

window.addEventListener('scroll', hideTooltip, true);
window.addEventListener('resize', hideTooltip);

// Wire button clicks and tooltips
for (const key of ['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross']) {
  itemButtons[key].addEventListener('click', () => onItemButtonClick(key));
  attachTooltip(itemButtons[key], key);
}

pauseBtn.addEventListener('click', renderPauseMenu);

// Module-scope doesn't expose names to inline onclick= handlers in overlay
// HTML templates. Bridge the ones used by those templates until overlay
// rendering is refactored in Task 12.
Object.assign(window, {
  startGame, resumeGame, loadRun, nextLevel, retryLevel,
  renderNewRunConfirm, renderRules, renderSettings, renderStartMenu, renderPauseMenu,
  hideOverlay, saveRun,
  buyFromMerchant, rerollMerchant, leaveShop,
  setMusicOn, setSfxOn, settings,
});

// Register service worker so Android Chrome offers install.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

renderStartMenu();
