import {
  getMerchant, setMerchant, getGold, getStashGold, spendGold,
  addItem,
} from '../state.js';
import { playSfx } from '../audio.js';
import { showShopOverlay } from '../ui/shop.js';
import { updateHud } from '../ui/render.js';
import { hideOverlay } from '../ui/overlay.js';

// ============================================================
// MERCHANT
// ============================================================

export const MERCHANT_PRICES = { potion: 100, pickaxe: 150, scanner: 200, row: 250, column: 250, cross: 300 };

// Discount distribution: weights sum to 100.
// Each slot's discount is rolled independently.
export const DISCOUNT_TIERS = [
  { key: 'free', weight: 1,  mult: 0 },
  { key: 'd90',  weight: 3,  mult: 0.10 },
  { key: 'd75',  weight: 15, mult: 0.25 },
  { key: 'd50',  weight: 15, mult: 0.50 },
  { key: 'd25',  weight: 20, mult: 0.75 },
  { key: 'full', weight: 46, mult: 1.00 },
];

export function rollDiscountTier() {
  const total = DISCOUNT_TIERS.reduce((s, t) => s + t.weight, 0); // 100
  let r = Math.random() * total;
  for (const tier of DISCOUNT_TIERS) {
    r -= tier.weight;
    if (r < 0) return tier;
  }
  return DISCOUNT_TIERS[DISCOUNT_TIERS.length - 1]; // fallback (shouldn't hit)
}

export function priceFromTier(basePrice, tier) {
  if (tier.key === 'free') return 0;
  if (tier.key === 'full') return basePrice;
  return Math.max(1, Math.round(basePrice * tier.mult));
}

export function rollMerchantStock() {
  const itemTypes = ['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross'];
  const stock = [];
  for (let i = 0; i < 10; i++) {
    const type = itemTypes[Math.floor(Math.random() * itemTypes.length)];
    const basePrice = MERCHANT_PRICES[type];
    const tier = rollDiscountTier();
    const price = priceFromTier(basePrice, tier);
    stock.push({ type, basePrice, discountKey: tier.key, price, sold: false });
  }
  return stock;
}

export function buyFromMerchant(idx) {
  const slotEl = document.querySelectorAll('#overlay-content .shop-slot')[idx];
  if (slotEl && slotEl._suppressNextClick) {
    slotEl._suppressNextClick = false;
    return;
  }
  if (!getMerchant()) return;
  const slot = getMerchant().stock[idx];
  if (!slot || slot.sold) return;
  const totalGold = getGold() + getStashGold();
  if (totalGold < slot.price) return;
  spendGold(slot.price);
  addItem(slot.type, 1);
  slot.sold = true;
  playSfx('payment');
  updateHud();
  showShopOverlay(); // re-render with updated state
}

export function rerollMerchant() {
  if (!getMerchant()) return;
  const cost = 100 * (getMerchant().rerollCount + 1);
  const totalGold = getGold() + getStashGold();
  if (totalGold < cost) return;
  spendGold(cost);
  getMerchant().rerollCount++;
  getMerchant().stock = rollMerchantStock();
  playSfx('payment');
  updateHud();
  showShopOverlay(); // re-render with new stock and new reroll cost
}

export function leaveShop() {
  hideOverlay();
}
