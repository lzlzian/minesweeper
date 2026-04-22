// Draft level state singleton for the editor. Separate from the game's
// state.js — the editor never mutates game state.

import { SCHEMA_VERSION } from './schema.js';

const state = {
  rows: 8,
  cols: 8,
  cells: [],        // cells[r][c] = { type } or { type:'gold', goldValue }
  playerStart: null,
  exit:        null,
  merchant:    null,
  fountain:    null,
  itemDrops:   [],  // [ { r, c, item } ]
  name:  '',
  notes: '',
  id:    '',
  brushKey: 'wall',
  loadedSlot: null, // remembers which slot was loaded (for Ctrl+S fast-save)
};

export function getEditorState() { return state; }
export function getBrushKey() { return state.brushKey; }
export function setBrushKey(k) { state.brushKey = k; }
export function getLoadedSlot() { return state.loadedSlot; }
export function setLoadedSlot(n) { state.loadedSlot = n; }

// Produces a plain object matching the JSON schema shape, suitable for
// passing to schema.levelToJson / validation.validateLevel.
export function toLevel() {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: state.id || 'draft',
    name: state.name,
    notes: state.notes,
    rows: state.rows,
    cols: state.cols,
    playerStart: state.playerStart,
    exit:        state.exit,
    merchant:    state.merchant,
    fountain:    state.fountain,
    cells:       state.cells.map(row => row.map(cell =>
      cell.type === 'gold' ? { type: 'gold', goldValue: cell.goldValue } : { type: cell.type }
    )),
    itemDrops:   state.itemDrops.map(d => ({ ...d })),
  };
}

// Replace the current draft with the given level object. Does NOT validate
// — caller is responsible (load paths all run jsonToLevel first).
export function loadLevel(level) {
  state.rows = level.rows;
  state.cols = level.cols;
  state.cells = level.cells.map(row => row.map(cell =>
    cell.type === 'gold' ? { type: 'gold', goldValue: cell.goldValue } : { type: cell.type }
  ));
  state.playerStart = level.playerStart ? { ...level.playerStart } : null;
  state.exit        = level.exit        ? { ...level.exit }        : null;
  state.merchant    = level.merchant    ? { ...level.merchant }    : null;
  state.fountain    = level.fountain    ? { ...level.fountain }    : null;
  state.itemDrops   = level.itemDrops.map(d => ({ ...d }));
  state.name  = level.name || '';
  state.notes = level.notes || '';
  state.id    = level.id || '';
}

// Initialize a blank draft at the given size, or 8x8 if size omitted.
// Leaves playerStart/exit unset — the author must place them.
export function resetDraft(rows = 8, cols = 8) {
  state.rows = rows;
  state.cols = cols;
  state.cells = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ type: 'empty' }))
  );
  state.playerStart = null;
  state.exit        = null;
  state.merchant    = null;
  state.fountain    = null;
  state.itemDrops   = [];
  state.name  = '';
  state.notes = '';
  state.id    = '';
  state.loadedSlot = null;
}
