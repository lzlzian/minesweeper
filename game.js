// ============================================================
// STATE
// ============================================================

const MAX_HP = 3;
const STEP_MS = 80;

const state = {
  gold: 0,
  stashGold: 0,
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
  activeItem: null, // null | 'pickaxe'
  levelsSinceMerchant: 0, // run-scoped; >=2 forces merchant spawn next level
  merchant: null, // level-scoped; { r, c, rerollCount, stock: [{ type, basePrice, discountKey, price, sold }, ...] } or null
  rulesetId: null, // level-scoped; string id from RULESETS; null => initLevel rolls
  biomeOverrides: null, // level-scoped; object or null, set by ruleset.prepare
};

function spendGold(amount) {
  // Deduct from current-level gold first, overflow into run gold.
  if (state.gold >= amount) {
    state.gold -= amount;
  } else {
    const remainder = amount - state.gold;
    state.gold = 0;
    state.stashGold -= remainder;
  }
}

// ============================================================
// RULESETS
// ============================================================
// Registry of level rulesets. Each level rolls one from this list (weighted)
// starting at level 13. Levels 1-12 always use 'regular'.
// Ruleset shape: { id: string, weight: number, prepare?: (state) => void, apply?: (state) => void }
// - prepare runs BEFORE level generation (may set override fields on state).
// - apply runs AFTER level generation (may mutate the finished board/entities).
// Both hooks are optional.
const RULESETS = [
  { id: 'regular',          weight: 9, prepare: null,                   apply: null },
  { id: 'treasure_chamber', weight: 1, prepare: prepareTreasureChamber, apply: applyTreasureChamber },
];

function prepareTreasureChamber(state) {
  state.biomeOverrides = {
    wallDensity:         0.15,
    gasDensity:          0.12,
    goldScatterDensity:  0.30,
    guaranteedItemDrops: 2,
    suppressMerchant:    true,
    freezePityTick:      true,
  };
}

function applyTreasureChamber(state) {
  // Compute the two off-diagonal corners (neither player start nor exit).
  const playerIdx = state._startCornerIdx;
  const exitIdx = 3 - playerIdx;
  const offDiagonalIdxs = [0, 1, 2, 3].filter(i => i !== playerIdx && i !== exitIdx);
  const cornerCoords = [
    { r: 0, c: 0 },
    { r: 0, c: state.cols - 1 },
    { r: state.rows - 1, c: 0 },
    { r: state.rows - 1, c: state.cols - 1 },
  ];

  for (const idx of offDiagonalIdxs) {
    const { r, c } = cornerCoords[idx];
    const cell = state.grid[r][c];
    const hadGas = cell.type === 'gas';

    // Overwrite whatever landed here with a chest-gold cell.
    cell.type = 'gold';
    cell.goldValue = 25;
    cell.item = null;
    cell.chest = true;
    cell.adjacent = countAdjacentGas(r, c);

    // If we removed a gas cell, neighbors' adjacency counts need recomputing.
    if (hadGas) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
          const n = state.grid[nr][nc];
          if (n.type !== 'gas' && n.type !== 'wall') {
            n.adjacent = countAdjacentGas(nr, nc);
          }
        }
      }
    }

    // Pre-reveal the chest cell.
    state.revealed[r][c] = true;
  }

  renderGrid();
}

function weightedPick(list) {
  const total = list.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const x of list) {
    r -= x.weight;
    if (r < 0) return x;
  }
  return list[list.length - 1]; // fallback
}

function resolveRuleset(id) {
  return RULESETS.find(r => r.id === id) || RULESETS[0];
}

// Size at level N: 10 at 1-2, 12 at 3-4, ..., capped at 20.
function gridSizeForLevel(level) {
  const size = 10 + 2 * Math.floor((level - 1) / 2);
  return Math.min(20, size);
}

function anchorCountForSize(size) {
  if (size <= 12) return 1;
  if (size <= 14) return 2;
  return Math.random() < 0.5 ? 2 : 3;
}

// Cell object shape:
// { type: 'empty' | 'gas' | 'gold' | 'wall' | 'detonated', adjacent: number, goldValue: number, item: null | 'potion' | 'scanner' | 'pickaxe' }
// 'detonated' = a gas cell that was dug into; now passable floor that shows a red cross.
// 'item' = if non-null, the item is visible on the revealed cell and gets
// picked up when the player steps onto the cell (not merely on reveal).

// ============================================================
// UI REFERENCES
// ============================================================

const board = document.getElementById('board');
const gridContainer = document.getElementById('grid-container');
const goldDisplay = document.getElementById('gold-display');
const hpDisplay = document.getElementById('hp-display');
const levelDisplay = document.getElementById('level-display');
const playerSprite = document.getElementById('player-sprite');
const overlay = document.getElementById('overlay');
const overlayContent = document.getElementById('overlay-content');
const itemBar = document.getElementById('item-bar');
const itemButtons = {
  potion: document.getElementById('item-potion'),
  scanner: document.getElementById('item-scanner'),
  pickaxe: document.getElementById('item-pickaxe'),
  row: document.getElementById('item-row'),
  column: document.getElementById('item-column'),
  cross: document.getElementById('item-cross'),
};
const itemCounts = {
  potion: document.getElementById('item-potion-count'),
  scanner: document.getElementById('item-scanner-count'),
  pickaxe: document.getElementById('item-pickaxe-count'),
  row: document.getElementById('item-row-count'),
  column: document.getElementById('item-column-count'),
  cross: document.getElementById('item-cross-count'),
};

const CELL_SIZE = 40;
const CELL_GAP = 2;
const BOARD_PAD = 16;

// ============================================================
// VIEWPORT / PAN
// ============================================================

const viewportEl = document.getElementById('viewport');
const minimapEl = document.getElementById('minimap');

const pan = {
  x: 0,
  y: 0,
  lastManualPanAt: 0, // timestamp ms; auto-recenter skips within 2000ms of this
};

function getViewportSize() {
  return { w: viewportEl.clientWidth, h: viewportEl.clientHeight };
}

function getBoardSize() {
  const gridW = state.cols * (CELL_SIZE + CELL_GAP) - CELL_GAP;
  const gridH = state.rows * (CELL_SIZE + CELL_GAP) - CELL_GAP;
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
  if (isCellOutsideCenterRect(state.playerRow, state.playerCol)) {
    centerOnCell(state.playerRow, state.playerCol, 200);
  }
}

