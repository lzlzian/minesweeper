// ============================================================
// SHOP OVERLAY
// ============================================================

import { overlayContent } from './dom.js';
import { showOverlay } from './overlay.js';
import { attachTooltip, hideTooltip } from './tooltip.js';
import {
  getMerchant, getGold, getStashGold, setActiveItem,
} from '../state.js';
import { playSfx } from '../audio.js';
import { updateItemBar } from './render.js';

let hooks = {
  onBuy: () => {},
  onReroll: () => {},
  onLeave: () => {},
  getTooltipData: () => null,
};

export function initShop(injected) {
  hooks = { ...hooks, ...injected };
}

const ITEM_EMOJI = {
  potion: '🍺', pickaxe: '⛏️', scanner: '🔍',
  row: '↔️', column: '↕️', cross: '✖️',
};
const ITEM_NAME = {
  potion: 'Potion', pickaxe: 'Pickaxe', scanner: 'Scanner',
  row: 'Row Scan', column: 'Column Scan', cross: 'Cross Scan',
};

export function showShopOverlay(playWelcome = false) {
  if (!getMerchant()) return;
  hideTooltip();
  // Clear any active item targeting before opening the shop.
  setActiveItem(null);
  updateItemBar();
  if (playWelcome) playSfx('welcome');

  const totalGold = getGold() + getStashGold();

  const slotsHtml = getMerchant().stock.map((slot, idx) => {
    const canAfford = totalGold >= slot.price;
    const disabled = slot.sold || !canAfford;
    const label = slot.sold ? 'Sold' : 'Buy';

    let badgeHtml = '';
    if (slot.discountKey !== 'full') {
      const badgeText = slot.discountKey === 'free' ? 'FREE'
                      : slot.discountKey === 'd90' ? '-90%'
                      : slot.discountKey === 'd75' ? '-75%'
                      : slot.discountKey === 'd50' ? '-50%'
                      : '-25%';
      badgeHtml = `<div class="shop-badge shop-badge-${slot.discountKey}">${badgeText}</div>`;
    }

    let priceHtml;
    if (slot.price === 0) {
      priceHtml = `<div class="shop-slot-price shop-slot-price-free">FREE</div>`;
    } else if (slot.discountKey !== 'full') {
      priceHtml = `<div class="shop-slot-price"><s>${slot.basePrice}g</s> ${slot.price}g</div>`;
    } else {
      priceHtml = `<div class="shop-slot-price">${slot.price}g</div>`;
    }

    return `
      <div class="shop-slot ${slot.sold ? 'sold' : ''}">
        ${badgeHtml}
        <div class="shop-slot-icon">${ITEM_EMOJI[slot.type]}</div>
        <div class="shop-slot-name">${ITEM_NAME[slot.type]}</div>
        ${priceHtml}
        <button data-act="buy" data-idx="${idx}" ${disabled ? 'disabled' : ''}>${label}</button>
      </div>
    `;
  }).join('');

  const rerollCost = 10 * (getMerchant().rerollCount + 1);
  const canAffordReroll = totalGold >= rerollCost;

  showOverlay(`
    <h2>🧙 Merchant</h2>
    <p>💰 Gold: ${getGold()} · Stash: ${getStashGold()}</p>
    <div class="shop-slots">${slotsHtml}</div>
    <div class="shop-actions">
      <button data-act="reroll" ${canAffordReroll ? '' : 'disabled'}>🎲 Reroll (${rerollCost}g)</button>
      <button data-act="leave">Leave</button>
    </div>
  `);

  // Wire buy buttons
  overlayContent.querySelectorAll('[data-act="buy"]').forEach(btn => {
    const idx = parseInt(btn.dataset.idx, 10);
    btn.addEventListener('click', () => hooks.onBuy(idx));
  });
  overlayContent.querySelector('[data-act="reroll"]')
    ?.addEventListener('click', () => hooks.onReroll());
  overlayContent.querySelector('[data-act="leave"]')
    ?.addEventListener('click', () => hooks.onLeave());

  // Wire tooltips onto each shop slot (slots re-render per buy/reroll).
  const slotEls = overlayContent.querySelectorAll('.shop-slot');
  getMerchant().stock.forEach((slot, idx) => {
    const el = slotEls[idx];
    if (!el) return;
    attachTooltip(el, hooks.getTooltipData(slot.type));
  });
}
