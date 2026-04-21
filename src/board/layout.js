import {
  getGrid, getRows, getCols,
  getStartCornerIdx, setStartCornerIdx,
  getRevealed,
} from '../state.js';

// Orthogonal directions first so ties are broken in favor of cardinal
// moves over diagonal ones.
export const STEP_DIRS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [-1, 1], [1, -1], [1, 1],
];

// Search outward from (anchorR, anchorC) in increasing Chebyshev distance
// for a non-wall cell. Used to anchor player/exit near a corner even when
// the corner itself got walled.
export function findNearCorner(anchorR, anchorC) {
  const maxDist = Math.max(getRows(), getCols());
  for (let d = 0; d < maxDist; d++) {
    for (let r = Math.max(0, anchorR - d); r <= Math.min(getRows() - 1, anchorR + d); r++) {
      for (let c = Math.max(0, anchorC - d); c <= Math.min(getCols() - 1, anchorC + d); c++) {
        if (Math.max(Math.abs(r - anchorR), Math.abs(c - anchorC)) !== d) continue;
        if (getGrid()[r][c].type === 'wall') continue;
        return { r, c };
      }
    }
  }
  return null;
}

export function pickPlayerStart() {
  const corners = [
    { r: 0, c: 0 },
    { r: 0, c: getCols() - 1 },
    { r: getRows() - 1, c: 0 },
    { r: getRows() - 1, c: getCols() - 1 },
  ];
  const cornerIdx = Math.floor(Math.random() * 4);
  setStartCornerIdx(cornerIdx);
  const anchor = corners[cornerIdx];
  return findNearCorner(anchor.r, anchor.c);
}

export function pickExit(playerR, playerC) {
  // Exit sits in the corner diagonally opposite to the player's start corner.
  const corners = [
    { r: 0, c: 0 },
    { r: 0, c: getCols() - 1 },
    { r: getRows() - 1, c: 0 },
    { r: getRows() - 1, c: getCols() - 1 },
  ];
  const oppositeIdx = 3 - getStartCornerIdx();
  const anchor = corners[oppositeIdx];
  const found = findNearCorner(anchor.r, anchor.c);
  if (!found) return null;
  if (found.r === playerR && found.c === playerC) return null;
  if (!hasNonWallNeighbor(found.r, found.c)) return null;
  return found;
}

export function pickMerchantCorner() {
  // Pick one of the two corners not used by player or exit.
  // Corner indices: 0=TL, 1=TR, 2=BL, 3=BR. Player = getStartCornerIdx(),
  // exit = 3 - getStartCornerIdx(). Off-diagonal corners are the other two.
  const playerIdx = getStartCornerIdx();
  const exitIdx = 3 - playerIdx;
  const offDiagonal = [0, 1, 2, 3].filter(i => i !== playerIdx && i !== exitIdx);
  const pickedIdx = offDiagonal[Math.floor(Math.random() * offDiagonal.length)];
  const corners = [
    { r: 0, c: 0 },
    { r: 0, c: getCols() - 1 },
    { r: getRows() - 1, c: 0 },
    { r: getRows() - 1, c: getCols() - 1 },
  ];
  const anchor = corners[pickedIdx];
  const found = findNearCorner(anchor.r, anchor.c);
  if (!found) return null;
  if (!hasNonWallNeighbor(found.r, found.c)) return null;
  return found;
}

export function hasNonWallNeighbor(r, c) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= getRows() || nc < 0 || nc >= getCols()) continue;
      if (getGrid()[nr][nc].type !== 'wall') return true;
    }
  }
  return false;
}

// Can (fromR, fromC) reach (toR, toC) through non-wall, non-gas cells?
// Ignores revealed state — answers "is the board theoretically navigable?"
// Use during level generation to validate solvability.
export function isReachable(fromR, fromC, toR, toC) {
  const visited = Array.from({ length: getRows() }, () =>
    Array(getCols()).fill(false)
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
        if (nr < 0 || nr >= getRows() || nc < 0 || nc >= getCols()) continue;
        if (visited[nr][nc]) continue;
        const t = getGrid()[nr][nc].type;
        if (t === 'wall' || t === 'gas') continue;
        visited[nr][nc] = true;
        queue.push({ r: nr, c: nc });
      }
    }
  }
  return false;
}

// Find a BFS path from (fromR, fromC) to (toR, toC), only crossing
// cells the player has already revealed — respects fog-of-war.
// Use during player movement; returns null if no revealed path exists.
export function findPath(fromR, fromC, toR, toC) {
  if (fromR === toR && fromC === toC) return [{ r: fromR, c: fromC }];
  const visited = Array.from({ length: getRows() }, () =>
    Array(getCols()).fill(null)
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
      if (nr < 0 || nr >= getRows() || nc < 0 || nc >= getCols()) continue;
      if (visited[nr][nc] !== null) continue;
      const t = getGrid()[nr][nc].type;
      if (t === 'wall' || t === 'gas') continue;
      if (!getRevealed()[nr][nc]) continue;
      visited[nr][nc] = { r, c };
      queue.push({ r: nr, c: nc });
    }
  }
  return null;
}
