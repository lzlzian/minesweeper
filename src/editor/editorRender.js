import { getEditorState, getBrushKey } from './editorState.js';
import { findBrush } from './palette.js';
import {
  gridEl, paletteEl, summaryEl, validationListEl, validationIndicator,
  notesTextarea, rowsInput, colsInput, levelNameInput,
} from './editorDom.js';
import { validateLevel } from './validation.js';
import { toLevel } from './editorState.js';

const PICKUP_EMOJI = {
  potion: '🍺', scanner: '🔍', pickaxe: '⛏️',
  row: '↔️', column: '↕️', cross: '✖️',
};

export function renderAll() {
  renderGrid();
  renderPalette();
  renderInspector();
}

export function renderGrid() {
  const state = getEditorState();
  gridEl.innerHTML = '';
  gridEl.style.gridTemplateColumns = `repeat(${state.cols}, 40px)`;
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const cell = state.cells[r][c];
      const el = document.createElement('div');
      el.className = 'editor-cell e-' + cell.type;
      el.dataset.row = r;
      el.dataset.col = c;

      // Terrain icon.
      let icon = '';
      if (cell.type === 'gas')      icon = '💀';
      else if (cell.type === 'gold') icon = cell.goldValue ? `💰${cell.goldValue}` : '💰';
      else if (cell.type === 'fountain') icon = '💧';
      else if (cell.type === 'wall') icon = '▓';

      // Item drops stack on top of the terrain icon — drops only live on empty
      // cells, so there's no collision. Placement icons override terrain.
      const drop = state.itemDrops.find(d => d.r === r && d.c === c);
      if (drop) icon = PICKUP_EMOJI[drop.item] || '?';

      // Unique placements override everything visually.
      if (isAt(state.playerStart, r, c)) icon = '🙂';
      else if (isAt(state.exit, r, c)) icon = '🚪';
      else if (isAt(state.merchant, r, c)) icon = '🧙';
      // fountain already shown via cell.type === 'fountain' above

      if (icon) {
        el.textContent = icon;
      } else if (cell.type === 'empty') {
        // Preview the in-game adjacency number on empty/untouched cells so the
        // author sees the same information the player will see. Wall, gas, and
        // gold cells never show a number in-game either.
        const n = countAdjacentGas(state, r, c);
        if (n > 0) {
          el.dataset.adjacent = n;
          const span = document.createElement('span');
          span.className = 'num';
          span.textContent = n;
          el.appendChild(span);
        }
      }
      gridEl.appendChild(el);
    }
  }
}

// 8-neighbor gas count, mirroring board/generation.js countAdjacentGas but
// operating on the editor's draft cells. Gas counts itself for any neighbor.
function countAdjacentGas(state, r, c) {
  let n = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
      if (state.cells[nr][nc].type === 'gas') n++;
    }
  }
  return n;
}

export function renderPalette() {
  paletteEl.innerHTML = '';
  const activeKey = getBrushKey();

  // Section headers help scan the palette.
  const sections = [
    { title: 'Terrain',   keys: ['empty', 'wall', 'gas', 'fountain'] },
    { title: 'Gold',      keys: ['gold1', 'gold5', 'gold10', 'gold25'] },
    { title: 'Placement', keys: ['playerStart', 'exit', 'merchant'] },
    { title: 'Drops',     keys: ['drop-potion', 'drop-scanner', 'drop-pickaxe', 'drop-row', 'drop-column', 'drop-cross'] },
  ];

  for (const section of sections) {
    const header = document.createElement('div');
    header.className = 'palette-section';
    header.textContent = section.title;
    paletteEl.appendChild(header);
    for (const key of section.keys) {
      const brush = findBrush(key);
      if (!brush) continue;
      const el = document.createElement('div');
      el.className = 'palette-swatch' + (key === activeKey ? ' active' : '');
      el.dataset.brushKey = key;
      el.textContent = brush.label;
      paletteEl.appendChild(el);
    }
  }
}

export function renderInspector() {
  const state = getEditorState();
  if (document.activeElement !== levelNameInput) levelNameInput.value = state.name;
  if (document.activeElement !== rowsInput)      rowsInput.value = state.rows;
  if (document.activeElement !== colsInput)      colsInput.value = state.cols;
  if (document.activeElement !== notesTextarea)  notesTextarea.value = state.notes;

  // Summary counters.
  let walls = 0, gas = 0, gold = 0;
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const t = state.cells[r][c].type;
      if (t === 'wall') walls++;
      else if (t === 'gas') gas++;
      else if (t === 'gold') gold++;
    }
  }
  summaryEl.textContent = `Walls: ${walls} · Gas: ${gas} · Gold: ${gold} · Drops: ${state.itemDrops.length}`;

  // Validation list.
  const res = validateLevel(toLevel());
  validationListEl.innerHTML = '';
  if (res.ok) {
    const li = document.createElement('li');
    li.className = 'ok';
    li.textContent = '✓ Level is playable';
    validationListEl.appendChild(li);
    validationIndicator.className = 'ok';
    validationIndicator.textContent = '✓ Playable';
  } else {
    for (const err of res.errors) {
      const li = document.createElement('li');
      li.className = 'fail';
      li.textContent = '✗ ' + err;
      validationListEl.appendChild(li);
    }
    validationIndicator.className = 'fail';
    validationIndicator.textContent = '✗ ' + res.errors[0];
  }
}

function isAt(pos, r, c) {
  return pos && pos.r === r && pos.c === c;
}
