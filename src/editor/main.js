// Editor boot. Minimal for this task — full wiring comes in later tasks.
import { resetDraft, getEditorState } from './editorState.js';
import { levelNameInput, rowsInput, colsInput } from './editorDom.js';

resetDraft(8, 8);

// Wire top-bar inputs to state (trivial two-way binding; render is a no-op
// for now).
const state = getEditorState();
levelNameInput.value = state.name;
rowsInput.value = state.rows;
colsInput.value = state.cols;

levelNameInput.addEventListener('input', () => { state.name = levelNameInput.value; });
rowsInput.addEventListener('change', () => {
  const n = Math.max(6, Math.min(20, parseInt(rowsInput.value, 10) || 8));
  rowsInput.value = n;
});
colsInput.addEventListener('change', () => {
  const n = Math.max(6, Math.min(20, parseInt(colsInput.value, 10) || 8));
  colsInput.value = n;
});

console.log('Level editor boot: grid', state.rows, '×', state.cols);
