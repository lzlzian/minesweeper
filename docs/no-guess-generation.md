# No-Guess Level Generation

## Problem Statement

Mining Crawler's current level generation is purely random: gas and walls are placed stochastically, with no guarantee that the player can reach the exit through logical deduction alone. This creates two problems:

1. **Items feel mandatory.** Players hoard scanners and reveal items to survive unavoidable 50/50 guesses. Items are survival tools rather than strategic choices.
2. **Guessing feels bad.** Hitting gas through no fault of your own — because the board simply didn't give you enough information — is frustrating, especially on deep runs where HP is precious.

The goal is to generate boards where a player can **always** deduce a safe path from start to exit using only the numbers, wall geometry, and flag placement — no guessing required. Items then become efficiency/speed tools rather than crutches.

---

## Definitions

**Deducible cell**: An unrevealed cell whose state (safe or gas) can be determined with certainty from the currently revealed information.

**Solvable board**: A board where the exit is reachable from the start through a sequence of deduction steps — each step reveals at least one new safe cell or identifies at least one gas cell, eventually connecting start to exit through revealed territory.

**Solver frontier**: The set of unrevealed, non-wall cells adjacent to at least one revealed cell. These are the cells the player could potentially dig next.

**No-guess**: The player never needs to reveal a cell without first proving it safe. Equivalently: the logical solver never stalls before a path to the exit is deduced.

---

## Deduction Rules

The solver applies two fundamental rules, iterated to a fixed point:

### Rule 1 — Safe Neighbor Elimination

If a revealed cell's gas count equals the number of its neighbors that are **known gas** (flagged or detonated), then all remaining unrevealed neighbors are **safe**.

```
Example: Cell shows "1", has 1 flagged neighbor and 2 unrevealed neighbors.
→ Both unrevealed neighbors are safe. Reveal them.
```

### Rule 2 — Gas Identification

If a revealed cell's **remaining gas count** (number minus known gas neighbors) equals its count of **unrevealed** neighbors, then all those unrevealed neighbors are **gas**.

```
Example: Cell shows "2", has 0 flagged neighbors and 2 unrevealed neighbors.
→ Both unrevealed neighbors are gas. Flag them.
```

### Optional: Set/Overlap Deduction (Rule 3)

For two revealed cells A and B whose unrevealed neighbor sets overlap:

- Let `Sa` = A's unrevealed neighbors, `gasA` = A's remaining gas count
- Let `Sb` = B's unrevealed neighbors, `gasB` = B's remaining gas count
- If `Sa ⊂ Sb` and `gasA == gasB`, then cells in `Sb \ Sa` are safe
- If `Sa ⊂ Sb` and `gasA == gasB - |Sb \ Sa|` would be negative... (contradiction, skip)

This catches cases like:
```
A says "1 gas in {x, y, z}"
B says "1 gas in {y, z}"
→ x must be safe (the gas B sees accounts for all of A's gas)
```

**Design choice:** Rule 3 makes puzzles harder. It could be gated behind difficulty/level progression:
- Levels 1–12: Rules 1 & 2 only (approachable)
- Levels 13+: Rules 1, 2, & 3 (requires deeper reasoning)

---

## Solver Algorithm

```
function solve(board, revealed, flagged, playerStart, exit):
    // Initialize: reveal the 3×3 around playerStart (matches game behavior)
    // Cascade any zeros as usual

    loop:
        changed = false

        for each revealed cell (r, c) with number > 0:
            unrevealed = unrevealed non-wall neighbors of (r, c)
            knownGas   = flagged/detonated neighbors of (r, c)
            remaining  = cell.adjacent - |knownGas|

            // Rule 1: all gas accounted for → rest are safe
            if remaining == 0 and |unrevealed| > 0:
                for each cell in unrevealed:
                    reveal(cell)   // cascade if adjacent == 0
                    changed = true

            // Rule 2: remaining == unrevealed count → all are gas
            if remaining == |unrevealed| and |unrevealed| > 0:
                for each cell in unrevealed:
                    flag(cell)
                    changed = true

        // Optional Rule 3: overlap deduction
        // (implementation detail — pair numbered cells sharing frontier neighbors)

        if not changed:
            break

    // Check: is the exit reachable through revealed cells?
    return pathExists(playerStart, exit, revealed)
```

The solver runs in `O(iterations × cells × neighbors)`. With max grid size 20×20 and typical convergence in <10 iterations, this is well under 1ms — fine for real-time generation.

---

## Generation Strategy: Generate and Fix

Pure rejection (generate → test → retry) wastes cycles. Instead, we integrate the solver into generation and **fix** ambiguities on the fly.

### Pipeline

```
1. Generate grid normally (walls, gas, gold, items — existing code)
2. Place player, exit, merchant, fountain (existing code)
3. Run ensureSafeStart() (existing code)
4. Run the solver
5. If solver stalls before exit is reachable:
   a. Identify the "stuck frontier" — unrevealed cells adjacent to revealed territory
      that the solver can't resolve
   b. Pick a gas cell from the stuck frontier
   c. Relocate it:
      - Move it to a random non-frontier cell far from the current revealed region
      - Recompute adjacency for affected cells
   d. Go to step 4 (re-run solver from current state, not from scratch)
6. If exit is reachable: board is valid, proceed
7. Safety valve: if >N fix attempts (e.g., 30), regenerate from scratch
```

