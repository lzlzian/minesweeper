# Module refactor — design

Split the monolithic `game.js` (2476 lines) into native ES modules under `src/`, introduce a strict state-boundary contract, and add a minimal smoke-test harness. No gameplay changes.

## Motivation

The game is at ~2500 lines in a single file and growing. Upcoming work (more items, more rulesets, more systems) will keep adding lines. A single-file shape makes two things harder:

- **Untangling.** Coupling is invisible when everything is in module scope. Every new feature edits the same file, and it's increasingly hard to reason about which functions share which state.
- **Migration later.** If we ever decide an engine switch is warranted, a tangled single file is harder to port than focused modules with explicit boundaries — regardless of destination.

This pass addresses both while preserving the current workflow: plain HTML/JS, no build step, no framework, deployable to GitHub Pages as-is.

## Goals

- Split `game.js` into focused ES modules under `src/`.
- Enforce a strict state boundary: only `state.js` may touch `state.*` directly; every other module reads and writes via exported functions.
- Add a minimal browser-based smoke-test harness (~10 assertions on pure functions).
- End with a thin `main.js` (~50 lines) as a pure entry point.
- Every intermediate commit produces a playable game.

## Non-goals

- `style.css` (deferred to a later standalone pass).
- Gameplay or behavior changes. **Zero** functional differences post-refactor — all existing features (start menu, pause menu, all items, merchant, tooltips, treasure chamber, fountain, save/resume, PWA) work identically.
- Build tooling, bundlers, TypeScript, framework adoption.
- Deep refactoring within modules. Functions stay roughly as-is; this pass is about moving them into the right file and routing state access through `state.js`.

## Module layout

```
src/
  main.js                  ~50 lines: imports, DOM listener wiring, startup
  state.js                 state singleton + ALL getters/setters + constants
                           (MAX_HP, STEP_MS, CELL_SIZE, CELL_GAP, BOARD_PAD)
  rulesets.js              RULESETS registry, weightedPick, resolveRuleset,
                           prepare/apply variants (treasure_chamber),
                           gridSizeForLevel, anchorCountForSize
  audio.js                 AudioContext, sfx buffers, playSfx, bgm, startBgm,
                           setMusicOn, setSfxOn, resumeAudioCtx
  settings.js              loadSettings, saveSettings, settings obj

  board/
    generation.js          placeWallClumps, generateGrid, countAdjacentGas,
                           placeGoldVeins, placeItemDrops, placeAnchors,
                           anchor distance constants
    layout.js              pickPlayerStart, pickExit, pickMerchantCorner,
                           findNearCorner, isReachable, carvePath, findPath,
                           hasNonWallNeighbor, cleanMerchantCell, STEP_DIRS

  gameplay/
    level.js               initLevel, startGame, resumeGame, nextLevel,
                           retryLevel, saveRun, loadRun, clearSave,
                           addToLifetimeGold, getLifetimeGold,
                           SAVE_KEY, LIFETIME_GOLD_KEY
    interaction.js         collectAt, revealCell, ensureSafeStart,
                           detonateGas, walkRay, findBestApproach,
                           handleRightClick, isAdjacentToPlayer, sleep,
                           debugRevealAll
    items.js               onItemButtonClick, useItemPotion, useItemScanner,
                           useItemRow/Column/Cross, revealAlongRay,
                           *HasTarget helpers, ITEM_TOOLTIPS, PICKUP_EMOJI
    merchant.js            MERCHANT_PRICES, DISCOUNT_TIERS, rollDiscountTier,
                           priceFromTier, rollMerchantStock, buyFromMerchant,
                           rerollMerchant, leaveShop

  ui/
    dom.js                 all `document.getElementById(...)` lookups as
                           named exports (board, hud pieces, overlay, etc)
    render.js              renderGrid, updateHud, updateItemBar,
                           updatePlayerSprite, flashHurtFace, spawnPickupFloat
    overlay.js             showOverlay, hideOverlay, showEscapedOverlay,
                           showDeathOverlay, renderStartMenu, renderPauseMenu,
                           renderRules, renderSettings, renderNewRunConfirm
    shop.js                showShopOverlay (uses merchant.js for logic)
    tooltip.js             attachTooltip, showTooltip, hideTooltip,
                           positionTooltip + tooltip constants
    view.js                pan object, applyPan, setPan, animatePanTo,
                           centerOnCell, autoRecenterOnPlayer,
                           isCellOutsideCenterRect, clampPan,
                           getViewportSize/getBoardSize, cellCenterPx,
                           renderMinimap
    pointer.js             viewport pointer arbiter: onViewportPointerDown/
                           Move/Up/Cancel, cellFromClientPoint,
                           DRAG_THRESHOLD_PX, LONG_PRESS_MS

tests/
  smoke.html               loads smoke.js as module, renders pass/fail table
  smoke.js                 ~10 assertions on pure functions
```

