import { overlay, overlayContent } from './dom.js';
import { hideTooltip } from './tooltip.js';
import { settings, setMusicOn, setSfxOn } from '../settings.js';
import { playSfx } from '../audio.js';
import {
  startGame, resumeGame, nextLevel, retryLevel,
  saveRun, loadRun,
} from '../gameplay/level.js';
import { getRulesetId } from '../state.js';

// String literal (not imported from authored.js) to avoid a static cycle:
// authored.js statically imports renderStartMenu/hideOverlay from this file.
// Keep authored.js's exported AUTHORED_RULESET_ID in sync with this constant.
const AUTHORED_RULESET_ID = 'authored';

function menuClick(handler) {
  return () => {
    playSfx('click');
    handler();
  };
}

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
  overlayContent.querySelector('[data-act="next-level"]').addEventListener('click', menuClick(() => nextLevel()));
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
  overlayContent.querySelector('[data-act="retry-level"]').addEventListener('click', menuClick(() => retryLevel()));
  overlayContent.querySelector('[data-act="new-run"]').addEventListener('click', menuClick(() => startGame()));
}

// Cleared/death overlays add a "Back to Editor" button when the level was
// launched via the editor's Test Play (hash is #play-authored=draft). The
// hash is stable across the run (retry doesn't change URL), so a simple
// string check is sufficient and avoids a static import cycle.
function cameFromEditor() {
  return location.hash === '#play-authored=draft';
}

export function showAuthoredClearedOverlay(gold) {
  const fromEditor = cameFromEditor();
  const editorBtn = fromEditor ? `<button data-act="back-to-editor">Back to Editor</button>` : '';
  showOverlay(`
    <h2>Level cleared!</h2>
    <p>Collected 💰 ${gold}</p>
    ${editorBtn}
    <button data-act="back-to-menu">Back to Menu</button>
  `);
  overlayContent.querySelector('[data-act="back-to-menu"]').addEventListener('click', menuClick(() => {
    window.location.href = 'index.html';
  }));
  overlayContent.querySelector('[data-act="back-to-editor"]')?.addEventListener('click', menuClick(() => {
    window.location.href = 'editor.html';
  }));
}

