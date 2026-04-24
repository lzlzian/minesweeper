import {
  getGrid, setGrid, getRows, getCols, setRows, setCols,
  getPlayerRow, getPlayerCol, getExit, getMerchant,
  getFountain, setFountain, getRevealed, setRevealed, setFlagged,
  getBiomeOverrides, setBiomeOverrides,
  getStartCornerIdx,
} from '../state.js';
import { anchorCountForSize } from '../rulesets.js';

// Callback injection for revealCell, which still lives in main.js.
// Removed in Task 17 when revealCell moves to gameplay/interaction.js.
// Throws if placeAnchors runs before the callback is wired — preferable to a
// silent no-op that would leave anchor cells unrevealed.
let revealCellImpl = () => {
  throw new Error('board/generation: revealCell not installed — call setRevealCell at bootstrap');
};
export function setRevealCell(fn) { revealCellImpl = fn; }

const ANCHOR_MIN_DIST_START = 4;
const ANCHOR_MIN_DIST_EXIT = 3;
const ANCHOR_MIN_DIST_BETWEEN = 5;

export function countAdjacentGas(r, c) {
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < getRows() && nc >= 0 && nc < getCols()) {
        const t = getGrid()[nr][nc].type;
        if (t === 'gas' || t === 'detonated') count++;
      }
    }
  }
  return count;
}

export function placeWallClumps() {
  const wallDensity = getBiomeOverrides()?.wallDensity ?? 0.25;
  const targetWallCount = Math.floor(getRows() * getCols() * wallDensity);
  let placed = 0;
  let attempts = 0;
  const maxAttempts = 500;

  while (placed < targetWallCount && attempts < maxAttempts) {
    attempts++;
    const clumpSize = 2 + Math.floor(Math.random() * 4); // 2..5
    const startR = Math.floor(Math.random() * getRows());
    const startC = Math.floor(Math.random() * getCols());
    if (getGrid()[startR][startC].type !== 'empty') continue;

    getGrid()[startR][startC].type = 'wall';
    placed++;

    const clump = [{ r: startR, c: startC }];
    for (let i = 1; i < clumpSize && placed < targetWallCount; i++) {
      const anchor = clump[Math.floor(Math.random() * clump.length)];
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      const [dr, dc] = dirs[Math.floor(Math.random() * dirs.length)];
      const nr = anchor.r + dr;
      const nc = anchor.c + dc;
      if (nr < 0 || nr >= getRows() || nc < 0 || nc >= getCols()) continue;
      if (getGrid()[nr][nc].type !== 'empty') continue;
      getGrid()[nr][nc].type = 'wall';
      clump.push({ r: nr, c: nc });
      placed++;
    }
  }
}

export function cleanMerchantCell(r, c) {
  const cell = getGrid()[r][c];
  const hadGas = cell.type === 'gas';
  cell.type = 'empty';
  cell.goldValue = 0;
  cell.item = null;
  // Recompute the merchant cell's own adjacency (was 0 if it was gas/wall).
  cell.adjacent = countAdjacentGas(r, c);
  // If gas was removed, neighbors' adjacency counts also need recomputation.
  if (hadGas) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= getRows() || nc < 0 || nc >= getCols()) continue;
        const n = getGrid()[nr][nc];
        if (n.type !== 'gas' && n.type !== 'wall') {
          n.adjacent = countAdjacentGas(nr, nc);
        }
      }
    }
  }
}

export function carvePath(fromR, fromC, toR, toC) {
  // Walk Chebyshev-style from (fromR, fromC) to (toR, toC), clearing walls
  // and gas on every cell of the path. Guarantees solvability.
  let r = fromR;
  let c = fromC;
  while (r !== toR || c !== toC) {
    if (r < toR) r++;
    else if (r > toR) r--;
    if (c < toC) c++;
    else if (c > toC) c--;
    const cell = getGrid()[r][c];
    if (cell.type === 'wall' || cell.type === 'gas') {
      cell.type = 'empty';
      cell.goldValue = 0;
    }
  }
  // Recompute adjacency for the whole grid (cheap at 12x12)
  for (let rr = 0; rr < getRows(); rr++) {
    for (let cc = 0; cc < getCols(); cc++) {
      const g = getGrid()[rr][cc];
      if (g.type !== 'gas' && g.type !== 'wall') {
        g.adjacent = countAdjacentGas(rr, cc);
      }
    }
  }
}

