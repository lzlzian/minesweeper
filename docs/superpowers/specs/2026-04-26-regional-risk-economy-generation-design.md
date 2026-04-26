# Regional Risk Economy Generation Design

**Date:** 2026-04-26
**Status:** Draft, ready for implementation planning

## Context

The current procedural generator produces a Minesweeper-like board with fixed wall/gas density, then repairs the board until the player has a deducible path from start to exit. That solved the old frustration problem: the player no longer gets trapped by mandatory guesses on the critical path.

It also created a new design problem. If the only true objective is "reach the exit" and that objective is always fully safe for a careful player, then HP, items, merchant power, and optional encounters lose strategic purpose. The player can ignore every risky reward and still succeed at the core objective.

The new direction is to keep the exit path as a trustworthy emergency hatch, but stop treating "reach this level's exit" as the whole run objective. The run should ask the player to stay economically alive and extract value from the mine. The safe path is allowed to be low-yield. The profitable paths should be optional, tempting, and sometimes uncertain.

This design replaces "random board, fixed density, no-guess repair" with "layout first, mines second, validate last."

## Design Thesis

The player promise becomes:

> You can always retreat if you play well, but retreating safely is not enough to build a strong run.

The exit spine remains deducible. Side branches and reward rooms may contain bounded uncertainty. Items, HP, gold, and encounters matter because they let the player convert risk into profit.

The game should not say:

> Guess correctly or your run cannot continue.

It should say:

> You can leave now, or you can spend resources and judgement to extract more value.

## Goals

- Preserve trust in the main path: a deducible route from start to exit should still exist.
- Make side content functionally meaningful by putting most profit and encounter value away from the safe spine.
- Add controlled uncertainty gates that create HP/item pressure without making the whole board feel unfair.
- Replace global gas density as the primary generator target with region-specific board states.
- Prevent zero-cascade bleed so one lucky reveal does not open every branch for free.
- Create enough structure that future encounters can be placed intentionally: vaults, survey stations, shrines, rescue miners, contracts, and alternate exits.
- Keep implementation incremental: first ship one safe spine plus one risk branch, then expand.

## Non-goals

- No full handcrafted level system for this pass.
- No real-time clock or turn timer in this design.
- No removal of the existing solver. The solver becomes a validation tool rather than the whole generator philosophy.
- No hidden mandatory unfairness. Any uncertainty gate on the critical path must be bounded, rare, visible through tuning, and preferably deferred until later levels.
- No full economy overhaul in the first implementation. We will create the generation structure first, then tune costs/rewards after playtesting.

## Player-Facing Model

Each level has three conceptual areas:

### 1. Safe Spine

The route from spawn to exit. It is deducible with the existing solver rules.

Characteristics:
- Lower gold density.
- Few or no item drops.
- May contain the merchant or fountain if those spawned.
- Should teach the player that the level is fair and retreat is available.
- Does not need to reveal the whole board.

### 2. Risk Branches

Optional paths connected to the spine through chokepoints. These lead to more gold, encounters, side objectives, or vault entrances.

Characteristics:
- Higher expected reward than the spine.
- May contain 0-2 bounded uncertainty gates.
- Designed so items can resolve or reduce the risk.
- Uses walls and numbered airlocks to prevent cascade bleed.
- Can be skipped without failing the level.

### 3. High-Value Rooms

Compact reward spaces: vaults, treasure rooms, relic rooms, rescue rooms, shrines, survey stations, or alternate exits.

Characteristics:
- Visible or previewed reward.
- Higher risk or resource cost.
- Often behind a gate: wall, lock, unstable corridor, gas ambiguity, gold cost, item cost.
- May offer reward types other than raw item inflation: gold, information, coupons, contracts, relics, discounts, or HP/gold/item conversions.

## Why Gold Economy Works Here

Gold becomes the run-level pressure. If the safe spine gives too little gold to sustain the run, the player eventually needs side content.

Possible long-term economy hooks:
- Descent fee every level or every N levels.
- Elevator repair cost.
- Debt pressure every 3 levels.
- Optional deeper descent costs.
- Contracts that pay out only if side objectives are completed.
- Expensive but powerful merchant inventory.

This design does not require shipping all of those now. The generator just needs to make it possible for safe play and profitable play to be meaningfully different.

## Current Generator Problem

The current generator begins with:

