# Module Refactor — Handoff (2026-04-19)

Session paused partway through Task 14. Next session picks up here.

## Where we are

**Progress: 13 of 19 tasks complete.** Every commit left the game playable; current master works.

```
src/
  main.js          (1165 lines — was 2476 at start)
  state.js         (176)
  audio.js         (75)
  settings.js      (17)
  rulesets.js      (43)
  board/
    generation.js  (408)
    layout.js      (160)
  ui/
    dom.js         (35)
    overlay.js     (189)
    render.js      (178)
    shop.js        (109)
    tooltip.js     (134)
    view.js        (205)
tests/
  smoke.html
  smoke.js         (176 — 11 tests passing)
```

**Still in main.js (1165 lines, will shrink to ~50):** revealCell, detonateGas, collectAt, findBestApproach, ensureSafeStart, walkRay, sleep, isAdjacentToPlayer, handleClick, handleRightClick, debugRevealAll, all item-use functions (onItemButtonClick, useItemPotion/Scanner/Pickaxe/Row/Column/Cross, *HasTarget, revealAlongRay), merchant logic (MERCHANT_PRICES, DISCOUNT_TIERS, rollDiscountTier, priceFromTier, rollMerchantStock, buyFromMerchant, rerollMerchant, leaveShop), level lifecycle (saveRun, loadRun, clearSave, initLevel, startGame, resumeGame, nextLevel, retryLevel, setMusicOn/setSfxOn wrappers), pointer arbiter, ITEM_TOOLTIPS, setMusicOn/setSfxOn wrappers, service worker registration, kick-off `renderStartMenu()` call.

## What's done (by commit)

| Commit    | Task | What                                                                 |
|-----------|------|----------------------------------------------------------------------|
| f772e60   | 1    | Flip to ES module, scaffold smoke harness                            |
| e76c459   | 1.1  | Temporary window.* bridge for inline onclicks (REMOVED in d545fb1)   |
| 0b14374   | 2    | Extract state.js with strict boundary + getters/mutators             |
| 8cf1259   | 2.1  | Fix: route _startCornerIdx through accessors                         |
| 33ccd5e   | 2.2  | Doc comments on getState() escape hatches                            |
| 7c8217f   | 3    | Extract audio.js                                                     |
| 3f8d392   | 3.1  | SFX load failures surfaced via console.warn                          |
| b1de20b   | 4    | Extract settings.js                                                  |
| 5fdd3c0   | 5    | Extract rulesets.js with installRulesetHooks bridge                  |
| a3058ac   | 5.1  | Deterministic anchorCountForSize tests                               |
| a69ea0b   | 6    | Extract board/layout.js                                              |
| 5ab4b2f   | 6.1  | Doc comments distinguishing isReachable vs findPath                  |
| 3779636   | 7    | Extract board/generation.js; remove installRulesetHooks bridge       |
| 4ecac21   | 7.1  | generation.js imports anchorCountForSize directly from rulesets.js   |
| 01f3e04   | 7.2  | initLevel renders after ruleset.apply; revealCell default throws     |
| 67e8046   | 8    | Extract ui/dom.js                                                    |
| e2eb3d9   | 9    | Extract ui/render.js (initial, had reverse imports)                  |
| 2f6be1d   | 9.1  | Replace reverse imports with setRenderDeps() callback injection      |
| 461e3da   | 10   | Extract ui/view.js; render.js imports applyPan/renderMinimap direct  |
| 6862767   | 11   | Extract ui/tooltip.js; attachTooltip takes resolved data object      |
| 8b2d8ce   | 12   | Extract ui/overlay.js with initOverlay() callback injection          |
| af68267   | 12.1 | Drop unused saveSettings + getLifetimeGold imports from overlay.js   |
| d545fb1   | 13   | Extract ui/shop.js and DELETE the window.* bridge (task complete)    |

## Still to do

