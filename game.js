// ============================================================
// STATE
// ============================================================

const MAX_HP = 3;
const STEP_MS = 80;

const state = {
  gold: 0,
  hp: MAX_HP,
  rows: 14,
  cols: 14,
  grid: [],
  revealed: [],
  flagged: [],
  gameOver: false,
  busy: false,
  playerRow: 0,
  playerCol: 0,
  exit: { r: 0, c: 0 },
};

// Cell object shape:
// { type: 'empty' | 'gas' | 'gold' | 'wall' | 'detonated', adjacent: number, goldValue: number }
// 'detonated' = a gas cell that was dug into; now passable floor that shows a red cross.

// ============================================================
// UI REFERENCES
// ============================================================

const gridContainer = document.getElementById('grid-container');
const goldDisplay = document.getElementById('gold-display');
const hpDisplay = document.getElementById('hp-display');
const overlay = document.getElementById('overlay');
const overlayContent = document.getElementById('overlay-content');

// ============================================================
// RENDERING
// ============================================================

function renderGrid() {
  gridContainer.innerHTML = '';
  gridContainer.style.gridTemplateColumns = `repeat(${state.cols}, 40px)`;

  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = r;
      cell.dataset.col = c;

      const isPlayer = (r === state.playerRow && c === state.playerCol);
      const isAdjacent = isAdjacentToPlayer(r, c);

      if (state.grid[r][c].type === 'wall') {
        cell.classList.add('wall');
      } else {
        const isExit = (r === state.exit.r && c === state.exit.c);
        if (isExit) cell.classList.add('exit');

        if (state.revealed[r][c]) {
          const g = state.grid[r][c];
          cell.classList.add('revealed');

          if (isPlayer) cell.classList.add('player');
          if (g.type === 'gas') cell.classList.add('gas');
          else if (g.type === 'detonated') cell.classList.add('detonated');
          else if (g.type === 'gold' && g.goldValue > 0) cell.classList.add('gold');

          if (g.type === 'detonated') {
            const numSpan = document.createElement('span');
            numSpan.className = 'num cross';
            numSpan.textContent = '✖';
            cell.appendChild(numSpan);
          } else if (g.adjacent > 0 && g.type !== 'gas') {
            cell.dataset.adjacent = g.adjacent;
            const numSpan = document.createElement('span');
            numSpan.className = 'num';
            numSpan.textContent = g.adjacent;
            cell.appendChild(numSpan);
          }

          let icon = null;
          if (isPlayer) icon = '🙂';
          else if (g.type === 'gas') icon = '💀';
          else if (g.type === 'gold' && g.goldValue > 0) icon = '💰';

          if (icon) {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'icon';
            iconSpan.textContent = icon;
            cell.appendChild(iconSpan);
          }
        } else if (state.flagged[r][c]) {
          cell.classList.add('flagged');
          if (isAdjacent) cell.classList.add('reachable');
        } else {
          if (isAdjacent) cell.classList.add('reachable');
        }
      }

      cell.addEventListener('click', () => handleClick(r, c));
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        handleRightClick(r, c);
      });

      gridContainer.appendChild(cell);
    }
  }
}

function updateHud() {
  goldDisplay.textContent = `Gold: ${state.gold}`;
  hpDisplay.textContent = '❤️'.repeat(Math.max(0, state.hp)) + '🖤'.repeat(Math.max(0, MAX_HP - state.hp));
}

