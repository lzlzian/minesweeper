const SAVE_KEY = 'miningCrawler.runState';

export function saveRunPayload(payload) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
}

export function loadRunPayload() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function clearSavedRun() {
  localStorage.removeItem(SAVE_KEY);
}
