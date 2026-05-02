import { overlay, overlayContent } from './dom.js';
import { hideTooltip } from './tooltip.js';
import { settings, setMusicOn, setSfxOn } from '../settings.js';
import { playSfx } from '../audio.js';
import {
  startGame, resumeGame, nextLevel,
  saveRun, loadRun,
} from '../gameplay/level.js';
import { getDebtCushionUsed, getGold, getOpenContracts, getPaymentDebt, getRulesetId, getStashGold, hasArtifact } from '../state.js';
import { getLeaderboard, recordRun } from '../gameplay/leaderboard.js';
import { isFinalRunLevel, paymentAmountForLevel } from '../gameplay/quota.js';
import { DEBT_CUSHION_GOLD, PAYMENT_DISCOUNT_PERCENT, artifactPaymentAmount, artifactRarityLabel } from '../gameplay/artifacts.js';
import { biomeForLevel } from '../gameplay/biomes.js';

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

function runEndLabel(cause) {
  if (cause === 'payment') return 'Payment';
  if (cause === 'death') return 'Death';
  if (cause === 'abandoned') return 'Abandoned';
  if (cause === 'win') return 'Win';
  return 'Ended';
}

function maybeRecordAbandonedSave(save) {
  if (!save) return;
  const totalGold = save.runGoldEarned ?? save.stashGold ?? 0;
  if ((save.level ?? 1) <= 1 && totalGold <= 0) return;
  recordRun({
    levelReached: save.level,
    totalGold,
    cause: 'abandoned',
  });
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
  hideTooltip();
  overlayContent.innerHTML = html;
  overlay.classList.remove('hidden');
}

export function hideOverlay() {
  hideTooltip();
  overlay.classList.add('hidden');
}

export function showGenerationOverlay(biome = null) {
  const title = biome?.name ? `Preparing ${escapeHtml(biome.name)}` : 'Preparing mine';
  const detail = biome?.tagline || 'Finding a fair route...';
  showOverlay(`
    <div class="generation-loading" role="status" aria-live="polite">
      <div class="generation-spinner" aria-hidden="true"></div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(detail)}</p>
    </div>
  `);
}

export function showArtifactFoundOverlay(artifact) {
  if (!artifact) return;
  showOverlay(`
    <div class="artifact-found" role="dialog" aria-labelledby="artifact-found-title">
      <div class="artifact-found-kicker">Artifact found</div>
      <div class="artifact-found-icon" aria-hidden="true">${escapeHtml(artifact.icon)}</div>
      <h2 id="artifact-found-title">${escapeHtml(artifact.name)}</h2>
      <p class="artifact-rarity">${escapeHtml(artifactRarityLabel(artifact))}</p>
      <p class="artifact-found-desc">${escapeHtml(artifact.desc)}</p>
      <button class="menu-btn-primary" data-act="close-artifact">Continue</button>
    </div>
  `);
  overlayContent.querySelector('[data-act="close-artifact"]')
    ?.addEventListener('click', menuClick(() => hideOverlay()));
}

export function showArtifactChoiceOverlay(artifacts, onChoose, options = {}) {
  if (!artifacts?.length) return;
  const kicker = options.kicker ?? "Joker's Choice";
  const title = options.title ?? 'Choose an artifact';
  const optionsHtml = artifacts.map(artifact => `
    <button class="artifact-choice" data-artifact-id="${escapeAttr(artifact.id)}">
        <span class="artifact-choice-icon" aria-hidden="true">${escapeHtml(artifact.icon)}</span>
        <span class="artifact-choice-body">
          <strong>${escapeHtml(artifact.name)}</strong>
          <span class="artifact-rarity">${escapeHtml(artifactRarityLabel(artifact))}</span>
          <span>${escapeHtml(artifact.desc)}</span>
        </span>
    </button>
  `).join('');
  showOverlay(`
    <div class="artifact-choice-modal" role="dialog" aria-labelledby="artifact-choice-title">
      <div class="artifact-found-kicker">${escapeHtml(kicker)}</div>
      <h2 id="artifact-choice-title">${escapeHtml(title)}</h2>
      <div class="artifact-choice-list">${optionsHtml}</div>
    </div>
  `);
  overlayContent.querySelectorAll('[data-artifact-id]').forEach(btn => {
    btn.addEventListener('click', menuClick(() => {
      const artifact = artifacts.find(option => option.id === btn.dataset.artifactId);
      if (artifact) onChoose?.(artifact);
    }));
  });
}

