import { resumeAudioCtx, setMusicOn as setAudioMusicOn, setSfxOn as setSfxOnAudio } from './audio.js';
import { settings } from './settings.js';
import { contractDisplay, pauseBtn } from './ui/dom.js';
import { renderStartMenu, renderPauseMenu, showOpenContractsOverlay } from './ui/overlay.js';
import { initShop } from './ui/shop.js';
import { initPointer } from './ui/pointer.js';
import { devTeleportToLevel, saveRun } from './gameplay/level.js';
import { buyFromMerchant, rerollMerchant, leaveShop, merchantEffectiveRerollCost } from './gameplay/merchant.js';
import { ITEM_TOOLTIPS, setItemAutosave } from './gameplay/items.js';
import { handleClick, handleRightClick, setInteractionAutosave } from './gameplay/interaction.js';

// Cell shape (see state.js for authoritative reference):
// { type: 'empty' | 'gas' | 'gold' | 'wall' | 'detonated' | 'fountain',
//   adjacent: number, goldValue: number, item: null | itemKey }

// Sync audio module with persisted settings on startup.
setAudioMusicOn(settings.musicOn);
setSfxOnAudio(settings.sfxOn);

// Unlock Web Audio on first user gesture (iOS requirement).
document.addEventListener('touchstart', resumeAudioCtx, { once: true });
document.addEventListener('click', resumeAudioCtx, { once: true });

// Wire shop: ui/shop is agnostic to which gameplay module owns the actions
// and tooltip data. main.js is the one place those layers meet.
initShop({
  onBuy: (idx) => {
    if (buyFromMerchant(idx)) saveRun();
  },
  onReroll: () => {
    if (rerollMerchant()) saveRun();
  },
  onLeave: leaveShop,
  getTooltipData: (itemKey) => ITEM_TOOLTIPS[itemKey],
  getRerollCost: merchantEffectiveRerollCost,
});

setInteractionAutosave(saveRun);
setItemAutosave(saveRun);

// Wire pointer arbiter to the interaction module.
initPointer({
  onCellTap: handleClick,
  onCellLongPress: handleRightClick,
});

pauseBtn.addEventListener('click', renderPauseMenu);
contractDisplay?.addEventListener('click', () => showOpenContractsOverlay());

function cheatLevelParam() {
  try {
    const raw = new URLSearchParams(location.search).get('cheatLevel');
    if (!raw) return null;
    const level = Math.floor(Number(raw));
    return Number.isFinite(level) && level >= 1 ? level : null;
  } catch {
    return null;
  }
}

function shouldExposeDevCheats() {
  try {
    const params = new URLSearchParams(location.search);
    return params.has('cheats') ||
      params.has('cheatLevel') ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1' ||
      location.hostname === '';
  } catch {
    return false;
  }
}

if (shouldExposeDevCheats()) {
  window.mineCheats = {
    level: (level, options = {}) => devTeleportToLevel(level, options),
    freshLevel: (level) => devTeleportToLevel(level, { freshRun: true }),
  };
}

window.addEventListener('beforeunload', () => {
  if (document.body.classList.contains('in-run')) saveRun();
});

// Register service worker so Android Chrome offers install.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

(async () => {
  const authoredMatch = location.hash.match(/^#play-authored=(.+)$/);
  const cheatLevel = cheatLevelParam();
  if (authoredMatch) {
    const { loadAuthoredAndStart } = await import('./gameplay/authored.js');
    await loadAuthoredAndStart(decodeURIComponent(authoredMatch[1]));
  } else if (cheatLevel != null) {
    await devTeleportToLevel(cheatLevel, { freshRun: true });
  } else {
    renderStartMenu();
  }
})();