1. Wall density.
2. Gas density.
3. Gold veins.
4. Item drops.
5. Solver repair until the exit is deducible.

That flow is backward for the new goal. If global gas density is fixed and the solver only cares about the exit, then non-spine terrain becomes incidental. Side content has no authored risk/reward shape.

The new generator should begin with an intended region graph:

```text
start -> spine segment -> spine segment -> exit
                  |
                  +-> risk branch -> vault
                  |
                  +-> shrine branch
```

Then it fills each region to match its desired gameplay.

## New Generator Architecture

### Phase 1: Region Layout

Generate a coarse region graph before placing gas:

- `spine`: start-to-exit path.
- `branch`: optional corridor or room connected to spine.
- `vault`: compact high-value room.
- `encounter`: shrine, survey station, rescue miner, fountain variant, etc.
- `buffer`: wall or numbered airlock region that blocks unwanted cascade connections.

Each cell gets an internal generation label:

```js
cell.regionId = 'spine_0';
cell.regionKind = 'spine' | 'branch' | 'vault' | 'buffer';
cell.genTag = null | 'airlock' | 'gate' | 'reward' | 'encounter';
```

These fields are generation-only. They do not need to be saved or rendered unless we add debug visualization.

### Phase 2: Walls And Connectivity

Carve the board as a small mine dungeon:

- Create a start room.
- Carve a spine corridor/room sequence to the exit.
- Carve 1-3 branch entrances off the spine.
- Carve optional branch rooms or vault rooms.
- Fill non-carved space with walls or sealed rock.

Important constraints:

- Every branch connects to the spine through a narrow doorway or short corridor.
- Each branch has exactly one initial entrance in the first version.
- Vault rooms can be reachable only through branch cells, not directly from spine.
- Avoid large open spaces that allow zero cascades to merge regions.

### Phase 3: Airlocks

An airlock is a boundary between two regions that prevents accidental zero-cascade reveal.

A simple airlock can be:

```text
spine floor -> numbered doorway -> branch floor
```

Generation rules:

- Airlock doorway cells must have `adjacent > 0`.
- No adjacency-0 cell in region A may touch an unrevealed adjacency-0 cell in region B.
- Prefer one-tile-wide entrances.
- Surround side rooms with walls except for the intended doorway.
- If an airlock becomes zero after gas placement or solver fixup, reject or repair the layout.

This is central. Without airlocks, one reveal can cascade through the spine into a branch and make all optional risk disappear.

### Phase 4: Region-Specific Gas Placement

Do not begin with a global gas count. Instead, each region asks for behavior:

| Region kind | Gas target | Solvability target | Reward target |
|---|---:|---|---|
| Safe spine | As needed | Fully deducible | Low |
| Low-risk branch | Low-medium | Fully deducible or 0-1 gate | Medium |
| Risk branch | Medium | 1-2 uncertainty gates | High |
| Vault | Pattern-based | 1 gate or resource lock | Very high |
| Encounter room | Low | Reachable, usually safe | Non-gold reward |

The final gas count is an output of the generator. We can still cap it with a soft min/max by level bracket, but it should not drive the board.

### Phase 5: Pattern-Based Uncertainty Gates

An uncertainty gate is a small local pattern that is intentionally not fully resolved by basic solver rules.

Examples:

#### Two-cell 50/50

One revealed number observes two unrevealed cells with one gas among them. One safe cell leads onward, one gas costs HP.

Use sparingly. Best for side branches.

#### Three-cell 1-of-3

A number sees three frontier cells with one gas. This creates risk but lower immediate hit chance than a 50/50.

Good for early risk branches.

#### Tool-resolvable gate

The ambiguity can be resolved by:
- scanner revealing/detonating safely,
- row/column/cross scan exposing more context,
- pickaxe opening a second angle,
- survey station clue,
- paying gold at an encounter,
- accepting HP damage as a shortcut.

This is the ideal gate type. The player feels powerful when using resources.

### Phase 6: Rewards After Gates

Rewards should sit behind or near risk gates so the player understands the offer.

Reward categories:

- Gold: safest reward type; still filtered through economy.
- Information: reveal local clue, mark safe cell, count gas in a room.
- Conversion: HP to gold, gold to item, item to relic, item to shortcut.
- Coupons: cheaper merchant slot, cheaper reroll, free next fountain, vault key.
- Relics/cosmetics: retention without power creep.
- Items: rare, preferably chosen or conditional, not frequent random freebies.