function showOverlay(html) {
  overlayContent.innerHTML = html;
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

function showEscapedOverlay() {
  showOverlay(`
    <h2>Escaped!</h2>
    <p>Gold this run: ${state.gold}</p>
    <button onclick="startGame()">New Run</button>
  `);
}

function showDeathOverlay() {
  showOverlay(`
    <h2>You died.</h2>
    <p>Gold this run: ${state.gold}</p>
    <button onclick="startGame()">New Run</button>
  `);
}

// ============================================================
// PLACEHOLDER — filled in next tasks
// ============================================================

function placeWallClumps() {
  const targetWallCount = Math.floor(state.rows * state.cols * 0.25);
  let placed = 0;
  let attempts = 0;
  const maxAttempts = 500;

  while (placed < targetWallCount && attempts < maxAttempts) {
    attempts++;
    const clumpSize = 2 + Math.floor(Math.random() * 4); // 2..5
    const startR = Math.floor(Math.random() * state.rows);
    const startC = Math.floor(Math.random() * state.cols);
    if (state.grid[startR][startC].type !== 'empty') continue;

    state.grid[startR][startC].type = 'wall';
    placed++;

    const clump = [{ r: startR, c: startC }];
    for (let i = 1; i < clumpSize && placed < targetWallCount; i++) {
      const anchor = clump[Math.floor(Math.random() * clump.length)];
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      const [dr, dc] = dirs[Math.floor(Math.random() * dirs.length)];
      const nr = anchor.r + dr;
      const nc = anchor.c + dc;
      if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
      if (state.grid[nr][nc].type !== 'empty') continue;
      state.grid[nr][nc].type = 'wall';
      clump.push({ r: nr, c: nc });
      placed++;
    }
  }
}

// Search outward from (anchorR, anchorC) in increasing Chebyshev distance
// for a non-wall cell. Used to anchor player/exit near a corner even when
// the corner itself got walled.
function findNearCorner(anchorR, anchorC) {
  const maxDist = Math.max(state.rows, state.cols);
  for (let d = 0; d < maxDist; d++) {
    for (let r = Math.max(0, anchorR - d); r <= Math.min(state.rows - 1, anchorR + d); r++) {
      for (let c = Math.max(0, anchorC - d); c <= Math.min(state.cols - 1, anchorC + d); c++) {
        if (Math.max(Math.abs(r - anchorR), Math.abs(c - anchorC)) !== d) continue;
        if (state.grid[r][c].type === 'wall') continue;
        return { r, c };
      }
    }
  }
  return null;
}

function pickPlayerStart() {
  const corners = [
    { r: 0, c: 0 },
    { r: 0, c: state.cols - 1 },
    { r: state.rows - 1, c: 0 },
    { r: state.rows - 1, c: state.cols - 1 },
  ];
  const cornerIdx = Math.floor(Math.random() * 4);
  state._startCornerIdx = cornerIdx;
  const anchor = corners[cornerIdx];
  return findNearCorner(anchor.r, anchor.c);
}

function pickExit(playerR, playerC) {
  // Exit sits in the corner diagonally opposite to the player's start corner.
  const corners = [
    { r: 0, c: 0 },
    { r: 0, c: state.cols - 1 },
    { r: state.rows - 1, c: 0 },
    { r: state.rows - 1, c: state.cols - 1 },
  ];
  const oppositeIdx = 3 - state._startCornerIdx;
  const anchor = corners[oppositeIdx];
  const found = findNearCorner(anchor.r, anchor.c);
  if (!found) return null;
  if (found.r === playerR && found.c === playerC) return null;
  if (!hasNonWallNeighbor(found.r, found.c)) return null;
  return found;
}

function hasNonWallNeighbor(r, c) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
      if (state.grid[nr][nc].type !== 'wall') return true;
    }
  }
  return false;
}

function isReachable(fromR, fromC, toR, toC) {
  const visited = Array.from({ length: state.rows }, () =>
    Array(state.cols).fill(false)
  );
  const queue = [{ r: fromR, c: fromC }];
  visited[fromR][fromC] = true;
  while (queue.length > 0) {
    const { r, c } = queue.shift();
    if (r === toR && c === toC) return true;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
        if (visited[nr][nc]) continue;
        const t = state.grid[nr][nc].type;
        if (t === 'wall' || t === 'gas') continue;
        visited[nr][nc] = true;
        queue.push({ r: nr, c: nc });
      }
    }
  }
  return false;
}

function carvePath(fromR, fromC, toR, toC) {
  // Walk Chebyshev-style from (fromR, fromC) to (toR, toC), clearing walls
  // and gas on every cell of the path. Guarantees solvability.
  let r = fromR;
  let c = fromC;
  while (r !== toR || c !== toC) {
    if (r < toR) r++;
    else if (r > toR) r--;
    if (c < toC) c++;
    else if (c > toC) c--;
    const cell = state.grid[r][c];
    if (cell.type === 'wall' || cell.type === 'gas') {
      cell.type = 'empty';
      cell.goldValue = 0;
    }
  }
  // Recompute adjacency for the whole grid (cheap at 12x12)
  for (let rr = 0; rr < state.rows; rr++) {
    for (let cc = 0; cc < state.cols; cc++) {
      const g = state.grid[rr][cc];
      if (g.type !== 'gas' && g.type !== 'wall') {
        g.adjacent = countAdjacentGas(rr, cc);
      }
    }
  }
}