export function generateGrid(gasCount) {
  // Initialize empty grid
  setGrid(Array.from({ length: getRows() }, () =>
    Array.from({ length: getCols() }, () => ({
      type: 'empty',
      adjacent: 0,
      goldValue: 0,
      item: null,
    }))
  ));

  // NEW: place walls first
  placeWallClumps();

  // Place gas pockets randomly (skip walls — 'empty' check below handles this)
  let placed = 0;
  while (placed < gasCount) {
    const r = Math.floor(Math.random() * getRows());
    const c = Math.floor(Math.random() * getCols());
    if (getGrid()[r][c].type === 'empty') {
      getGrid()[r][c].type = 'gas';
      placed++;
    }
  }

  // Calculate adjacency numbers (walls are skipped — they neither count nor get counted)
  for (let r = 0; r < getRows(); r++) {
    for (let c = 0; c < getCols(); c++) {
      if (getGrid()[r][c].type === 'gas') continue;
      if (getGrid()[r][c].type === 'wall') continue;
      getGrid()[r][c].adjacent = countAdjacentGas(r, c);
    }
  }

  // Place gold veins — bias high values toward high-adjacency cells
  placeGoldVeins();

  // Place 1-2 item drops on plain empty cells
  placeItemDrops();
}

export function placeGoldVeins() {
  // Collect all safe cells and sort by adjacency (high first)
  const safeCells = [];
  for (let r = 0; r < getRows(); r++) {
    for (let c = 0; c < getCols(); c++) {
      if (getGrid()[r][c].type !== 'gas' && getGrid()[r][c].type !== 'wall') {
        safeCells.push({ r, c, adj: getGrid()[r][c].adjacent });
      }
    }
  }

  // Pick vein centers — 3 veins, biased toward high adjacency
  const sorted = [...safeCells].sort((a, b) => b.adj - a.adj);
  const veinCount = 3;
  const centers = [];

  for (let i = 0; i < veinCount && i < sorted.length; i++) {
    // Pick from top 30% of high-adjacency cells with some randomness
    const pool = sorted.slice(0, Math.max(5, Math.floor(sorted.length * 0.3)));
    const pick = pool[Math.floor(Math.random() * pool.length)];
    centers.push(pick);
    // Remove pick from sorted to avoid duplicate centers
    const idx = sorted.indexOf(pick);
    if (idx !== -1) sorted.splice(idx, 1);
  }

  // Assign gold values: center = 10, neighbors = 5
  for (const center of centers) {
    const cell = getGrid()[center.r][center.c];
    if (cell.type !== 'gas') {
      cell.type = 'gold';
      cell.goldValue = 10;
    }

    // Adjacent cells get medium gold
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = center.r + dr;
        const nc = center.c + dc;
        if (nr >= 0 && nr < getRows() && nc >= 0 && nc < getCols()) {
          const neighbor = getGrid()[nr][nc];
          if (neighbor.type === 'empty') {
            neighbor.type = 'gold';
            neighbor.goldValue = 5;
          }
        }
      }
    }
  }

  // Scatter some low-value gold (value 1) on remaining empty cells
  const scatterDensity = getBiomeOverrides()?.goldScatterDensity ?? 0.2;
  for (let r = 0; r < getRows(); r++) {
    for (let c = 0; c < getCols(); c++) {
      if (getGrid()[r][c].type === 'empty' && Math.random() < scatterDensity) {
        getGrid()[r][c].type = 'gold';
        getGrid()[r][c].goldValue = 1;
      }
    }
  }
}

export function placeItemDrops() {
  // Collect empty, goldless, non-gas, non-wall cells as drop candidates.
  // We skip gold cells (already have a payoff) to keep item drops as a
  // distinct reward. Spawn/exit exclusions happen in initLevel, which
  // overwrites the item field on those cells if they landed on drops.
  const candidates = [];
  for (let r = 0; r < getRows(); r++) {
    for (let c = 0; c < getCols(); c++) {
      const cell = getGrid()[r][c];
      if (cell.type === 'empty' && cell.goldValue === 0) {
        candidates.push({ r, c });
      }
    }
  }
  if (candidates.length === 0) return;

  // Fisher-Yates shuffle, then take 1 or 2.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const requestedDrops = getBiomeOverrides()?.guaranteedItemDrops ?? (1 + Math.floor(Math.random() * 2));
  const dropCount = Math.min(candidates.length, requestedDrops);
  const itemTypes = ['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross'];
  for (let i = 0; i < dropCount; i++) {
    const pick = candidates[i];
    const itemType = itemTypes[Math.floor(Math.random() * itemTypes.length)];
    getGrid()[pick.r][pick.c].item = itemType;
  }
}