The first implementation can use gold only. The generator structure should leave room for richer rewards later.

## Solver And Validation Model

The solver should become a set of validators:

### Spine Validator

Required:
- Starting from the normal initial reveal state, the exit becomes reachable by deduction.
- The validator may ignore optional branches.
- If a branch accidentally makes the spine easier, that is acceptable.
- If the spine requires a guess, reject or repair unless the level bracket explicitly allows a critical-path gate.

### Branch Validator

For each branch:
- Confirm the entrance is reachable from the spine.
- Estimate how many uncertainty gates exist before the reward.
- Confirm the branch does not cascade open from the spine reveal.
- Confirm rewards are behind at least some exploration cost.

The first version can use a simpler test:
- Clone revealed state after solving the spine.
- Reveal the branch entrance.
- Run solver inside branch.
- If solver reaches the reward, branch has 0 gates.
- If solver stalls, count one gate, simulate resolving it, continue up to limit.

### Cascade Isolation Validator

Required:
- Reveal all spine cells that the spine solver would reveal.
- Confirm high-value branch reward cells are not revealed.
- Confirm branch interior cells are not mostly revealed for free.
- Confirm airlock cells have `adjacent > 0`.

Possible acceptance rule:

```text
No more than 20% of a branch's non-airlock cells may be revealed during spine solve.
No vault reward cell may be revealed during spine solve.
```

### Economy Validator

Track expected gold by region:

- Safe spine gold.
- Branch gold.
- Vault gold.
- Encounter reward value.

Initial target, subject to tuning:

| Level bracket | Safe spine value | Optional value | Notes |
|---|---:|---:|---|
| 1-4 | 60-80% of total | 20-40% | Teach greed gently |
| 5-8 | 40-60% | 40-60% | Side content starts mattering |
| 9+ | 25-45% | 55-75% | Economy pressure lives off-spine |

The exact numbers depend on descent fees and merchant tuning. The important part is that safe play should not be equally profitable.

## Difficulty Progression

### Levels 1-4

- Safe spine fully deducible.
- Branches mostly deducible.
- 0 forced uncertainty gates.
- Optional branch gate chance low.
- Rewards teach the pattern: "side paths are where profit lives."

### Levels 5-8

- Safe spine fully deducible.
- 1-2 branches.
- Some branches have 1 bounded gate.
- Items become useful but not mandatory.
- Gold economy starts nudging players off the spine.

### Levels 9-12

- Safe spine fully deducible.
- Branches can have 1-2 gates.
- Vault rooms can appear.
- Some branch rewards should be visible before commitment.
- Merchant/fountain placement should sometimes be off-spine but reachable.

### Levels 13+

- Rulesets can alter region recipe.
- Treasure chamber can become a high-reward low-merchant variant.
- New biomes can change branch types instead of only density.
- Critical-path uncertainty may be tested later, but should not be part of the first implementation of this generator.

## Encounter Placement

Encounters should be placed by region purpose, not random cell scatter.

### Merchant

Possible options:

1. Keep merchant on or near the spine so it remains accessible.
2. Put merchant in a low-risk branch and make reaching them a choice.
3. Add a "merchant camp" room as a known branch type.

First implementation should keep merchant spine-adjacent to avoid too many variables.

### Fountain

Fountains become more interesting off-spine:

- A fountain in a branch is a lure.
- A fountain after a risk gate can refund HP if reached.
- A cursed fountain can become a conversion encounter later.

First implementation can place fountains on safe spine or low-risk branches only.

### Vault

Vaults are the best first new side objective.

Properties:
- Visible reward preview: gold icons, chest icon, locked door.
- Requires risk gate, pickaxe, key, or gold payment.
- Should never be solved/revealed by the spine cascade.

### Survey Station

Great second encounter:

- Reveals a clue about a branch or vault.
- Costs gold or consumes use.
- Lets gold become safety.

## Implementation Plan

### Milestone 1: Debug Region Generator

Goal: create a board with labeled regions but simple contents.

Work:
- Add generation-only region labels.
- Generate spine and one branch with walls.
- Add debug renderer toggle or console dump for region labels.
- Keep current gas/gold placement initially.

Success:
- The board visibly has a spine and an isolated branch.
- Start and exit are connected.
- Branch connects through one entrance.

