import { toLevel } from './editorState.js';
import { validateLevel } from './validation.js';
import { writePendingTestPlay } from './slotStore.js';

export function testPlayCurrentDraft() {
  const level = toLevel();
  const res = validateLevel(level);
  if (!res.ok) {
    alert('Cannot test play:\n' + res.errors.join('\n'));
    return;
  }
  writePendingTestPlay(level);
  window.location.href = 'index.html#play-authored=draft';
}
