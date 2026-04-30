# Biome System Design

Date: 2026-04-29

## Summary

Add a biome system that turns the procedural run into a sequence of longer acts. Each biome controls level-generation flavor, branch identities, economy pressure, NPC weights, artifact/curses availability, visual theme, and eventually special cells or local rules.

The purpose is not to reskin the same level every few floors. The purpose is to give the run a long arc where the player learns one environment, exploits it, then faces a new environment with different risk/reward logic.

Long-term target:

- 5-10 biomes.
- 10-20 levels per biome.
- 100-200 level full-run potential.
- The old level 30 win can become a shorter-run milestone later. The mainline run can continue past it.

## Goals

- Create long-run variety without destabilizing the current core loop.
- Give future systems a home: contracts, branch identities, curses, risk artifacts, bank/debt mechanics, special cells, and new NPCs.
- Let each biome change map feel, branch composition, gold economy, and optional risk.
- Keep Minesweeper deduction readable. New rules should be introduced slowly.
- Support save/resume and future seeded runs cleanly.
- Make level bands feel authored even though boards remain procedural.

## Non-Goals

- Do not rewrite the whole generator in one pass.
- Do not make every biome change the core Minesweeper number rules immediately.
- Do not require visual/audio polish in the first implementation.
- Do not jump directly to 100+ level balance before the biome framework proves itself.
- Do not make biomes purely cosmetic.

## Design Principle

Biome mechanics should answer one of these questions:

- What kind of branches does this biome tempt the player with?
- What kind of risk does this biome make more common?
- What kind of reward does this biome make more common?
- What deduction pattern does this biome emphasize?
- What economy pressure does this biome create?
- What new decision does the player make here?

If a biome only changes color, it is not enough.

If a biome changes too many rules at once, it is too much.

## Biome Cadence

Biomes should last 10-20 levels. A shorter cadence makes the game feel scattered because players barely understand the new rules before the next change. A longer cadence gives each biome a proper arc.

Recommended initial cadence:

- 15 levels per biome.

Why 15:

- Long enough for learning, mastery, and pressure.
- Short enough that a new environment appears regularly.
- Works well with payment checkpoints every 3 levels.
- Gives 5 payment checkpoints per biome.

Alternate cadences:

- 10 levels: better for a shorter arcade run.
- 20 levels: better for a more epic run, but each biome needs more internal variety.

## Biome Internal Arc

Each biome should have three phases:

1. Introduction.
   - Levels 1-3 of the biome.
   - Present the biome's layout/reward flavor softly.
   - Avoid stacking harsh contracts, curses, or special cells immediately.

2. Mix.
   - Middle levels.
   - Combine the biome's main identity with normal branch variety.
   - Let artifacts and contracts interact with the biome.

3. Pressure.
   - Final levels of the biome.
   - Increase the biome's signature risk.
   - Offer a high-value branch or contract before the next biome.
   - Optional: biome checkpoint/boss/payment beat.

Example for a 15-level biome:

- Levels 1-3: teach.
- Levels 4-10: mix.
- Levels 11-15: pressure.

## Proposed Biome List

This list is a design target, not all first-pass scope.

### Coal Shafts

Role: baseline biome.

Approximate band:

- Levels 1-15 in the long-run plan.
- Current baseline content starts here and currently covers levels 1-15.

Identity:

- Core Minesweeper rules.
- Regional spine and side branches.
- Basic gold, merchant, fountain, joker, item branches.
- Payments are introduced.

Primary purpose:

- Teach the run structure.
- Keep early decisions readable.
- Establish branch temptation and payment pressure.

Possible knobs:

- Normal gas.
- Normal gold.
- Normal merchant/fountain/joker rates.
- Mostly simple branch identities.

### Fungal Caves

Role: sustain and recovery biome.

Identity:

- More life-support and weird growth.
- Slightly more fountains or healing alternatives.
- Branches may be broader and more organic.
- Gold can be spread out rather than concentrated.

Possible mechanics:

- Spore cells that reveal a small safe pocket.
- Fungal growth branches with low gas but winding routes.
- Fountain branches more likely, but payments begin climbing.

Design risk:

- Too much healing can flatten danger. Healing should create confidence to take optional risk, not remove risk.

### Crystal Veins

Role: information and greed biome.

Current first-pass band:

- Levels 16-30.
- Endless Deep now starts at level 31.

Identity:

- High gold visibility.
- Chests and crystal rewards.
- More risk artifacts.
- Information cells that help deduction or reveal constrained clues.

Current first-pass implementation:

- Crystal clue cells can appear in side branches.
- Revealing a crystal clue reveals one adjacent safe numbered cell.
- Crystal branches bias value into optional/chest rewards instead of spine gold.
- Branch gas pressure is slightly higher, while fountain odds are slightly lower.

Possible mechanics:

- Crystal cells reveal one adjacent safe hidden cell.
- Survey rooms more common.
- Chest-heavy gold branches.
- Curses that trade information for economy pressure.

Design risk:

- Free information can trivialize no-guess logic. Crystal effects should be limited and visible.

### Company Dig Site

Role: economy and contracts biome.

Identity:

- Bank/debt theme begins to matter mechanically.
- Contracts appear more often.
- Merchants and bank NPCs become central.
- Payments feel more antagonistic.

Possible mechanics:

- Contract office branches.
- Loan offers.
- Merchant stock manipulation.
- Higher payment multiplier but more ways to earn.
- Curses framed as predatory financing.

Design risk:

- Economy UI can become confusing. The player needs clear future payment visibility and clear contract terms.

### Flooded Works

Role: pathing and constrained movement biome.

Identity:

- Wider maps with flooded pockets.
- Safe-but-awkward terrain.
- Branch entry and exit shape matters more.

Possible mechanics:

- Water cells are safe but affect reveal or movement rules.
- Flooded branch rooms have fewer gas cells but more dead space.
- Some contracts require exploring flooded branches.

Design risk:

- Movement friction can become annoying. Water should change decisions, not slow every click.

### Volcanic Depths

Role: hazard pressure biome.

Identity:

- Higher gas pressure.
- Chokepoints.
- Stronger rewards for accepting danger.
- Hazard Pay-style mechanics shine.

Possible mechanics:

- Scorched cells from triggered gas.
- Hot vents as special cells.
- Dense pockets behind numbered chokepoints.
- High-value vault branches.

Design risk:

- Too much unavoidable damage breaks fairness. No-guess spine guarantees still matter.

### Ancient Vault

Role: late-game culmination biome.

Identity:

- Strong rewards and strange branch rooms.
- Rare artifacts.
- High payment pressure.
- More authored-feeling layouts.

Possible mechanics:

- Guaranteed vault branch.
- More Joker choice moments.
- Final checkpoint rooms.
- Strong curses with dramatic upside.

Design risk:

- Late game should be tense, not random. Avoid making the final biome a bag of disconnected gimmicks.

### Endless Deep

Role: post-designed-run mode.

Current first-pass band:

- Level 31+.
- Mechanically mostly baseline until the designed biomes ahead of it are filled in.

Identity:

- Uses all prior biome content.
- Cycles or mixes biome rules.
- Payments and generation scale slowly.
- Leaderboard tracks deepest level.

Possible mechanics:

- Biome remix every 10-20 levels.
- Mutator stacking.
- Optional cash-out after each biome band.

Design risk:

- Infinite scaling can become degenerate. It is acceptable if endless eventually breaks, but it should not break immediately.

## Biome Registry

Add a `src/gameplay/biomes.js` module with a registry.

Example shape:

```js
export const BIOMES = [
  {
    id: 'coal_shafts',
    name: 'Coal Shafts',
    levelStart: 1,
    levelEnd: 15,
    generation: {
      gasMultiplier: 1.0,
      goldMultiplier: 1.0,
      branchCapacityBonus: 0,
      branchRecipes: {
        gold: ['cache', 'small_vault'],
        merchant: ['market_nook'],
        fountain: ['clinic'],
        joker: ['joker_den'],
        item: ['supply_cache'],
      },
      spineShapes: {
        corner: 1,
        zigzag: 1,
        edgeCrawl: 1,
      },
    },
    features: {
      merchantChance: 0.33,
      fountainChance: 0.50,
      jokerChance: 0.33,
    },
    economy: {
      paymentMultiplier: 1.0,
      optionalGoldMultiplier: 1.0,
      chestGoldMultiplier: 1.0,
    },
    artifacts: {
      riskWeight: 1.0,
      utilityWeight: 1.0,
    },
    contracts: {
      chance: 0.0,
      pool: [],
    },
    theme: {
      className: 'biome-coal-shafts',
    },
  },
];

export function biomeForLevel(level) {
  return BIOMES.find(b => level >= b.levelStart && level <= b.levelEnd) ?? BIOMES[BIOMES.length - 1];
}
```

The exact names can change. The key idea is that level initialization should ask for a biome once and pass it through the systems that need it.

## State Integration

State should track the active biome id.

Potential state additions:

```js
biomeId: null,
```

Accessors:

```js
getBiomeId()
setBiomeId(id)
```

Save payload:

- Include `biomeId`.
- Current level snapshots already preserve board state.
- On fresh level generation, derive biome from level.
- On resume, restore the saved level snapshot and biome id.

Important:

- Saved level snapshots should prevent rerolling biome-specific generation.
- Seeded runs later need biome selection to be deterministic from seed plus level.

## Level Lifecycle Integration

In `initLevel()`:

1. Determine biome:
   - `const biome = biomeForLevel(getLevel())`.
   - Set `state.biomeId`.

2. Apply biome preparation:
   - Replace or supplement current `ruleset.prepare`.
   - Use biome knobs to set generation config.

3. Generate:
   - Pass biome into `generateRegionalGrid`.
   - Use biome feature weights for merchant/fountain/joker/contracts.
   - Use biome branch recipe pools.

4. Apply level-start effects:
   - Existing artifact start effects.
   - Biome-specific start effects, if any.

5. Render:
   - Add body or board CSS class for biome.
   - Update HUD with biome name if desired.

In `resumeGame(save)`:

- If `save.levelState` exists, restore it.
- Restore `biomeId`.
- Apply visual theme from saved biome id.
- Do not regenerate.

## Generator Integration

The current generator already has useful concepts:

- Spine.
- Branch regions.
- Feature branches.
- Gold branch.
- Protected cells.
- Branch interiors.
- Branch hierarchy under pressure.

Biomes should initially adjust these rather than replace them.

Possible generation knobs:

```js
{
  gasMultiplier,
  optionalGoldMultiplier,
  featureGoldMultiplier,
  branchCapacityBonus,
  minBranchSizeMultiplier,
  maxBranchSizeMultiplier,
  branchInteriorRecipeWeights,
  spineShapeWeights,
  branchEntranceStyleWeights,
  roomWallIslandMultiplier,
  numberedChokepointChance,
}
```

Initial implementation should only add a small set of knobs:

- Feature spawn rates.
- Gold budget multiplier.
- Gas pressure multiplier.
- Branch recipe weights.
- Theme id.

Avoid adding 20 knobs before the first biome has proven the model.

## Branch Identities

Branch identities are probably the first system that should plug into biomes.

A branch identity is a recipe applied to a branch region. It controls:

- Preferred size.
- Internal walls.
- Gas pocket style.
- Reward placement.
- Chokepoints.
- Whether the branch is meant to be safe, risky, greedy, or informational.

Proposed branch identities:

### Cache

- Small to medium.
- Item or small chest reward.
- Low to medium gas.
- Simple room shape.

### Vault

- Medium to large.
- Chest-heavy.
- More numbered chokepoints.
- Higher gas near reward.

### Clinic

- Fountain branch.
- Safer entry.
- Risk can sit near optional side gold.

### Market

