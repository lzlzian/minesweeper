// ============================================================
// STATE
// ============================================================

const state = {
  level: 1,
  gold: 0,
  goldQuota: 30,
  dynamite: 25,
  rows: 9,
  cols: 9,
  gasCount: 10,
  grid: [],        // 2D array of cell objects
  revealed: [],    // 2D bool
  flagged: [],     // 2D bool
  gameOver: false,
  firstClick: true,
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

      if (state.revealed[r][c]) {
        const g = state.grid[r][c];
        cell.classList.add('revealed');

        if (g.type === 'gold') {
          cell.classList.add('gold');
          cell.textContent = `+${g.goldValue}`;
        } else if (g.type === 'rubble') {
          cell.classList.add('rubble');
          cell.textContent = '\u2716';
        } else if (g.adjacent > 0) {
          cell.textContent = g.adjacent;
          cell.dataset.adjacent = g.adjacent;
        }
      } else if (state.flagged[r][c]) {
        cell.classList.add('flagged');
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

function handleClick(r, c) {}
function handleRightClick(r, c) {}

// ============================================================
// INIT
// ============================================================

function initLevel() {
  state.gold = 0;
  state.gameOver = false;
  state.firstClick = true;
  state.revealed = Array.from({ length: state.rows }, () => Array(state.cols).fill(false));
  state.flagged = Array.from({ length: state.rows }, () => Array(state.cols).fill(false));
  generateGrid();
  updateHud();
  renderGrid();
  hideOverlay();
}

initLevel();