export function placeAnchors() {
  const target = anchorCountForSize(getRows());
  if (target === 0) return;

  const startR = getPlayerRow();
  const startC = getPlayerCol();
  const exitR = getExit().r;
  const exitC = getExit().c;

  // Collect candidates: adjacency-0, non-gas, non-wall, far enough from start/exit.
  const candidates = [];
  for (let r = 0; r < getRows(); r++) {
    for (let c = 0; c < getCols(); c++) {
      const cell = getGrid()[r][c];
      if (cell.type === 'gas' || cell.type === 'wall') continue;
      if (cell.adjacent !== 0) continue;
      const distStart = Math.max(Math.abs(r - startR), Math.abs(c - startC));
      const distExit = Math.max(Math.abs(r - exitR), Math.abs(c - exitC));
      if (distStart < ANCHOR_MIN_DIST_START) continue;
      if (distExit < ANCHOR_MIN_DIST_EXIT) continue;
      candidates.push({ r, c });
    }
  }

  // Shuffle candidates (Fisher-Yates).
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  // Pick anchors one at a time, enforcing spacing and merge checks.
  const placed = [];

  for (const cand of candidates) {
    if (placed.length >= target) break;

    // Enforce minimum distance from already-placed anchors.
    const tooClose = placed.some(a =>
      Math.max(Math.abs(cand.r - a.r), Math.abs(cand.c - a.c)) < ANCHOR_MIN_DIST_BETWEEN
    );
    if (tooClose) continue;

    // Snapshot revealed state before cascading this anchor.
    const snapshot = getRevealed().map(row => [...row]);

    revealCellImpl(cand.r, cand.c);

    // Collect which cells were newly revealed.
    const newCells = [];
    for (let r = 0; r < getRows(); r++) {
      for (let c = 0; c < getCols(); c++) {
        if (getRevealed()[r][c] && !snapshot[r][c]) {
          newCells.push({ r, c });
        }
      }
    }

    // Merge check: if any newly-revealed cell is adjacent (Chebyshev 1)
    // to a cell that was already revealed before this anchor, the cascade
    // merged with an existing region. Roll it back.
    let merged = false;
    for (const nc of newCells) {
      for (let dr = -1; dr <= 1 && !merged; dr++) {
        for (let dc = -1; dc <= 1 && !merged; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = nc.r + dr;
          const nc2 = nc.c + dc;
          if (nr < 0 || nr >= getRows() || nc2 < 0 || nc2 >= getCols()) continue;
          if (snapshot[nr][nc2]) {
            merged = true;
          }
        }
      }
      if (merged) break;
    }

    if (merged) {
      // Un-reveal all cells this anchor opened.
      for (const nc of newCells) {
        getRevealed()[nc.r][nc.c] = false;
      }
      continue;
    }

    placed.push(cand);
  }
}

export function prepareTreasureChamber(state) {
  state.biomeOverrides = {
    wallDensity:         0.15,
    gasDensity:          0.12,
    goldScatterDensity:  0.30,
    guaranteedItemDrops: 2,
    suppressMerchant:    true,
    freezePityTick:      true,
  };
}

export function applyTreasureChamber(state) {
  // Compute the two off-diagonal corners (neither player start nor exit).
  const playerIdx = state.startCornerIdx;
  const exitIdx = 3 - playerIdx;
  const offDiagonalIdxs = [0, 1, 2, 3].filter(i => i !== playerIdx && i !== exitIdx);
  const cornerCoords = [
    { r: 0, c: 0 },
    { r: 0, c: getCols() - 1 },
    { r: getRows() - 1, c: 0 },
    { r: getRows() - 1, c: getCols() - 1 },
  ];

  for (const idx of offDiagonalIdxs) {
    const { r, c } = cornerCoords[idx];
    const cell = getGrid()[r][c];
    const hadGas = cell.type === 'gas';

    // If the fountain happened to land on this corner, clear it — the chest
    // overwrites the cell and getFountain() would otherwise point at a now-chest
    // cell, causing a double reward on pickup.
    if (getFountain() && getFountain().r === r && getFountain().c === c) {
      setFountain(null);
    }

    // Overwrite whatever landed here with a chest-gold cell.
    cell.type = 'gold';
    cell.goldValue = 25;
    cell.item = null;
    cell.chest = true;
    cell.adjacent = countAdjacentGas(r, c);

    // If we removed a gas cell, neighbors' adjacency counts need recomputing.
    if (hadGas) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= getRows() || nc < 0 || nc >= getCols()) continue;
          const n = getGrid()[nr][nc];
          if (n.type !== 'gas' && n.type !== 'wall') {
            n.adjacent = countAdjacentGas(nr, nc);
          }
        }
      }
    }

    // Pre-reveal the chest cell.
    getRevealed()[r][c] = true;
  }
}