function renderMinimap() {
  if (!state.grid || !state.grid.length) return;
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
  const boardDim = Math.max(state.rows, state.cols);
  const pxPerCell = Math.floor(cssSize / boardDim);
  const drawW = pxPerCell * state.cols;
  const drawH = pxPerCell * state.rows;
  const offsetX = (cssSize - drawW) / 2;
  const offsetY = (cssSize - drawH) / 2;

  // Background (fully opaque so unrevealed area is visibly dark even over faint BG).
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, cssSize, cssSize);

  // Draw each cell.
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const x = offsetX + c * pxPerCell;
      const y = offsetY + r * pxPerCell;
      const cell = state.grid[r][c];

      if (!state.revealed[r][c]) {
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
  drawMarker(state.exit.r, state.exit.c, '#33ff33');

  // Merchant (if spawned; always pre-revealed).
  if (state.merchant) {
    drawMarker(state.merchant.r, state.merchant.c, '#ff33ff');
  }

  // Player last so it's always visible.
  drawMarker(state.playerRow, state.playerCol, '#ffdd00');
}

minimapEl.addEventListener('click', (e) => {
  const rect = minimapEl.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;
  const cssSize = 100;
  const boardDim = Math.max(state.rows, state.cols);
  const pxPerCell = Math.floor(cssSize / boardDim);
  const drawW = pxPerCell * state.cols;
  const drawH = pxPerCell * state.rows;
  const offsetX = (cssSize - drawW) / 2;
  const offsetY = (cssSize - drawH) / 2;
  const c = Math.floor((clickX - offsetX) / pxPerCell);
  const r = Math.floor((clickY - offsetY) / pxPerCell);
  if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return;
  pan.lastManualPanAt = performance.now(); // treat as manual pan
  centerOnCell(r, c, 200);
});

window.addEventListener('resize', () => {
  setPan(pan.x, pan.y); // re-clamp under new viewport size
  renderMinimap();
});

// ============================================================
// SETTINGS
// ============================================================

const SETTINGS_KEY = 'miningCrawler.settings';