export function showPaidJokerOverlay({ price = 0, canAfford = false, choiceCount = 0 } = {}, onPay, onLeave) {
  const rewardText = choiceCount > 1
    ? `Choose 1 of ${choiceCount} artifacts`
    : 'Random artifact';
  showOverlay(`
    <div class="artifact-found" role="dialog" aria-labelledby="paid-joker-title">
      <div class="artifact-found-kicker">Wandering Joker</div>
      <div class="artifact-found-icon" aria-hidden="true">🃏</div>
      <h2 id="paid-joker-title">Joker Deal</h2>
      <p class="artifact-found-desc">${escapeHtml(rewardText)}</p>
      <p class="payment-due">Price: 💰 ${price}</p>
      <button class="menu-btn-primary" data-act="pay-joker" ${canAfford ? '' : 'disabled'}>Pay</button>
      <button class="menu-btn-secondary" data-act="leave-joker">Leave</button>
    </div>
  `);
  overlayContent.querySelector('[data-act="pay-joker"]')
    ?.addEventListener('click', menuClick(() => onPay?.()));
  overlayContent.querySelector('[data-act="leave-joker"]')
    ?.addEventListener('click', menuClick(() => {
      onLeave?.();
      hideOverlay();
    }));
}

export function showBankOverlay({ offer, pawnItems = [] } = {}, onTakeLoan, onSellItem, onLeave) {
  const loanHtml = offer?.available
    ? `
      <p>Loan: 💰 ${offer.payout}</p>
      <p>Repay: 💰 ${offer.debt} at end of Level ${offer.dueLevel}</p>
      <button class="menu-btn-primary" data-act="take-loan">Take Loan</button>
    `
    : '<p>Loan: already taken.</p>';
  const pawnHtml = pawnItems.length
    ? pawnItems.map(item => `
        <button class="menu-btn-secondary" data-sell-item="${escapeAttr(item.key)}">
          Sell ${escapeHtml(item.name)} x${item.count} for ${item.price}g
        </button>
      `).join('')
    : '<p>No items to pawn.</p>';
  showOverlay(`
    <div class="contract-offer" role="dialog" aria-labelledby="contract-offer-title">
      <div class="artifact-found-kicker">Bank office</div>
      <h2 id="contract-offer-title">Loan & Pawn</h2>
      ${loanHtml}
      <p class="contract-offer-fineprint">Loans skip the upcoming checkpoint and come due on the one after.</p>
      <h3>Pawn Shop</h3>
      ${pawnHtml}
      <button class="menu-btn-secondary" data-act="leave-bank">Leave</button>
    </div>
  `);
  overlayContent.querySelector('[data-act="take-loan"]')
    ?.addEventListener('click', menuClick(() => {
      onTakeLoan?.();
    }));
  overlayContent.querySelectorAll('[data-sell-item]').forEach(btn => {
    btn.addEventListener('click', menuClick(() => {
      onSellItem?.(btn.dataset.sellItem);
    }));
  });
  overlayContent.querySelector('[data-act="leave-bank"]')
    ?.addEventListener('click', menuClick(() => {
      hideOverlay();
      onLeave?.();
    }));
}

function contractExpiryText(contract) {
  const remaining = Math.max(0, contract?.levelsRemaining ?? contract?.expiresAfter ?? 0);
  return `${remaining} clear${remaining === 1 ? '' : 's'} left`;
}

function contractRiskText(contract) {
  const risks = [];
  if (contract?.failOnTriggeredGas) risks.push('gas fails');
  if (contract?.failOnItemsUsed) risks.push('items fail');
  if (contract?.failOnWrongFlags) risks.push('wrong flags fail');
  if (!risks.length) risks.push('expires if unfinished');
  return risks.join(' · ');
}

function openContractsHtml(contracts = []) {
  if (!contracts.length) {
    return '<p class="contract-offer-fineprint">No open contracts.</p>';
  }
  return `
    <div class="open-contract-list">
      ${contracts.map(contract => `
        <div class="open-contract-row">
          <span class="contract-choice-icon" aria-hidden="true">${escapeHtml(contract.icon)}</span>
          <span class="contract-choice-body">
            <strong>${escapeHtml(contract.name)} · ${contractExpiryText(contract)} · win ${contract.payout}g</strong>
            <span>${escapeHtml(contract.desc)}</span>
            <span>Buy-in paid: ${contract.cost ?? 0}g · ${escapeHtml(contractRiskText(contract))}</span>
          </span>
        </div>
      `).join('')}
    </div>
  `;
}