// Orthogonal directions first so ties are broken in favor of cardinal
// moves over diagonal ones.
const STEP_DIRS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [-1, 1], [1, -1], [1, 1],
];

function findPath(fromR, fromC, toR, toC) {
  if (fromR === toR && fromC === toC) return [{ r: fromR, c: fromC }];
  const visited = Array.from({ length: state.rows }, () =>
    Array(state.cols).fill(null)
  );
  const queue = [{ r: fromR, c: fromC }];
  visited[fromR][fromC] = { r: -1, c: -1 };

  while (queue.length > 0) {
    const { r, c } = queue.shift();
    if (r === toR && c === toC) {
      const path = [];
      let cur = { r, c };
      while (cur.r !== -1) {
        path.push(cur);
        cur = visited[cur.r][cur.c];
      }
      path.reverse();
      return path;
    }
    for (const [dr, dc] of STEP_DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
      if (visited[nr][nc] !== null) continue;
      const t = state.grid[nr][nc].type;
      if (t === 'wall' || t === 'gas') continue;
      if (!state.revealed[nr][nc]) continue;
      visited[nr][nc] = { r, c };
      queue.push({ r: nr, c: nc });
    }
  }
  return null;
}

function generateGrid(gasCount) {
  // Initialize empty grid
  state.grid = Array.from({ length: state.rows }, () =>
    Array.from({ length: state.cols }, () => ({
      type: 'empty',
      adjacent: 0,
      goldValue: 0,
    }))
  );

  // NEW: place walls first
  placeWallClumps();

  // Place gas pockets randomly (skip walls — 'empty' check below handles this)
  let placed = 0;
  while (placed < gasCount) {
    const r = Math.floor(Math.random() * state.rows);
    const c = Math.floor(Math.random() * state.cols);
    if (state.grid[r][c].type === 'empty') {
      state.grid[r][c].type = 'gas';
      placed++;
    }
  }

  // Calculate adjacency numbers (walls are skipped — they neither count nor get counted)
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.grid[r][c].type === 'gas') continue;
      if (state.grid[r][c].type === 'wall') continue;
      state.grid[r][c].adjacent = countAdjacentGas(r, c);
    }
  }

  // Place gold veins — bias high values toward high-adjacency cells
  placeGoldVeins();
}

function countAdjacentGas(r, c) {
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) {
        if (state.grid[nr][nc].type === 'gas') count++;
      }
    }
  }
  return count;
}

function placeGoldVeins() {
  // Collect all safe cells and sort by adjacency (high first)
  const safeCells = [];
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.grid[r][c].type !== 'gas' && state.grid[r][c].type !== 'wall') {
        safeCells.push({ r, c, adj: state.grid[r][c].adjacent });
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
    const cell = state.grid[center.r][center.c];
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
        if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) {
          const neighbor = state.grid[nr][nc];
          if (neighbor.type === 'empty') {
            neighbor.type = 'gold';
            neighbor.goldValue = 5;
          }
        }
      }
    }
  }

  // Scatter some low-value gold (value 1) on remaining empty cells
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.grid[r][c].type === 'empty' && Math.random() < 0.2) {
        state.grid[r][c].type = 'gold';
        state.grid[r][c].goldValue = 1;
      }
    }
  }
}

function debugRevealAll() {
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      state.revealed[r][c] = true;
    }
  }
  renderGrid();
}

function isAdjacentToPlayer(r, c) {
  const dr = Math.abs(r - state.playerRow);
  const dc = Math.abs(c - state.playerCol);
  if (dr === 0 && dc === 0) return false;
  return dr <= 1 && dc <= 1;
}

function collectGoldAt(r, c) {
  const cell = state.grid[r][c];
  if (cell.type === 'gold' && cell.goldValue > 0) {
    state.gold += cell.goldValue;
    cell.goldValue = 0;
  }
}

