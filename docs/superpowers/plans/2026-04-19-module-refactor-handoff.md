# Module Refactor — Handoff (2026-04-21)

Session paused after Task 16. Next session picks up at Task 17.

## Where we are

**Progress: 16 of 19 tasks complete.** Every commit left the game playable; current master works.

```
src/
  main.js            (713 lines — was 2476 at start, then 1165 at last handoff)
  state.js           (176)
  audio.js           (75)
  settings.js        (17)
  rulesets.js        (43)
  board/
    generation.js    (408)
    layout.js        (160)
  ui/
    dom.js           (35)
    overlay.js       (189)
    pointer.js       (135)   [NEW — Task 14]
    render.js        (178)
    shop.js          (109)
    tooltip.js       (134)
    view.js          (205)
  gameplay/
    items.js         (286)   [NEW — Task 16]
    merchant.js      (90)    [NEW — Task 15]
tests/
  smoke.html         (42)    [expanded with DOM stubs — Task 15]
  smoke.js           (214 — 16 tests passing)
```

**Still in main.js (713 lines, will shrink to ~50):** revealCell, detonateGas, collectAt, findBestApproach, ensureSafeStart, walkRay, sleep, isAdjacentToPlayer, handleClick, handleItemClick (pickaxe branch), handleRightClick, debugRevealAll, animateWalk, level lifecycle (saveRun, loadRun, clearSave, initLevel, startGame, resumeGame, nextLevel, retryLevel), setMusicOn/setSfxOn wrappers, service worker registration, kick-off `renderStartMenu()` call.

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
| 972f5e7   | 14   | Extract ui/pointer.js with callback injection                        |
| afa6d19   | 15   | Extract gameplay/merchant.js + 5 tests + smoke.html DOM stubs        |
| 72863e5   | 16   | Extract gameplay/items.js (owns ITEM_TOOLTIPS + button wiring)       |

## Still to do

| Task | Module                      | Plan section |
|------|-----------------------------|--------------|
| 17   | gameplay/interaction.js     | Plan lines ~2360-2510 |
| 18   | gameplay/level.js           | Plan lines ~2510-2650 |
| 19   | Enforcement grep + playtest | Plan lines ~2650-end  |

Spec: `docs/superpowers/specs/2026-04-19-module-refactor-design.md`
Plan: `docs/superpowers/plans/2026-04-19-module-refactor.md`

## Patterns established (apply in remaining tasks)

- **Strict state boundary.** No `state.*` outside `state.js` except ruleset-hook parameters. Enforcement grep: `grep -n "state\." src/main.js` should only show the import line + `state.biomeOverrides`/`state.startCornerIdx` inside `prepareTreasureChamber(state)`/`applyTreasureChamber(state)`.
- **Callback injection, NOT reverse imports.** When module A needs something that still lives in main.js, expose an `initA({...})` hook and have main.js call it at bootstrap. Do NOT add `export` to main.js — that's reverse-direction and pollutes it.
- **Default callbacks: throw for required, no-op for optional.** `setRevealCell` throws (anchors would silently not cascade otherwise); others default to no-ops because render can tolerate "not yet wired" briefly during load.
- **`data-act="..."` + addEventListener, never inline `onclick=`.** The window bridge is gone; don't re-introduce it.
- **`attachTooltip(el, dataObj)` takes a resolved `{name, desc, howto}` object**, not an item key. Caller does `ITEM_TOOLTIPS[key]` lookup.
- **Every commit playable**, every commit a rollback point. Run game at `http://localhost:3000` + smoke harness at `/tests/smoke.html` before committing.
- **ui/* should NOT import from gameplay/*.** Dependency direction is `main → gameplay → ui/state/audio`. When a ui module needs gameplay data (e.g., shop.js needs `ITEM_TOOLTIPS` for tooltips), use a hook (e.g., `getTooltipData`) wired from main.js at bootstrap.
- **smoke.html DOM stubs required.** Any smoke test that transitively imports `ui/view.js` (through e.g. `ui/render.js`) needs `<canvas id="minimap">` plus the full set of dom.js-referenced elements — `view.js` attaches a top-level listener on `minimapEl` at module load. See tests/smoke.html for the full set.

## Active callback injections (to unwind in remaining tasks)

- `setRevealCell(revealCell)` in generation.js — **removed by Task 17** when revealCell moves to gameplay/interaction.js
- `setRenderDeps({ isAdjacentToPlayer })` in render.js (called from main.js) — drops in Task 17 when `isAdjacentToPlayer` moves. The four `*HasTarget` deps are already wired by items.js itself (Task 16); main.js no longer touches them.
- `initItems({ walkRay, detonateGas, revealCell })` in items.js — **removed by Task 17** when interaction.js is extracted; items.js switches to direct imports.
- `initShop({ onBuy, onReroll, onLeave, getTooltipData })` in shop.js — the four hooks stay post-refactor because shop is in `ui/` and must not reverse-import `gameplay/merchant.js` or `gameplay/items.js`. Main.js is the one place that wires ui to gameplay, per the layering rule. This is a **deliberate deviation from the original plan text** (which had `getTooltipData` dropping in Task 16).
- `initOverlay({ onStartGame, onResumeGame, onNextLevel, onRetryLevel, onSaveRun, onClearSave, onLoadRun, onToggleMusic, onToggleSfx })` in overlay.js — same layering reason: overlay is ui/, lifecycle is gameplay/. Post-Task-18, these hooks point at imports from `gameplay/level.js` and the `initOverlay` call stays in main.js.

## Known non-issue to ignore next session

`src/ui/overlay.js` has a cycle with `gameplay/level.js` (Task 18) because `overlay.js` imports functions that the level module will provide via hooks — but the level module will want to call `showDeathOverlay` / `showEscapedOverlay` from inside `initLevel`. Both imports are used inside function bodies only, so the cycle is safe at module load (ES module semantics). Documented in the spec, don't re-litigate.

## Hoisting consideration (applies to Task 17 and Task 18)

main.js bootstrap calls (`setRevealCell(revealCell)`, `initItems({walkRay, detonateGas, revealCell})`, `initShop({onBuy: buyFromMerchant, ...})`, `initOverlay({...})`) run at module top-level **before** the function declarations they reference. This works today because the referenced functions are `function` declarations (hoisted). If Task 17 moves `walkRay`/`detonateGas`/`revealCell` to interaction.js and main.js switches to imports, the order still works — ES module bindings are available throughout the module's top level. But if you restructure into `const fn = () => {}` expressions, ordering breaks. Keep the current `function` style when in doubt.

## How to resume

1. Read this doc and the two referenced plan/spec files.
2. Playtest briefly to confirm current master works (smoke harness 16/16, game boots clean).
3. Continue with Task 17 per the plan (`gameplay/interaction.js`).
4. After Task 17, `initItems` hook goes away, items.js imports `walkRay`/`detonateGas`/`revealCell` from interaction.js directly.
5. Prefer direct implementation over subagent dispatch for the remaining tasks — they're mechanical. Dispatch only if a task balloons (>300 lines moved).