- Merchant branch.
- Safe entrance and readable approach.
- May include small gold temptation nearby.

### Joker Den

- Joker branch.
- Weird shape.
- Medium risk.
- May have one extra reward decoy.

### Survey Room

- Information reward.
- More numbered cells.
- Lower gold.
- Useful for contracts or future special cells.

### Contract Office

- Contains contract NPC/object.
- Usually safe enough to enter.
- Contract target may point elsewhere.

### Shrine

- Offers curse/risk artifact.
- Should be optional and clearly marked.

Biomes choose branch identities by weights.

Example:

- Coal Shafts: cache, market, clinic, small vault.
- Crystal Veins: vault, survey room, shrine.
- Company Dig Site: contract office, market, vault.
- Volcanic Depths: vault, hazard room, shrine.

## Contracts

Contracts are optional level or branch objectives.

Contracts should be introduced in a specific biome, probably Company Dig Site.

Contract examples:

- Clear the level without triggering gas.
- Collect all chests.
- Mark at least N gas correctly.
- Visit the vault branch before exiting.
- Exit with full HP.
- Finish with no item use.
- Pay an upfront fee for a larger end-level payout.

Contract design rules:

- A contract must have clear terms before accepting.
- The player should be able to inspect accepted contracts.
- Payout timing should be clear.
- Failure should not feel like a hidden gotcha.
- Contracts should not require perfect knowledge of unrevealed branches unless that is explicitly the challenge.

Possible state:

```js
contracts: [
  {
    id,
    status: 'offered' | 'accepted' | 'completed' | 'failed',
    levelAccepted,
    levelExpires,
    payout,
    penalty,
    progress,
  },
]
```

First pass can avoid persistent multi-level contracts and only use current-level contracts.

## Curses and Risk Artifacts

Curses and risk artifacts are run-shaping choices with upside and downside.

They can appear from:

- Joker.
- Shrine branch.
- Bank/loan NPC.
- Contract rewards.
- Deep biome rewards.

Examples:

- More chest gold, payments increase.
- Merchant discounts, rerolls cost more.
- Extra artifact choice, branch gas increases.
- Safer spine, more dangerous branches.
- More gold this biome, interest due next biome.
- Free debt cushion, but final payments rise.

Design rules:

- Show both upside and downside in the artifact modal.
- Avoid hidden costs.
- Prefer costs that create decisions, not pure punishment.
- Do not let curses permanently soft-lock a run without warning.

Biome relation:

- Crystal Veins can introduce tempting risk artifacts.
- Company Dig Site can introduce debt curses.
- Volcanic Depths can introduce hazard-based risk artifacts.
- Ancient Vault can offer powerful late-game curses.

## Bank and Debt Theme

The bank/debt theme should become more than flavor.

Possible systems:

- Loans.
- Interest.
- Contract underwriting.
- Debt forgiveness artifacts.
- Payment collectors.
- Bank branch rooms.
- Buy-now-pay-later merchant offers.
- Final payoff screen.

The bank works best if it connects systems:

- Payments are the baseline pressure.
- Contracts are legalistic opportunities.
- Curses are predatory bargains.
- Merchants and banks can overlap.
- Debt can save a run now and threaten it later.

Possible first mechanic:

- Bank NPC offers a loan.
- Gain X gold now.
- Add Y to the next checkpoint payment.
- Loan offer appears in Company Dig Site.

## Special Cells and Local Rules

Special cells should be introduced slowly.

First pass should focus on generation and economy changes. Later biomes can add one special cell each.

Possible cells:

### Crystal Cell

- Safe.
- On reveal, reveals one adjacent safe hidden cell or one adjacent number.
- Appears in Crystal Veins.

### Water Cell

- Safe.
- Could reveal connected water but not adjacent land.
- Appears in Flooded Works.

### Vent Cell

- Safe or hazard-adjacent.
- Counts nearby gas differently or signals dense gas pockets.
- Appears in Volcanic Depths.

### Bank Marker