// Dig into a gas cell: mark it as detonated (passable, no icon, leaves a
// red cross marker). Neighbor adjacency numbers are intentionally NOT
// recomputed — a revealed "3" stays "3" even after you detonate one of
// the three gases, preserving the deduction info the player already
// earned.
function detonateGas(r, c) {
  state.grid[r][c].type = 'detonated';
  state.grid[r][c].goldValue = 0;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Animate the player along a path of revealed cells. Returns true if the
// walk completed (including winning on the exit); returns false if
// something stopped it (e.g., win handled).
async function animateWalk(path) {
  for (let i = 1; i < path.length; i++) {
    await sleep(STEP_MS);
    state.playerRow = path[i].r;
    state.playerCol = path[i].c;
    collectGoldAt(path[i].r, path[i].c);
    updateHud();
    renderGrid();

    if (path[i].r === state.exit.r && path[i].c === state.exit.c) {
      state.gameOver = true;
      addToLifetimeGold(state.gold);
      showEscapedOverlay();
      return false;
    }
  }
  return true;
}

// Among the 8 neighbors of (tr, tc), find the revealed non-wall cell
// reachable from the player with the shortest path. Returns { r, c, path }
// or null.
function findBestApproach(tr, tc) {
  let best = null;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = tr + dr;
      const nc = tc + dc;
      if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
      if (!state.revealed[nr][nc]) continue;
      const t = state.grid[nr][nc].type;
      if (t === 'wall' || t === 'gas') continue;
      const path = findPath(state.playerRow, state.playerCol, nr, nc);
      if (!path) continue;
      if (!best || path.length < best.path.length) {
        best = { r: nr, c: nc, path };
      }
    }
  }
  return best;
}

async function handleClick(r, c) {
  if (state.gameOver) return;
  if (state.busy) return;
  if (state.grid[r][c].type === 'wall') return;

  state.busy = true;
  try {
    // Clicked a revealed cell: just walk to it.
    if (state.revealed[r][c]) {
      const path = findPath(state.playerRow, state.playerCol, r, c);
      if (!path || path.length < 2) return;
      await animateWalk(path);
      return;
    }

    // Clicked an unrevealed cell.
    if (state.flagged[r][c]) return;

    // If adjacent, dig directly. Otherwise walk to the nearest revealed
    // cell adjacent to the target, then dig.
    if (!isAdjacentToPlayer(r, c)) {
      const approach = findBestApproach(r, c);
      if (!approach) return;
      const walked = await animateWalk(approach.path);
      if (!walked) return;
      await sleep(STEP_MS);
    }

    if (!isAdjacentToPlayer(r, c)) return;

    const cell = state.grid[r][c];
    if (cell.type === 'gas') {
      state.hp--;
      detonateGas(r, c);
      state.revealed[r][c] = true;
      state.playerRow = r;
      state.playerCol = c;
      updateHud();
      renderGrid();

      if (state.hp <= 0) {
        state.gameOver = true;
        addToLifetimeGold(state.gold);
        showDeathOverlay();
        return;
      }
    } else {
      revealCell(r, c);
      state.playerRow = r;
      state.playerCol = c;
      collectGoldAt(r, c);
      updateHud();
      renderGrid();

      if (r === state.exit.r && c === state.exit.c) {
        state.gameOver = true;
        addToLifetimeGold(state.gold);
        showEscapedOverlay();
        return;
      }
    }
  } finally {
    state.busy = false;
  }
}

function ensureSafeStart(r, c) {
  // Clear gas and walls from the start cell and its 8 neighbors
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
      const cell = state.grid[nr][nc];
      if (cell.type === 'gas') {
        cell.type = 'empty';
        cell.goldValue = 0;
        // Relocate gas to a distant cell
        let relocated = false;
        let attempts = 0;
        while (!relocated && attempts < 500) {
          attempts++;
          const rr = Math.floor(Math.random() * state.rows);
          const rc = Math.floor(Math.random() * state.cols);
          const dist = Math.abs(rr - r) + Math.abs(rc - c);
          if (state.grid[rr][rc].type === 'empty' && dist > 3) {
            state.grid[rr][rc].type = 'gas';
            relocated = true;
          }
        }
      }
      if (cell.type === 'wall') {
        cell.type = 'empty';
      }
    }
  }
  // Recalculate adjacency for all non-gas, non-wall cells
  for (let row = 0; row < state.rows; row++) {
    for (let col = 0; col < state.cols; col++) {
      const c2 = state.grid[row][col];
      if (c2.type !== 'gas' && c2.type !== 'wall') {
        c2.adjacent = countAdjacentGas(row, col);
      }
    }
  }
}

