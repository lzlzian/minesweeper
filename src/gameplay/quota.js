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

export function nextPaymentLevel(level) {
  if (level <= FIRST_PAYMENT_LEVEL) return FIRST_PAYMENT_LEVEL;
  return FIRST_PAYMENT_LEVEL + Math.ceil((level - FIRST_PAYMENT_LEVEL) / PAYMENT_INTERVAL) * PAYMENT_INTERVAL;
}

export function paymentAmountForLevel(level) {
  if (level !== nextPaymentLevel(level)) return 0;
  if (PAYMENT_AMOUNTS.has(level)) return PAYMENT_AMOUNTS.get(level);
  if (level > LAST_FIXED_PAYMENT_LEVEL) {
    const extraSteps = (level - LAST_FIXED_PAYMENT_LEVEL) / PAYMENT_INTERVAL;
    if (Number.isInteger(extraSteps)) {
      return PAYMENT_AMOUNTS.get(LAST_FIXED_PAYMENT_LEVEL) + ENDLESS_PAYMENT_STEP * extraSteps;
    }
  }
  return 0;
}

export function nextPaymentForLevel(level) {
  const dueLevel = nextPaymentLevel(level);
  return {
    level: dueLevel,
    amount: paymentAmountForLevel(dueLevel),
  };
}

export function isPostPaymentRewardLevel(level) {
  return level > 1 && paymentAmountForLevel(level - 1) > 0;
}

export function isFinalRunLevel(level) {
  return false;
}
