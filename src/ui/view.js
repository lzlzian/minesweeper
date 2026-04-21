import {
  CELL_SIZE, CELL_GAP, BOARD_PAD,
  getGrid, getRows, getCols, getRevealed, getExit, getMerchant, getFountain,
  getPlayerRow, getPlayerCol,
} from '../state.js';
import { board, viewportEl, minimapEl } from './dom.js';

// ============================================================
// VIEWPORT / PAN
// ============================================================

export const pan = {
  x: 0,
  y: 0,
  lastManualPanAt: 0, // timestamp ms; auto-recenter skips within 2000ms of this
};

export function getViewportSize() {
  return { w: viewportEl.clientWidth, h: viewportEl.clientHeight };
}

export function getBoardSize() {
  const gridW = getCols() * (CELL_SIZE + CELL_GAP) - CELL_GAP;
  const gridH = getRows() * (CELL_SIZE + CELL_GAP) - CELL_GAP;
  return { w: gridW + BOARD_PAD * 2, h: gridH + BOARD_PAD * 2 };
}

export function cellCenterPx(r, c) {
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

export function applyPan() {
  board.style.transform = `translate(${pan.x}px, ${pan.y}px)`;
}

export function setPan(x, y) {
  const clamped = clampPan(x, y);
  pan.x = clamped.x;
  pan.y = clamped.y;
  applyPan();
}

// Animate pan from current position to (targetX, targetY) over durationMs.
let panAnimId = 0;
export function animatePanTo(targetX, targetY, durationMs = 200) {
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
export function centerOnCell(r, c, durationMs = 200) {
  const { w: vw, h: vh } = getViewportSize();
  const cc = cellCenterPx(r, c);
  animatePanTo(vw / 2 - cc.x, vh / 2 - cc.y, durationMs);
}

export function isCellOutsideCenterRect(r, c) {
  const { w: vw, h: vh } = getViewportSize();
  const cc = cellCenterPx(r, c);
  const screenX = cc.x + pan.x;
  const screenY = cc.y + pan.y;
  return (
    screenX < vw * 0.2 || screenX > vw * 0.8 ||
    screenY < vh * 0.2 || screenY > vh * 0.8
  );
}

export function autoRecenterOnPlayer() {
  // Honor manual scouting: skip if user panned within the last 2s.
  if (performance.now() - pan.lastManualPanAt < 2000) return;
  if (isCellOutsideCenterRect(getPlayerRow(), getPlayerCol())) {
    centerOnCell(getPlayerRow(), getPlayerCol(), 200);
  }
}

export function renderMinimap() {
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