function revealCell(r, c) {
  if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return;
  if (state.revealed[r][c]) return;
  if (state.grid[r][c].type === 'gas') return;
  if (state.grid[r][c].type === 'wall') return;

  state.revealed[r][c] = true;
  const cell = state.grid[r][c];

  if (cell.adjacent === 0) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        revealCell(r + dr, c + dc);
      }
    }
  }
}


function handleRightClick(r, c) {
  if (state.gameOver) return;
  if (state.grid[r][c].type === 'wall') return;  // NEW
  if (state.revealed[r][c]) return;
  state.flagged[r][c] = !state.flagged[r][c];
  renderGrid();
}





// ============================================================
// INIT
// ============================================================

function initLevel() {
  state.gold = 0;
  state.hp = MAX_HP;
  state.gameOver = false;
  state.busy = false;

  const maxAttempts = 50;
  let solved = false;

  for (let attempt = 0; attempt < maxAttempts && !solved; attempt++) {
    state.revealed = Array.from({ length: state.rows }, () => Array(state.cols).fill(false));
    state.flagged = Array.from({ length: state.rows }, () => Array(state.cols).fill(false));
    const gasCount = Math.floor(state.rows * state.cols * 0.20);
    generateGrid(gasCount);

    const start = pickPlayerStart();
    if (!start) continue;
    state.playerRow = start.r;
    state.playerCol = start.c;
    ensureSafeStart(state.playerRow, state.playerCol);

    const exit = pickExit(state.playerRow, state.playerCol);
    if (!exit) continue;
    state.exit = exit;

    // Exit cell itself must not be gas
    if (state.grid[exit.r][exit.c].type === 'gas') {
      state.grid[exit.r][exit.c].type = 'empty';
      // recompute adjacency for neighbors (a gas was removed)
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = exit.r + dr;
          const nc = exit.c + dc;
          if (nr < 0 || nr >= state.rows || nc < 0 || nc >= state.cols) continue;
          const c2 = state.grid[nr][nc];
          if (c2.type !== 'gas' && c2.type !== 'wall') {
            c2.adjacent = countAdjacentGas(nr, nc);
          }
        }
      }
    }

    // Exit cell should not carry gold — keeps the exit cell mechanically clean
    if (state.grid[exit.r][exit.c].type === 'gold') {
      state.grid[exit.r][exit.c].type = 'empty';
      state.grid[exit.r][exit.c].goldValue = 0;
    }

    if (isReachable(state.playerRow, state.playerCol, exit.r, exit.c)) {
      solved = true;
    }
  }

  if (!solved) {
    console.warn('initLevel: 50 attempts failed, carving a guaranteed path from player to exit');
    carvePath(state.playerRow, state.playerCol, state.exit.r, state.exit.c);
  }

  // Pre-reveal exit cell and the player's starting cell only (no cascade — player digs from turn 1)
  state.revealed[state.exit.r][state.exit.c] = true;
  state.revealed[state.playerRow][state.playerCol] = true;
  collectGoldAt(state.playerRow, state.playerCol);

  updateHud();
  renderGrid();
  hideOverlay();
}

function showStartScreen() {
  showOverlay(`
    <h2>Mining Crawler</h2>
    <p>Reach the exit (🚪) to escape.</p>
    <p>Dig adjacent cells to reveal paths. Numbers count nearby gas.</p>
    <p>You have 3 ❤️. Digging gas costs 1 ❤️. Gold is optional treasure.</p>
    <button onclick="startGame()">Start Run</button>
  `);
}

const LIFETIME_GOLD_KEY = 'miningCrawler.lifetimeGold';

function addToLifetimeGold(amount) {
  const cur = parseInt(localStorage.getItem(LIFETIME_GOLD_KEY) || '0', 10);
  localStorage.setItem(LIFETIME_GOLD_KEY, String(cur + amount));
}

function getLifetimeGold() {
  return parseInt(localStorage.getItem(LIFETIME_GOLD_KEY) || '0', 10);
}

function startGame() {
  state.rows = 12;
  state.cols = 12;
  initLevel();
}

showStartScreen();