function loadSettings() {
  try {
    return { musicOn: true, sfxOn: true, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch { return { musicOn: true, sfxOn: true }; }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

const settings = loadSettings();

// ============================================================
// AUDIO (Web Audio API for SFX, HTML5 Audio for BGM)
// ============================================================

const SFX_VOLUME = 0.5;
const BGM_VOLUME = 0.15;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const sfxGain = audioCtx.createGain();
sfxGain.gain.value = SFX_VOLUME;
sfxGain.connect(audioCtx.destination);

const sfxBuffers = {};
const sfxPaths = {
  dig: 'assets/sounds/dig.mp3',
  boom: 'assets/sounds/boom.mp3',
  gold: 'assets/sounds/gold.mp3',
  step: 'assets/sounds/step.mp3',
  mark: 'assets/sounds/mark.mp3',
  unmark: 'assets/sounds/unmark.mp3',
  win: 'assets/sounds/win.mp3',
  welcome: 'assets/sounds/welcome.mp3',
  payment: 'assets/sounds/payment.mp3',
  scan: 'assets/sounds/scan.mp3',
  drink: 'assets/sounds/drink.mp3',
  pickaxe: 'assets/sounds/pickaxe.mp3',
  pickup: 'assets/sounds/pickup.mp3',
};

for (const [name, path] of Object.entries(sfxPaths)) {
  fetch(path)
    .then(r => r.arrayBuffer())
    .then(buf => audioCtx.decodeAudioData(buf))
    .then(decoded => { sfxBuffers[name] = decoded; })
    .catch(() => {});
}

function resumeAudioCtx() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
}
document.addEventListener('touchstart', resumeAudioCtx, { once: true });
document.addEventListener('click', resumeAudioCtx, { once: true });

function playSfx(name) {
  if (!settings.sfxOn) return;
  const buf = sfxBuffers[name];
  if (!buf) return;
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.connect(sfxGain);
  src.start();
}

const bgm = new Audio('assets/sounds/background-music.mp3');
bgm.loop = true;
bgm.volume = BGM_VOLUME;

function startBgm() {
  if (!settings.musicOn) return;
  bgm.play().catch(() => {});
}

function setMusicOn(value) {
  settings.musicOn = value;
  saveSettings();
  if (value) {
    bgm.play().catch(() => {});
  } else {
    bgm.pause();
  }
}

function setSfxOn(value) {
  settings.sfxOn = value;
  saveSettings();
}

// ============================================================
// RENDERING
// ============================================================

function renderGrid() {
  gridContainer.innerHTML = '';
  gridContainer.style.gridTemplateColumns = `repeat(${state.cols}, 40px)`;

  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = r;
      cell.dataset.col = c;

      const isAdjacent = isAdjacentToPlayer(r, c);

      if (state.grid[r][c].type === 'wall') {
        cell.classList.add('wall');
      } else {
        const isExit = (r === state.exit.r && c === state.exit.c);
        if (isExit) cell.classList.add('exit');

        const isMerchant = state.merchant && r === state.merchant.r && c === state.merchant.c;
        if (isMerchant) cell.classList.add('merchant');

        if (state.revealed[r][c]) {
          const g = state.grid[r][c];
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
          else if (g.item) icon = PICKUP_EMOJI[g.item];

          if (icon) {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'icon';
            iconSpan.textContent = icon;
            cell.appendChild(iconSpan);
          }
        } else if (state.flagged[r][c]) {
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
function flashHurtFace() {
  playerSprite.textContent = '🤕';
  const token = ++hurtFlashToken;
  setTimeout(() => {
    if (token === hurtFlashToken) {
      playerSprite.textContent = '🙂';
    }
  }, 1000);
}

function updatePlayerSprite(instant = false) {
  const x = BOARD_PAD + state.playerCol * (CELL_SIZE + CELL_GAP);
  const y = BOARD_PAD + state.playerRow * (CELL_SIZE + CELL_GAP);
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

const PICKUP_EMOJI = { potion: '🍺', scanner: '🔍', pickaxe: '⛏️', row: '↔️', column: '↕️', cross: '✖️' };

function spawnPickupFloat(r, c, label, extraClass) {
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

function updateHud() {
  goldDisplay.textContent = `💰 ${state.gold} · Stash: ${state.stashGold}`;
  hpDisplay.textContent = '❤️'.repeat(Math.max(0, state.hp)) + '🖤'.repeat(Math.max(0, MAX_HP - state.hp));
  levelDisplay.textContent = `Level ${state.level}`;
  updateItemBar();
}

function updateItemBar() {
  for (const key of ['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross']) {
    const count = state.items[key];
    itemCounts[key].textContent = count;

    const btn = itemButtons[key];
    let disabled = count === 0 || state.gameOver;
    if (key === 'potion' && state.hp >= MAX_HP) disabled = true;
    if (key === 'scanner' && !scannerHasTarget()) disabled = true;
    if (key === 'row' && !rowHasTarget()) disabled = true;
    if (key === 'column' && !columnHasTarget()) disabled = true;
    if (key === 'cross' && !crossHasTarget()) disabled = true;
    btn.disabled = disabled;

    btn.classList.toggle('active', state.activeItem === key);
  }
}

function showOverlay(html) {
  overlayContent.innerHTML = html;
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

function showEscapedOverlay() {
  const nextSize = gridSizeForLevel(state.level + 1);
  showOverlay(`
    <h2>Escaped!</h2>
    <p>Level ${state.level} cleared · +💰 ${state.gold}</p>
    <p>Stash: 💰 ${state.stashGold + state.gold}</p>
    <p>Next: Level ${state.level + 1} (${nextSize}×${nextSize})</p>
    <button onclick="nextLevel()">Descend</button>
  `);
}

function showDeathOverlay() {
  showOverlay(`
    <h2>You died.</h2>
    <p>Level ${state.level} · Forfeited 💰 ${state.gold}</p>
    <p>Stash: 💰 ${state.stashGold}</p>
    <button onclick="retryLevel()">Retry Level</button>
    <button onclick="startGame()">New Run</button>
  `);
}

function showShopOverlay(playWelcome = false) {
  if (!state.merchant) return;
  // Clear any active item targeting before opening the shop.
  state.activeItem = null;
  updateItemBar();
  if (playWelcome) playSfx('welcome');

  const totalGold = state.gold + state.stashGold;
  const itemEmoji = { potion: '🍺', pickaxe: '⛏️', scanner: '🔍', row: '↔️', column: '↕️', cross: '✖️' };
  const itemName = { potion: 'Potion', pickaxe: 'Pickaxe', scanner: 'Scanner', row: 'Row Scan', column: 'Column Scan', cross: 'Cross Scan' };

  const slotsHtml = state.merchant.stock.map((slot, idx) => {
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

  const rerollCost = 10 * (state.merchant.rerollCount + 1);
  const canAffordReroll = totalGold >= rerollCost;

  showOverlay(`
    <h2>🧙 Merchant</h2>
    <p>💰 Gold: ${state.gold} · Stash: ${state.stashGold}</p>
    <div class="shop-slots">${slotsHtml}</div>
    <div class="shop-actions">
      <button onclick="rerollMerchant()" ${canAffordReroll ? '' : 'disabled'}>🎲 Reroll (${rerollCost}g)</button>
      <button onclick="leaveShop()">Leave</button>
    </div>
  `);
}

function buyFromMerchant(idx) {
  if (!state.merchant) return;
  const slot = state.merchant.stock[idx];
  if (!slot || slot.sold) return;
  const totalGold = state.gold + state.stashGold;
  if (totalGold < slot.price) return;
  spendGold(slot.price);
  state.items[slot.type]++;
  slot.sold = true;
  playSfx('payment');
  updateHud();
  showShopOverlay(); // re-render with updated state
}

function rerollMerchant() {
  if (!state.merchant) return;
  const cost = 10 * (state.merchant.rerollCount + 1);
  const totalGold = state.gold + state.stashGold;
  if (totalGold < cost) return;
  spendGold(cost);
  state.merchant.rerollCount++;
  state.merchant.stock = rollMerchantStock();
  playSfx('payment');
  updateHud();
  showShopOverlay(); // re-render with new stock and new reroll cost
}

function leaveShop() {
  hideOverlay();
}

// ============================================================
// PLACEHOLDER — filled in next tasks
// ============================================================

function placeWallClumps() {
  const wallDensity = state.biomeOverrides?.wallDensity ?? 0.25;
  const targetWallCount = Math.floor(state.rows * state.cols * wallDensity);
  let placed = 0;
  let attempts = 0;
  const maxAttempts = 500;

  while (placed < targetWallCount && attempts < maxAttempts) {
    attempts++;
    const clumpSize = 2 + Math.floor(Math.random() * 4); // 2..5
    const startR = Math.floor(Math.random() * state.rows);
    const startC = Math.floor(Math.random() * state.cols);
    if (state.grid[startR][startC].type !== 'empty') continue;

    state.grid[startR][startC].type = 'wall';
    placed++;

    const clump = [{ r: startR, c: startC }];
    for (let i = 1; i < clumpSize && placed < targetWallCount; i++) {
      const anchor = clump[Math.floor(Math.random() * clump.length)];
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      const [dr, dc] = dirs[Math.floor(Math.random() * dirs.length)];
      const nr = anchor.r + dr;
      const nc = anchor.c + dc;
      if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
      if (state.grid[nr][nc].type !== 'empty') continue;
      state.grid[nr][nc].type = 'wall';
      clump.push({ r: nr, c: nc });
      placed++;
    }
  }
}

// Search outward from (anchorR, anchorC) in increasing Chebyshev distance
// for a non-wall cell. Used to anchor player/exit near a corner even when
// the corner itself got walled.
function findNearCorner(anchorR, anchorC) {
  const maxDist = Math.max(state.rows, state.cols);
  for (let d = 0; d < maxDist; d++) {
    for (let r = Math.max(0, anchorR - d); r <= Math.min(state.rows - 1, anchorR + d); r++) {
      for (let c = Math.max(0, anchorC - d); c <= Math.min(state.cols - 1, anchorC + d); c++) {
        if (Math.max(Math.abs(r - anchorR), Math.abs(c - anchorC)) !== d) continue;
        if (state.grid[r][c].type === 'wall') continue;
        return { r, c };
      }
    }
  }
  return null;
}

function pickPlayerStart() {
  const corners = [
    { r: 0, c: 0 },
    { r: 0, c: state.cols - 1 },
    { r: state.rows - 1, c: 0 },
    { r: state.rows - 1, c: state.cols - 1 },
  ];
  const cornerIdx = Math.floor(Math.random() * 4);
  state._startCornerIdx = cornerIdx;
  const anchor = corners[cornerIdx];
  return findNearCorner(anchor.r, anchor.c);
}

function pickExit(playerR, playerC) {
  // Exit sits in the corner diagonally opposite to the player's start corner.
  const corners = [
    { r: 0, c: 0 },
    { r: 0, c: state.cols - 1 },
    { r: state.rows - 1, c: 0 },
    { r: state.rows - 1, c: state.cols - 1 },
  ];
  const oppositeIdx = 3 - state._startCornerIdx;
  const anchor = corners[oppositeIdx];
  const found = findNearCorner(anchor.r, anchor.c);
  if (!found) return null;
  if (found.r === playerR && found.c === playerC) return null;
  if (!hasNonWallNeighbor(found.r, found.c)) return null;
  return found;
}

function pickMerchantCorner() {
  // Pick one of the two corners not used by player or exit.
  // Corner indices: 0=TL, 1=TR, 2=BL, 3=BR. Player = state._startCornerIdx,
  // exit = 3 - state._startCornerIdx. Off-diagonal corners are the other two.
  const playerIdx = state._startCornerIdx;
  const exitIdx = 3 - playerIdx;
  const offDiagonal = [0, 1, 2, 3].filter(i => i !== playerIdx && i !== exitIdx);
  const pickedIdx = offDiagonal[Math.floor(Math.random() * offDiagonal.length)];
  const corners = [
    { r: 0, c: 0 },
    { r: 0, c: state.cols - 1 },
    { r: state.rows - 1, c: 0 },
    { r: state.rows - 1, c: state.cols - 1 },
  ];
  const anchor = corners[pickedIdx];
  const found = findNearCorner(anchor.r, anchor.c);
  if (!found) return null;
  if (!hasNonWallNeighbor(found.r, found.c)) return null;
  return found;
}

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

function cleanMerchantCell(r, c) {
  const cell = state.grid[r][c];
  const hadGas = cell.type === 'gas';
  cell.type = 'empty';
  cell.goldValue = 0;
  cell.item = null;
  // Recompute the merchant cell's own adjacency (was 0 if it was gas/wall).
  cell.adjacent = countAdjacentGas(r, c);
  // If gas was removed, neighbors' adjacency counts also need recomputation.
  if (hadGas) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
        const n = state.grid[nr][nc];
        if (n.type !== 'gas' && n.type !== 'wall') {
          n.adjacent = countAdjacentGas(nr, nc);
        }
      }
    }
  }
}

function hasNonWallNeighbor(r, c) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
      if (state.grid[nr][nc].type !== 'wall') return true;
    }
  }
  return false;
}

function isReachable(fromR, fromC, toR, toC) {
  const visited = Array.from({ length: state.rows }, () =>
    Array(state.cols).fill(false)
  );
  const queue = [{ r: fromR, c: fromC }];
  visited[fromR][fromC] = true;
  while (queue.length > 0) {
    const { r, c } = queue.shift();
    if (r === toR && c === toC) return true;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
        if (visited[nr][nc]) continue;
        const t = state.grid[nr][nc].type;
        if (t === 'wall' || t === 'gas') continue;
        visited[nr][nc] = true;
        queue.push({ r: nr, c: nc });
      }
    }
  }
  return false;
}

function carvePath(fromR, fromC, toR, toC) {
  // Walk Chebyshev-style from (fromR, fromC) to (toR, toC), clearing walls
  // and gas on every cell of the path. Guarantees solvability.
  let r = fromR;
  let c = fromC;
  while (r !== toR || c !== toC) {
    if (r < toR) r++;
    else if (r > toR) r--;
    if (c < toC) c++;
    else if (c > toC) c--;
    const cell = state.grid[r][c];
    if (cell.type === 'wall' || cell.type === 'gas') {
      cell.type = 'empty';
      cell.goldValue = 0;
    }
  }
  // Recompute adjacency for the whole grid (cheap at 12x12)
  for (let rr = 0; rr < state.rows; rr++) {
    for (let cc = 0; cc < state.cols; cc++) {
      const g = state.grid[rr][cc];
      if (g.type !== 'gas' && g.type !== 'wall') {
        g.adjacent = countAdjacentGas(rr, cc);
      }
    }
  }
}

// Orthogonal directions first so ties are broken in favor of cardinal
// moves over diagonal ones.
const STEP_DIRS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [-1, 1], [1, -1], [1, 1],
];

function findPath(fromR, fromC, toR, toC) {
  if (fromR === toR && fromC === toC) return [{ r: fromR, c: fromC }];
  const visited = Array.from({ length: state.rows }, () =>
    Array(state.cols).fill(null)
  );
  const queue = [{ r: fromR, c: fromC }];
  visited[fromR][fromC] = { r: -1, c: -1 };

  while (queue.length > 0) {
    const { r, c } = queue.shift();
    if (r === toR && c === toC) {
      const path = [];
      let cur = { r, c };
      while (cur.r !== -1) {
        path.push(cur);
        cur = visited[cur.r][cur.c];
      }
      path.reverse();
      return path;
    }
    for (const [dr, dc] of STEP_DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
      if (visited[nr][nc] !== null) continue;
      const t = state.grid[nr][nc].type;
      if (t === 'wall' || t === 'gas') continue;
      if (!state.revealed[nr][nc]) continue;
      visited[nr][nc] = { r, c };
      queue.push({ r: nr, c: nc });
    }
  }
  return null;
}

function generateGrid(gasCount) {
  // Initialize empty grid
  state.grid = Array.from({ length: state.rows }, () =>
    Array.from({ length: state.cols }, () => ({
      type: 'empty',
      adjacent: 0,
      goldValue: 0,
      item: null,
    }))
  );

  // NEW: place walls first
  placeWallClumps();

  // Place gas pockets randomly (skip walls — 'empty' check below handles this)
  let placed = 0;
  while (placed < gasCount) {
    const r = Math.floor(Math.random() * state.rows);
    const c = Math.floor(Math.random() * state.cols);
    if (state.grid[r][c].type === 'empty') {
      state.grid[r][c].type = 'gas';
      placed++;
    }
  }

  // Calculate adjacency numbers (walls are skipped — they neither count nor get counted)
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.grid[r][c].type === 'gas') continue;
      if (state.grid[r][c].type === 'wall') continue;
      state.grid[r][c].adjacent = countAdjacentGas(r, c);
    }
  }

  // Place gold veins — bias high values toward high-adjacency cells
  placeGoldVeins();

  // Place 1-2 item drops on plain empty cells
  placeItemDrops();
}

