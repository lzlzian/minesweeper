// Pure logical solver. Given a board snapshot + revealed/flagged state,
// determines whether the exit cell becomes reachable via deduction using
// Rule 1 (safe-neighbor elimination). No DOM, no game-state imports.
// Inputs are cloned — the caller's arrays are never mutated.

const DIRS = [
  [-1,-1], [-1, 0], [-1, 1],
  [ 0,-1],          [ 0, 1],
  [ 1,-1], [ 1, 0], [ 1, 1],
];

function cloneMatrix(m) {
  return m.map(row => row.slice());
}

function neighbors(r, c, rows, cols) {
  const out = [];
  for (const [dr, dc] of DIRS) {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
    out.push({ r: nr, c: nc });
  }
  return out;
}

// Mirrors gameplay/interaction.js revealCell on a local `revealed` snapshot.
// Reveal (r,c); if adj=0, spread to 8 neighbors. Skips walls and gas.
function cascadeReveal(r, c, grid, rows, cols, revealed) {
  if (r < 0 || r >= rows || c < 0 || c >= cols) return;
  if (revealed[r][c]) return;
  const start = grid[r][c];
  if (start.type === 'wall' || start.type === 'gas') return;
  const stack = [{ r, c }];
  while (stack.length) {
    const { r: cr, c: cc } = stack.pop();
    if (revealed[cr][cc]) continue;
    const cell = grid[cr][cc];
    if (cell.type === 'wall' || cell.type === 'gas') continue;
    revealed[cr][cc] = true;
    if ((cell.adjacent ?? 0) === 0) {
      for (const n of neighbors(cr, cc, rows, cols)) stack.push(n);
    }
  }
}

export function solve(grid, rows, cols, revealedIn, flaggedIn, player, exit) {
  const revealed = cloneMatrix(revealedIn);
  const flagged  = cloneMatrix(flaggedIn);

  // Seed: start-3x3 cascade, matching in-game behavior.
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      cascadeReveal(player.r + dr, player.c + dc, grid, rows, cols, revealed);
    }
  }

  // Deduction loop, fixed-point on Rule 1.
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!revealed[r][c]) continue;
        const cell = grid[r][c];
        if (cell.type !== 'empty') continue;
        const adj = cell.adjacent ?? 0;
        if (adj === 0) continue;

        let knownGas = 0;
        const unrevealed = [];
        for (const n of neighbors(r, c, rows, cols)) {
          const nc = grid[n.r][n.c];
          if (nc.type === 'wall') continue;
          if (flagged[n.r][n.c] || nc.type === 'detonated') { knownGas++; continue; }
          if (revealed[n.r][n.c]) continue;
          unrevealed.push(n);
        }
        const remaining = adj - knownGas;

        // Rule 1: all gas accounted for → every unrevealed neighbor is safe.
        if (remaining === 0 && unrevealed.length > 0) {
          for (const u of unrevealed) {
            if (!revealed[u.r][u.c]) {
              cascadeReveal(u.r, u.c, grid, rows, cols, revealed);
              changed = true;
            }
          }
        }
      }
    }
  }

  return { solved: !!revealed[exit.r][exit.c], revealed, flagged };
}