export function showContractBoardOverlay({ choices = [], openContracts = [] } = {}, onChoose, onLeave) {
  const availableGold = getGold() + getStashGold();
  const choicesHtml = choices.length
    ? `
      <p class="contract-offer-fineprint">Pay the buy-in now. Open contracts stay live until completed, failed, or expired.</p>
      <div class="contract-choice-list">
        ${choices.map(choice => {
          const canAfford = availableGold >= (choice.cost ?? 0);
          return `
          <button class="contract-choice" data-contract-id="${escapeAttr(choice.id)}" ${canAfford ? '' : 'disabled'}>
            <span class="contract-choice-icon" aria-hidden="true">${escapeHtml(choice.icon)}</span>
            <span class="contract-choice-body">
              <strong>${escapeHtml(choice.name)} · pay ${choice.cost ?? 0}g · win ${choice.payout}g</strong>
              <span>${escapeHtml(choice.desc)}</span>
              <span>${contractExpiryText(choice)} · ${escapeHtml(contractRiskText(choice))}</span>
              ${canAfford ? '' : '<span>Not enough gold.</span>'}
            </span>
          </button>
        `;
        }).join('')}
      </div>`
    : '<p class="contract-offer-fineprint">This board has already been filed.</p>';
  showOverlay(`
    <div class="contract-offer" role="dialog" aria-labelledby="contract-board-title">
      <div class="artifact-found-kicker">Contract board</div>
      <h2 id="contract-board-title">Pick a Contract</h2>
      ${choicesHtml}
      <h3>Open Contracts</h3>
      ${openContractsHtml(openContracts)}
      <button class="menu-btn-secondary" data-act="leave-contract">Leave</button>
    </div>
  `);
  overlayContent.querySelectorAll('[data-contract-id]').forEach(btn => {
    btn.addEventListener('click', menuClick(() => {
      const contract = choices.find(choice => choice.id === btn.dataset.contractId);
      if (contract) onChoose?.(contract);
      hideOverlay();
    }));
  });
  overlayContent.querySelector('[data-act="leave-contract"]')
    ?.addEventListener('click', menuClick(() => {
      hideOverlay();
      onLeave?.();
    }));
}

export function showOpenContractsOverlay(contracts = getOpenContracts(), onLeave) {
  showOverlay(`
    <div class="contract-offer" role="dialog" aria-labelledby="open-contracts-title">
      <div class="artifact-found-kicker">Open paperwork</div>
      <h2 id="open-contracts-title">Open Contracts</h2>
      ${openContractsHtml(contracts)}
      <p class="contract-offer-fineprint">Contracts are scored only when you clear a level.</p>
      <button class="menu-btn-primary" data-act="close-contracts">Close</button>
    </div>
  `);
  overlayContent.querySelector('[data-act="close-contracts"]')
    ?.addEventListener('click', menuClick(() => {
      hideOverlay();
      onLeave?.();
    }));
}