function countAdjacentGas(r, c) {
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) {
        const t = state.grid[nr][nc].type;
        if (t === 'gas' || t === 'detonated') count++;
      }
    }
  }
  return count;
}

function placeGoldVeins() {
  // Collect all safe cells and sort by adjacency (high first)
  const safeCells = [];
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.grid[r][c].type !== 'gas' && state.grid[r][c].type !== 'wall') {
        safeCells.push({ r, c, adj: state.grid[r][c].adjacent });
      }
    }
  }

  // Pick vein centers — 3 veins, biased toward high adjacency
  const sorted = [...safeCells].sort((a, b) => b.adj - a.adj);
  const veinCount = 3;
  const centers = [];

  for (let i = 0; i < veinCount && i < sorted.length; i++) {
    // Pick from top 30% of high-adjacency cells with some randomness
    const pool = sorted.slice(0, Math.max(5, Math.floor(sorted.length * 0.3)));
    const pick = pool[Math.floor(Math.random() * pool.length)];
    centers.push(pick);
    // Remove pick from sorted to avoid duplicate centers
    const idx = sorted.indexOf(pick);
    if (idx !== -1) sorted.splice(idx, 1);
  }

  // Assign gold values: center = 10, neighbors = 5
  for (const center of centers) {
    const cell = state.grid[center.r][center.c];
    if (cell.type !== 'gas') {
      cell.type = 'gold';
      cell.goldValue = 10;
    }

    // Adjacent cells get medium gold
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = center.r + dr;
        const nc = center.c + dc;
        if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) {
          const neighbor = state.grid[nr][nc];
          if (neighbor.type === 'empty') {
            neighbor.type = 'gold';
            neighbor.goldValue = 5;
          }
        }
      }
    }
  }

  // Scatter some low-value gold (value 1) on remaining empty cells
  const scatterDensity = state.biomeOverrides?.goldScatterDensity ?? 0.2;
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.grid[r][c].type === 'empty' && Math.random() < scatterDensity) {
        state.grid[r][c].type = 'gold';
        state.grid[r][c].goldValue = 1;
      }
    }
  }
}