| Task | Module                      | Plan section |
|------|-----------------------------|--------------|
| 14   | ui/pointer.js               | Plan lines ~1930-2060 |
| 15   | gameplay/merchant.js        | Plan lines ~2060-2180 |
| 16   | gameplay/items.js           | Plan lines ~2180-2280 |
| 17   | gameplay/interaction.js     | Plan lines ~2280-2395 |
| 18   | gameplay/level.js           | Plan lines ~2395-2510 |
| 19   | Enforcement grep + playtest | Plan lines ~2510-end  |

Spec: `docs/superpowers/specs/2026-04-19-module-refactor-design.md`
Plan: `docs/superpowers/plans/2026-04-19-module-refactor.md`

## Patterns established (apply in remaining tasks)

- **Strict state boundary.** No `state.*` outside `state.js` except ruleset-hook parameters. Enforcement grep: `grep -n "state\." src/main.js` should only show the import line + `state.biomeOverrides`/`state.startCornerIdx` inside `prepareTreasureChamber(state)`/`applyTreasureChamber(state)`.
- **Callback injection, NOT reverse imports.** When module A needs something that still lives in main.js, expose an `initA({...})` hook and have main.js call it at bootstrap. Do NOT add `export` to main.js — that's reverse-direction and pollutes it.
- **Default callbacks: throw for required, no-op for optional.** `setRevealCell` throws (anchors would silently not cascade otherwise); others default to no-ops because render can tolerate "not yet wired" briefly during load.
- **`data-act="..."` + addEventListener, never inline `onclick=`.** The window bridge is gone; don't re-introduce it.
- **`attachTooltip(el, dataObj)` takes a resolved `{name, desc, howto}` object**, not an item key. Caller does `ITEM_TOOLTIPS[key]` lookup.
- **Every commit playable**, every commit a rollback point. Run game at `http://localhost:3000` + smoke harness at `/tests/smoke.html` before committing.

## Active callback injections (to unwind in remaining tasks)

- `setRevealCell(revealCell)` in generation.js — **removed by Task 17** when revealCell moves to gameplay/interaction.js
- `setRenderDeps({ isAdjacentToPlayer, scannerHasTarget, rowHasTarget, columnHasTarget, crossHasTarget })` in render.js — `isAdjacentToPlayer` drops in Task 17, the four `*HasTarget` helpers drop in Task 16
- `initShop({ onBuy, onReroll, onLeave, getTooltipData })` in shop.js — `onBuy`/`onReroll`/`onLeave` hooks stay but point at imports after Task 15; `getTooltipData` drops in Task 16 when ITEM_TOOLTIPS moves to gameplay/items.js
- `initOverlay({ onStartGame, onResumeGame, onNextLevel, onRetryLevel, onSaveRun, onClearSave, onLoadRun, onToggleMusic, onToggleSfx })` in overlay.js — hooks point at imports after Task 18 (but `initOverlay` call itself stays since the overlay module cannot import lifecycle directly without creating a cycle)

## Known non-issue to ignore next session

`src/ui/overlay.js` has a cycle with `gameplay/level.js` (Task 18) because `overlay.js` imports functions that the level module will provide via hooks — but the level module will want to call `showDeathOverlay` / `showEscapedOverlay` from inside `initLevel`. Both imports are used inside function bodies only, so the cycle is safe at module load (ES module semantics). Documented in the spec, don't re-litigate.

## How to resume

1. Read this doc and the two referenced plan/spec files.
2. Check memory: user is luhy559, solo game dev, master-only workflow.
3. Playtest briefly to confirm current master works (shouldn't have regressed since session paused mid-Task-14 extraction — nothing uncommitted).
4. Continue with Task 14 per the plan.
5. Prefer direct implementation over subagent dispatch for the remaining gameplay tasks (14, 16, 17, 18) — they're mostly mechanical. Dispatch only if a task balloons (>300 lines moved).