export function showEscapedOverlay(level, gold, stashGold, nextSize, effects = {}) {
  const dividend = effects?.dividend ?? null;
  const danger = effects?.danger ?? null;
  const cleanTools = effects?.cleanTools ?? null;
  const bounty = effects?.bounty ?? null;
  const heal = effects?.heal ?? null;
  const contracts = effects?.contracts ?? (effects?.contract ? [effects.contract] : []);
  const basePaymentDue = paymentAmountForLevel(level, biomeForLevel(level).economy);
  const debtDue = basePaymentDue > 0 ? getPaymentDebt(level) : 0;
  const rawPaymentDue = basePaymentDue + debtDue;
  const paymentDue = artifactPaymentAmount(rawPaymentDue);
  const afterPayment = stashGold + gold - paymentDue;
  const debtCushionApplies = paymentDue > 0 &&
    afterPayment < 0 &&
    -afterPayment <= DEBT_CUSHION_GOLD &&
    hasArtifact('debt_cushion') &&
    !getDebtCushionUsed();
  const paymentDiscountHtml = rawPaymentDue > paymentDue && hasArtifact('payment_discount')
    ? `<span class="payment-discount">-${PAYMENT_DISCOUNT_PERCENT}% from ${rawPaymentDue}g</span>`
    : '';
  const debtHtml = debtDue > 0
    ? `<p class="payment-due">Company debt: 💰 ${debtDue}</p>`
    : '';
  const afterPaymentHtml = debtCushionApplies
    ? `<p>After payment: 💰 0</p>
       <p class="artifact-result artifact-result-positive">🛟 Debt Cushion covers ${-afterPayment}g shortfall</p>`
    : `<p>After payment: 💰 ${afterPayment}</p>`;
  const paymentHtml = paymentDue > 0
    ? `
      <p class="payment-due">Payment due now: 💰 ${paymentDue}</p>
      ${debtHtml}
      ${paymentDiscountHtml}
      ${afterPaymentHtml}
    `
    : '';
  const dividendHtml = dividend
    ? `<p class="artifact-result artifact-result-positive">💵 Exit Dividend: +${dividend.amount}g</p>`
    : '';
  const dangerHtml = danger
    ? `<p class="artifact-result artifact-result-positive">⚠️ Danger Dividend: +${danger.amount}g</p>`
    : '';
  const cleanToolsHtml = cleanTools
    ? `<p class="artifact-result artifact-result-positive">🧽 Clean Tools: +${cleanTools.amount}g</p>`
    : '';
  const bountyHtml = bounty
    ? `
      <p class="artifact-result ${bounty.net < 0 ? 'artifact-result-negative' : 'artifact-result-positive'}">
        🚩 Flag Bounty: +${bounty.earned}g / -${bounty.penalty}g = ${bounty.net >= 0 ? '+' : ''}${bounty.net}g
      </p>
    `
    : '';
  const healHtml = heal
    ? `<p class="artifact-result artifact-result-positive">💗 Safety Dividend: +${heal.amount} HP</p>`
    : '';
  const contractHtml = contracts.map(contract => {
    if (contract.status === 'progress') {
      return `
        <p class="artifact-result artifact-result-positive">
          📋 Contract open: ${escapeHtml(contract.contract.name)} · ${contract.levelsRemaining} clear${contract.levelsRemaining === 1 ? '' : 's'} left
        </p>
      `;
    }
    const failedLabel = contract.reason === 'expired' ? 'Contract expired' : 'Contract failed';
    return `
      <p class="artifact-result ${contract.success ? 'artifact-result-positive' : 'artifact-result-negative'}">
        📋 ${contract.success ? 'Contract complete' : failedLabel}: ${escapeHtml(contract.contract.name)}${contract.success ? ` +${contract.payout}g` : ''}
      </p>
    `;
  }).join('');
  const isFinal = isFinalRunLevel(level);
  const buttonText = isFinal
    ? (paymentDue > 0 ? 'Pay and Finish' : 'Finish Run')
    : (paymentDue > 0 ? 'Pay and Descend' : 'Descend');
  const nextHtml = isFinal
    ? '<p>Final level cleared.</p>'
    : `<p>Next: Level ${level + 1} (${nextSize}×${nextSize})</p>`;
  showOverlay(`
    <h2>Escaped!</h2>
    <p>Level ${level} cleared · +💰 ${gold}</p>
    ${dividendHtml}
    ${dangerHtml}
    ${cleanToolsHtml}
    ${bountyHtml}
    ${healHtml}
    ${contractHtml}
    <p>Stash: 💰 ${stashGold + gold}</p>
    ${paymentHtml}
    ${nextHtml}
    <button data-act="next-level">${buttonText}</button>
  `);
  wireEscapedOverlay();
}

function wireEscapedOverlay() {
  overlayContent.querySelector('[data-act="next-level"]').addEventListener('click', menuClick(() => nextLevel()));
}

export function showDeathOverlay(level, gold, stashGold) {
  showOverlay(`
    <h2>Run ended.</h2>
    <p>You died on Level ${level}.</p>
    <p>Lost current-level gold: 💰 ${gold}</p>
    <p>Final stash: 💰 ${stashGold}</p>
    <p>Leaderboard updated.</p>
    <button data-act="new-run">New Run</button>
    <button class="menu-btn-secondary" data-act="leaderboard">Leaderboard</button>
  `);
  wireDeathOverlay();
}

function wireDeathOverlay() {
  const q = (act) => overlayContent.querySelector(`[data-act="${act}"]`);
  q('new-run').addEventListener('click', menuClick(() => startGame()));
  q('leaderboard').addEventListener('click', menuClick(() => renderLeaderboard('run-end')));
}

export function showPaymentFailedOverlay(level, paymentDue, totalGold) {
  showOverlay(`
    <h2>Run ended.</h2>
    <p>Payment required after Level ${level}: 💰 ${paymentDue}</p>
    <p>You had: 💰 ${totalGold}</p>
    <p>Shortfall: 💰 ${paymentDue - totalGold}</p>
    <p>Leaderboard updated.</p>
    <button data-act="new-run">New Run</button>
    <button class="menu-btn-secondary" data-act="leaderboard">Leaderboard</button>
  `);
  const q = (act) => overlayContent.querySelector(`[data-act="${act}"]`);
  q('new-run').addEventListener('click', menuClick(() => startGame()));
  q('leaderboard').addEventListener('click', menuClick(() => renderLeaderboard('run-end')));
}

