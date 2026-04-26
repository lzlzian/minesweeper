// Pure logical solver. Given a board snapshot + revealed/flagged state,
// determines whether the exit cell becomes reachable via deduction using
// Rule 1 (safe-neighbor elimination) and Rule 2 (gas identification).
// No DOM, no game-state imports. Inputs are cloned — the caller's arrays
// are never mutated.

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

// After gas relocation, a cell that was already revealed as a number can become
// a zero. Gameplay resyncs those already-visible empty zeroes by cascading from
// them, so generation must validate against that expanded revealed state.
export function syncRevealedZeroCascades(grid, rows, cols, revealed) {
  const seenZero = Array.from({ length: rows }, () => Array(cols).fill(false));
  const stack = [];
  let changed = false;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (revealed[r][c] && cell.type === 'empty' && (cell.adjacent ?? 0) === 0) {
        stack.push({ r, c });
      }
    }
  }

  while (stack.length) {
    const { r, c } = stack.pop();
    if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
    const cell = grid[r][c];
    if (cell.type === 'wall' || cell.type === 'gas') continue;
    if (!revealed[r][c]) {
      revealed[r][c] = true;
      changed = true;
    }
    if ((cell.adjacent ?? 0) !== 0) continue;
    if (seenZero[r][c]) continue;
    seenZero[r][c] = true;
    for (const n of neighbors(r, c, rows, cols)) stack.push(n);
  }

  return changed;
}

// BFS: can player walk to exit through revealed, non-wall, non-gas cells?
function pathConnected(revealed, grid, rows, cols, player, exit) {
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  const queue = [player];
  visited[player.r][player.c] = true;
  while (queue.length) {
    const { r, c } = queue.shift();
    if (r === exit.r && c === exit.c) return true;
    for (const [dr, dc] of DIRS) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (visited[nr][nc]) continue;
      if (!revealed[nr][nc]) continue;
      const t = grid[nr][nc].type;
      if (t === 'wall' || t === 'gas') continue;
      visited[nr][nc] = true;
      queue.push({ r: nr, c: nc });
    }
  }
  return false;
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

  // If exit is already walkable from spawn, zero steps needed.
  if (pathConnected(revealed, grid, rows, cols, player, exit)) {
    return { solved: true, revealed, flagged, steps: 0 };
  }

  // Deduction loop, fixed-point on Rules 1 and 2.
  // `steps` counts deduction rounds needed before exit becomes walkable.
  let steps = 0;
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

        // Rule 2: remaining gas == unrevealed count → all unrevealed are gas.
        if (remaining > 0 && remaining === unrevealed.length) {
          for (const u of unrevealed) {
            if (!flagged[u.r][u.c]) {
              flagged[u.r][u.c] = true;
              changed = true;
            }
          }
        }
      }
    }
    if (changed) {
      steps++;
      if (pathConnected(revealed, grid, rows, cols, player, exit)) {
        return { solved: true, revealed, flagged, steps };
      }
    }
  }

  return { solved: false, revealed, flagged, steps };
}

export function relocateFrontierGas(grid, rows, cols, revealed, flagged, player, exit, opts = {}) {
  const FAR = opts.far ?? 4;
  const exclude = opts.exclude ?? [];

  const sources = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].type !== 'gas') continue;
      if (flagged[r][c]) continue;
      let onFrontier = false;
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        if (revealed[nr][nc]) { onFrontier = true; break; }
      }
      if (onFrontier) sources.push({ r, c });
    }
  }
  if (sources.length === 0) return false;

  const all = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].type !== 'empty') continue;
      if (revealed[r][c]) continue;
      if (flagged[r][c]) continue;
      if (r === player.r && c === player.c) continue;
      if (r === exit.r && c === exit.c) continue;
      if (exclude.some(p => p.r === r && p.c === c)) continue;

      let minDist = Infinity;
      outer: for (let rr = 0; rr < rows; rr++) {
        for (let cc = 0; cc < cols; cc++) {
          if (!revealed[rr][cc]) continue;
          const d = Math.max(Math.abs(r - rr), Math.abs(c - cc));
          if (d < minDist) minDist = d;
          if (minDist === 0) break outer;
        }
      }

      let score = 0;
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        if (grid[nr][nc].type === 'gas') score++;
      }

      all.push({ r, c, score, minDist });
    }
  }
  if (all.length === 0) return false;

  const farCells = all.filter(d => d.minDist >= FAR);
  const pool = farCells.length > 0 ? farCells : all;
  pool.sort((a, b) => b.score - a.score);
  const topScore = pool[0].score;
  const tops = pool.filter(d => d.score === topScore);
  const dest = tops[Math.floor(Math.random() * tops.length)];
  const src  = sources[Math.floor(Math.random() * sources.length)];

  grid[src.r][src.c].type = 'empty';
  grid[src.r][src.c].adjacent = 0;
  grid[dest.r][dest.c].type = 'gas';

  recomputeAdjacencyAround(grid, rows, cols, src.r, src.c);
  recomputeAdjacencyAround(grid, rows, cols, dest.r, dest.c);

  return true;
}

function recomputeAdjacencyAround(grid, rows, cols, r, c) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const cell = grid[nr][nc];
      if (cell.type === 'wall' || cell.type === 'gas') continue;
      let n = 0;
      for (const [ddr, ddc] of DIRS) {
        const nnr = nr + ddr, nnc = nc + ddc;
        if (nnr < 0 || nnr >= rows || nnc < 0 || nnc >= cols) continue;
        if (grid[nnr][nnc].type === 'gas') n++;
      }
      cell.adjacent = n;
    }
  }
}

export function makeSolvable(grid, rows, cols, revealed, flagged, player, exit, opts = {}) {
  const maxFixAttempts = opts.maxFixAttempts ?? 30;
  let fixups = 0;
  for (let attempt = 0; attempt <= maxFixAttempts; attempt++) {
    const res = solve(grid, rows, cols, revealed, flagged, player, exit);
    if (res.solved) return { solved: true, fixups, steps: res.steps };
    const moved = relocateFrontierGas(
      grid, rows, cols, res.revealed, res.flagged, player, exit, opts,
    );
    if (!moved) return { solved: false, fixups, steps: res.steps };
    fixups++;
  }
  return { solved: false, fixups, steps: 0 };
}