export function showAuthoredDeathOverlay(gold) {
  const fromEditor = cameFromEditor();
  const editorBtn = fromEditor ? `<button data-act="back-to-editor">Back to Editor</button>` : '';
  showOverlay(`
    <h2>You died.</h2>
    <p>Collected before dying: 💰 ${gold}</p>
    <button data-act="retry-authored">Retry Level</button>
    ${editorBtn}
    <button data-act="back-to-menu">Back to Menu</button>
  `);
  overlayContent.querySelector('[data-act="retry-authored"]').addEventListener('click', menuClick(async () => {
    const { getCurrentAuthoredData, startAuthoredLevel } = await import('../gameplay/authored.js');
    const data = getCurrentAuthoredData();
    if (data) startAuthoredLevel(data);
  }));
  overlayContent.querySelector('[data-act="back-to-menu"]').addEventListener('click', menuClick(() => {
    window.location.href = 'index.html';
  }));
  overlayContent.querySelector('[data-act="back-to-editor"]')?.addEventListener('click', menuClick(() => {
    window.location.href = 'editor.html';
  }));
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
    <button class="menu-btn-secondary" data-act="play-authored">Play Authored</button>
    <button class="menu-btn-secondary" data-act="rules">Rules</button>
    <button class="menu-btn-secondary" data-act="settings">Settings</button>
  `);
  wireStartMenu(save);
}

function wireStartMenu(save) {
  const q = (act) => overlayContent.querySelector(`[data-act="${act}"]`);
  q('continue')?.addEventListener('click', menuClick(() => resumeGame(loadRun())));
  q('start-new-run')?.addEventListener('click', menuClick(() => startGame()));
  q('confirm-new-run')?.addEventListener('click', menuClick(() => renderNewRunConfirm()));
  q('play-authored')?.addEventListener('click', menuClick(() => renderAuthoredList()));
  q('rules')?.addEventListener('click', menuClick(() => renderRules('start')));
  q('settings')?.addEventListener('click', menuClick(() => renderSettings('start')));
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
  overlayContent.querySelector('[data-act="start-new-run"]').addEventListener('click', menuClick(() => startGame()));
  overlayContent.querySelector('[data-act="cancel"]').addEventListener('click', menuClick(() => renderStartMenu()));
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
  q('resume')?.addEventListener('click', menuClick(() => hideOverlay()));
  q('rules')?.addEventListener('click', menuClick(() => renderRules('pause')));
  q('settings')?.addEventListener('click', menuClick(() => renderSettings('pause')));
  q('quit')?.addEventListener('click', menuClick(() => {
    // Never overwrite the procgen save with authored-level state.
    if (getRulesetId() !== AUTHORED_RULESET_ID) saveRun();
    renderStartMenu();
  }));
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
  overlayContent.querySelector('[data-act="back"]').addEventListener('click', menuClick(() => {
    if (parent === 'pause') {
      renderPauseMenu();
    } else {
      renderStartMenu();
    }
  }));
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
  q('toggle-music')?.addEventListener('click', menuClick(() => {
    setMusicOn(!settings.musicOn);
    renderSettings(parent);
  }));
  q('toggle-sfx')?.addEventListener('click', menuClick(() => {
    setSfxOn(!settings.sfxOn);
    renderSettings(parent);
  }));
  q('back')?.addEventListener('click', menuClick(() => {
    if (parent === 'pause') {
      renderPauseMenu();
    } else {
      renderStartMenu();
    }
  }));
}

export async function renderAuthoredList() {
  let committed = [];
  try {
    const res = await fetch('levels/index.json');
    if (res.ok) committed = await res.json();
  } catch { /* manifest missing — fine */ }

  const committedRows = committed.map(c =>
    `<button class="menu-btn-secondary" data-authored-id="${escapeAttr(c.id)}">${escapeHtml(c.name)}</button>`
  ).join('');

  let slotRows = '';
  try {
    const rawSlots = localStorage.getItem('miningCrawler.editor.slots');
    if (rawSlots) {
      const slots = JSON.parse(rawSlots);
      slotRows = slots.map(s =>
        `<button class="menu-btn-secondary" data-authored-slot="${Number(s.slot)}">Slot ${Number(s.slot)}: ${escapeHtml(s.name)}</button>`
      ).join('');
    }
  } catch { /* ignore */ }

  const body = [];
  if (committedRows) body.push(`<p><strong>Committed</strong></p>${committedRows}`);
  if (slotRows)      body.push(`<p><strong>Drafts</strong></p>${slotRows}`);
  if (!body.length)  body.push(`<p>No authored levels yet. Open the editor at <code>editor.html</code>.</p>`);

  showOverlay(`
    <h2>Play Authored</h2>
    ${body.join('')}
    <button class="menu-btn-primary" data-act="back">Back</button>
  `);
  overlayContent.querySelectorAll('[data-authored-id]').forEach(btn => {
    btn.addEventListener('click', menuClick(() => {
      window.location.href = `index.html#play-authored=${encodeURIComponent(btn.dataset.authoredId)}`;
    }));
  });
  overlayContent.querySelectorAll('[data-authored-slot]').forEach(btn => {
    btn.addEventListener('click', menuClick(() => {
      window.location.href = `index.html#play-authored=slot-${btn.dataset.authoredSlot}`;
    }));
  });
  overlayContent.querySelector('[data-act="back"]').addEventListener('click', menuClick(() => renderStartMenu()));
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
// escapeAttr assumes its output is used inside a double-quoted attribute.
// escapeHtml encodes ", &, <, > which is sufficient there. Single-quoted or
// unquoted attributes would need additional escaping.
function escapeAttr(s) { return escapeHtml(s); }
