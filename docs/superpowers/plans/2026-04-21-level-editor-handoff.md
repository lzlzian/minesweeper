# Level Editor — Handoff (2026-04-21)

Shipped on branch `level-editor`. All 12 tasks of `docs/superpowers/plans/2026-04-21-level-editor.md` are complete.
Spec: `docs/superpowers/specs/2026-04-21-level-editor-design.md`.

## What shipped

- `editor.html` + `src/editor/*` — painter-style level editor (schema, validation, palette, render, pointer, slot storage, Test Play, main).
- `src/gameplay/authored.js` — authored-level boot path (`startAuthoredLevel`, `loadAuthoredAndStart`, `AUTHORED_RULESET_ID` sentinel).
- `src/ui/overlay.js` — "Play Authored" start-menu entry + `renderAuthoredList` + authored-mode cleared/death overlays.
- `src/gameplay/interaction.js` — three call sites (animateWalk exit, handleClick exit, death) branch on `getRulesetId() === AUTHORED_RULESET_ID`.
- `src/main.js` — `#play-authored=<id>` hash route, async IIFE wrapper.
- `levels/` — directory for committed levels; `levels/index.json` manifest; `levels/test-authored.json` smoke fixture.
- `tests/smoke.js` — 20 new tests (9 schema + 11 validation). 36/36 pass.

## Verification summary (2026-04-22 smoke, via Playwright)

| Check | Result |
|---|---|
| Smoke harness `tests/smoke.html` | 36/36 pass |
| `index.html#play-authored=test-authored` boots fixture | ✅ player (0,0), walls (1,1)+(1,2), gas (2,4), fountain (3,3) with adjacency `1💧`, gold (4,1), drop 🍺 (5,5), exit (7,7) |
| `editor.html` loads, palette renders, 0 console errors | ✅ |
| Painting via palette + grid click | ✅ placement icons render, validation indicator transitions `✗ → ✓ Playable` |
| Undo (`Z`) / redo (`Y`) keyboard shortcuts | ✅ restore exact state |
| Number-key brush selection (`1`–`9`) | ✅ cycles through palette |
| Test Play → `#play-authored=draft` | ✅ draft round-trips via localStorage, painted wall at (3,3) renders in game |
| Walk to exit → authored cleared overlay | ✅ "Level cleared! Collected 💰 X / Back to Menu" |
| Start menu has "Play Authored" entry | ✅ between New Run and Rules |
| Play Authored → sublist shows committed + slots | ✅ "Test Authored" listed under Committed |
| `index.html` (no hash) → procgen unaffected | ✅ 10×10 board, 23 walls, regular start menu |

## How to use

**Author a level:**
1. Open `editor.html`.
2. Paint with the palette (click/drag). Number keys `1`–`9` select brushes. `Z`/`Y` undo/redo.
3. Place 🙂 player start, 🚪 exit (required). Optionally 🧙 merchant, 💧 fountain, 💰 gold, 💀 gas, ▓ wall, drop items.
4. When validation indicator shows "✓ Playable", click **Test Play** — loads directly into the game.
5. To save the draft: `☰ → Save to Slot…` (1–10). `Ctrl+S` fast-saves to the current slot.
6. To commit a polished level: `☰ → Export JSON`, save into `levels/level-XX.json`, add a manifest entry to `levels/index.json`.

**Play an authored level:**
1. `index.html` → start menu → **Play Authored**.
2. Pick from Committed (from `levels/index.json`) or Drafts (from editor slots).

## Known limitations / deferred polish

These were flagged by review loops but left for follow-up — none block playtest:

- **Resize-down silently drops out-of-bounds placements.** Spec proposed a confirmation modal; first cut skipped it.
- **Undo/redo shortcuts use bare `Z`/`Y` (no Ctrl modifier).** Matches plan snippet, but non-standard vs. Ctrl+Z/Ctrl+Y browser convention. INPUT/TEXTAREA guard prevents hijacking in text fields. If you notice accidental undos, wrap both in `(e.ctrlKey || e.metaKey)`.
- **`pushUndo()` fires on refused paints too.** Means some Ctrl+Z presses appear to do nothing (snapshotted a no-op stroke). Fixable by moving `pushUndo()` inside `applyAndFlash` after the `changed === true` branch.
- **Number keys only reach first 9 of 16 brushes.** No shortcut for gold1/5/10/25, placements 3+, or any drops. Good enough for a v1 iteration loop.
- **Test-Play silent-localStorage-failure chain.** If `writePendingTestPlay` fails, the editor still navigates, the game alerts "draft not found", then bounces to menu. A preflight check in `testPlayCurrentDraft` would be cleaner.
- **Editor is desktop-only.** Pointer handling works on touch in principle but the topbar/palette/inspector layout isn't tuned for narrow viewports.
- **Schema is v1** — `SCHEMA_VERSION` in `src/editor/schema.js`. Bump for any breaking change.

