// ============================================================
// SETTINGS
// ============================================================

import { setMusicOn as setAudioMusicOn, setSfxOn as setSfxOnAudio } from './audio.js';

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

// Persist + sync audio module on setting change.
export function setMusicOn(value) {
  settings.musicOn = value;
  saveSettings();
  setAudioMusicOn(value);
}

export function setSfxOn(value) {
  settings.sfxOn = value;
  saveSettings();
  setSfxOnAudio(value);
}