### Why "relocate" instead of "remove"

Removing gas reduces density and makes the board easier. Relocating preserves the overall gas count and difficulty feel. The relocated gas ends up in unexplored territory where it still creates interesting deduction puzzles — just not unsolvable ones.

### Relocation targeting

When relocating a gas cell, prefer destinations that:
- Are far from the current revealed frontier (Chebyshev distance ≥ 4)
- Are adjacent to other gas cells (creates denser clusters, which paradoxically are easier to deduce — a "5" next to a wall is very informative)
- Are NOT on the exit cell or merchant cell

### When to stop fixing

The solver only needs to find a deducible path to the exit. It does NOT need to make the entire board solvable. Unreachable pockets of ambiguity are fine — the player can choose to explore them (with items) for gold, or skip them. This is important: it means we only fix cells that block progress toward the exit, not every ambiguity on the board.

---

## Impact on Existing Systems

### Items — New Role

| Item | Current Role (guess-based) | New Role (no-guess) |
|------|---------------------------|---------------------|
| Scanner | Survive a 50/50 | Speed up local deduction; safely peek dangerous areas |
| Row/Column/Cross | Survive large unknown areas | Rapid territory expansion; race for gold |
| Pickaxe | Break out of dead ends | Open shortcuts through walls; access gold veins |
| Potion | Recover from bad luck | Recover from misreads or greedy play |

### Difficulty Tuning Levers

1. **Gas density** — Lower density → more zeros → bigger cascades → easier. Current: 20%. Recommended starting point for no-guess: 15–18%.
2. **Wall density** — Walls constrain neighbor sets, making numbers more powerful. Current: 25%. May need slight reduction if solver stalls too often.
3. **Deduction depth** — Rules 1+2 only vs. including Rule 3 (set overlap). Gate by level.
4. **Board size** — Larger boards = more steps to exit = more chances to stall. Already scales 10→20 by level.
5. **Anchor placement** — Pre-revealed safe islands give the player multiple information sources. May want to increase anchor count on harder levels to compensate for deeper deduction requirements.

### Treasure Chamber Biome

Already uses 12% gas density and 15% wall density. Should pass the solver more frequently. No changes needed — run it through the same pipeline.

### Authored Levels

Authored levels bypass procgen entirely. The solver should be available as a **validation tool** in the editor (already has `validateLevel()`), but authored levels can intentionally include unsolvable sections as a design choice. Add an optional "solvability check" button in the editor, don't enforce it.

### Save/Load

No impact. Save payload captures level number and items, not board state. The board is regenerated on resume (via `initLevel()`), which will now use the no-guess pipeline.

---

## Implementation Plan

### Phase 1: Solver (standalone, testable)

Create `src/solver.js`:
- `solve(grid, rows, cols, revealed, flagged, playerStart, exit)` → `{ solved: boolean, revealed, flagged, steps }`
- Pure logic, no DOM, no side effects
- Operates on cloned arrays (doesn't mutate game state)
- Unit-testable with hand-crafted boards

### Phase 2: Solver integration in editor

Add a "Check Solvability" button to `editor.html` that runs the solver against the authored level and highlights unsolvable frontier cells. Useful for testing and for level design.

### Phase 3: Generate-and-fix pipeline

Modify `initLevel()` in `src/gameplay/level.js`:
- After existing generation + placement, run the solver
- If unsolvable, apply the fix-up loop (relocate gas)
- Track metrics: how many fix-ups per level, acceptance rate of raw generation

### Phase 4: Difficulty tuning

- Adjust gas/wall density per level based on solver data
- Gate Rule 3 deduction behind level thresholds
- Playtest and iterate on feel

### Phase 5: Visualization (optional, for debugging)

- Replay mode: step through the solver's deduction sequence visually
- Highlight cells that required Rule 2 vs. Rule 1 (shows "danger zones" where the player needs careful reasoning)
- Heat map of fix-up frequency per cell position (reveals generation bias)

---

## Open Questions

1. **Should the solver account for items?** If the player starts with a scanner, one guess is "free." This could be used as a release valve: allow 1 ambiguity per scanner in inventory. Alternatively, keep the board pure (fully deducible) and let items be pure upside. **Recommendation: keep boards fully deducible.** Cleaner design, items stay optional.

2. **Performance budget.** The solver + fix-up loop runs during level generation. Target: <50ms total. If generation takes multiple retries, lazy-load the next level while the player is in the merchant shop or reading the "Escaped!" overlay.

3. **Difficulty perception.** No-guess boards may feel *harder* because the player now knows every death was avoidable — their mistake, not RNG. This is actually good (skill-based games retain better) but worth noting for playtesting.

4. **Treasure Chamber edge case.** The biome places 25g chests in off-diagonal corners with pre-revealed cells. The solver should treat these as additional information sources (they are — the chest cell's adjacency number is visible). No special handling needed; just make sure the solver includes all pre-revealed cells in its initial state.

5. **Rule 3 complexity.** Set/overlap deduction is `O(frontier² × neighbor_count)` per pass. At 20×20 with ~60 frontier cells, that's ~3600 pairs × 8 = ~29k comparisons per iteration. Still fast enough (<1ms). But the *player* finding these deductions is much harder. Consider adding a subtle visual hint for advanced deductions (e.g., a faint highlight on cells that form deducible groups) — but that's a separate feature.
