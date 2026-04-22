import { resetDraft, getEditorState, setBrushKey, loadLevel, toLevel, setLoadedSlot, getLoadedSlot } from './editorState.js';
import {
  levelNameInput, rowsInput, colsInput, notesTextarea, paletteEl,
  menuBtn, menuDropdown, modalEl, modalContentEl, importInput,
} from './editorDom.js';
import { renderAll } from './editorRender.js';
import { initEditorPointer } from './editorPointer.js';
import { SCHEMA_VERSION, jsonToLevel, levelToJson } from './schema.js';
import {
  saveDraft, loadDraft, listSlots, saveToSlot, loadFromSlot,
  isLocalStorageWorking,
} from './slotStore.js';

// Boot: load draft if present, else blank 8x8.
const saved = loadDraft();
if (saved) {
  const parsed = jsonToLevel(JSON.stringify(saved));
  if (parsed.ok) {
    loadLevel(parsed.level);
  } else {
    console.warn('Editor: saved draft is invalid, starting blank', parsed.errors);
    resetDraft(8, 8);
  }
} else {
  resetDraft(8, 8);
}

renderAll();
initEditorPointer();

const state = getEditorState();

// -- Two-way bindings --

levelNameInput.addEventListener('input', () => {
  state.name = levelNameInput.value;
  scheduleAutosave();
});

notesTextarea.addEventListener('input', () => {
  state.notes = notesTextarea.value;
  scheduleAutosave();
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
  if (state.playerStart && (state.playerStart.r >= rows || state.playerStart.c >= cols)) state.playerStart = null;
  if (state.exit        && (state.exit.r        >= rows || state.exit.c        >= cols)) state.exit = null;
  if (state.merchant    && (state.merchant.r    >= rows || state.merchant.c    >= cols)) state.merchant = null;
  if (state.fountain    && (state.fountain.r    >= rows || state.fountain.c    >= cols)) state.fountain = null;
  state.itemDrops = state.itemDrops.filter(d => d.r < rows && d.c < cols);
  renderAll();
  scheduleAutosave();
}

rowsInput.addEventListener('change', () => resizeDraft(parseInt(rowsInput.value, 10) || 8, state.cols));
colsInput.addEventListener('change', () => resizeDraft(state.rows, parseInt(colsInput.value, 10) || 8));

paletteEl.addEventListener('click', (e) => {
  const el = e.target.closest('.palette-swatch');
  if (!el) return;
  setBrushKey(el.dataset.brushKey);
  renderAll();
});

// -- Autosave --

let autosaveTimer = null;
export function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    saveDraft(toLevel());
  }, 500);
}

// Autosave after every paint stroke too. Easiest hookup: poll renders (called
// by pointer handlers after every stroke). Expose a global hook.
window._editorAutosave = scheduleAutosave;
// And wire it by patching renderAll — every paint calls renderAll().
// Simpler: autosave on pointerup directly.
window.addEventListener('pointerup', scheduleAutosave);

// -- Menu wiring --

menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  menuDropdown.classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
  if (!menuDropdown.contains(e.target) && e.target !== menuBtn) {
    menuDropdown.classList.add('hidden');
  }
});

menuDropdown.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-menu-act]');
  if (!btn) return;
  const act = btn.dataset.menuAct;
  menuDropdown.classList.add('hidden');
  if      (act === 'new')         onNew();
  else if (act === 'load-draft')  onLoadDraft();
  else if (act === 'load-slot')   onLoadSlot();
  else if (act === 'save-slot')   onSaveSlot();
  else if (act === 'import')      importInput.click();
  else if (act === 'export')      onExport();
});

importInput.addEventListener('change', onImportFile);

function onNew() {
  showConfirm('Discard current draft and start fresh?', () => {
    resetDraft(8, 8);
    renderAll();
    scheduleAutosave();
  });
}

function onLoadDraft() {
  const saved = loadDraft();
  if (!saved) { alert('No draft saved.'); return; }
  const parsed = jsonToLevel(JSON.stringify(saved));
  if (!parsed.ok) { alert('Draft invalid: ' + parsed.errors.join(', ')); return; }
  loadLevel(parsed.level);
  setLoadedSlot(null);
  renderAll();
}

function onLoadSlot() {
  const slots = listSlots();
  if (slots.length === 0) { alert('No saved slots.'); return; }
  const rows = slots.map(s => `<li><button data-load-slot="${s.slot}">Slot ${s.slot}: ${escapeHtml(s.name)}</button></li>`).join('');
  showModal(`<h3>Load Slot</h3><ul>${rows}</ul><button data-close>Cancel</button>`);
  modalContentEl.querySelectorAll('button[data-load-slot]').forEach(b => {
    b.addEventListener('click', () => {
      const n = parseInt(b.dataset.loadSlot, 10);
      const saved = loadFromSlot(n);
      if (!saved) { hideModal(); return; }
      const parsed = jsonToLevel(JSON.stringify(saved));
      if (!parsed.ok) { alert('Slot invalid: ' + parsed.errors.join(', ')); return; }
      loadLevel(parsed.level);
      setLoadedSlot(n);
      renderAll();
      hideModal();
    });
  });
  modalContentEl.querySelector('[data-close]').addEventListener('click', hideModal);
}

function onSaveSlot() {
  // Prompt for slot 1..10.
  const buttons = [];
  for (let n = 1; n <= 10; n++) buttons.push(`<button data-save-slot="${n}">${n}</button>`);
  showModal(`<h3>Save to Slot</h3><p>Pick a slot (1–10):</p><div>${buttons.join(' ')}</div><button data-close>Cancel</button>`);
  modalContentEl.querySelectorAll('button[data-save-slot]').forEach(b => {
    b.addEventListener('click', () => {
      const n = parseInt(b.dataset.saveSlot, 10);
      saveToSlot(n, toLevel());
      setLoadedSlot(n);
      hideModal();
      alert(`Saved to slot ${n}.`);
    });
  });
  modalContentEl.querySelector('[data-close]').addEventListener('click', hideModal);
}

function onExport() {
  const level = toLevel();
  level.id = level.id || promptForId();
  const json = levelToJson(level);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `${level.id || 'level'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function promptForId() {
  const v = prompt('Level id (filename slug, e.g. "level-01"):');
  return (v || 'level').replace(/[^a-z0-9-]/gi, '-');
}

function onImportFile(e) {
  const file = e.target.files[0];
  importInput.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const parsed = jsonToLevel(reader.result);
    if (!parsed.ok) { alert('Import failed:\n' + parsed.errors.join('\n')); return; }
    loadLevel(parsed.level);
    setLoadedSlot(null);
    renderAll();
  };
  reader.readAsText(file);
}

function showModal(html) {
  modalContentEl.innerHTML = html;
  modalEl.classList.remove('hidden');
}
function hideModal() {
  modalEl.classList.add('hidden');
}
function showConfirm(msg, onYes) {
  showModal(`<p>${escapeHtml(msg)}</p><button data-yes>Yes</button><button data-no>No</button>`);
  modalContentEl.querySelector('[data-yes]').addEventListener('click', () => { onYes(); hideModal(); });
  modalContentEl.querySelector('[data-no]').addEventListener('click', hideModal);
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

// localStorage banner on failure.
if (!isLocalStorageWorking()) {
  const banner = document.createElement('div');
  banner.style.cssText = 'background:#4a1e1e;color:#d86a6a;padding:8px;text-align:center;';
  banner.textContent = 'Drafts will not be saved — localStorage unavailable. Use Export to download.';
  document.body.insertBefore(banner, document.body.firstChild);
}
