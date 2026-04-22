// Validates a level object (post-schema-parse shape) against playability
// rules. Used by the editor (on save/test-play) and the game (on authored
// level load). Does NOT re-check structural shape — that's schema.js.

import { VALID_ITEM_KEYS } from './schema.js';

const MIN_SIZE = 6;
const MAX_SIZE = 20;

export function validateLevel(level) {
  const errors = [];

  // Rows/cols range.
  if (level.rows < MIN_SIZE || level.rows > MAX_SIZE) {
    errors.push(`rows must be in [${MIN_SIZE}, ${MAX_SIZE}], got ${level.rows}`);
  }
  if (level.cols < MIN_SIZE || level.cols > MAX_SIZE) {
    errors.push(`cols must be in [${MIN_SIZE}, ${MAX_SIZE}], got ${level.cols}`);
  }

  // Positions in bounds.
  const inBounds = (p) => p && p.r >= 0 && p.r < level.rows && p.c >= 0 && p.c < level.cols;
  if (!inBounds(level.playerStart)) errors.push('playerStart out of bounds');
  if (!inBounds(level.exit)) errors.push('exit out of bounds');
  if (level.merchant && !inBounds(level.merchant)) errors.push('merchant out of bounds');
  if (level.fountain && !inBounds(level.fountain)) errors.push('fountain out of bounds');

  // Player != exit.
  if (posEq(level.playerStart, level.exit)) {
    errors.push('playerStart and exit share a position');
  }

  // No two unique placements share a position.
  const placements = [
    ['playerStart', level.playerStart],
    ['exit', level.exit],
    level.merchant ? ['merchant', level.merchant] : null,
    level.fountain ? ['fountain', level.fountain] : null,
  ].filter(Boolean);
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      if (posEq(placements[i][1], placements[j][1])) {
        errors.push(`${placements[i][0]} and ${placements[j][0]} share a position`);
      }
    }
  }

  // Drops don't overlap unique placements.
  for (const d of level.itemDrops) {
    for (const [name, pos] of placements) {
      if (posEq(d, pos)) {
        errors.push(`item drop at (${d.r},${d.c}) overlaps ${name}`);
      }
    }
  }

  // If something is already wrong with geometry, stop before cell-level checks.
  if (errors.length) return { ok: false, errors };

  // Player-start and exit cells must be empty.
  const startCell = level.cells[level.playerStart.r][level.playerStart.c];
  if (startCell.type !== 'empty') {
    errors.push(`playerStart cell must be empty, got ${startCell.type}`);
  }
  const exitCell = level.cells[level.exit.r][level.exit.c];
  if (exitCell.type !== 'empty') {
    errors.push(`exit cell must be empty, got ${exitCell.type}`);
  }

  // Each drop lands on an empty cell, valid item key.
  for (const d of level.itemDrops) {
    if (!VALID_ITEM_KEYS.includes(d.item)) {
      errors.push(`item drop at (${d.r},${d.c}) has invalid item: ${d.item}`);
    }
    const cell = level.cells[d.r][d.c];
    if (cell.type !== 'empty') {
      errors.push(`item drop at (${d.r},${d.c}) lands on non-empty cell (${cell.type})`);
    }
  }

  // Exit reachable from player via non-wall, non-gas cells.
  if (!isReachable(level, level.playerStart, level.exit)) {
    errors.push('exit not reachable from playerStart (non-wall, non-gas path required)');
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

function posEq(a, b) {
  return a && b && a.r === b.r && a.c === b.c;
}

// Chebyshev BFS through non-wall, non-gas cells. Matches engine's
// board/layout.js isReachable, but operates on the JSON-shaped level.
function isReachable(level, from, to) {
  const visited = Array.from({ length: level.rows }, () => Array(level.cols).fill(false));
  const queue = [{ r: from.r, c: from.c }];
  visited[from.r][from.c] = true;
  while (queue.length) {
    const { r, c } = queue.shift();
    if (r === to.r && c === to.c) return true;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= level.rows || nc < 0 || nc >= level.cols) continue;
        if (visited[nr][nc]) continue;
        const t = level.cells[nr][nc].type;
        if (t === 'wall' || t === 'gas') continue;
        visited[nr][nc] = true;
        queue.push({ r: nr, c: nc });
      }
    }
  }
  return false;
}
