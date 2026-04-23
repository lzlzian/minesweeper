// Adapter: convert an editor-shaped level into solver inputs, run the
// solver, return a render-friendly result.
import { solve } from '../solver.js';

export function checkSolvability(level) {
  const { rows, cols } = level;
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const src = level.cells[r][c];
      if (src.type === 'wall')     row.push({ type: 'wall' });
      else if (src.type === 'gas') row.push({ type: 'gas' });
      else                         row.push({ type: 'empty' }); // empty, gold, etc.
    }
    grid.push(row);
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].type !== 'empty') continue;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          if (grid[nr][nc].type === 'gas') n++;
        }
      }
      grid[r][c].adjacent = n;
    }
  }
  const revealed = Array.from({ length: rows }, () => Array(cols).fill(false));
  const flagged  = Array.from({ length: rows }, () => Array(cols).fill(false));
  const res = solve(grid, rows, cols, revealed, flagged, level.playerStart, level.exit);
  return { solved: res.solved };
}