function placeItemDrops() {
  // Collect empty, goldless, non-gas, non-wall cells as drop candidates.
  // We skip gold cells (already have a payoff) to keep item drops as a
  // distinct reward. Spawn/exit exclusions happen in initLevel, which
  // overwrites the item field on those cells if they landed on drops.
  const candidates = [];
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const cell = state.grid[r][c];
      if (cell.type === 'empty' && cell.goldValue === 0) {
        candidates.push({ r, c });
      }
    }
  }
  if (candidates.length === 0) return;

  // Fisher-Yates shuffle, then take 1 or 2.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const requestedDrops = state.biomeOverrides?.guaranteedItemDrops ?? (1 + Math.floor(Math.random() * 2));
  const dropCount = Math.min(candidates.length, requestedDrops);
  const itemTypes = ['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross'];
  for (let i = 0; i < dropCount; i++) {
    const pick = candidates[i];
    const itemType = itemTypes[Math.floor(Math.random() * itemTypes.length)];
    state.grid[pick.r][pick.c].item = itemType;
  }
}

const ANCHOR_MIN_DIST_START = 4;
const ANCHOR_MIN_DIST_EXIT = 3;
const ANCHOR_MIN_DIST_BETWEEN = 5;

function placeAnchors() {
  const target = anchorCountForSize(state.rows);
  if (target === 0) return;

  const startR = state.playerRow;
  const startC = state.playerCol;
  const exitR = state.exit.r;
  const exitC = state.exit.c;

  // Collect candidates: adjacency-0, non-gas, non-wall, far enough from start/exit.
  const candidates = [];
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const cell = state.grid[r][c];
      if (cell.type === 'gas' || cell.type === 'wall') continue;
      if (cell.adjacent !== 0) continue;
      const distStart = Math.max(Math.abs(r - startR), Math.abs(c - startC));
      const distExit = Math.max(Math.abs(r - exitR), Math.abs(c - exitC));
      if (distStart < ANCHOR_MIN_DIST_START) continue;
      if (distExit < ANCHOR_MIN_DIST_EXIT) continue;
      candidates.push({ r, c });
    }
  }

  // Shuffle candidates (Fisher-Yates).
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  // Pick anchors one at a time, enforcing spacing and merge checks.
  const placed = [];

  for (const cand of candidates) {
    if (placed.length >= target) break;

    // Enforce minimum distance from already-placed anchors.
    const tooClose = placed.some(a =>
      Math.max(Math.abs(cand.r - a.r), Math.abs(cand.c - a.c)) < ANCHOR_MIN_DIST_BETWEEN
    );
    if (tooClose) continue;

    // Snapshot revealed state before cascading this anchor.
    const snapshot = state.revealed.map(row => [...row]);

    revealCell(cand.r, cand.c);

    // Collect which cells were newly revealed.
    const newCells = [];
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        if (state.revealed[r][c] && !snapshot[r][c]) {
          newCells.push({ r, c });
        }
      }
    }

    // Merge check: if any newly-revealed cell is adjacent (Chebyshev 1)
    // to a cell that was already revealed before this anchor, the cascade
    // merged with an existing region. Roll it back.
    let merged = false;
    for (const nc of newCells) {
      for (let dr = -1; dr <= 1 && !merged; dr++) {
        for (let dc = -1; dc <= 1 && !merged; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = nc.r + dr;
          const nc2 = nc.c + dc;
          if (nr < 0 || nr >= state.rows || nc2 < 0 || nc2 >= state.cols) continue;
          if (snapshot[nr][nc2]) {
            merged = true;
          }
        }
      }
      if (merged) break;
    }

    if (merged) {
      // Un-reveal all cells this anchor opened.
      for (const nc of newCells) {
        state.revealed[nc.r][nc.c] = false;
      }
      continue;
    }

    placed.push(cand);
  }
}

function debugRevealAll() {
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      state.revealed[r][c] = true;
    }
  }
  renderGrid();
}

function isAdjacentToPlayer(r, c) {
  const dr = Math.abs(r - state.playerRow);
  const dc = Math.abs(c - state.playerCol);
  if (dr === 0 && dc === 0) return false;
  return dr <= 1 && dc <= 1;
}