### Milestone 2: Spine Validation

Goal: preserve the current no-guess trust.

Work:
- Adapt existing solver validation to run against the spine target.
- Reject boards where exit is not deducible.
- Track which cells were revealed by spine solving.

Success:
- Exit remains deducible.
- Optional branch cells are not required.

### Milestone 3: Cascade Isolation

Goal: stop side branches from opening for free.

Work:
- Add airlock checks.
- Reject branches where spine solve reveals too much of the branch.
- Force entrance cells to be numbered.

Success:
- Revealing the spine does not reveal the branch reward.
- Branches remain optional and unrevealed until entered.

### Milestone 4: One Risk Branch

Goal: create one optional side branch with a known reward and optional uncertainty.

Work:
- Place a branch reward: gold cluster or chest.
- Add a simple 0-or-1 gate recipe by level bracket.
- Give branch more gold than equivalent spine segment.
- Keep branch gate optional, not on exit path.

Success:
- Player can exit without branch.
- Branch is tempting.
- Items help with branch risk.

### Milestone 5: Economy Pressure

Goal: make safe play insufficient long-term.

Work:
- Add or prototype a descent/elevator cost.
- Reduce spine gold relative to branch gold.
- Track average gold collected by region in debug logs.

Success:
- Safe-only play survives level-to-level but falls behind.
- Greedy play earns more but spends HP/items.

### Milestone 6: Encounter Expansion

Goal: add variety after the generator proves itself.

Work:
- Add vault room.
- Add survey station.
- Add shrine conversion.
- Add rescue miner or contract.

Success:
- Encounters are placed in appropriate regions.
- Rewards do not collapse into free item inflation.

## Data Structures

Possible generation model:

```js
const levelRecipe = {
  spineSegments: 4,
  branches: [
    { kind: 'gold_branch', riskGates: 0, rewardBudget: 50 },
    { kind: 'vault', riskGates: 1, rewardBudget: 120 },
  ],
  safeSpineGoldBudget: 60,
  optionalGoldBudget: 140,
};
```

Each generated region:

```js
const region = {
  id: 'branch_1',
  kind: 'branch',
  cells: [{ r, c }],
  entrance: { r, c },
  rewardCells: [{ r, c }],
  targetRiskGates: 1,
  actualRiskGates: 0,
};
```

The board can keep region metadata outside cells to avoid polluting runtime state:

```js
const genMeta = {
  regions: [],
  regionByCell: Map, // key "r,c" -> region id
  spineCells: Set,
  branchCells: Set,
};
```

## Gas And Number Recipes

We need two classes of placement:

### Organic Fill

Used for spine and regular branch terrain. Place gas so numbers create interesting deduction without over-opening.

Approach:
- Start with low gas.
- Add gas around frontier cells to create numbered boundaries.
- Run solver.
- Reject if too easy or too blocked.

### Pattern Stamp

Used for gates and vaults. Stamp known local patterns that produce controlled uncertainty.

Approach:
- Reserve a small cell patch.
- Place gas/walls/reward according to pattern.
- Recompute adjacency.
- Validate local behavior.

Pattern stamps are less elegant than pure procedural generation, but much easier to tune.

## Handling Cascades

Cascade control is the most important technical constraint.

Rules of thumb:

- Zero cells are dangerous near region boundaries.
- Every doorway should be adjacent to at least one gas.
- Reward rooms should not contain a zero connected to the entrance unless free reveal is intentional.
- Wall buffers should separate vaults from spine.
- After any gas relocation or pattern stamp, recompute adjacency and rerun isolation checks.

Validator pseudocode:

```js
const spineResult = solveToExit(grid, initialRevealed, initialFlagged);
for (const branch of branches) {
  const revealedCount = branch.cells.filter(cell => spineResult.revealed[cell.r][cell.c]).length;
  if (revealedCount / branch.cells.length > 0.2) reject('branch cascade leak');
  for (const reward of branch.rewardCells) {
    if (spineResult.revealed[reward.r][reward.c]) reject('reward revealed for free');
  }
  if (grid[branch.entrance.r][branch.entrance.c].adjacent === 0) reject('zero airlock');
}
```

## Tuning Knobs

Generator knobs:

