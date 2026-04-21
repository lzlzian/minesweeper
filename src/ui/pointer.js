import { viewportEl } from './dom.js';
import { pan, setPan } from './view.js';

// ============================================================
// POINTER ARBITER (tap / long-press / drag)
// ============================================================

const DRAG_THRESHOLD_PX = 8;
const LONG_PRESS_MS = 400;

let hooks = {
  onCellTap: () => {},
  onCellLongPress: () => {},
};

export function initPointer(injected) {
  hooks = { ...hooks, ...injected };
}

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
      hooks.onCellLongPress(activePointer.cellR, activePointer.cellC);
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
      hooks.onCellTap(activePointer.cellR, activePointer.cellC);
    }
  }
  // If state was 'drag', pan already happened in pointermove.
  // If longPressFired, onCellLongPress already ran.

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
    hooks.onCellLongPress(hit.r, hit.c);
  }
});
