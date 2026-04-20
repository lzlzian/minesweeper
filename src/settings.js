// ============================================================
// SETTINGS
// ============================================================

const SETTINGS_KEY = 'miningCrawler.settings';

function loadSettings() {
  try {
    return { musicOn: true, sfxOn: true, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch { return { musicOn: true, sfxOn: true }; }
}

export const settings = loadSettings();

export function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