function collectAt(r, c) {
  const cell = state.grid[r][c];
  if (cell.type === 'gold' && cell.goldValue > 0) {
    playSfx('gold');
    spawnPickupFloat(r, c, `${cell.chest ? '🎁' : '💰'} +${cell.goldValue}`);
    state.gold += cell.goldValue;
    cell.goldValue = 0;
    cell.chest = false;
  }
  if (cell.item) {
    state.items[cell.item]++;
    spawnPickupFloat(r, c, `${PICKUP_EMOJI[cell.item] || ''} +1`);
    cell.item = null;
    playSfx('pickup');
  }
}

// Walk from (startR, startC) stepping (dR, dC) each iteration. Skips the
// starting cell (callback fires on each subsequent cell). Stops at the
// first wall or grid boundary. The callback receives (r, c) — return true
// to continue, false to halt (e.g., to stop after a specific event).
function walkRay(startR, startC, dR, dC, callback) {
  let r = startR + dR;
  let c = startC + dC;
  while (r >= 0 && r < state.rows && c >= 0 && c < state.cols) {
    if (state.grid[r][c].type === 'wall') return;
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
  state.grid[r][c].type = 'detonated';
  state.grid[r][c].goldValue = 0;
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
    state.playerRow = path[i].r;
    state.playerCol = path[i].c;
    playSfx('step');
    updatePlayerSprite();
    autoRecenterOnPlayer();
    renderMinimap();
    await sleep(STEP_MS);
    collectAt(path[i].r, path[i].c);
    updateHud();

    if (path[i].r === state.exit.r && path[i].c === state.exit.c) {
      playSfx('win');
      state.gameOver = true;
      renderGrid();
      addToLifetimeGold(state.gold);
      showEscapedOverlay();
      return false;
    }
  }
  renderGrid();
  // Open shop if we landed on the merchant.
  if (state.merchant &&
      state.playerRow === state.merchant.r &&
      state.playerCol === state.merchant.c) {
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
      if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
      if (!state.revealed[nr][nc]) continue;
      const t = state.grid[nr][nc].type;
      if (t === 'wall' || t === 'gas') continue;
      const path = findPath(state.playerRow, state.playerCol, nr, nc);
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
  if (!state.activeItem) return false;
  const item = state.activeItem;
  const cell = state.grid[r][c];

  if (item === 'pickaxe') {
    // Valid target: any wall cell.
    if (cell.type !== 'wall') {
      state.activeItem = null;
      updateItemBar();
      renderGrid();
      return true;
    }
    state.items.pickaxe--;
    state.activeItem = null;

    // Convert wall to revealed floor. Walls never participated in adjacency
    // counts, so neighbor numbers are already correct — only the new cell
    // needs its adjacency computed.
    cell.type = 'empty';
    cell.goldValue = 0;
    cell.item = null; // defensive: walls shouldn't have items but be safe
    cell.adjacent = countAdjacentGas(r, c);
    state.revealed[r][c] = true;

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
  if (state.gameOver) return;
  if (state.busy) return;

  // Re-open shop if player clicks their own cell and it's the merchant.
  if (r === state.playerRow && c === state.playerCol &&
      state.merchant && r === state.merchant.r && c === state.merchant.c) {
    showShopOverlay(true);
    return;
  }

  if (state.activeItem) {
    await handleItemClick(r, c);
    return;
  }

  if (state.grid[r][c].type === 'wall') return;

  state.busy = true;
  try {
    // Clicked a revealed cell: just walk to it.
    if (state.revealed[r][c]) {
      const path = findPath(state.playerRow, state.playerCol, r, c);
      if (!path || path.length < 2) return;
      await animateWalk(path);
      return;
    }

    // Clicked an unrevealed cell.
    if (state.flagged[r][c]) return;

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

    const cell = state.grid[r][c];
    if (cell.type === 'gas') {
      playSfx('boom');
      state.hp--;
      detonateGas(r, c);
      state.revealed[r][c] = true;
      state.playerRow = r;
      state.playerCol = c;
      updatePlayerSprite();
      flashHurtFace();
      updateHud();
      renderGrid();
      autoRecenterOnPlayer();

      if (state.hp <= 0) {
        state.gameOver = true;
        showDeathOverlay();
        return;
      }
    } else {
      playSfx('dig');
      revealCell(r, c);
      state.playerRow = r;
      state.playerCol = c;
      updatePlayerSprite();
      collectAt(r, c);
      updateHud();
      renderGrid();
      autoRecenterOnPlayer();

      if (r === state.exit.r && c === state.exit.c) {
        playSfx('win');
        state.gameOver = true;
        addToLifetimeGold(state.gold);
        showEscapedOverlay();
        return;
      }
    }
  } finally {
    state.busy = false;
  }
}

function ensureSafeStart(r, c) {
  // Clear gas and walls from the start cell and its 8 neighbors
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
      const cell = state.grid[nr][nc];
      if (cell.type === 'gas') {
        cell.type = 'empty';
        cell.goldValue = 0;
        // Relocate gas to a distant cell
        let relocated = false;
        let attempts = 0;
        while (!relocated && attempts < 500) {
          attempts++;
          const rr = Math.floor(Math.random() * state.rows);
          const rc = Math.floor(Math.random() * state.cols);
          const dist = Math.abs(rr - r) + Math.abs(rc - c);
          if (state.grid[rr][rc].type === 'empty' && dist > 3) {
            state.grid[rr][rc].type = 'gas';
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
  for (let row = 0; row < state.rows; row++) {
    for (let col = 0; col < state.cols; col++) {
      const c2 = state.grid[row][col];
      if (c2.type !== 'gas' && c2.type !== 'wall') {
        c2.adjacent = countAdjacentGas(row, col);
      }
    }
  }
}

function revealCell(r, c) {
  if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return;
  if (state.revealed[r][c]) return;
  if (state.grid[r][c].type === 'gas') return;
  if (state.grid[r][c].type === 'wall') return;

  state.revealed[r][c] = true;
  const cell = state.grid[r][c];

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
  if (state.gameOver) return;
  if (state.grid[r][c].type === 'wall') return;  // NEW
  if (state.revealed[r][c]) return;
  state.flagged[r][c] = !state.flagged[r][c];
  playSfx(state.flagged[r][c] ? 'mark' : 'unmark');
  renderGrid();
}





// ============================================================
// INIT
// ============================================================

function initLevel() {
  // Roll ruleset if not already set (retries/resumes preserve it).
  if (!state.rulesetId) {
    state.rulesetId = (state.level >= 13 && RULESETS.length > 1)
      ? weightedPick(RULESETS).id
      : 'regular';
  }
  // Clear biome overrides from any previous level before prepare sets them again.
  state.biomeOverrides = null;
  const ruleset = resolveRuleset(state.rulesetId);
  ruleset.prepare?.(state);

  state.gameOver = false;
  state.busy = false;
  state.activeItem = null;
  state.merchant = null;
  state.rows = gridSizeForLevel(state.level);
  state.cols = state.rows;

  // Decide whether a merchant spawns this level.
  const spawnMerchant = state.biomeOverrides?.suppressMerchant
    ? false
    : (state.levelsSinceMerchant >= 2 || Math.random() < 0.50);

  const maxAttempts = 50;
  let solved = false;

  for (let attempt = 0; attempt < maxAttempts && !solved; attempt++) {
    state.revealed = Array.from({ length: state.rows }, () => Array(state.cols).fill(false));
    state.flagged = Array.from({ length: state.rows }, () => Array(state.cols).fill(false));
    const gasDensity = state.biomeOverrides?.gasDensity ?? 0.20;
    const gasCount = Math.floor(state.rows * state.cols * gasDensity);
    generateGrid(gasCount);

    const start = pickPlayerStart();
    if (!start) continue;
    state.playerRow = start.r;
    state.playerCol = start.c;
    ensureSafeStart(state.playerRow, state.playerCol);
    // Spawn cell auto-reveals; don't grant a free item there.
    state.grid[state.playerRow][state.playerCol].item = null;

    const exit = pickExit(state.playerRow, state.playerCol);
    if (!exit) continue;
    state.exit = exit;

    // Exit cell itself must not be gas
    if (state.grid[exit.r][exit.c].type === 'gas') {
      state.grid[exit.r][exit.c].type = 'empty';
      // recompute adjacency for neighbors (a gas was removed)
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = exit.r + dr;
          const nc = exit.c + dc;
          if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
          const c2 = state.grid[nr][nc];
          if (c2.type !== 'gas' && c2.type !== 'wall') {
            c2.adjacent = countAdjacentGas(nr, nc);
          }
        }
      }
    }
    // Exit cell stays mechanically clean — no item drop there either.
    state.grid[exit.r][exit.c].item = null;

    // Exit cell should not carry gold — keeps the exit cell mechanically clean
    if (state.grid[exit.r][exit.c].type === 'gold') {
      state.grid[exit.r][exit.c].type = 'empty';
      state.grid[exit.r][exit.c].goldValue = 0;
    }

    // Merchant placement (if this level spawns one).
    let merchantPos = null;
    if (spawnMerchant) {
      merchantPos = pickMerchantCorner();
      if (!merchantPos) continue;
      if (merchantPos.r === state.playerRow && merchantPos.c === state.playerCol) continue;
      if (merchantPos.r === exit.r && merchantPos.c === exit.c) continue;
      cleanMerchantCell(merchantPos.r, merchantPos.c);
    }

    const exitReachable = isReachable(state.playerRow, state.playerCol, exit.r, exit.c);
    const merchantReachable = !merchantPos || isReachable(state.playerRow, state.playerCol, merchantPos.r, merchantPos.c);
    if (exitReachable && merchantReachable) {
      if (merchantPos) {
        state.merchant = { r: merchantPos.r, c: merchantPos.c, stock: rollMerchantStock(), rerollCount: 0 };
      }
      solved = true;
    }
  }

  if (!solved) {
    console.warn('initLevel: 50 attempts failed, carving a guaranteed path from player to exit');
    carvePath(state.playerRow, state.playerCol, state.exit.r, state.exit.c);
    if (spawnMerchant) {
      // Place merchant at its corner anchor (may have been unreachable) and carve a path to it.
      const merchantPos = pickMerchantCorner();
      if (merchantPos) {
        cleanMerchantCell(merchantPos.r, merchantPos.c);
        carvePath(state.playerRow, state.playerCol, merchantPos.r, merchantPos.c);
        state.merchant = { r: merchantPos.r, c: merchantPos.c, stock: rollMerchantStock(), rerollCount: 0 };
      }
    }
  }

  // Pre-reveal exit, start, and merchant cells; start cell cascades for anchor merge-check.
  state.revealed[state.exit.r][state.exit.c] = true;
  state.revealed[state.playerRow][state.playerCol] = true;
  if (state.merchant) {
    state.revealed[state.merchant.r][state.merchant.c] = true;
  }

  // Reveal the player's start 3×3 so new players see safe ground around them.
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      revealCell(state.playerRow + dr, state.playerCol + dc);
    }
  }

  placeAnchors();

  collectAt(state.playerRow, state.playerCol);

  updateHud();
  renderGrid();
  // Snap pan to center on player at level start (instant, not animated).
  const vp = getViewportSize();
  const cc = cellCenterPx(state.playerRow, state.playerCol);
  setPan(vp.w / 2 - cc.x, vp.h / 2 - cc.y);
  ruleset.apply?.(state);
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
    <button class="menu-btn-secondary" onclick="renderStartMenu()">Quit to Menu</button>
  `);
}

function renderRules(parent) {
  const back = parent === 'pause' ? 'renderPauseMenu()' : 'renderStartMenu()';
  showOverlay(`
    <h2>Rules</h2>
    <p>Reach the exit (🚪) to escape to the next level.</p>
    <p>Dig adjacent cells to reveal paths. Numbers count gas tiles in the 8 surrounding cells.</p>
    <p>You have 3 ❤️. Hitting gas damages you for 1 ❤️. Dying forfeits your current-level gold, but stash and items are safe.</p>
    <p>Gold (💰) is optional — step onto revealed gold to collect it.</p>
    <p><strong>Items</strong> — walk onto the tile, or buy from 🧙:</p>
    <ul class="rules-items">
      <li>🍺 <strong>Potion</strong> — restore 1 ❤️</li>
      <li>🔍 <strong>Scanner</strong> — reveal the 3×3 around you</li>
      <li>⛏️ <strong>Pickaxe</strong> — break one wall tile</li>
      <li>↔️ <strong>Row Scan</strong> — reveal along your row until walls stop it</li>
      <li>↕️ <strong>Column Scan</strong> — reveal along your column until walls stop it</li>
      <li>✖️ <strong>Cross Scan</strong> — reveal along all four diagonals until walls stop them</li>
    </ul>
    <p>A 🧙 merchant sometimes appears — spend gold for items at varying discounts.</p>
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
  const data = {
    level: state.level,
    stashGold: state.stashGold,
    items: { ...state.items },
    levelsSinceMerchant: state.levelsSinceMerchant,
    rulesetId: state.rulesetId,
    hp: state.hp,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
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
  state.level = 1;
  state.hp = MAX_HP;
  state.gold = 0;
  state.stashGold = 0;
  state.levelsSinceMerchant = 0;
  state.items = { potion: 1, scanner: 1, pickaxe: 1, row: 1, column: 1, cross: 1 };
  state.rulesetId = null;
  initLevel();
  updatePlayerSprite(true);
  hurtFlashToken++;
  playerSprite.textContent = '🙂';
  startBgm();
}

function resumeGame(save) {
  document.body.classList.add('in-run');
  state.level = save.level;
  state.gold = 0;
  state.stashGold = save.stashGold;
  state.levelsSinceMerchant = save.levelsSinceMerchant;
  state.items = { ...save.items };
  // Back-compat: saves from before line-reveal items lack these keys.
  state.items.row = state.items.row ?? 0;
  state.items.column = state.items.column ?? 0;
  state.items.cross = state.items.cross ?? 0;
  // Back-compat: saves from before the ruleset framework lack this key.
  // Leaving it null lets initLevel roll fresh (regular on level <13, uniform on >=13).
  state.rulesetId = save.rulesetId ?? null;
  // Back-compat: saves from before persistent HP lack this key; treat as full HP.
  state.hp = save.hp ?? MAX_HP;
  initLevel();
  updatePlayerSprite(true);
  hurtFlashToken++;
  playerSprite.textContent = '🙂';
  startBgm();
}

function nextLevel() {
  state.stashGold += state.gold;
  state.gold = 0;
  state.level++;
  if (state.biomeOverrides?.freezePityTick) {
    // Freeze pity timer: do not increment levelsSinceMerchant across this level.
  } else if (state.merchant) {
    state.levelsSinceMerchant = 0;
  } else {
    state.levelsSinceMerchant++;
  }
  state.rulesetId = null;
  saveRun();
  initLevel();
  updatePlayerSprite(true);
  hurtFlashToken++;
  playerSprite.textContent = '🙂';
}

function retryLevel() {
  state.gold = 0;
  state.hp = MAX_HP;
  initLevel();
  updatePlayerSprite(true);
  hurtFlashToken++;
  playerSprite.textContent = '🙂';
}

// ============================================================
// ITEM USAGE
// ============================================================

function onItemButtonClick(itemKey) {
  if (state.gameOver || state.busy) return;
  if (state.items[itemKey] <= 0) return;

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
  if (state.activeItem === itemKey) {
    state.activeItem = null;
  } else {
    state.activeItem = itemKey;
  }
  updateItemBar();
  renderGrid();
}

function useItemPotion() {
  if (state.hp >= MAX_HP) return;
  if (state.items.potion <= 0) return;
  state.items.potion--;
  state.hp = Math.min(MAX_HP, state.hp + 1);
  playSfx('drink');
  updateHud();
}

// True if the 3×3 around the player contains at least one unrevealed,
// non-wall cell — i.e., scanning would actually do something.
function scannerHasTarget() {
  const pr = state.playerRow;
  const pc = state.playerCol;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = pr + dr;
      const c = pc + dc;
      if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) continue;
      if (state.revealed[r][c]) continue;
      if (state.grid[r][c].type === 'wall') continue;
      return true;
    }
  }
  return false;
}