**13 modules + 1 entry + 2 test files.**

### Dependency direction

Top imports bottom. No cycles.

```
main.js
  → gameplay/* → ui/* → board/* → rulesets.js
  → everything → state.js, audio.js, settings.js
```

### Upward calls

`ui/overlay.js` needs to trigger `startGame` / `resumeGame` / `nextLevel` (which live in `gameplay/level.js`, a higher layer). To avoid importing upward, `overlay.js` takes callbacks on init:

```js
// in main.js
import { initOverlay } from './ui/overlay.js';
import { startGame, resumeGame } from './gameplay/level.js';
initOverlay({ onStartGame: startGame, onResumeGame: resumeGame, /* ... */ });
```

Mild ceremony, avoids cycles, keeps the dependency graph clean.

## State boundary contract

Only `state.js` touches `state.*` directly. Every other module reads and writes via exported functions.

### `state.js` exports

- **Constants:** `MAX_HP`, `STEP_MS`, `CELL_SIZE`, `CELL_GAP`, `BOARD_PAD`.
- **Generic escape hatch:** `getState()` — returns the singleton. Use sparingly; flag any use with a comment.
- **Typed getters:** `getGold`, `getStashGold`, `getHp`, `getLevel`, `getRulesetId`, `getGrid`, `getPlayer`, `getExit`, `getMerchant`, `getFountain`, `getItemCounts`, `getBoardSize`, `getBiomeOverrides`, plus any other field currently read externally.
- **Semantic mutators** (mutators encode invariants — HP clamping, gold floor, etc):
  - `spendGold(amount)` — already exists, keep
  - `addGold(amount)`
  - `moveGoldToStash()` — handles the `nextLevel` pattern
  - `damagePlayer(amount)` → returns new hp, clamps at 0
  - `healPlayer(amount)` → clamps at `MAX_HP`
  - `addItem(key, count)`
  - `consumeItem(key)` — decrements counter, asserts > 0
  - `setPlayerPosition(r, c)`
  - `setGrid(grid)`
  - `setRulesetId(id)`
  - `setFountain(f)`
  - `setMerchant(m)`
  - `setLevel(n)`
  - `resetForNewRun()` — clears run-scoped state (gold, stash, items, level, ruleset)
  - `resetForNewLevel()` — clears level-scoped state (grid, player, exit, fountain, biomeOverrides) but preserves HP/items/stash
- **Save payload helpers:**
  - `getSavePayload()` — returns the object currently built inline in `saveRun`
  - `applySavePayload(save)` — restores state from a loaded save

### Field-level vs semantic

Use semantic mutators where invariants exist (HP clamping, gold floor). Use simple setters where there are no invariants (`setPlayerPosition`, `setGrid`). Don't manufacture semantic names for trivial assignments.

### Grid cells

The grid is a 2D array of cell objects. Strict boundary at the cell level is impractical (too many reads/writes across generation, rendering, interaction). Treat `grid` as a returned reference: `state.js` owns the array, callers read and mutate cell properties directly. Cells are "checked out" from state.

### Enforcement

Manual grep at the end of the refactor, and before any future commit that edits these files:

```bash
grep -rn "state\." src/ --include="*.js" | grep -v "src/state.js" | grep -v "//"
```

Should return empty (ignoring comments). Any match is a boundary violation.

## Test harness

### Files

- `tests/smoke.html` — minimal HTML shell with `<pre id="out">` and `<script type="module" src="./smoke.js">`.
- `tests/smoke.js` — imports pure functions from `src/`, runs assertions, writes results to `#out`.

### Running

Open `http://localhost:3000/tests/smoke.html` with the same `npx serve . -l 3000` workflow used for the game. Manual refresh after each commit. No CI, no pre-commit hook, no file watcher.

### Pattern

```js
import { weightedPick } from '../src/rulesets.js';
import { priceFromTier } from '../src/gameplay/merchant.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push(`PASS  ${name}`); }
  catch (e) { results.push(`FAIL  ${name}  — ${e.message}`); }
}
function assertEq(a, b, msg) {
  if (a !== b) throw new Error(msg ?? `${a} !== ${b}`);
}

test('priceFromTier d50', () => {
  assertEq(priceFromTier(20, 'd50'), 10);
});

document.getElementById('out').textContent = results.join('\n');
```

### Initial assertions (~10)

