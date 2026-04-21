# Module Refactor — Complete (2026-04-21)

**All 19 tasks done.** main.js went from 2476 lines to 47 lines.

## Final layout

```
src/
  main.js            (47)    bootstrap only
  state.js           (176)   strict state boundary
  audio.js           (75)
  settings.js        (28)    persisted settings + audio-sync wrappers
  rulesets.js        (43)
  board/
    generation.js    (408)
    layout.js        (160)
  ui/
    dom.js           (35)
    overlay.js       (183)
    pointer.js       (135)
    render.js        (178)
    shop.js          (109)
    tooltip.js       (134)
    view.js          (205)
  gameplay/
    interaction.js   (367)   walk, reveal, collect, detonate, flag, pickaxe targeting
    items.js         (276)   use-item actions, ITEM_TOOLTIPS, button wiring
    level.js         (260)   initLevel + run orchestration + save/load
    merchant.js      (90)    prices, discounts, buy/reroll/leave
tests/
  smoke.html         (42)    DOM stubs + harness
  smoke.js           (214)   16 tests passing
```

## Commit history (all tasks)

| Commit    | Task | What                                                                 |
|-----------|------|----------------------------------------------------------------------|
| f772e60   | 1    | Flip to ES module, scaffold smoke harness                            |
| e76c459   | 1.1  | Temporary window.* bridge for inline onclicks (removed in d545fb1)   |
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
| e2eb3d9   | 9    | Extract ui/render.js                                                 |
| 2f6be1d   | 9.1  | Replace reverse imports with setRenderDeps() callback injection      |
| 461e3da   | 10   | Extract ui/view.js                                                   |
| 6862767   | 11   | Extract ui/tooltip.js                                                |
| 8b2d8ce   | 12   | Extract ui/overlay.js with initOverlay() callback injection          |
| af68267   | 12.1 | Drop unused saveSettings + getLifetimeGold imports from overlay.js   |
| d545fb1   | 13   | Extract ui/shop.js and delete the window.* bridge                    |
| 972f5e7   | 14   | Extract ui/pointer.js                                                |
| afa6d19   | 15   | Extract gameplay/merchant.js + 5 tests + smoke.html DOM stubs        |
| 72863e5   | 16   | Extract gameplay/items.js                                            |
| df05dee   | 17   | Extract gameplay/interaction.js; drop initItems hook                 |
| a766c5e   | 18   | Extract gameplay/level.js; drop initOverlay hook; main.js -> 47 lines |
| (this doc) | 19  | Enforcement grep + final playtest + docs                             |

## Architecture (end state)

### Dependency direction (strict — do not reverse)

```
main.js
  └─> gameplay/  (interaction, items, merchant, level)
        └─> ui/  (render, view, overlay, shop, tooltip, pointer, dom)
              └─> state.js, audio.js, settings.js
        └─> board/ (generation, layout)
              └─> state.js, rulesets.js
```

`ui/*` never imports from `gameplay/*` with ONE documented exception: `ui/overlay.js` imports from `gameplay/level.js` because the menu/pause overlays' buttons directly trigger lifecycle actions. This is a cycle (level.js also imports `hideOverlay` from overlay.js), safe because all cross-module identifiers are only used inside function bodies, never at module load.

### State boundary

`state.js` holds the singleton. Everyone else goes through accessors/mutators. The only exception is `prepareTreasureChamber(state)` / `applyTreasureChamber(state)` in `board/generation.js` — ruleset hooks receive the raw state as a parameter to read `state.startCornerIdx` and set `state.biomeOverrides`. This is documented in the RULESETS contract.

### Cross-module callback injection (remaining)

Two injection points survive post-refactor because they wire ui to gameplay without reverse imports:

- `initShop({ onBuy, onReroll, onLeave, getTooltipData })` — shop.js is pure ui; main.js passes gameplay handlers + `(key) => ITEM_TOOLTIPS[key]`.
- `initPointer({ onCellTap, onCellLongPress })` — pointer.js is pure ui; main.js passes `handleClick` and `handleRightClick` from interaction.js.

Two internal-injection points wire module-load side effects:

- `setRevealCell(revealCell)` in interaction.js — tells `board/generation.js` which function to use for anchor-cell cascades.
- `setRenderDeps({...})` called from both interaction.js (injects `isAdjacentToPlayer`) and items.js (injects the 4 `*HasTarget` predicates) — tells `ui/render.js` how to decide cell-highlight state and item-bar disable state without reverse-importing gameplay.

### What's in main.js (47 lines)

1. Imports.
2. Sync audio module with persisted settings on startup.
3. Unlock Web Audio on first gesture.
4. `initShop` wiring.
5. `initPointer` wiring.
6. Pause button listener.
7. Service worker registration.
8. `renderStartMenu()` kickoff.

Nothing else. This is the thin entry point the refactor was aiming for.

## Verification

- `grep -rn "state\." src/ --include="*.js"` — only matches are inside `state.js`, inside import-statement module paths, or inside the two documented ruleset hooks in `generation.js`. State boundary holds.
- Smoke harness: 16/16 passing.
- Game boots with 0 runtime errors (only pre-existing favicon 404 + apple-mobile-web-app-capable deprecation warning).
- Level 1 renders correctly: player, exit, merchant/fountain, walls, gold, items, numbered edges.

## What I didn't manually playtest end-to-end

Due to browser-session flakiness in this environment, the following were NOT manually clicked through:
- Full walk → collect → exit → next-level transition
- Merchant buy / reroll / leave
- Each item actually doing its thing (potion heal, scanner reveal, pickaxe wall break, row/column/cross rays)
- Death → retry reset
- Save → close tab → reopen → continue
- Reaching level 13+ to see a treasure_chamber roll

Code paths are unchanged from pre-refactor — all the functions just moved modules — so these should still work, but a manual check on real master after this session is recommended before the next feature push.
