# Anchor Cells — Design Spec

**Date:** 2026-04-18
**Status:** Draft
**Problem:** Correct guesses rarely improve board state — the player gets stuck in long guess-chains with no new deduction material.

## Problem Analysis

Dense walls (25%) + dense gas (20%) break minesweeper solvability, which is intentional — it creates probabilistic decisions. But currently, surviving a guess often reveals a cell whose adjacency number doesn't help: the player is right back to guessing. There's no mid-board "breath of fresh air" that gives the player a new cluster of numbers to reason from.

## Solution: Anchor Cells

Pre-reveal a small number of safe cells at level start. These cells have adjacency 0, so they cascade open on reveal, creating isolated pockets of certainty with numbered edges. The player sees these pockets from turn 1 — islands of light on an otherwise dark board.

### What the player experiences

1. Level starts → spawn area cascades open as usual
2. 1–3 additional pockets are visible elsewhere on the board (already revealed, with numbers on edges)
3. Each pocket provides multiple numbered edges — immediate deduction material
4. The gap between the player's explored area and the nearest anchor is the interesting decision: "I need to cross 3–5 uncertain cells to reach that pocket — is it worth it?"
5. Anchors become navigation waypoints — the player plans routes from pocket to pocket instead of pushing blindly

### Placement rules

Anchors are placed during `initLevel`, after grid generation and start/exit setup, but before the first `renderGrid`.

1. **Candidate selection:** Collect all cells where `adjacent === 0` AND `type !== 'gas'` AND `type !== 'wall'`. Exclude cells within Chebyshev distance 4 of the player start (that area is already safe-started and will cascade on its own). Exclude cells within Chebyshev distance 3 of the exit.
2. **Minimum spacing:** Anchors must be at least Chebyshev distance 5 from each other. This prevents two anchor cascades from merging into one giant revealed zone.
3. **Count scales with board size:**
   - 10×10 (levels 1–2): 1 anchor
   - 12×12 (levels 3–4): 1 anchor
   - 14×14 (levels 5–6): 2 anchors
   - 16×16+ (levels 7+): 2–3 anchors (roll randomly)
4. **Selection:** From valid candidates, pick randomly. If fewer valid candidates exist than the target count, place as many as possible — it's fine to place 0 anchors on a rare board where no candidates qualify.
5. **Reveal:** Call `revealCell(r, c)` for each anchor. Since `adjacent === 0`, this triggers the existing cascade logic, revealing the pocket and its numbered edges. Items/gold on anchor-cascaded cells become visible but are NOT collected (consistent with existing reveal-vs-collect separation).

### Post-placement safety check

After revealing all anchors, verify that no anchor's cascade merged with:
- The player's start cascade
- Another anchor's cascade
- The exit cell's pre-reveal

Check: snapshot which cells are revealed before placing each anchor. After calling `revealCell`, compare the newly-revealed set against the pre-anchor snapshot. If any newly-revealed cell is adjacent to (within Chebyshev 1 of) a cell that was already revealed before anchor placement, the cascade merged with an existing region. Un-reveal all cells in the new set (set `revealed[r][c] = false`) and skip that anchor. Process anchors one at a time so each check is independent.

### What this does NOT change

- Gas density (20%), wall density (25%) — unchanged
- Item drops, gold veins, merchant — unchanged
- Player start safe-zone — unchanged (ensureSafeStart still clears the 3×3)
- Exit pre-reveal — unchanged
- HP, items, shop — unchanged
- Pathfinding, reachability checks — unchanged (anchors are just revealed cells)

### Tuning knobs (adjust in playtesting)

| Knob | Default | Range | Effect |
|------|---------|-------|--------|
| Min distance from start | 4 (Chebyshev) | 3–6 | Too low → anchor merges with start cascade |
| Min distance from exit | 3 (Chebyshev) | 2–5 | Too low → trivializes endgame |
| Min distance between anchors | 5 (Chebyshev) | 4–7 | Too low → anchors merge; too high → can't place enough |
| Anchor count (small boards) | 1 | 0–2 | More = easier |
| Anchor count (large boards) | 2–3 | 1–4 | More = easier |

### Implementation scope

This is a level-generation change only:
1. Add `placeAnchors()` function that implements the placement rules above
2. Call it in `initLevel()` after start/exit/merchant setup, before `renderGrid()`
3. No new state fields, no new UI elements, no new items, no new audio

### Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Anchor cascade merges with start → highway to exit | Min-distance constraint from start (4). Post-placement merge check (optional). |
| No valid 0-adjacency candidates on a dense board | Graceful fallback: place 0 anchors. Acceptable — dense boards are rare and the feature is additive. |
| Anchors make the game too easy | Reduce count or increase min-distances. All tuning knobs are simple constants. |
| Anchors spawn on item/gold cells | Items/gold become visible but not collected (existing behavior). No issue. |
