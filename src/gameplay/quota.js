// Run payment pressure. These are actual checkpoint payments, not cumulative
// targets. They are centralized so playtest tuning stays contained.
export const MAX_RUN_LEVEL = Infinity;
const FIRST_PAYMENT_LEVEL = 3;
const PAYMENT_INTERVAL = 3;
const LAST_FIXED_PAYMENT_LEVEL = 30;
const ENDLESS_PAYMENT_STEP = 180;
const PAYMENT_AMOUNTS = new Map([
  [3, 120],
  [6, 240],
  [9, 420],
  [12, 600],
  [15, 780],
  [18, 960],
  [21, 1140],
  [24, 1320],
  [27, 1500],
  [30, 1680],
]);

function paymentMultiplierFrom(economy = {}) {
  if (typeof economy === 'number') {
    return Number.isFinite(economy) ? Math.max(0, economy) : 1;
  }
  const multiplier = economy?.paymentMultiplier ?? 1;
  return Number.isFinite(multiplier) ? Math.max(0, multiplier) : 1;
}

function scaledPayment(amount, economy = {}) {
  if (amount <= 0) return 0;
  const multiplier = paymentMultiplierFrom(economy);
  return Math.round(amount * multiplier);
}

export function nextPaymentLevel(level) {
  if (level <= FIRST_PAYMENT_LEVEL) return FIRST_PAYMENT_LEVEL;
  return FIRST_PAYMENT_LEVEL + Math.ceil((level - FIRST_PAYMENT_LEVEL) / PAYMENT_INTERVAL) * PAYMENT_INTERVAL;
}

export function paymentAmountForLevel(level, economy = {}) {
  if (level !== nextPaymentLevel(level)) return 0;
  if (PAYMENT_AMOUNTS.has(level)) return scaledPayment(PAYMENT_AMOUNTS.get(level), economy);
  if (level > LAST_FIXED_PAYMENT_LEVEL) {
    const extraSteps = (level - LAST_FIXED_PAYMENT_LEVEL) / PAYMENT_INTERVAL;
    if (Number.isInteger(extraSteps)) {
      return scaledPayment(PAYMENT_AMOUNTS.get(LAST_FIXED_PAYMENT_LEVEL) + ENDLESS_PAYMENT_STEP * extraSteps, economy);
    }
  }
  return 0;
}

export function nextPaymentForLevel(level, economy = {}) {
  const dueLevel = nextPaymentLevel(level);
  return {
    level: dueLevel,
    amount: paymentAmountForLevel(dueLevel, economy),
  };
}

export function isPostPaymentRewardLevel(level) {
  return level > 1 && paymentAmountForLevel(level - 1) > 0;
}

export function isFinalRunLevel(level) {
  return false;
}
