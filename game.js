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

function generateGrid() {}
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
