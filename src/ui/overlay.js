import { overlay, overlayContent } from './dom.js';
import { hideTooltip } from './tooltip.js';
import { settings, setMusicOn, setSfxOn } from '../settings.js';
import {
  startGame, resumeGame, nextLevel, retryLevel,
  saveRun, loadRun,
} from '../gameplay/level.js';

// ============================================================
// OVERLAY RENDERING
// ============================================================

// Note on cycles: overlay.js imports from gameplay/level.js, and level.js
// imports hideOverlay from this module. ES modules allow this because all
// cross-module identifiers are used inside function bodies — never at
// top-level module load — so neither side dereferences the other's binding
// before it's been assigned.

export function showOverlay(html) {
  overlayContent.innerHTML = html;
  overlay.classList.remove('hidden');
}

export function hideOverlay() {
  hideTooltip();
  overlay.classList.add('hidden');
}

export function showEscapedOverlay(level, gold, stashGold, nextSize) {
  showOverlay(`
    <h2>Escaped!</h2>
    <p>Level ${level} cleared · +💰 ${gold}</p>
    <p>Stash: 💰 ${stashGold + gold}</p>
    <p>Next: Level ${level + 1} (${nextSize}×${nextSize})</p>
    <button data-act="next-level">Descend</button>
  `);
  wireEscapedOverlay();
}

function wireEscapedOverlay() {
  overlayContent.querySelector('[data-act="next-level"]').addEventListener('click', () => nextLevel());
}

export function showDeathOverlay(level, gold, stashGold) {
  showOverlay(`
    <h2>You died.</h2>
    <p>Level ${level} · Forfeited 💰 ${gold}</p>
    <p>Stash: 💰 ${stashGold}</p>
    <button data-act="retry-level">Retry Level</button>
    <button data-act="new-run">New Run</button>
  `);
  wireDeathOverlay();
}

function wireDeathOverlay() {
  overlayContent.querySelector('[data-act="retry-level"]').addEventListener('click', () => retryLevel());
  overlayContent.querySelector('[data-act="new-run"]').addEventListener('click', () => startGame());
}

export function renderStartMenu() {
  document.body.classList.remove('in-run');
  const save = loadRun();
  const continueBtn = save
    ? `<button class="menu-btn-primary" data-act="continue">Continue (Level ${save.level} · 💰 ${save.stashGold})</button>`
    : '';
  const newRunClass = save ? 'menu-btn-secondary' : 'menu-btn-primary';
  const newRunAct = save ? 'confirm-new-run' : 'start-new-run';
  showOverlay(`
    <h2>Mining Crawler</h2>
    ${continueBtn}
    <button class="${newRunClass}" data-act="${newRunAct}">New Run</button>
    <button class="menu-btn-secondary" data-act="rules">Rules</button>
    <button class="menu-btn-secondary" data-act="settings">Settings</button>
  `);
  wireStartMenu(save);
}

function wireStartMenu(save) {
  const q = (act) => overlayContent.querySelector(`[data-act="${act}"]`);
  q('continue')?.addEventListener('click', () => resumeGame(loadRun()));
  q('start-new-run')?.addEventListener('click', () => startGame());
  q('confirm-new-run')?.addEventListener('click', () => renderNewRunConfirm());
  q('rules')?.addEventListener('click', () => renderRules('start'));
  q('settings')?.addEventListener('click', () => renderSettings('start'));
}

export function renderNewRunConfirm() {
  showOverlay(`
    <h2>New Run?</h2>
    <p>Starting a new run will erase your saved progress.</p>
    <button class="menu-btn-primary" data-act="start-new-run">Start New Run</button>
    <button class="menu-btn-secondary" data-act="cancel">Cancel</button>
  `);
  wireNewRunConfirm();
}

function wireNewRunConfirm() {
  overlayContent.querySelector('[data-act="start-new-run"]').addEventListener('click', () => startGame());
  overlayContent.querySelector('[data-act="cancel"]').addEventListener('click', () => renderStartMenu());
}

export function renderPauseMenu() {
  showOverlay(`
    <h2>Paused</h2>
    <button class="menu-btn-primary" data-act="resume">Resume</button>
    <button class="menu-btn-secondary" data-act="rules">Rules</button>
    <button class="menu-btn-secondary" data-act="settings">Settings</button>
    <button class="menu-btn-secondary" data-act="quit">Quit to Menu</button>
  `);
  wirePauseMenu();
}

function wirePauseMenu() {
  const q = (act) => overlayContent.querySelector(`[data-act="${act}"]`);
  q('resume')?.addEventListener('click', () => hideOverlay());
  q('rules')?.addEventListener('click', () => renderRules('pause'));
  q('settings')?.addEventListener('click', () => renderSettings('pause'));
  q('quit')?.addEventListener('click', () => {
    saveRun();
    renderStartMenu();
  });
}

export function renderRules(parent) {
  showOverlay(`
    <h2>Rules</h2>
    <p>Reach the exit (🚪) to escape to the next level.</p>
    <p>Dig adjacent cells to reveal paths. Numbers count gas tiles in the 8 surrounding cells.</p>
    <p>You have 3 ❤️. Hitting gas damages you for 1 ❤️. HP carries between levels — dying forfeits your current-level gold, but stash and items are safe.</p>
    <p>Gold (💰) is optional — step onto revealed gold to collect it.</p>
    <p>A 🧙 merchant sometimes appears — spend gold for items at varying discounts.</p>
    <p>💧 A <strong>Health Fountain</strong> sometimes appears — step on it to heal to full. Single use.</p>
    <button class="menu-btn-primary" data-act="back">Back</button>
  `);
  wireRules(parent);
}

function wireRules(parent) {
  overlayContent.querySelector('[data-act="back"]').addEventListener('click', () => {
    if (parent === 'pause') {
      renderPauseMenu();
    } else {
      renderStartMenu();
    }
  });
}

export function renderSettings(parent) {
  const musicLabel = settings.musicOn ? 'On' : 'Off';
  const sfxLabel = settings.sfxOn ? 'On' : 'Off';
  showOverlay(`
    <h2>Settings</h2>
    <div class="toggle-row">
      <span>🎵 Music</span>
      <button class="toggle-btn ${settings.musicOn ? 'toggle-on' : 'toggle-off'}" data-act="toggle-music">${musicLabel}</button>
    </div>
    <div class="toggle-row">
      <span>🔊 Sound Effects</span>
      <button class="toggle-btn ${settings.sfxOn ? 'toggle-on' : 'toggle-off'}" data-act="toggle-sfx">${sfxLabel}</button>
    </div>
    <button class="menu-btn-primary" data-act="back">Back</button>
  `);
  wireSettings(parent);
}

function wireSettings(parent) {
  const q = (act) => overlayContent.querySelector(`[data-act="${act}"]`);
  q('toggle-music')?.addEventListener('click', () => {
    setMusicOn(!settings.musicOn);
    renderSettings(parent);
  });
  q('toggle-sfx')?.addEventListener('click', () => {
    setSfxOn(!settings.sfxOn);
    renderSettings(parent);
  });
  q('back')?.addEventListener('click', () => {
    if (parent === 'pause') {
      renderPauseMenu();
    } else {
      renderStartMenu();
    }
  });
}
