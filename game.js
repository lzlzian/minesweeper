// ============================================================
// STATE
// ============================================================

const state = {
  level: 1,
  gold: 0,
  goldQuota: 0,
  dynamite: 0,
  rows: 0,
  cols: 0,
  gasCount: 0,
  grid: [],        // 2D array of cell objects
  revealed: [],    // 2D bool
  flagged: [],     // 2D bool
  gameOver: false,
  playerRow: 0,
  playerCol: 0,
};

// Cell object shape:
// { type: 'empty' | 'gas' | 'gold', adjacent: number, goldValue: 0 }

// ============================================================
// UI REFERENCES
// ============================================================

const gridContainer = document.getElementById('grid-container');
const levelDisplay = document.getElementById('level-display');
const goldDisplay = document.getElementById('gold-display');
const dynamiteDisplay = document.getElementById('dynamite-display');
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

      if (state.revealed[r][c]) {
        const g = state.grid[r][c];
        cell.classList.add('revealed');

        if (isPlayer) {
          cell.classList.add('player');
        }

        if (g.type === 'gold') {
          cell.classList.add('gold');
          if (g.adjacent > 0) {
            cell.textContent = g.adjacent;
            cell.dataset.adjacent = g.adjacent;
          }
        } else if (g.type === 'rubble') {
          cell.classList.add('rubble');
          cell.textContent = '\u2716';
        } else if (g.adjacent > 0) {
          cell.textContent = g.adjacent;
          cell.dataset.adjacent = g.adjacent;
        }
      } else if (state.flagged[r][c]) {
        cell.classList.add('flagged');
        if (isAdjacent) cell.classList.add('reachable');
      } else {
        if (isAdjacent) cell.classList.add('reachable');
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
  levelDisplay.textContent = `Level: ${state.level}`;
  goldDisplay.textContent = `Gold: ${state.gold} / ${state.goldQuota}`;
  dynamiteDisplay.textContent = `Dynamite: ${state.dynamite}`;

  dynamiteDisplay.classList.toggle('warning', state.dynamite <= 5);
  goldDisplay.classList.toggle('success', state.gold >= state.goldQuota);
}

function showOverlay(html) {
  overlayContent.innerHTML = html;
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

// ============================================================
// PLACEHOLDER — filled in next tasks
// ============================================================

function generateGrid() {
  // Initialize empty grid
  state.grid = Array.from({ length: state.rows }, () =>
    Array.from({ length: state.cols }, () => ({
      type: 'empty',
      adjacent: 0,
      goldValue: 0,
    }))
  );

  // Place gas pockets randomly
  let placed = 0;
  while (placed < state.gasCount) {
    const r = Math.floor(Math.random() * state.rows);
    const c = Math.floor(Math.random() * state.cols);
    if (state.grid[r][c].type === 'empty') {
      state.grid[r][c].type = 'gas';
      placed++;
    }
  }

  // Calculate adjacency numbers
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      if (state.grid[r][c].type === 'gas') continue;
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
      if (state.grid[r][c].type !== 'gas') {
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

function handleClick(r, c) {
  if (state.gameOver) return;

  // Click on revealed cell = move there (free, if adjacent)
  if (state.revealed[r][c]) {
    if (!isAdjacentToPlayer(r, c)) return;
    if (state.grid[r][c].type === 'rubble') return;
    state.playerRow = r;
    state.playerCol = c;
    renderGrid();
    return;
  }

  // Click on unrevealed cell = dig (costs dynamite, must be adjacent)
  if (!isAdjacentToPlayer(r, c)) return;
  if (state.flagged[r][c]) return;
  if (state.dynamite <= 0) return;

  // Spend dynamite
  state.dynamite--;

  const cell = state.grid[r][c];

  if (cell.type === 'gas') {
    explodeGas(r, c);
    // Player stays where they are (explosion pushes them back)
  } else {
    revealCell(r, c);
    // Move player to the newly dug cell
    state.playerRow = r;
    state.playerCol = c;
  }

  updateHud();
  renderGrid();
  checkWinLoss();
}

function ensureSafeStart(r, c) {
  // Clear gas from start cell and its immediate neighbors
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) {
        if (state.grid[nr][nc].type === 'gas') {
          state.grid[nr][nc].type = 'empty';
          state.grid[nr][nc].goldValue = 0;
          // Relocate gas elsewhere
          let placed = false;
          while (!placed) {
            const rr = Math.floor(Math.random() * state.rows);
            const rc = Math.floor(Math.random() * state.cols);
            const dist = Math.abs(rr - r) + Math.abs(rc - c);
            if (state.grid[rr][rc].type === 'empty' && dist > 3) {
              state.grid[rr][rc].type = 'gas';
              placed = true;
            }
          }
        }
      }
    }
  }
  // Recalculate all adjacency numbers
  for (let row = 0; row < state.rows; row++) {
    for (let col = 0; col < state.cols; col++) {
      if (state.grid[row][col].type !== 'gas') {
        state.grid[row][col].adjacent = countAdjacentGas(row, col);
      }
    }
  }
}