- Safe.
- Indicates contract or debt branch.
- Appears in Company Dig Site.

Rule of thumb:

- One new cell per biome is enough.
- The cell should be visible and learnable.
- Avoid making number interpretation inconsistent unless the UI strongly signals it.

## Economy Integration

Biomes can adjust economy without changing payment cadence immediately.

Potential knobs:

- Payment multiplier.
- Optional gold multiplier.
- Chest gold multiplier.
- Merchant price multiplier.
- Contract payout multiplier.
- Loan offer size.
- Artifact reward weighting.

Payment cadence can remain every 3 levels.

If biome length is 15 levels, each biome contains 5 payment checkpoints. That creates a natural rhythm:

- Early biome payment: manageable.
- Mid biome payment: pressure begins.
- Final biome payment: transition gate.

Future idea:

- Biome-clear payment can be special, larger, or themed.
- Clearing a biome can offer a cash-out or deeper descent choice.

## UI and Feedback

Minimum first pass:

- Show biome name in HUD or level intro.
- Apply a body class for theme styling.
- Mention biome in level-start overlay: "Preparing Coal Shafts".

Later:

- Biome transition overlay.
- Small biome rule card.
- Contract panel.
- Debt/payment panel.
- Biome icon on leaderboard/run summary.

Avoid long tutorial text in the main UI. Use compact, contextual modals only when a mechanic first appears.

## Visual Theme

Visual theme can start simple:

- Body class.
- Board background.
- Cell color tweaks.
- Branch/NPC icon tinting, if useful.

Do not let visuals reduce readability of numbers, flags, gas, or gold.

Potential CSS hook:

```js
document.body.dataset.biome = biome.id;
```

Or:

```js
document.body.classList.add(`biome-${biome.id}`);
```

Need cleanup when changing levels.

## Seeded Runs Compatibility

Seeded runs should eventually make:

- Biome sequence deterministic.
- Level generation deterministic.
- Merchant stock deterministic.
- Artifact choices deterministic.
- Contract offers deterministic.

Biome design should avoid hidden calls to `Math.random()` scattered across unrelated modules. Long-term, generation should use a seeded RNG object passed through the systems that need randomness.

First pass does not need seeded RNG, but biome APIs should be designed so an RNG can be threaded through later.

## Endless Mode Compatibility

Endless mode can begin after the designed biome sequence.

Options:

1. Cycle biomes with increased scaling.
2. Randomly remix previous biomes.
3. Use a special Endless Deep biome that pulls recipes from all prior biomes.

Recommended:

- Use Endless Deep as a meta-biome.
- It chooses sub-biome modifiers every 10-20 levels.
- It scales payments and rewards slowly.
- It allows leaderboard comparison by deepest level.

## Save Compatibility

Current run saves include generated level snapshots. That is good for biomes.

Need to include:

- `biomeId`.
- Any active contracts.
- Any curse/debt state.
- Any biome-specific level state.

For old saves:

- If no `biomeId`, derive from level.
- If no `contracts`, default to empty.
- If no `debt`, default to empty/zero.

Do not regenerate a saved active level just to apply a new biome id. Restored board state should remain authoritative.

## Implementation Plan

### Phase 1: Framework Only

Goal:

- Add biome registry and active biome id without major gameplay changes.

Tasks:

1. Add `src/gameplay/biomes.js`.
2. Add `biomeForLevel(level)`.
3. Add `biomeId` to state and save payload.
4. In `initLevel`, select biome and apply a body/theme class.
5. Show biome name in generation overlay or HUD.
6. Add smoke tests for level-to-biome mapping and save/load.

Acceptance:

- Existing gameplay remains essentially unchanged.
- Smoke tests pass.
- Saved games restore with the correct biome id.

### Phase 2: Biome Knobs

Goal:

- Let biomes affect generation/economy through small safe knobs.

Tasks:

1. Pass biome config into level generation.
2. Add gold multiplier support.
3. Add feature spawn-rate support.
4. Add simple branch recipe weighting, if low-risk.
5. Keep core Minesweeper rules unchanged.

