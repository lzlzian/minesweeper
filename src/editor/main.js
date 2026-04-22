import { resetDraft, getEditorState, setBrushKey } from './editorState.js';
import {
  levelNameInput, rowsInput, colsInput, notesTextarea, paletteEl,
} from './editorDom.js';
import { renderAll } from './editorRender.js';

resetDraft(8, 8);
renderAll();

const state = getEditorState();

levelNameInput.addEventListener('input', () => {
  state.name = levelNameInput.value;
});

notesTextarea.addEventListener('input', () => {
  state.notes = notesTextarea.value;
});

function resizeDraft(rows, cols) {
  rows = Math.max(6, Math.min(20, rows));
  cols = Math.max(6, Math.min(20, cols));
  const newCells = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      if (r < state.rows && c < state.cols) return state.cells[r][c];
      return { type: 'empty' };
    })
  );
  state.cells = newCells;
  state.rows = rows;
  state.cols = cols;
  // Clear any placements / drops now outside bounds.
  if (state.playerStart && (state.playerStart.r >= rows || state.playerStart.c >= cols)) state.playerStart = null;
  if (state.exit        && (state.exit.r        >= rows || state.exit.c        >= cols)) state.exit = null;
  if (state.merchant    && (state.merchant.r    >= rows || state.merchant.c    >= cols)) state.merchant = null;
  if (state.fountain    && (state.fountain.r    >= rows || state.fountain.c    >= cols)) state.fountain = null;
  state.itemDrops = state.itemDrops.filter(d => d.r < rows && d.c < cols);
  renderAll();
}

rowsInput.addEventListener('change', () => {
  const n = parseInt(rowsInput.value, 10) || 8;
  resizeDraft(n, state.cols);
});

colsInput.addEventListener('change', () => {
  const n = parseInt(colsInput.value, 10) || 8;
  resizeDraft(state.rows, n);
});

// Palette clicks set the active brush.
paletteEl.addEventListener('click', (e) => {
  const el = e.target.closest('.palette-swatch');
  if (!el) return;
  setBrushKey(el.dataset.brushKey);
  renderAll();
});