function revealCell(r, c) {
  if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return;
  if (state.revealed[r][c]) return;
  if (state.grid[r][c].type === 'gas') return;
  if (state.grid[r][c].type === 'rubble') return;

  state.revealed[r][c] = true;
  const cell = state.grid[r][c];

  // Collect gold if present
  if (cell.type === 'gold') {
    state.gold += cell.goldValue;
  }

  // Cascade if no adjacent gas
  if (cell.adjacent === 0) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        revealCell(r + dr, c + dc);
      }
    }
  }
}

function explodeGas(r, c) {
  // Destroy the gas cell and its 8 neighbors
  const destroyed = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) {
        destroyed.push({ r: nr, c: nc });
        state.grid[nr][nc].type = 'rubble';
        state.grid[nr][nc].goldValue = 0;
        state.grid[nr][nc].adjacent = 0;
        state.revealed[nr][nc] = true;
      }
    }
  }

  // Recalculate adjacency for all non-gas, non-rubble cells near the explosion
  // (because destroyed gas pockets lower their neighbors' counts)
  for (const d of destroyed) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = d.r + dr;
        const nc = d.c + dc;
        if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) {
          const cell = state.grid[nr][nc];
          if (cell.type !== 'gas' && cell.type !== 'rubble') {
            cell.adjacent = countAdjacentGas(nr, nc);
          }
        }
      }
    }
  }
}

function handleRightClick(r, c) {
  if (state.gameOver) return;
  if (state.revealed[r][c]) return;
  state.flagged[r][c] = !state.flagged[r][c];
  renderGrid();
}

function checkWinLoss() {
  // Win: hit gold quota
  if (state.gold >= state.goldQuota) {
    state.gameOver = true;
    const surplus = state.gold - state.goldQuota;
    showOverlay(`
      <h2>Mine Complete!</h2>
      <p>Gold collected: ${state.gold}</p>
      <p>Surplus: +${surplus}</p>
      <p>Dynamite remaining: ${state.dynamite}</p>
      <button onclick="nextLevel()">Next Level</button>
    `);
    return;
  }

  // Lose: out of dynamite
  if (state.dynamite <= 0) {
    state.gameOver = true;
    showOverlay(`
      <h2>Out of Dynamite!</h2>
      <p>Gold collected: ${state.gold} / ${state.goldQuota}</p>
      <p>Levels cleared: ${state.level - 1}</p>
      <button onclick="restartGame()">New Run</button>
    `);
    return;
  }
}

function getLevelConfig(level) {
  // Base values scale with level
  const rows = Math.min(9 + Math.floor(level / 3), 14);
  const cols = rows;
  const totalCells = rows * cols;
  const gasDensity = Math.min(0.12 + level * 0.01, 0.25);
  const gasCount = Math.floor(totalCells * gasDensity);
  const goldQuota = 30 + (level - 1) * 20;
  const dynamite = Math.max(Math.floor(totalCells * 0.35) - level, 15);

  return { rows, cols, gasCount, goldQuota, dynamite };
}

function nextLevel() {
  const surplus = state.gold - state.goldQuota;
  state.level++;
  const config = getLevelConfig(state.level);
  state.rows = config.rows;
  state.cols = config.cols;
  state.gasCount = config.gasCount;
  state.goldQuota = config.goldQuota;
  state.dynamite = config.dynamite;
  initLevel();
  // Carry over surplus gold from previous level
  state.gold = Math.max(0, surplus);
  updateHud();
}

function restartGame() {
  state.level = 1;
  const config = getLevelConfig(1);
  state.rows = config.rows;
  state.cols = config.cols;
  state.gasCount = config.gasCount;
  state.goldQuota = config.goldQuota;
  state.dynamite = config.dynamite;
  initLevel();
}

// ============================================================
// INIT
// ============================================================

function initLevel() {
  state.gold = 0;
  state.gameOver = false;
  state.revealed = Array.from({ length: state.rows }, () => Array(state.cols).fill(false));
  state.flagged = Array.from({ length: state.rows }, () => Array(state.cols).fill(false));
  generateGrid();

  // Place player at top-left corner, ensure it's safe
  state.playerRow = 0;
  state.playerCol = 0;
  ensureSafeStart(0, 0);
  revealCell(0, 0);

  updateHud();
  renderGrid();
  hideOverlay();
}

function showStartScreen() {
  showOverlay(`
    <h2>Mine Sweeper</h2>
    <p>Dig through the mine to extract gold.</p>
    <p>You can only dig cells next to you.</p>
    <p>Numbers show nearby gas pockets — avoid them!</p>
    <p>Hit the gold quota to advance.</p>
    <button onclick="startGame()">Start Mining</button>
  `);
}

function startGame() {
  state.level = 1;
  const config = getLevelConfig(1);
  state.rows = config.rows;
  state.cols = config.cols;
  state.gasCount = config.gasCount;
  state.goldQuota = config.goldQuota;
  state.dynamite = config.dynamite;
  initLevel();
}

showStartScreen();
