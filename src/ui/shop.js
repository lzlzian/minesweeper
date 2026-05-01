// ============================================================
// SHOP OVERLAY
// ============================================================

import { overlayContent } from './dom.js';
import { showOverlay } from './overlay.js';
import { attachTooltip, hideTooltip } from './tooltip.js';
import {
  getMerchant, getGold, getStashGold, getHp, hasArtifact, setActiveItem,
} from '../state.js';
import { playSfx } from '../audio.js';
import { updateItemBar } from './render.js';
import { CLUTCH_COUPON_PERCENT, MERCHANT_DISCOUNT_PERCENT, merchantArtifactPrice } from '../gameplay/artifacts.js';

let hooks = {
  onBuy: () => {},
  onReroll: () => {},
  onLeave: () => {},
  getTooltipData: () => null,
  getRerollCost: (rerollCount) => 40 + 40 * rerollCount,
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
  const hasCoupon = hasArtifact('merchant_discount');
  const clutchCouponActive = hasArtifact('clutch_coupon') && getHp() <= 1;

  const slotsHtml = getMerchant().stock.map((slot, idx) => {
    const price = merchantArtifactPrice(slot.price);
    const artifactDiscounted = price < slot.price;
    const canAfford = totalGold >= price;
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
    } else if (slot.discountKey !== 'full' || artifactDiscounted) {
      priceHtml = `<div class="shop-slot-price"><s>${slot.basePrice}g</s> ${price}g</div>`;
    } else {
      priceHtml = `<div class="shop-slot-price">${price}g</div>`;
    }
    const discountChips = [];
    if (artifactDiscounted && hasCoupon) discountChips.push(`Coupon -${MERCHANT_DISCOUNT_PERCENT}%`);
    if (artifactDiscounted && clutchCouponActive) discountChips.push(`Clutch -${CLUTCH_COUPON_PERCENT}%`);
    const couponHtml = discountChips.map(chip => `<div class="shop-coupon-chip">${chip}</div>`).join('');

    return `
      <div class="shop-slot ${slot.sold ? 'sold' : ''}">
        ${badgeHtml}
        <div class="shop-slot-icon">${ITEM_EMOJI[slot.type]}</div>
        <div class="shop-slot-name">${ITEM_NAME[slot.type]}</div>
        ${priceHtml}
        ${couponHtml}
        <button data-act="buy" data-idx="${idx}" ${disabled ? 'disabled' : ''}>${label}</button>
      </div>
    `;
  }).join('');

  const rerollCost = hooks.getRerollCost(getMerchant().rerollCount);
  const canAffordReroll = totalGold >= rerollCost;
  const rerollLabel = rerollCost === 0 ? 'FREE' : `${rerollCost}g`;
  const freeRerollNote = hasArtifact('free_reroll') && getMerchant().rerollCount === 0
    ? '<p class="shop-coupon-note">🎲 House Dice: first reroll is free</p>'
    : '';

  showOverlay(`
    <h2>🧙 Merchant</h2>
    <p>💰 Gold: ${getGold()} · Stash: ${getStashGold()}</p>
    ${hasCoupon ? `<p class="shop-coupon-note">🏷️ Counterfeit Coupon: -${MERCHANT_DISCOUNT_PERCENT}% after slot discounts</p>` : ''}
    ${clutchCouponActive ? `<p class="shop-coupon-note">🧷 Clutch Coupon: -${CLUTCH_COUPON_PERCENT}% at 1 HP</p>` : ''}
    ${freeRerollNote}
    <div class="shop-slots">${slotsHtml}</div>
    <div class="shop-actions">
      <button data-act="reroll" ${canAffordReroll ? '' : 'disabled'}>🎲 Reroll (${rerollLabel})</button>
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
