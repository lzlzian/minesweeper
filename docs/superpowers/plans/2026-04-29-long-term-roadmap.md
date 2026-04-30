# Long-Term Roadmap Notes

Date: 2026-04-29

## Context

The game is currently in a strong playable state. A level 30 win has been possible in the capped version, lucky runs feel exciting, and the core loop of deduction, branch risk, gold pressure, artifacts, merchants, and payments is working.

This document captures the current long-term direction before we start expanding the game further.

## Strategic Direction

The next major shape should be a longer roguelike run built around biome acts. Instead of changing theme every few levels, each biome should last long enough to teach, mix, and pressure its own rules.

Target direction:

- New biome every 10-20 levels.
- Roughly 5-10 biomes over a full run.
- Long-term run length can grow to roughly 100-200 levels.
- The old level 30 win can become an act milestone, demo win, or shorter-run mode later. The mainline run can continue past it.

## High Priority, Eventually

Seeded runs and endless mode are definitely wanted eventually.

Seeded runs should support:

- Daily or named seeds.
- Reproducible level generation.
- Comparable local leaderboard entries.
- Cleaner playtest/debug reproduction.

Endless mode should support:

- Continuing after the designed final biome.
- Scaling payments and rewards.
- Leaderboard tracking deepest level and total gold.
- Possibly optional "cash out" moments at major biome clears.

These are important, but they do not need to be first. They become more valuable after the run has more content variety.

## High Priority, Soon

These are the most promising near-term expansion systems:

- Contracts.
- Branch identities.
- Curses and risk artifacts.
- Biome framework.

Contracts should create optional goals that change how a player approaches a level or branch:

- Clear with no triggered gas.
- Collect all chests.
- Visit a specific branch before exiting.
- Mark enough gas correctly.
- Leave some gold behind for a better future payout.

Branch identities should make optional branches feel authored and varied:

- Vault.
- Cache.
- Clinic.
- Market.
- Joker den.
- Contract office.
- Survey room.
- Shrine.
- Hazard room.

Curses and risk artifacts should offer powerful run-shaping choices with a real cost:

- More chest gold, higher payments.
- Cheaper merchant prices, harsher rerolls.
- Stronger artifacts, more branch gas.
- Better information, worse economy.
- Temporary debt relief, future interest.

The biome framework should probably come before a large pile of new contracts/artifacts, because it gives those mechanics a natural home.

## Definite Todo

The bank and debt theme is a core thematic direction.

Future debt/bank systems might include:

- Payment collector flavor.
- Loans.
- Interest.
- Debt forgiveness.
- Debt cushion variants.
- Bank NPCs.
- Contract payouts routed through the bank.
- Final payoff or escape framing.

This should not be only UI flavor. The best version should make the gold economy feel like an antagonist.

## Lower Priority, Nice To Have

Run summary and progression feedback are nice, but lower priority than adding new decisions and biome variety.

Examples:

- Gold by source.
- Payments made.
- Artifacts found.
- Contracts completed.
- Correct and incorrect flags.
- Gas triggered.
- Richest level.
- Closest payment scare.

Tutorial and first-run smoothing are also useful but can wait unless new-player confusion becomes a clear blocker.

Examples:

- First merchant branch teach moment.
- First payment warning emphasis.
- First artifact explanation.
- First contract explanation.
- Shorter first-biome onboarding.

## Near-Term Recommendation

Implement the biome framework next, then add one new biome deeply.

Suggested first expansion sequence:

1. Add biome registry and level-band selection.
2. Keep current levels as the first biome, likely "Coal Shafts".
3. Add biome-aware generator knobs without changing core rules yet.
4. Add branch identity recipes.
5. Add contracts in one biome.
6. Add risk artifacts or curses in one later biome.
7. Add bank/debt theme once payments and contracts have more surface area.

The main design principle: make the run feel longer because it has different kinds of decisions, not just because numbers get bigger.