export function showRunWonOverlay(level, totalGold, stashGold) {
  showOverlay(`
    <h2>You win!</h2>
    <p>Level ${level} cleared.</p>
    <p>Total gold earned: 💰 ${totalGold}</p>
    <p>Final stash: 💰 ${stashGold}</p>
    <p>Leaderboard updated.</p>
    <button data-act="new-run">New Run</button>
    <button class="menu-btn-secondary" data-act="leaderboard">Leaderboard</button>
  `);
  const q = (act) => overlayContent.querySelector(`[data-act="${act}"]`);
  q('new-run').addEventListener('click', menuClick(() => startGame()));
  q('leaderboard').addEventListener('click', menuClick(() => renderLeaderboard('run-end')));
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
    <button class="menu-btn-secondary" data-act="leaderboard">Leaderboard</button>
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
  q('leaderboard')?.addEventListener('click', menuClick(() => renderLeaderboard('start')));
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
  overlayContent.querySelector('[data-act="start-new-run"]').addEventListener('click', menuClick(() => {
    maybeRecordAbandonedSave(loadRun());
    startGame();
  }));
  overlayContent.querySelector('[data-act="cancel"]').addEventListener('click', menuClick(() => renderStartMenu()));
}

export function renderLeaderboard(parent = 'start') {
  const entries = getLeaderboard();
  const body = entries.length
    ? `<div class="leaderboard-list">
        ${entries.map((entry, idx) => `
          <div class="leaderboard-row">
            <span class="leaderboard-rank">#${idx + 1}</span>
            <span>Level ${entry.levelReached}</span>
            <span>💰 ${entry.totalGold}</span>
            <span>${runEndLabel(entry.cause)}</span>
          </div>
        `).join('')}
      </div>`
    : '<p>No runs recorded yet.</p>';
  const newRunButton = parent === 'run-end'
    ? '<button class="menu-btn-primary" data-act="new-run">New Run</button>'
    : '';
  showOverlay(`
    <h2>Leaderboard</h2>
    <p>Ranked by deepest level, then total gold earned.</p>
    ${body}
    ${newRunButton}
    <button class="menu-btn-secondary" data-act="back">Back</button>
  `);
  overlayContent.querySelector('[data-act="back"]').addEventListener('click', menuClick(() => renderStartMenu()));
  overlayContent.querySelector('[data-act="new-run"]')?.addEventListener('click', menuClick(() => startGame()));
}

export function renderPauseMenu() {
  const editorBtn = cameFromEditor()
    ? `<button class="menu-btn-secondary" data-act="back-to-editor">Back to Editor</button>`
    : '';
  showOverlay(`
    <h2>Paused</h2>
    <button class="menu-btn-primary" data-act="resume">Resume</button>
    <button class="menu-btn-secondary" data-act="rules">Rules</button>
    <button class="menu-btn-secondary" data-act="settings">Settings</button>
    ${editorBtn}
    <button class="menu-btn-secondary" data-act="quit">Quit to Menu</button>
  `);
  wirePauseMenu();
}

function wirePauseMenu() {
  const q = (act) => overlayContent.querySelector(`[data-act="${act}"]`);
  q('resume')?.addEventListener('click', menuClick(() => hideOverlay()));
  q('rules')?.addEventListener('click', menuClick(() => renderRules('pause')));
  q('settings')?.addEventListener('click', menuClick(() => renderSettings('pause')));
  q('back-to-editor')?.addEventListener('click', menuClick(() => {
    window.location.href = 'editor.html';
  }));
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
    <p>Dig adjacent cells to reveal paths. Numbers count gas tiles in the 8 surrounding cells. Stand on a number and click it to reveal neighbors when marked gas matches.</p>
    <p>You have 3 ❤️. Hitting gas damages you for 1 ❤️. HP carries between levels — dying ends the run.</p>
    <p>Payments are due on checkpoint levels. If you cannot pay after clearing a checkpoint level, the run ends.</p>
    <p>Gold (💰) is optional, but you will need enough to make payments. Revealed loose gold is collected automatically; step onto chests to claim them.</p>
    <p>A 🧙 merchant sometimes appears — spend gold for items at varying discounts.</p>
    <p>🏦 Banks offer loans that come due after the next checkpoint, plus a pawn shop for selling items.</p>
    <p>📋 Contract boards sell optional open contracts. Buy-ins are paid up front; contracts resolve when you clear a level, and unfinished contracts can expire.</p>
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