1. `weightedPick` — with stubbed `Math.random` returning 0.0, picks first; returning 0.99, picks last.
2. `priceFromTier` — `free` → 0, `d50` halves, `full` unchanged.
3. `rollDiscountTier` — over 10,000 rolls, observed distribution matches `DISCOUNT_TIERS` within ±5%.
4. `countAdjacentGas` — hand-built 3×3 grid with mix of gas/detonated/empty, center cell count is correct.
5. `findPath` — straight-line path exists in empty grid.
6. `findPath` — returns null when blocked by a wall ring.
7. `isReachable` — mirrors the two `findPath` cases.
8. `gridSizeForLevel(1)` and `gridSizeForLevel(20)` match the current curve.
9. `anchorCountForSize` — boundary values (10, 12, 14, 16, 20).
10. `getSavePayload` + `applySavePayload` round-trip — set state, snapshot, mutate, restore, assert fields equal.

### What it catches

Pure-function regressions introduced by moving code between files — the primary risk during extraction. Won't catch UI/DOM bugs or rendering regressions; those still need playtest.

## Migration order

Each numbered step is its own commit and leaves a playable game. After each step: run the smoke harness + manual smoke test (start a run, walk, open shop, save/resume).

### Phase 0 — foundation

1. **Flip entry point.** Move `game.js` → `src/main.js` verbatim. Update `index.html`: `<script src="game.js">` → `<script type="module" src="src/main.js">`. Replace the one inline `onclick="renderPauseMenu()"` with `addEventListener` wired in `main.js`. Scaffold `tests/smoke.html` + empty `smoke.js`. Verify game still runs.

### Phase 1 — leaf extractions

2. **Extract `state.js`.** Move `state`, constants (`MAX_HP`, `STEP_MS`, `CELL_SIZE`, `CELL_GAP`, `BOARD_PAD`), `spendGold`. Add all getters, setters, and semantic mutators described above. Update every call site in `main.js`. Add the save/load round-trip test to smoke harness. *(Bulk of the refactor — every function in the file touches state.)*
3. **Extract `audio.js`.**
4. **Extract `settings.js`.**
5. **Extract `rulesets.js`.** Add `weightedPick` and `priceFromTier` tests.

### Phase 2 — board layer

6. **Extract `board/layout.js`.** Add `findPath` / `isReachable` tests.
7. **Extract `board/generation.js`.** Add `countAdjacentGas` test.

### Phase 3 — UI layer (bottom-up)

8. **Extract `ui/dom.js`.**
9. **Extract `ui/render.js`.**
10. **Extract `ui/view.js`** (pan, minimap).
11. **Extract `ui/tooltip.js`.**
12. **Extract `ui/overlay.js`** with callback-injection pattern for upward calls into `gameplay/level.js` (which is extracted later; interim callbacks are defined in `main.js` against functions still living there).
13. **Extract `ui/shop.js`.**
14. **Extract `ui/pointer.js`.**

### Phase 4 — gameplay layer

15. **Extract `gameplay/merchant.js`.**
16. **Extract `gameplay/items.js`.**
17. **Extract `gameplay/interaction.js`.**
18. **Extract `gameplay/level.js`.** `startGame`, `resumeGame`, `nextLevel`, `retryLevel`, `initLevel`, save/load. Replace interim callbacks in `main.js` with real imports.

### Phase 5 — verify

19. **Enforcement + playtest.** Run the enforcement grep — should return empty. Verify `main.js` is ~50 lines. Full playtest: fresh run, death + retry, continue from save, merchant visit + buy + reroll, treasure chamber level, fountain interaction (both damaged and full-HP cases), all 6 items used. All smoke assertions green. Cleanup commit if any issues surface.

### Rollback

Each commit is a clean rollback point. If step N breaks something not caught until later, `git reset --hard <step N-1 commit>` restores the last verified-playable state.

## Risks and mitigations

- **Risk:** ES modules loaded from `file://` don't work (CORS). **Mitigation:** user already uses `npx serve` for local testing per existing memory; documented behavior, no change.
- **Risk:** Inline `onclick=` in `index.html` breaks when the script becomes a module (module scope != global). **Mitigation:** phase 0 removes all inline handlers up front.
- **Risk:** Circular imports at module load time. **Mitigation:** all imports are referenced inside functions, not at top level (matches current code style). Dependency graph has no cycles by design.
- **Risk:** State-boundary violations creep back in after refactor. **Mitigation:** enforcement grep is trivial to run; run it before merging future feature work that touches these files.
- **Risk:** A regression sneaks through that the smoke harness doesn't cover (UI/rendering). **Mitigation:** explicit manual playtest checklist in phase 5.

## Open questions

None at spec time. Any surfacing during implementation get logged in the plan.