Acceptance:

- Coal Shafts matches current feel.
- One test biome can make visible, measurable changes.
- No-guess guarantees still pass.

### Phase 3: Branch Identities

Goal:

- Make branches feel distinct and biome-driven.

Tasks:

1. Define branch identity recipes.
2. Assign identities during regional branch planning.
3. Implement cache, vault, clinic, market, joker den.
4. Add metrics/tests for recipe placement.

Acceptance:

- Gold branches can be vault/cache instead of generic rooms.
- Merchant/fountain/joker branches retain isolated branch guarantees.
- Branch entry remains inviting.

### Phase 4: First New Biome

Goal:

- Add one real biome deeply, not several shallow biomes.

First new biome:

- Crystal Veins.

Crystal Veins is good if we want generation/reward novelty first.

Company Dig Site is good if we want contracts/debt first.

Tasks:

1. Pick biome level band. Done: levels 16-30.
2. Add biome-specific branch/economy weights. Done first pass.
3. Add one special branch or mechanic. Done first pass: crystal clue cells.
4. Add light theme class. Done first pass.
5. Add tests. Done first pass.
6. Playtest economy.

Acceptance:

- The biome feels different without needing a tutorial wall.
- The current core loop remains intact.

### Phase 5: Contracts and Curses

Goal:

- Add optional run-shaping decisions.

Tasks:

1. Add contract object model.
2. Add contract branch/NPC.
3. Add 3-5 simple level-scoped contracts.
4. Add curse/risk artifact type.
5. Add Shrine or Bank offer surface.

Acceptance:

- Contracts create optional goals.
- Risk artifacts are clearly labeled.
- Payments/gold economy remains tuneable.

### Phase 6: Long Run Expansion

Goal:

- Deepen the uncapped run beyond the current first biome.

Tasks:

1. Decide full-run level target.
2. Decide whether the old level 30 win should return as a separate short-run milestone.
3. Add biome transition overlays.
4. Rebalance payment curve across all bands.
5. Add deeper leaderboard categories.

Acceptance:

- A long run has a clear arc.
- Players can pause/resume safely.
- Former milestone levels still feel meaningful.

## Testing Plan

Smoke tests:

- `biomeForLevel` returns expected biome ids.
- Save/load preserves biome id.
- Active level snapshot restoration does not reroll biome.
- Biome generation knobs affect metrics within expected ranges.
- Branch identity selection respects required feature branches.
- Contracts settle success/failure correctly.
- Debt/payment calculations remain deterministic.

Manual tests:

- Start a new run and see correct first biome.
- Descend across a biome boundary.
- Save/resume before and after a boundary.
- Save/resume inside a biome-specific level.
- Verify visual theme updates and clears.
- Verify no-guess logs still accept generated boards.
- Verify payments remain clear.

Future seeded tests:

- Same seed plus same level produces same biome and board.
- Same seed produces same merchant/artifact/contract offers.

## Open Questions

- Should the old level 30 win return as a short-run mode or milestone?
- What should the second designed biome be after Crystal Veins: Company Dig Site, Fungal Caves, or something else?
- Should biome length be 10, 15, or 20 levels for the first long-run experiment?
- Should payment checkpoints stay every 3 levels forever?
- Should biome transitions offer a cash-out choice?
- Should curses be a subtype of artifact, or a separate run modifier list?
- Should contracts be level-scoped first, or can some span multiple levels?
- Should endless mode cycle biomes or use a dedicated Endless Deep biome?

## Recommendation

Build the biome framework first, then implement one biome deeply.

Recommended immediate path:

1. Add framework with Coal Shafts as the only active biome.
2. Add biome id to state/save and HUD/theme hook.
3. Add branch identity recipe framework.
4. Implement Crystal Veins as the first new biome if the goal is map/reward variety.
5. Implement Company Dig Site next if the goal is contracts and bank/debt.

This gives the game a durable expansion skeleton while protecting the fun core that already exists.
