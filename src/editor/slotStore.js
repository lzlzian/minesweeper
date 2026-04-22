import { SCHEMA_VERSION } from './schema.js';

const DRAFT_KEY = 'miningCrawler.editor.draft';
const SLOTS_KEY = 'miningCrawler.editor.slots';
const SLOT_KEY = (n) => `miningCrawler.editor.slot.${n}`;
const PENDING_TEST_PLAY_KEY = 'miningCrawler.editor.pendingTestPlay';

// Returns true/false for localStorage availability — set once on first call.
let lsWorks = null;
export function isLocalStorageWorking() {
  if (lsWorks !== null) return lsWorks;
  try {
    localStorage.setItem('miningCrawler.editor._probe', '1');
    localStorage.removeItem('miningCrawler.editor._probe');
    lsWorks = true;
  } catch {
    lsWorks = false;
  }
  return lsWorks;
}

export function saveDraft(level) {
  if (!isLocalStorageWorking()) return false;
  localStorage.setItem(DRAFT_KEY, JSON.stringify(level));
  return true;
}

export function loadDraft() {
  if (!isLocalStorageWorking()) return null;
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function listSlots() {
  if (!isLocalStorageWorking()) return [];
  const raw = localStorage.getItem(SLOTS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function saveToSlot(slotN, level) {
  if (!isLocalStorageWorking()) return false;
  localStorage.setItem(SLOT_KEY(slotN), JSON.stringify(level));
  const slots = listSlots().filter(s => s.slot !== slotN);
  slots.push({
    slot: slotN,
    id: level.id || `slot-${slotN}`,
    name: level.name || `Slot ${slotN}`,
    updatedAt: Date.now(),
  });
  localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
  return true;
}

export function loadFromSlot(slotN) {
  if (!isLocalStorageWorking()) return null;
  const raw = localStorage.getItem(SLOT_KEY(slotN));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function deleteSlot(slotN) {
  if (!isLocalStorageWorking()) return false;
  localStorage.removeItem(SLOT_KEY(slotN));
  const slots = listSlots().filter(s => s.slot !== slotN);
  localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
  return true;
}

export function writePendingTestPlay(level) {
  if (!isLocalStorageWorking()) return false;
  localStorage.setItem(PENDING_TEST_PLAY_KEY, JSON.stringify(level));
  return true;
}

export function readAndClearPendingTestPlay() {
  if (!isLocalStorageWorking()) return null;
  const raw = localStorage.getItem(PENDING_TEST_PLAY_KEY);
  localStorage.removeItem(PENDING_TEST_PLAY_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export { SCHEMA_VERSION };
