# Level Editor — Session Handoff

**Date written:** 2026-04-21
**Branch:** `level-editor` (created this session from `master`)
**Status:** Spec and plan committed. Ready to execute.

---

## How to pick this up in a fresh session

Paste something like this into a new Claude Code session:

> We're implementing the level editor for mining-crawler on the `level-editor` branch. Spec is at `docs/superpowers/specs/2026-04-21-level-editor-design.md`. Implementation plan is at `docs/superpowers/plans/2026-04-21-level-editor.md` (12 tasks). Please use the **superpowers:subagent-driven-development** skill to execute the plan — one fresh subagent per task, review between tasks. Start from Task 1.

That's enough — the subagent-driven-development skill owns the execution loop from there.

---

## What was decided (quick reference)

All eight brainstorming questions resolved. Details in the spec, but the short version:

| Question | Answer |
|---|---|
| What are handcrafted levels for? | **B** — playtest a Candy-Crush-style campaign shape |
| Relationship to procgen? | Keep both alongside; editor is for iteration and potential procgen templates |
| Where do authored levels live? | **C** — localStorage drafts + JSON export for committed levels |
| Editor UI layout? | **A** — painter (palette + grid + inspector) |
| Scope per level? | **B** — geometry + explicit placements (no run-level overrides) |
| How are levels played? | **B** — Test Play from editor + "Play Authored" start-menu entry |
| Editor entry point? | **A** — dedicated `editor.html` page, no game-menu button |
| Game/editor code layout? | **A** — two pages, strong isolation, shared low-level modules only |

**Anchors in authored levels:** not placed. Author designs the whole layout.

---

## What's on disk already

- `docs/superpowers/specs/2026-04-21-level-editor-design.md` — design spec (reviewed + approved).
- `docs/superpowers/plans/2026-04-21-level-editor.md` — 12-task implementation plan with full code in every step.
- `.gitignore` updated with `.superpowers/` for the brainstorming companion.
- Branch `level-editor` is checked out.

Commits on the branch so far (both docs-only):
- `docs: level editor design spec`
- `docs: level editor implementation plan`

Nothing else has been touched. `master` is clean and the game is unchanged.

---

## Task 11 is optional

The plan marks Task 11 (keyboard shortcuts + undo/redo) as cuttable. If scope creeps, drop it — the editor is fully functional without it and nothing later depends on it. You can always bolt it on after playtesting the first few levels.

---

## Resume recipe

```
cd C:/Users/PC/Desktop/Development/workspace/minesweeper-mining
git status          # should be clean, on level-editor
git log --oneline -3  # should show the two docs commits on top of master
```

Then in the new Claude Code session, invoke subagent-driven-development and point it at the plan. It picks up the task list and runs each task as an isolated subagent with per-task reviews before committing.

---

## If you want to change direction first

If something in the spec feels wrong after sleeping on it:

1. Open `docs/superpowers/specs/2026-04-21-level-editor-design.md`, edit it.
2. Regenerate or patch the plan (`docs/superpowers/plans/2026-04-21-level-editor.md`) to match.
3. Commit both changes.
4. Then kick off execution.

Easiest way to patch the plan: tell Claude "the spec changed — here's the diff. Please update the plan to match, focusing on tasks that need changing." Don't try to edit the plan by hand — it's ~3000 lines.
