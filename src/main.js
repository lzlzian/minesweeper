import { resumeAudioCtx, setMusicOn as setAudioMusicOn, setSfxOn as setSfxOnAudio } from './audio.js';
import { settings } from './settings.js';
import { pauseBtn } from './ui/dom.js';
import { renderStartMenu, renderPauseMenu } from './ui/overlay.js';
import { initShop } from './ui/shop.js';
import { initPointer } from './ui/pointer.js';
import { buyFromMerchant, rerollMerchant, leaveShop } from './gameplay/merchant.js';
import { ITEM_TOOLTIPS } from './gameplay/items.js';
import { handleClick, handleRightClick } from './gameplay/interaction.js';

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
  onBuy: buyFromMerchant,
  onReroll: rerollMerchant,
  onLeave: leaveShop,
  getTooltipData: (itemKey) => ITEM_TOOLTIPS[itemKey],
});

// Wire pointer arbiter to the interaction module.
initPointer({
  onCellTap: handleClick,
  onCellLongPress: handleRightClick,
});

pauseBtn.addEventListener('click', renderPauseMenu);

// Register service worker so Android Chrome offers install.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

(async () => {
  const authoredMatch = location.hash.match(/^#play-authored=(.+)$/);
  if (authoredMatch) {
    const { loadAuthoredAndStart } = await import('./gameplay/authored.js');
    await loadAuthoredAndStart(decodeURIComponent(authoredMatch[1]));
  } else {
    renderStartMenu();
  }
})();
