// ============================================================
// ITEM TOOLTIPS
// ============================================================

import { tooltipEl } from './dom.js';

const TOOLTIP_HOVER_DELAY_MS = 300;
const TOOLTIP_LONG_PRESS_MS = 400;
const TOOLTIP_MOVE_THRESHOLD = 8;
const TOOLTIP_GAP = 8;

let tooltipShownFor = null; // element currently showing tooltip, or null

export function hideTooltip() {
  tooltipEl.classList.add('hidden');
  tooltipEl.classList.remove('tooltip-below');
  tooltipEl.style.setProperty('--tooltip-tail-x', '50%');
  tooltipShownFor = null;
}

function showTooltip(triggerEl, data) {
  if (!data) return;
  const howtoHtml = data.howto
    ? '<div class="tooltip-howto">' + escapeHtml(data.howto) + '</div>'
    : '';
  tooltipEl.innerHTML =
    '<div class="tooltip-name">' + escapeHtml(data.name) + '</div>' +
    '<div class="tooltip-desc">' + escapeHtml(data.desc) + '</div>' +
    howtoHtml;
  tooltipEl.classList.remove('hidden');
  tooltipEl.classList.remove('tooltip-below');
  positionTooltip(triggerEl);
  tooltipShownFor = triggerEl;
}

function positionTooltip(triggerEl) {
  const trigRect = triggerEl.getBoundingClientRect();
  const tipRect = tooltipEl.getBoundingClientRect();
  const vw = window.innerWidth;

  // Preferred: above trigger
  let top = trigRect.top - tipRect.height - TOOLTIP_GAP;
  let flipBelow = false;
  if (top < TOOLTIP_GAP) {
    top = trigRect.bottom + TOOLTIP_GAP;
    flipBelow = true;
  }

  // Horizontal center on trigger, clamped to viewport
  const trigCenterX = trigRect.left + trigRect.width / 2;
  const preferredLeft = trigCenterX - tipRect.width / 2;
  const clampedLeft = Math.max(
    TOOLTIP_GAP,
    Math.min(preferredLeft, vw - tipRect.width - TOOLTIP_GAP)
  );

  // Tail stays centered on the trigger, even if tooltip is clamped
  const tailX = trigCenterX - clampedLeft;
  tooltipEl.style.setProperty('--tooltip-tail-x', tailX + 'px');

  tooltipEl.style.left = clampedLeft + 'px';
  tooltipEl.style.top = top + 'px';

  if (flipBelow) {
    tooltipEl.classList.add('tooltip-below');
  }
}

// Wire hover (desktop) and long-press (mobile) tooltip triggers on an element.
// `data` is the resolved tooltip object: { name, desc, howto? }.
export function attachTooltip(el, data) {
  let startX = 0;
  let startY = 0;
  let pending = false;
  let timer = null;

  const clearTimer = () => {
    if (timer) { clearTimeout(timer); timer = null; }
  };

  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      showTooltip(el, data);
    }, TOOLTIP_HOVER_DELAY_MS);
  });

  el.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimer();
    if (tooltipShownFor === el) hideTooltip();
  });

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    startX = e.clientX;
    startY = e.clientY;
    pending = true;
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      if (!pending) return;
      el._suppressNextClick = true;
      showTooltip(el, data);
    }, TOOLTIP_LONG_PRESS_MS);
  });

  el.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') return;
    if (!pending) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (dx * dx + dy * dy > TOOLTIP_MOVE_THRESHOLD * TOOLTIP_MOVE_THRESHOLD) {
      pending = false;
      clearTimer();
    }
  });

  el.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') return;
    pending = false;
    clearTimer();
    if (tooltipShownFor === el) hideTooltip();
  });

  el.addEventListener('pointercancel', (e) => {
    if (e.pointerType === 'mouse') return;
    pending = false;
    clearTimer();
    if (tooltipShownFor === el) hideTooltip();
  });
}

window.addEventListener('scroll', hideTooltip, true);
window.addEventListener('resize', hideTooltip);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