- Branch count per level.
- Branch length.
- Branch room size.
- Vault chance.
- Gate count.
- Gate type weights.
- Airlock strictness.
- Spine gold budget.
- Branch gold budget.
- Encounter reward budget.
- Merchant placement region.
- Fountain placement region.

Economy knobs:

- Descent fee.
- Merchant spawn chance and pity.
- Merchant prices.
- Reroll curve.
- Free item drop rate.
- Gold rewards behind gates.
- HP fountain frequency.

Risk knobs:

- Gate frequency.
- Gate severity: 50/50 vs 1-of-3 vs tool-resolvable.
- HP damage.
- Potion availability.
- Scanner availability.
- Pickaxe utility.

## Debug Metrics

Add logs while iterating:

```text
[regional-gen] level=7 size=16 regions=spine:42 branch:18 vault:9
[regional-gen] spineGold=54 optionalGold=132 gates=1 branchLeak=0.08
[regional-gen] spineSolved=true branchSolved=false airlocks=ok attempts=12
```

Metrics to record:

- Generation attempts per accepted level.
- Spine solver steps.
- Branch leak percent.
- Safe-spine gold.
- Optional gold.
- Number of gates.
- Number of branch rewards revealed for free.
- Gas count by region.
- Player collected gold by region, later if tracking is added.

## Testing Plan

### Smoke Tests

Add pure tests for:

- Region graph creates start-to-exit connectivity.
- Branch has exactly one entrance.
- Airlock cells are non-zero.
- Spine solver reaches exit.
- Spine solve does not reveal branch reward.
- Vault reward is not on spawn/exit/merchant/fountain.
- Gas count is preserved after any repair pass, if repair remains.

### Browser Verification

Use the in-browser smoke page and manual play:

1. Start a run. Confirm the exit path remains deducible.
2. Reveal spine. Confirm branch remains unrevealed.
3. Enter branch. Confirm reward feels visible and tempting.
4. Use scanner/pickaxe on branch gate. Confirm item has real purpose.
5. Skip branch. Confirm the level can still be exited.
6. Play several levels. Confirm safe-only play earns less gold.

### Playtest Questions

- Do players notice that side paths are where profit lives?
- Do players feel the exit path is still fair?
- Do branch risks feel like choices or punishments?
- Are items used to extract value, not only as panic buttons?
- Does the economy pressure feel strategic rather than stressful?
- Are zero cascades accidentally revealing too much?

## Risks

### Risk: The Generator Becomes Too Complex

Mitigation:
- Implement one spine plus one branch first.
- Use simple rectangular/corridor regions before fancy cave shapes.
- Add debug region visualization.

### Risk: Optional Risk Still Feels Ignorable

Mitigation:
- Shift gold budget off-spine.
- Add descent/economy pressure.
- Make branch rewards visible.

### Risk: Optional Risk Feels Like Cheap Guessing

Mitigation:
- Use bounded, tool-resolvable gates.
- Introduce gates gradually.
- Keep critical path deducible.
- Make rewards clear before risk.

### Risk: Cascades Break Everything

Mitigation:
- Airlocks are mandatory.
- Add branch leak tests.
- Reject zero doorway cells.
- Use wall buffers around vaults.

### Risk: Items Become Required Too Often

Mitigation:
- Keep early branch gates optional.
- Allow HP or gold alternatives.
- Make some branches fully deducible but longer/lower reward.

## Open Questions

- Should the first economy pressure be a descent fee, a periodic debt, or just merchant/reward tuning?
- Should critical-path uncertainty ever happen, or should the spine always stay fully deducible forever?
- Should branch gates be explicitly telegraphed in UI, or should the board state communicate them naturally?
- Should safe-spine gold be calculated by region budget or by normal gold veins with region multipliers?
- Should region labels be available in the editor eventually?

## Recommended First Ship

Ship the smallest version that tests the core thesis:

1. Generate a deducible safe spine to the exit.
2. Generate one isolated side branch.
3. Put a visible gold chest behind the branch.
4. Ensure the branch does not cascade open from the spine.
5. Give the branch either:
   - no gate on early levels,
   - one tool-resolvable gate on later levels.
6. Move more gold into the branch than onto the spine.
7. Add debug logs for region gold and cascade leak.

Do not add five encounter types at once. The first playtest question is more fundamental:

> Does a safe exit plus profitable risky branch make items, HP, and gold feel meaningful?

If yes, expand encounters. If no, tune economy pressure before adding content.