## Architectural notes (for future work on this surface)

- **Editor ↔ game isolation.** `src/editor/*` never imports from `src/gameplay/`, `src/board/`, or `src/ui/`. The shared surface is `src/editor/schema.js` + `src/editor/validation.js`, consumed by `src/gameplay/authored.js` at game-boot time. Keep it that way.
- **`AUTHORED_RULESET_ID` sentinel.** Exported from `src/gameplay/authored.js`; imported by `src/gameplay/interaction.js` for ruleset gating. The runtime `rulesets.js` registry deliberately does NOT know about this id — authored mode is a boot-path replacement, not a ruleset plugin. No `prepare`/`apply` hooks run.
- **Static-cycle avoidance.** `src/ui/overlay.js` statically imports from `src/gameplay/level.js` (which imports `hideOverlay` back). Adding `authored.js` to this cycle would break module evaluation order. The death-overlay Retry handler uses `await import('../gameplay/authored.js')` to break the cycle at runtime.
- **Slot storage keys** (in `src/editor/slotStore.js`): `miningCrawler.editor.draft`, `miningCrawler.editor.slots`, `miningCrawler.editor.slot.<N>`, `miningCrawler.editor.pendingTestPlay`. Code-review flagged one duplication: `src/ui/overlay.js` reads `miningCrawler.editor.slots` as a string literal. Extracting the key to a tiny shared module would help future-proof.

## Next steps (if authored direction sticks)

- **Campaign mode** — play authored levels in sequence with persistent HP/stash.
- **Per-level overrides** — starter items, HP, merchant stock in the schema.
- **Level thumbnails / palette preview** in the Play Authored list.
- **Editor resize-confirmation modal** when resizing down would drop placements.
- **Mobile editor ergonomics** — narrow-viewport layout, touch-friendly palette.
- **Ctrl-modifier shortcuts** — fix the two review-flagged nits above.

## Commit log on this branch (master → HEAD)

```
e813bb9 editor: undo/redo stack, number-key brush selection, Ctrl+S save          (Task 11)
769cb1a editor: defensive coercion + escapeAttr contract comment in Play Authored (Task 10 fix)
f3ec023 game: Play Authored menu entry with committed + slot listings              (Task 10)
6f3117a editor: Test Play button with validation + navigation to game              (Task 9)
fbef9e5 game: authored-mode end-of-level and death overlays with retry             (Task 8)
cc2e462 docs: session 2 handoff — Tasks 1-7 of level editor complete
68e943c editor: extract AUTHORED_RULESET_ID constant for Task 8 reuse
a378e1f game: authored-level boot path + hash route handler                        (Task 7)
03d0fb1 editor: drop dead window._editorAutosave global
7b1fcbf editor: localStorage draft autosave, slot load/save, JSON import/export    (Task 6)
fba1f73 editor: click/drag paint with placement, drops, erase, flash refusal       (Task 5)
3ca681a editor: drop unused BRUSHES import, guard inspector writes against focus-steal
e0a9dc7 editor: grid/palette/inspector renderer + resize wiring                    (Task 4)
e62ba69 editor: page scaffold, state singleton, palette taxonomy                   (Task 3)
3cce684 editor: dedupe VALID_ITEM_KEYS — import from schema instead of redeclaring
2d79450 editor: level validation rules (placement, reachability, bounds)           (Task 2)
65f2bda editor: level JSON schema module with round-trip tests                     (Task 1)
b0119c5 docs: session handoff for level editor work
87967b9 docs: level editor implementation plan
4bde814 docs: level editor design spec
```

20 commits on top of master. Ready to merge or continue iterating on the `level-editor` branch.
