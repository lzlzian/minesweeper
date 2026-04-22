import { getEditorState, getBrushKey, pushUndo } from './editorState.js';
import { findBrush } from './palette.js';
import { gridEl } from './editorDom.js';
import { renderAll } from './editorRender.js';

// Brush application. Returns true if the cell changed, false if refused.
// On refusal, caller flashes the cell red.
export function applyBrush(r, c, brushKey) {
  const brush = findBrush(brushKey);
  if (!brush) return false;
  const state = getEditorState();
  const cell = state.cells[r][c];

  if (brush.kind === 'terrain') {
    // Block wall/gas on cells that hold a unique placement (player/exit/merchant/fountain).
    if (brush.cellType === 'wall' || brush.cellType === 'gas') {
      if (hasUniquePlacement(state, r, c)) return false;
    }
    // Block any non-empty terrain on a cell holding an item drop.
    if (brush.cellType !== 'empty' && hasDrop(state, r, c)) return false;

    // Fountain is both a cell type AND a unique placement.
    if (brush.cellType === 'fountain') {
      // Can't paint fountain over player/exit/merchant.
      if (isAt(state.playerStart, r, c)) return false;
      if (isAt(state.exit, r, c)) return false;
      if (isAt(state.merchant, r, c)) return false;
      // If there's an existing fountain, clear its old cell back to empty.
      if (state.fountain && !(state.fountain.r === r && state.fountain.c === c)) {
        state.cells[state.fountain.r][state.fountain.c] = { type: 'empty' };
      }
      state.fountain = { r, c };
    } else if (cell.type === 'fountain' && brush.cellType !== 'fountain') {
      // Overpainting the current fountain cell with a different terrain —
      // clear the top-level fountain reference.
      if (state.fountain && state.fountain.r === r && state.fountain.c === c) {
        state.fountain = null;
      }
    }

    if (brush.cellType === 'gold') {
      state.cells[r][c] = { type: 'gold', goldValue: brush.goldValue };
    } else {
      state.cells[r][c] = { type: brush.cellType };
    }
    return true;
  }

  if (brush.kind === 'placement') {
    const slot = brush.slot; // 'playerStart' | 'exit' | 'merchant'
    // Cell must be empty for placement (not wall/gas/gold/fountain).
    if (cell.type !== 'empty') return false;
    // Can't overlap another unique placement.
    for (const otherSlot of ['playerStart', 'exit', 'merchant', 'fountain']) {
      if (otherSlot === slot) continue;
      if (isAt(state[otherSlot], r, c)) return false;
    }
    // Can't overlap an item drop.
    if (hasDrop(state, r, c)) return false;
    // Move the marker.
    state[slot] = { r, c };
    return true;
  }

  if (brush.kind === 'drop') {
    // Drops only land on empty cells.
    if (cell.type !== 'empty') return false;
    // Can't overlap unique placements.
    if (hasUniquePlacement(state, r, c)) return false;
    // Replace any existing drop at this cell.
    state.itemDrops = state.itemDrops.filter(d => !(d.r === r && d.c === c));
    state.itemDrops.push({ r, c, item: brush.item });
    return true;
  }

  return false;
}

// Eraser: sets cell back to 'empty' and removes any drop/placement at this cell.
export function eraseAt(r, c) {
  const state = getEditorState();
  const prev = state.cells[r][c];
  state.cells[r][c] = { type: 'empty' };
  state.itemDrops = state.itemDrops.filter(d => !(d.r === r && d.c === c));
  for (const slot of ['playerStart', 'exit', 'merchant', 'fountain']) {
    if (isAt(state[slot], r, c)) state[slot] = null;
  }
  // If we erased the fountain cell, the slot was already cleared above.
  // If erased cell was not one of the above, prev may have been a fountain
  // (only fountain lives on both cell.type and state.fountain). Safety: if
  // prev.type was fountain and state.fountain still points here, null it.
  if (prev && prev.type === 'fountain' && state.fountain && state.fountain.r === r && state.fountain.c === c) {
    state.fountain = null;
  }
  return true;
}

function isAt(p, r, c) { return p && p.r === r && p.c === c; }
function hasUniquePlacement(state, r, c) {
  return isAt(state.playerStart, r, c) || isAt(state.exit, r, c)
      || isAt(state.merchant, r, c) || isAt(state.fountain, r, c);
}
function hasDrop(state, r, c) {
  return state.itemDrops.some(d => d.r === r && d.c === c);
}

// Pointer handling.
let painting = false;
let paintedThisStroke = new Set(); // "r,c" keys to avoid re-applying during drag

export function initEditorPointer() {
  gridEl.addEventListener('pointerdown', (e) => {
    const cellEl = e.target.closest('.editor-cell');
    if (!cellEl) return;
    const r = parseInt(cellEl.dataset.row, 10);
    const c = parseInt(cellEl.dataset.col, 10);

    pushUndo();  // snapshot before any mutation (paint or erase)

    if (e.button === 2) {
      // Right-click = erase.
      e.preventDefault();
      eraseAt(r, c);
      renderAll();
      return;
    }

    painting = true;
    paintedThisStroke.clear();
    applyAndFlash(r, c, cellEl);
  });

  gridEl.addEventListener('pointermove', (e) => {
    if (!painting) return;
    const cellEl = e.target.closest('.editor-cell');
    if (!cellEl) return;
    const r = parseInt(cellEl.dataset.row, 10);
    const c = parseInt(cellEl.dataset.col, 10);
    const key = `${r},${c}`;
    if (paintedThisStroke.has(key)) return;
    applyAndFlash(r, c, cellEl);
  });

  const endStroke = () => {
    painting = false;
    paintedThisStroke.clear();
  };
  window.addEventListener('pointerup', endStroke);
  window.addEventListener('pointercancel', endStroke);

  // Suppress context menu on grid so right-click erases cleanly.
  gridEl.addEventListener('contextmenu', (e) => e.preventDefault());
}

function applyAndFlash(r, c, cellEl) {
  const changed = applyBrush(r, c, getBrushKey());
  paintedThisStroke.add(`${r},${c}`);
  if (changed) {
    renderAll();
  } else {
    // Flash red on refusal.
    const el = document.querySelector(`.editor-cell[data-row="${r}"][data-col="${c}"]`) || cellEl;
    el.classList.remove('flash-bad');
    void el.offsetWidth; // retrigger animation
    el.classList.add('flash-bad');
  }
}