// True if the player's row contains at least one unrevealed, non-wall cell
// within wall-bounded range on either side.
function rowHasTarget() {
  const pr = state.playerRow;
  const pc = state.playerCol;
  let found = false;
  const check = (r, c) => {
    if (found) return false;
    if (!state.revealed[r][c]) {
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
  const pr = state.playerRow;
  const pc = state.playerCol;
  let found = false;
  const check = (r, c) => {
    if (found) return false;
    if (!state.revealed[r][c]) {
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
  const pr = state.playerRow;
  const pc = state.playerCol;
  let found = false;
  const check = (r, c) => {
    if (found) return false;
    if (!state.revealed[r][c]) {
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
  if (state.items.scanner <= 0) return;
  if (!scannerHasTarget()) return;
  state.items.scanner--;

  const pr = state.playerRow;
  const pc = state.playerCol;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = pr + dr;
      const c = pc + dc;
      if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) continue;
      if (state.revealed[r][c]) continue;
      const cell = state.grid[r][c];
      if (cell.type === 'wall') continue;
      if (cell.type === 'gas') {
        detonateGas(r, c);
        state.revealed[r][c] = true;
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
    if (state.revealed[r][c]) return true;
    const cell = state.grid[r][c];
    if (cell.type === 'gas') {
      detonateGas(r, c);
      state.revealed[r][c] = true;
    } else {
      revealCell(r, c);
    }
    return true;
  });
}

// Reveal the player's row — two rays (west, east), stop at walls, gas
// detonates harmlessly, empty cells may cascade via revealCell.
function useItemRow() {
  if (state.items.row <= 0) return;
  if (!rowHasTarget()) return;
  state.items.row--;
  const pr = state.playerRow;
  const pc = state.playerCol;
  revealAlongRay(pr, pc, 0, -1);
  revealAlongRay(pr, pc, 0, 1);
  playSfx('scan');
  updateHud();
  updateItemBar();
  renderGrid();
}

// Reveal the player's column — two rays (north, south), stop at walls.
function useItemColumn() {
  if (state.items.column <= 0) return;
  if (!columnHasTarget()) return;
  state.items.column--;
  const pr = state.playerRow;
  const pc = state.playerCol;
  revealAlongRay(pr, pc, -1, 0);
  revealAlongRay(pr, pc, 1, 0);
  playSfx('scan');
  updateHud();
  updateItemBar();
  renderGrid();
}

// Reveal the four diagonals from the player — four rays, stop at walls.
function useItemCross() {
  if (state.items.cross <= 0) return;
  if (!crossHasTarget()) return;
  state.items.cross--;
  const pr = state.playerRow;
  const pc = state.playerCol;
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
  if (e.key === 'Escape' && state.activeItem) {
    state.activeItem = null;
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

// Wire button clicks
for (const key of ['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross']) {
  itemButtons[key].addEventListener('click', () => onItemButtonClick(key));
}

// Register service worker so Android Chrome offers install.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

renderStartMenu();
