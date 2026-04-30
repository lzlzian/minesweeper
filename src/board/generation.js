import {
  getGrid, setGrid, getRows, getCols,
  getBiomeOverrides, hasArtifact,
} from '../state.js';

const REGIONAL_BRANCH_LEAK_LIMIT = 0.20;
const REGIONAL_VERSION = 1;
const DIRS_8 = [
  [-1, -1], [-1, 0], [-1, 1],
  [ 0, -1],          [ 0, 1],
  [ 1, -1], [ 1, 0], [ 1, 1],
];
const ITEM_DROP_TYPES = ['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross'];

function makeCell(type = 'empty') {
  return {
    type,
    adjacent: 0,
    goldValue: 0,
    item: null,
    chest: false,
    preview: null,
    crystal: false,
    crystalUsed: false,
    crystalGoldValue: 0,
    crystalClueCount: 0,
    crystalClueRadius: 0,
  };
}

function cellKey(r, c) {
  return `${r},${c}`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function shuffleInPlace(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randomItemType() {
  return ITEM_DROP_TYPES[Math.floor(Math.random() * ITEM_DROP_TYPES.length)];
}

function regionalItemDropCount(features) {
  if (features.itemDropCount !== undefined) return Math.max(0, features.itemDropCount);
  if (features.itemDrop !== undefined) return features.itemDrop ? 1 : 0;
  return getBiomeOverrides()?.guaranteedItemDrops ?? (Math.random() < 0.5 ? 1 : 0);
}

function branchFeatureCapacity(rows) {
  if (rows <= 12) return 2;
  if (rows <= 14) return 3;
  return 4;
}

function resolveRegionalFeatures(features, requestedItemDrops, generation = {}) {
  const capacity = branchFeatureCapacity(getRows()) + (generation.branchCapacityBonus ?? 0);
  const requests = [
    { purpose: 'joker', enabled: !!features.joker },
    { purpose: 'merchant', enabled: !!features.merchant },
    { purpose: 'fountain', enabled: !!features.fountain },
    { purpose: 'item', enabled: requestedItemDrops > 0 },
  ];
  const selected = new Set(requests
    .filter(request => request.enabled)
    .slice(0, capacity)
    .map(request => request.purpose));
  const suppressed = requests
    .filter(request => request.enabled && !selected.has(request.purpose))
    .map(request => request.purpose);

  return {
    branchCapacity: capacity,
    suppressedBranchPlans: suppressed,
    requestedItemDrops: selected.has('item') ? requestedItemDrops : 0,
    features: {
      ...features,
      merchant: selected.has('merchant'),
      fountain: selected.has('fountain'),
      joker: selected.has('joker'),
      itemDrop: selected.has('item'),
      itemDropCount: selected.has('item') ? requestedItemDrops : 0,
    },
  };
}

function createRegion(meta, id, kind, props = {}) {
  const region = {
    id,
    kind,
    cells: [],
    entrance: null,
    rewardCells: [],
    targetRiskGates: 0,
    actualRiskGates: 0,
    ...props,
  };
  meta.regions.push(region);
  meta.regionById?.set(id, region);
  return region;
}

function regionById(meta, id) {
  return meta.regionById?.get(id) ?? meta.regions.find(candidate => candidate.id === id);
}

function markRegionCell(meta, region, r, c, genTag = null) {
  if (r < 0 || r >= getRows() || c < 0 || c >= getCols()) return false;
  const key = cellKey(r, c);
  const previous = meta.regionByCell.get(key);
  if (previous && previous !== region.id) return false;

  const cell = getGrid()[r][c];
  cell.type = 'empty';
  cell.goldValue = 0;
  cell.item = null;
  cell.chest = false;
  cell.preview = null;
  cell.crystal = false;
  cell.crystalUsed = false;
  cell.crystalGoldValue = 0;
  cell.crystalClueCount = 0;
  cell.crystalClueRadius = 0;

  if (!previous) {
    meta.regionByCell.set(key, region.id);
    region.cells.push({ r, c });
    if (region.kind === 'spine') meta.spineCells.add(key);
    if (region.kind === 'branch' || region.kind === 'vault') meta.branchCells.add(key);
  }

  if (genTag) {
    if (!region.tags) region.tags = {};
    if (!region.tags[genTag]) region.tags[genTag] = [];
    region.tags[genTag].push({ r, c });
  }
  return true;
}

function makeCornerTransform(start) {
  const flipR = start.r !== 0;
  const flipC = start.c !== 0;
  return (r, c) => ({
    r: flipR ? getRows() - 1 - r : r,
    c: flipC ? getCols() - 1 - c : c,
  });
}

function carveCanonicalCell(meta, region, tx, r, c, genTag = null) {
  const p = tx(r, c);
  return markRegionCell(meta, region, p.r, p.c, genTag);
}

function carveCanonicalRect(meta, region, tx, r0, c0, r1, c1, genTag = null) {
  const rr0 = clamp(Math.min(r0, r1), 0, getRows() - 1);
  const rr1 = clamp(Math.max(r0, r1), 0, getRows() - 1);
  const cc0 = clamp(Math.min(c0, c1), 0, getCols() - 1);
  const cc1 = clamp(Math.max(c0, c1), 0, getCols() - 1);
  for (let r = rr0; r <= rr1; r++) {
    for (let c = cc0; c <= cc1; c++) {
      carveCanonicalCell(meta, region, tx, r, c, genTag);
    }
  }
}

function isProtectedRegionalCell(meta, r, c) {
  const key = cellKey(r, c);
  if (meta.spineCells.has(key)) return true;
  for (const region of meta.regions) {
    if (region.rewardCells.some(cell => cell.r === r && cell.c === c)) return true;
  }
  return false;
}

function placeGasAt(meta, r, c, { allowRegion = false } = {}) {
  if (r < 0 || r >= getRows() || c < 0 || c >= getCols()) return false;
  if (!allowRegion && meta.regionByCell.has(cellKey(r, c))) return false;
  if (isProtectedRegionalCell(meta, r, c) && !(allowRegion && meta.spineCells.has(cellKey(r, c)))) return false;
  const cell = getGrid()[r][c];
  if (cell.type === 'gas') return true;
  if (cell.type !== 'wall' && cell.type !== 'empty') return false;
  cell.type = 'gas';
  cell.goldValue = 0;
  cell.item = null;
  cell.chest = false;
  cell.preview = null;
  cell.crystal = false;
  cell.crystalUsed = false;
  cell.crystalGoldValue = 0;
  cell.crystalClueCount = 0;
  cell.crystalClueRadius = 0;
  return true;
}

function collectAdjacentCandidates(r, c, predicate) {
  const out = [];
  for (const [dr, dc] of DIRS_8) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nr >= getRows() || nc < 0 || nc >= getCols()) continue;
    if (!predicate(nr, nc)) continue;
    out.push({ r: nr, c: nc });
  }
  return out;
}

function touchesRegion(meta, r, c, regionKind) {
  for (const [dr, dc] of DIRS_8) {
    const nr = r + dr;
    const nc = c + dc;
    const regionId = meta.regionByCell.get(cellKey(nr, nc));
    if (!regionId) continue;
    const region = regionById(meta, regionId);
    if (region?.kind === regionKind) return true;
  }
  return false;
}

function recomputeAllAdjacency() {
  for (let r = 0; r < getRows(); r++) {
    for (let c = 0; c < getCols(); c++) {
      const cell = getGrid()[r][c];
      if (cell.type === 'gas' || cell.type === 'wall') continue;
      cell.adjacent = countAdjacentGas(r, c);
    }
  }
}

function pushProtectedCell(meta, cell) {
  if (!meta.protectedCells) meta.protectedCells = [];
  if (!meta.protectedCellKeys) meta.protectedCellKeys = new Set();
  const key = cellKey(cell.r, cell.c);
  if (meta.protectedCellKeys.has(key)) return;
  meta.protectedCellKeys.add(key);
  meta.protectedCells.push({ r: cell.r, c: cell.c });
}

function carveCanonicalWideLine(meta, region, tx, from, to, width, genTag = null) {
  const halfA = Math.floor((width - 1) / 2);
  const halfB = width - 1 - halfA;
  let r = from.r;
  let c = from.c;
  const vertical = from.c === to.c;
  const horizontal = from.r === to.r;

  const carveWideCell = (cr, cc) => {
    if (vertical) {
      for (let off = -halfA; off <= halfB; off++) carveCanonicalCell(meta, region, tx, cr, cc + off, genTag);
    } else if (horizontal) {
      for (let off = -halfA; off <= halfB; off++) carveCanonicalCell(meta, region, tx, cr + off, cc, genTag);
    } else {
      carveCanonicalRect(meta, region, tx, cr - halfA, cc - halfA, cr + halfB, cc + halfB, genTag);
    }
  };

  carveWideCell(r, c);
  while (r !== to.r || c !== to.c) {
    if (r < to.r) r++;
    else if (r > to.r) r--;
    else if (c < to.c) c++;
    else if (c > to.c) c--;
    carveWideCell(r, c);
  }
}

function chooseSpineWaypoints(rows, cols, { avoidDense = false } = {}) {
  const cNear = randInt(2, Math.max(2, Math.floor(cols * 0.35)));
  const cMid = randInt(Math.max(3, Math.floor(cols * 0.38)), Math.min(cols - 4, Math.floor(cols * 0.62)));
  const cFar = randInt(Math.min(cols - 3, Math.ceil(cols * 0.65)), cols - 3);
  const rNear = randInt(2, Math.max(2, Math.floor(rows * 0.35)));
  const rMid = randInt(Math.max(3, Math.floor(rows * 0.38)), Math.min(rows - 4, Math.floor(rows * 0.62)));
  const rFar = randInt(Math.min(rows - 3, Math.ceil(rows * 0.65)), rows - 3);

  const templates = [
    {
      name: 'upper-hook',
      points: [{ r: 1, c: 1 }, { r: 1, c: cFar }, { r: rNear, c: cFar }, { r: rNear, c: cols - 2 }, { r: rows - 2, c: cols - 2 }],
    },
    {
      name: 'left-hook',
      points: [{ r: 1, c: 1 }, { r: rFar, c: 1 }, { r: rFar, c: cNear }, { r: rows - 2, c: cNear }, { r: rows - 2, c: cols - 2 }],
    },
    {
      name: 'zigzag',
      points: [{ r: 1, c: 1 }, { r: rNear, c: 1 }, { r: rNear, c: cFar }, { r: rMid, c: cFar }, { r: rMid, c: cNear }, { r: rFar, c: cNear }, { r: rFar, c: cols - 2 }, { r: rows - 2, c: cols - 2 }],
    },
    {
      name: 'corner-loop',
      points: [{ r: 1, c: 1 }, { r: 1, c: cols - 2 }, { r: rows - 2, c: cols - 2 }],
    },
    {
      name: 'low-loop',
      points: [{ r: 1, c: 1 }, { r: rows - 2, c: 1 }, { r: rows - 2, c: cols - 2 }],
    },
    {
      name: 'offset-dogleg',
      points: [{ r: 1, c: 1 }, { r: rNear, c: 1 }, { r: rNear, c: cMid }, { r: rFar, c: cMid }, { r: rFar, c: cols - 2 }, { r: rows - 2, c: cols - 2 }],
    },
  ];
  const pool = avoidDense
    ? templates.filter(template => template.name !== 'zigzag')
    : templates;
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildBranchCandidate(meta, root, dir, plan) {
  const perp = { r: -dir.c, c: dir.r };
  const cells = [];
  const cellKeys = new Set();
  const add = (r, c, tag) => {
    const key = cellKey(r, c);
    if (cellKeys.has(key)) return;
    cellKeys.add(key);
    cells.push({ r, c, tag });
  };

  const foyerDepth = Math.min(plan.corridorLen, plan.entryFoyerDepth ?? 3);
  const foyerHalfWidth = plan.corridorLen >= 2 ? 1 : 0;
  for (let d = 1; d <= plan.corridorLen; d++) {
    if (d === 1 || d > foyerDepth || foyerHalfWidth === 0) {
      add(root.r + dir.r * d, root.c + dir.c * d, d === 1 ? 'airlock' : 'branch_corridor');
      continue;
    }
    for (let w = -foyerHalfWidth; w <= foyerHalfWidth; w++) {
      add(
        root.r + dir.r * d + perp.r * w,
        root.c + dir.c * d + perp.c * w,
        'branch_foyer',
      );
    }
  }

  const widthLeft = Math.floor((plan.roomWidth - 1) / 2);
  const widthRight = plan.roomWidth - 1 - widthLeft;
  for (let d = plan.corridorLen + 1; d <= plan.corridorLen + plan.roomDepth; d++) {
    for (let w = -widthLeft; w <= widthRight; w++) {
      add(
        root.r + dir.r * d + perp.r * w,
        root.c + dir.c * d + perp.c * w,
        'branch_room',
      );
    }
  }

  if (cells.length === 0) return null;
  const entrance = cells[0];
  const featureCell = {
    r: root.r + dir.r * (plan.corridorLen + plan.roomDepth),
    c: root.c + dir.c * (plan.corridorLen + plan.roomDepth),
  };
  const rewardCell = {
    r: featureCell.r + perp.r * widthLeft,
    c: featureCell.c + perp.c * widthLeft,
  };

  for (const cell of cells) {
    if (cell.r < 0 || cell.r >= getRows() || cell.c < 0 || cell.c >= getCols()) return null;
    if (meta.regionByCell.has(cellKey(cell.r, cell.c))) return null;
    for (const [dr, dc] of DIRS_8) {
      const nr = cell.r + dr;
      const nc = cell.c + dc;
      const regionId = meta.regionByCell.get(cellKey(nr, nc));
      if (!regionId) continue;
      const region = regionById(meta, regionId);
      if (region?.kind === 'spine' && !(cell.r === entrance.r && cell.c === entrance.c)) return null;
      if (region?.kind === 'branch') return null;
    }
  }

  return { cells, entrance, featureCell, rewardCell };
}

function branchSearchLimits(plan) {
  const span = Math.min(getRows(), getCols());
  const compact = span <= 12;
  const generousDepth = compact ? 4 : Math.max(5, Math.floor(span * 0.42));
  const generousWidth = compact ? 5 : Math.max(5, Math.floor(span * 0.38));
  const generousCorridor = compact ? 3 : Math.max(4, Math.floor(span * 0.22));

  return {
    minCorridorLen: Math.max(1, plan.minCorridorLen ?? Math.min(plan.corridorLen, 2)),
    maxCorridorLen: Math.max(plan.corridorLen, plan.maxCorridorLen ?? generousCorridor),
    minRoomDepth: Math.max(1, plan.minRoomDepth ?? plan.roomDepth),
    maxRoomDepth: Math.max(plan.roomDepth, plan.maxRoomDepth ?? generousDepth),
    minRoomWidth: Math.max(1, plan.minRoomWidth ?? plan.roomWidth),
    maxRoomWidth: Math.max(plan.roomWidth, plan.maxRoomWidth ?? generousWidth),
  };
}

function branchCandidatesForRoot(meta, root, dir, plan) {
  const limits = branchSearchLimits(plan);
  const candidates = [];
  const descending = (max, min, step = 2) => {
    const values = [];
    for (let value = max; value >= min; value -= step) values.push(value);
    if (!values.includes(min)) values.push(min);
    return values;
  };
  for (let corridorLen = limits.maxCorridorLen; corridorLen >= limits.minCorridorLen; corridorLen--) {
    for (const roomDepth of descending(limits.maxRoomDepth, limits.minRoomDepth)) {
      for (const roomWidth of descending(limits.maxRoomWidth, limits.minRoomWidth)) {
        const exactPlan = { ...plan, corridorLen, roomDepth, roomWidth };
        const candidate = buildBranchCandidate(meta, root, dir, exactPlan);
        if (!candidate) continue;
        candidates.push({ ...candidate, plan: exactPlan });
      }
    }
  }
  return candidates;
}

function estimatedBranchCells(plan) {
  const foyerHalfWidth = plan.corridorLen >= 2 ? 1 : 0;
  const foyerDepth = Math.min(plan.corridorLen, plan.entryFoyerDepth ?? 3);
  const corridorCells = plan.corridorLen +
    (foyerHalfWidth > 0 ? Math.max(0, foyerDepth - 1) * 2 : 0);
  return corridorCells + plan.roomDepth * plan.roomWidth;
}

function branchDimensionPlans(plan) {
  const limits = branchSearchLimits(plan);
  const plans = [];
  const descending = (max, min, step = 2) => {
    const values = [];
    for (let value = max; value >= min; value -= step) values.push(value);
    if (!values.includes(min)) values.push(min);
    return values;
  };
  for (let corridorLen = limits.maxCorridorLen; corridorLen >= limits.minCorridorLen; corridorLen--) {
    for (const roomDepth of descending(limits.maxRoomDepth, limits.minRoomDepth)) {
      for (const roomWidth of descending(limits.maxRoomWidth, limits.minRoomWidth)) {
        const exactPlan = { ...plan, corridorLen, roomDepth, roomWidth };
        plans.push(exactPlan);
      }
    }
  }
  return plans.sort((a, b) => estimatedBranchCells(b) - estimatedBranchCells(a));
}

function bestBranchCandidateAtLargestSize(meta, planVariants, roots, dirs, minCornerDist) {
  for (const branchPlan of planVariants) {
    for (const exactPlan of branchDimensionPlans(branchPlan)) {
      let best = null;
      for (const root of roots) {
        const distStart = Math.max(Math.abs(root.r - meta.start.r), Math.abs(root.c - meta.start.c));
        const distExit = Math.max(Math.abs(root.r - meta.exit.r), Math.abs(root.c - meta.exit.c));
        if (distStart < minCornerDist || distExit < minCornerDist) continue;

        for (const dir of dirs) {
          const candidate = buildBranchCandidate(meta, root, dir, exactPlan);
          if (!candidate) continue;
          const candidateWithPlan = { ...candidate, plan: exactPlan };
          const score = scoreBranchCandidate(meta, candidateWithPlan);
          if (!best || score > best.score) {
            best = { branchPlan: exactPlan, candidate: candidateWithPlan, root, score };
          }
        }
      }
      if (best) return best;
    }
  }
  return null;
}

function scoreBranchCandidate(meta, candidate) {
  const feature = candidate.featureCell;
  const distStart = Math.max(Math.abs(feature.r - meta.start.r), Math.abs(feature.c - meta.start.c));
  const distExit = Math.max(Math.abs(feature.r - meta.exit.r), Math.abs(feature.c - meta.exit.c));
  return candidate.cells.length * 100 + Math.min(distStart, distExit) + Math.random();
}

function branchCellKeySet(branch) {
  if (branch.cellKeys) return branch.cellKeys;
  return new Set(branch.cells.map(cell => cellKey(cell.r, cell.c)));
}

function sameCell(a, b) {
  return !!a && !!b && a.r === b.r && a.c === b.c;
}

function branchPrimaryTarget(branch) {
  return branch.rewardCells[0] ?? branch.featureCell ?? null;
}

function isBranchReservedCell(branch, cell, { nearEntrance = true } = {}) {
  if (!cell) return true;
  if (sameCell(cell, branch.entrance)) return true;
  if (sameCell(cell, branch.featureCell)) return true;
  if (branch.rewardCells.some(reward => sameCell(cell, reward))) return true;
  if (nearEntrance && branch.entrance) {
    const distEntrance = Math.max(Math.abs(cell.r - branch.entrance.r), Math.abs(cell.c - branch.entrance.c));
    if (distEntrance <= 1) return true;
  }
  return false;
}

function branchIsReachable(branch) {
  const target = branchPrimaryTarget(branch);
  if (!branch.entrance || !target) return true;
  const branchKeys = branchCellKeySet(branch);
  const startKey = cellKey(branch.entrance.r, branch.entrance.c);
  const targetKey = cellKey(target.r, target.c);
  if (!branchKeys.has(startKey) || !branchKeys.has(targetKey)) return false;

  const queue = [branch.entrance];
  const visited = new Set([startKey]);
  while (queue.length) {
    const current = queue.shift();
    if (current.r === target.r && current.c === target.c) return true;
    for (const [dr, dc] of DIRS_8) {
      const nr = current.r + dr;
      const nc = current.c + dc;
      const key = cellKey(nr, nc);
      if (!branchKeys.has(key) || visited.has(key)) continue;
      const cell = getGrid()[nr][nc];
      if (cell.type === 'wall' || cell.type === 'gas') continue;
      visited.add(key);
      queue.push({ r: nr, c: nc });
    }
  }
  return false;
}

function cellKeySetIsReachable(keys, start, target) {
  const startKey = cellKey(start.r, start.c);
  const targetKey = cellKey(target.r, target.c);
  if (!keys.has(startKey) || !keys.has(targetKey)) return false;
  const queue = [start];
  const visited = new Set([startKey]);
  while (queue.length) {
    const current = queue.shift();
    if (current.r === target.r && current.c === target.c) return true;
    for (const [dr, dc] of DIRS_8) {
      const nr = current.r + dr;
      const nc = current.c + dc;
      const key = cellKey(nr, nc);
      if (!keys.has(key) || visited.has(key)) continue;
      const cell = getGrid()[nr]?.[nc];
      if (!cell || cell.type === 'wall' || cell.type === 'gas') continue;
      visited.add(key);
      queue.push({ r: nr, c: nc });
    }
  }
  return false;
}

function spineIsReachable(meta) {
  return cellKeySetIsReachable(meta.spineCells, meta.start, meta.exit);
}

function setBranchWallIfReachable(branch, cell) {
  if (isBranchReservedCell(branch, cell)) return false;
  if (!branchCellKeySet(branch).has(cellKey(cell.r, cell.c))) return false;
  const gridCell = getGrid()[cell.r][cell.c];
  if (gridCell.type !== 'empty') return false;
  gridCell.type = 'wall';
  gridCell.goldValue = 0;
  gridCell.item = null;
  gridCell.chest = false;
  gridCell.preview = null;
  gridCell.crystal = false;
  gridCell.crystalUsed = false;
  gridCell.crystalGoldValue = 0;
  gridCell.crystalClueCount = 0;
  gridCell.crystalClueRadius = 0;
  if (!branchIsReachable(branch)) {
    gridCell.type = 'empty';
    return false;
  }
  if (!branch.wallCells) branch.wallCells = [];
  branch.wallCells.push({ r: cell.r, c: cell.c });
  return true;
}

function placeSpineGasIfReachable(meta, r, c) {
  if (!placeGasAt(meta, r, c, { allowRegion: true })) return false;
  if (spineIsReachable(meta)) return true;
  const cell = getGrid()[r][c];
  cell.type = 'empty';
  cell.adjacent = 0;
  return false;
}

function addBranch(meta, plan) {
  const spine = meta.regions.find(region => region.kind === 'spine');
  if (!spine) return null;
  const span = Math.min(getRows(), getCols());
  const rootLimit = span <= 12
    ? spine.cells.length
    : (span <= 14
      ? Math.min(spine.cells.length, 56)
      : (span <= 16 ? Math.min(spine.cells.length, 36) : Math.min(spine.cells.length, 28)));
  const planVariants = [
    plan,
    {
      ...plan,
      corridorLen: Math.max(1, plan.corridorLen - 1),
      roomDepth: Math.max(2, plan.roomDepth - 1),
      roomWidth: Math.max(3, plan.roomWidth - 1),
    },
    {
      ...plan,
      corridorLen: 1,
      roomDepth: plan.purpose === 'gold' ? Math.max(2, Math.min(plan.roomDepth, 3)) : 1,
      roomWidth: plan.purpose === 'gold' ? 3 : 1,
    },
  ];
  const roots = shuffleInPlace([...spine.cells]).slice(0, rootLimit);
  const dirs = shuffleInPlace([
    { r: -1, c: 0 },
    { r: 1, c: 0 },
    { r: 0, c: -1 },
    { r: 0, c: 1 },
  ]);

  let best = bestBranchCandidateAtLargestSize(meta, planVariants, roots, dirs, 3);
  if (!best && plan.purpose === 'gold') {
    best = bestBranchCandidateAtLargestSize(meta, planVariants, roots, dirs, 2);
  }

  if (!best) return null;
  const { candidate, root } = best;
  const region = createRegion(meta, plan.id, 'branch', {
    purpose: plan.purpose,
    targetRiskGates: plan.riskGates,
    featureCell: candidate.featureCell,
    root,
    sizePlan: {
      corridorLen: candidate.plan.corridorLen,
      roomDepth: candidate.plan.roomDepth,
      roomWidth: candidate.plan.roomWidth,
    },
  });
  region.entrance = { r: candidate.entrance.r, c: candidate.entrance.c };

  for (const cell of candidate.cells) {
    markRegionCell(meta, region, cell.r, cell.c, cell.tag);
  }
  region.cellKeys = new Set(region.cells.map(cell => cellKey(cell.r, cell.c)));

  const reward = plan.purpose === 'gold' ? candidate.rewardCell : candidate.featureCell;
  region.rewardCells.push({ r: reward.r, c: reward.c });
  meta.rewardCells.push({ r: reward.r, c: reward.c });
  for (const cell of region.cells) pushProtectedCell(meta, cell);
  return region;
}

function branchVector(branch) {
  if (!branch.root || !branch.entrance) return null;
  const dir = {
    r: Math.sign(branch.entrance.r - branch.root.r),
    c: Math.sign(branch.entrance.c - branch.root.c),
  };
  if (dir.r === 0 && dir.c === 0) return null;
  return {
    dir,
    perp: { r: -dir.c, c: dir.r },
  };
}

function branchCellAt(branch, d, w) {
  const vector = branchVector(branch);
  if (!vector || !branch.root) return null;
  return {
    r: branch.root.r + vector.dir.r * d + vector.perp.r * w,
    c: branch.root.c + vector.dir.c * d + vector.perp.c * w,
  };
}

function branchCellDepth(branch, cell) {
  const vector = branchVector(branch);
  if (!vector || !branch.root || !cell) return 0;
  if (vector.dir.r !== 0) return (cell.r - branch.root.r) * vector.dir.r;
  return (cell.c - branch.root.c) * vector.dir.c;
}

function isBranchEntryCell(branch, cell) {
  const corridorLen = branch.sizePlan?.corridorLen ?? 1;
  return branchCellDepth(branch, cell) <= corridorLen + 1;
}

function branchRoomCells(branch) {
  return branch.tags?.branch_room ?? branch.cells.filter(cell => !sameCell(cell, branch.entrance));
}

function placeBranchPartition(branch) {
  const plan = branch.sizePlan;
  if (!plan || plan.roomDepth < 4 || plan.roomWidth < 4) return 0;

  const widthLeft = Math.floor((plan.roomWidth - 1) / 2);
  const widthRight = plan.roomWidth - 1 - widthLeft;
  const partitionDepth = plan.corridorLen + Math.max(2, Math.floor(plan.roomDepth * 0.55));
  const doorway = randInt(-widthLeft, widthRight);
  let placed = 0;

  for (let w = -widthLeft; w <= widthRight; w++) {
    if (w === doorway) continue;
    const cell = branchCellAt(branch, partitionDepth, w);
    if (!cell) continue;
    if (setBranchWallIfReachable(branch, cell)) placed++;
  }
  return placed;
}

function placeBranchWallIslands(branch, level) {
  const rooms = branchRoomCells(branch).filter(cell =>
    !isBranchReservedCell(branch, cell) &&
    !isBranchEntryCell(branch, cell)
  );
  if (rooms.length < 9) return 0;
  const density = level <= 4 ? 0.08 : (level <= 12 ? 0.11 : 0.14);
  const target = Math.min(
    Math.floor(rooms.length * 0.22),
    Math.max(1, Math.floor(rooms.length * density)),
  );
  let placed = 0;
  for (const cell of shuffleInPlace([...rooms])) {
    if (setBranchWallIfReachable(branch, cell)) placed++;
    if (placed >= target) break;
  }
  return placed;
}

function placeBranchRoomStructure(meta, level) {
  for (const branch of meta.regions.filter(region => region.kind === 'branch')) {
    const partitionWalls = placeBranchPartition(branch);
    const islandWalls = placeBranchWallIslands(branch, level);
    branch.structure = {
      partitionWalls,
      islandWalls,
    };
  }
}

function placeSpineDeductionGas(meta, level) {
  const generation = meta.biome?.generation ?? {};
  const gasMultiplier = (generation.gasMultiplier ?? 1) * (generation.spineGasMultiplier ?? 1);
  const candidates = [];
  for (const key of meta.spineCells) {
    const [r, c] = key.split(',').map(Number);
    const distStart = Math.max(Math.abs(r - meta.start.r), Math.abs(c - meta.start.c));
    const distExit = Math.max(Math.abs(r - meta.exit.r), Math.abs(c - meta.exit.c));
    if (distStart < 3 || distExit < 3) continue;
    for (const candidate of collectAdjacentCandidates(r, c, (nr, nc) => {
      if (meta.regionByCell.has(cellKey(nr, nc))) return false;
      if (touchesRegion(meta, nr, nc, 'branch')) return false;
      return getGrid()[nr][nc].type === 'wall';
    })) {
      candidates.push(candidate);
    }
  }

  shuffleInPlace(candidates);
  const seen = new Set();
  const baseTarget = Math.max(
    level <= 4 ? 5 : (level <= 12 ? 9 : 12),
    Math.floor(meta.spineCells.size * (level <= 4 ? 0.10 : (level <= 12 ? 0.14 : 0.15))),
  );
  const target = Math.max(0, Math.round(baseTarget * gasMultiplier));
  let placed = 0;
  for (const candidate of candidates) {
    const key = cellKey(candidate.r, candidate.c);
    if (seen.has(key)) continue;
    seen.add(key);
    if (placeGasAt(meta, candidate.r, candidate.c)) placed++;
    if (placed >= target) break;
  }

  const interiorCandidates = [];
  for (const key of meta.spineCells) {
    const [r, c] = key.split(',').map(Number);
    const distStart = Math.max(Math.abs(r - meta.start.r), Math.abs(c - meta.start.c));
    const distExit = Math.max(Math.abs(r - meta.exit.r), Math.abs(c - meta.exit.c));
    if (distStart < 4 || distExit < 4) continue;
    let spineNeighbors = 0;
    for (const [dr, dc] of DIRS_8) {
      if (meta.spineCells.has(cellKey(r + dr, c + dc))) spineNeighbors++;
    }
    if (spineNeighbors >= 5) interiorCandidates.push({ r, c });
  }

  shuffleInPlace(interiorCandidates);
  const baseInteriorTarget = level <= 4 ? 2 : (level <= 12 ? 5 : 6);
  const interiorTarget = Math.max(0, Math.round(baseInteriorTarget * gasMultiplier));
  let interiorPlaced = 0;
  for (const candidate of interiorCandidates) {
    if (placeSpineGasIfReachable(meta, candidate.r, candidate.c)) interiorPlaced++;
    if (interiorPlaced >= interiorTarget) break;
  }
}

function branchGasTarget(branch, level, baseRisk, generation = {}) {
  const rooms = branchRoomCells(branch).length;
  const gasMultiplier = (generation.gasMultiplier ?? 1) * (generation.branchGasMultiplier ?? 1);
  if (rooms < 4) return Math.round(baseRisk * gasMultiplier);
  const density = level <= 4 ? 0.09 : (level <= 12 ? 0.13 : 0.17);
  const bySize = Math.floor(rooms * density);
  const floor = level <= 4 ? 1 : (level <= 12 ? 2 : 3);
  const cap = Math.max(floor, Math.floor(rooms * 0.26));
  const target = Math.max(baseRisk, floor, bySize);
  return Math.min(cap, Math.max(floor, Math.round(target * gasMultiplier)));
}

function branchRiskCandidates(branch) {
  const plan = branch.sizePlan ?? {};
  const corridorLen = plan.corridorLen ?? 1;
  const roomDepth = plan.roomDepth ?? 1;
  const minRiskDepth = corridorLen + Math.max(2, Math.floor(roomDepth * 0.45));
  const preferred = [];
  const fallback = [];

  for (const cell of branchRoomCells(branch)) {
    if (sameCell(cell, branch.entrance)) continue;
    if (sameCell(cell, branch.featureCell)) continue;
    if (branch.rewardCells.some(reward => sameCell(cell, reward))) continue;
    if (getGrid()[cell.r][cell.c].type !== 'empty') continue;

    if (branchCellDepth(branch, cell) >= minRiskDepth) preferred.push(cell);
    else if (!isBranchEntryCell(branch, cell)) fallback.push(cell);
  }

  return [
    ...shuffleInPlace(preferred),
    ...shuffleInPlace(fallback),
  ];
}

function placeBranchGasIfReachable(meta, branch, cell) {
  if (isBranchReservedCell(branch, cell)) return false;
  if (!branchCellKeySet(branch).has(cellKey(cell.r, cell.c))) return false;
  if (!placeGasAt(meta, cell.r, cell.c, { allowRegion: true })) return false;
  if (!branchIsReachable(branch)) {
    const gridCell = getGrid()[cell.r][cell.c];
    gridCell.type = 'empty';
    gridCell.adjacent = 0;
    return false;
  }
  if (!branch.internalGasCells) branch.internalGasCells = [];
  branch.internalGasCells.push({ r: cell.r, c: cell.c });
  return true;
}

function placeRegionalGas(meta, level) {
  const generation = meta.biome?.generation ?? {};
  placeSpineDeductionGas(meta, level);
  const branches = meta.regions.filter(region => region.kind === 'branch');
  for (const branch of branches) {
    const entrance = branch.entrance;
    let airlockCandidates = collectAdjacentCandidates(entrance.r, entrance.c, (nr, nc) => {
      const key = cellKey(nr, nc);
      if (meta.spineCells.has(key)) return false;
      if (meta.branchCells.has(key)) return false;
      if (touchesRegion(meta, nr, nc, 'spine')) return false;
      return getGrid()[nr][nc].type === 'wall';
    });
    if (airlockCandidates.length === 0) {
      airlockCandidates = collectAdjacentCandidates(entrance.r, entrance.c, (nr, nc) => {
        const key = cellKey(nr, nc);
        if (meta.spineCells.has(key)) return false;
        if (meta.branchCells.has(key)) return false;
        return getGrid()[nr][nc].type === 'wall';
      });
    }
    shuffleInPlace(airlockCandidates);
    if (airlockCandidates[0]) {
      placeGasAt(meta, airlockCandidates[0].r, airlockCandidates[0].c);
      branch.airlockGasCells = [{ r: airlockCandidates[0].r, c: airlockCandidates[0].c }];
      pushProtectedCell(meta, airlockCandidates[0]);
    }

    const baseRisk = branch.purpose === 'gold' ? branch.targetRiskGates : Math.max(0, branch.targetRiskGates - 1);
    const targetBranchGas = branchGasTarget(branch, level, baseRisk, generation);
    const riskCells = branchRiskCandidates(branch);
    let branchGas = 0;
    if (targetBranchGas > 0) {
      for (const cell of riskCells) {
        if (placeBranchGasIfReachable(meta, branch, cell)) {
          branchGas++;
          branch.actualRiskGates = Math.max(branch.actualRiskGates, 1);
        }
        if (branchGas >= targetBranchGas) break;
      }
    }
  }
}

function placeGoldOnCell(r, c, amount, { chest = false, preview = false } = {}) {
  const cell = getGrid()[r][c];
  if (cell.type === 'gas' || cell.type === 'wall') return false;
  cell.type = 'gold';
  cell.goldValue = amount;
  cell.chest = chest;
  cell.preview = preview ? 'chest' : null;
  cell.item = null;
  cell.crystal = false;
  cell.crystalUsed = false;
  cell.crystalGoldValue = 0;
  cell.crystalClueCount = 0;
  cell.crystalClueRadius = 0;
  return true;
}

function distributeGold(cells, budget, amounts) {
  let remaining = budget;
  let placed = 0;
  const candidates = shuffleInPlace([...cells]);
  for (const cell of candidates) {
    if (remaining <= 0) break;
    const gridCell = getGrid()[cell.r][cell.c];
    if (gridCell.type !== 'empty') continue;
    const amount = Math.min(remaining, amounts[Math.floor(Math.random() * amounts.length)]);
    if (amount <= 0) continue;
    if (placeGoldOnCell(cell.r, cell.c, amount)) {
      placed += amount;
      remaining -= amount;
    }
  }
  return placed;
}

function scaledBudget(amount, multiplier = 1) {
  return Math.max(0, Math.round(amount * multiplier));
}

export function regionalGoldBudgetsForLevel(level, economy = {}) {
  const goldMultiplier = economy.goldMultiplier ?? 1;
  const spineMultiplier = goldMultiplier * (economy.spineGoldMultiplier ?? 1);
  const optionalMultiplier = goldMultiplier * (economy.optionalGoldMultiplier ?? 1);
  const featureMultiplier = goldMultiplier * (economy.featureGoldMultiplier ?? 1);
  if (level <= 4) {
    return {
      spine: scaledBudget(22, spineMultiplier),
      optional: scaledBudget(52, optionalMultiplier),
      feature: scaledBudget(26, featureMultiplier),
    };
  }
  if (level <= 8) {
    return {
      spine: scaledBudget(18, spineMultiplier),
      optional: scaledBudget(78, optionalMultiplier),
      feature: scaledBudget(30, featureMultiplier),
    };
  }
  const lateStep = Math.max(0, Math.floor((level - 9) / 3));
  return {
    spine: scaledBudget(14, spineMultiplier),
    optional: scaledBudget(100 + lateStep * 35, optionalMultiplier),
    feature: scaledBudget(36 + lateStep * 10, featureMultiplier),
  };
}

function placeRegionalRewards(meta, level) {
  const spineRegion = meta.regions.find(region => region.kind === 'spine');
  const branches = meta.regions.filter(region => region.kind === 'branch');
  const economy = {
    ...(meta.biome?.generation ?? {}),
    ...(meta.biome?.economy ?? {}),
  };
  const budgets = regionalGoldBudgetsForLevel(level, economy);
  const chestMultiplier = economy.chestGoldMultiplier ?? 1;

  const placeExtraGoldBranchChest = (branch, value) => {
    const extraChest = shuffleInPlace(branch.cells.filter(cell => {
      if (cell.r === branch.entrance.r && cell.c === branch.entrance.c) return false;
      if (branch.rewardCells.some(rewardCell => rewardCell.r === cell.r && rewardCell.c === cell.c)) return false;
      return getGrid()[cell.r][cell.c].type === 'empty';
    }))[0];
    if (!extraChest) return false;
    if (!placeGoldOnCell(extraChest.r, extraChest.c, value, { chest: true, preview: true })) return false;
    const extraReward = { r: extraChest.r, c: extraChest.c };
    branch.rewardCells.push(extraReward);
    meta.rewardCells.push(extraReward);
    return true;
  };

  const safeSpineCells = spineRegion.cells.filter(cell => {
    const distStart = Math.max(Math.abs(cell.r - meta.start.r), Math.abs(cell.c - meta.start.c));
    const distExit = Math.max(Math.abs(cell.r - meta.exit.r), Math.abs(cell.c - meta.exit.c));
    return distStart > 2 && distExit > 1;
  });
  distributeGold(safeSpineCells, budgets.spine, [1, 1, 5]);

  for (const branch of branches) {
    if (branch.purpose !== 'gold') {
      const featureGoldCells = branch.cells.filter(cell => {
        if (branch.entrance && cell.r === branch.entrance.r && cell.c === branch.entrance.c) return false;
        if (branch.featureCell && cell.r === branch.featureCell.r && cell.c === branch.featureCell.c) return false;
        return getGrid()[cell.r][cell.c].type === 'empty';
      });
      distributeGold(featureGoldCells, budgets.feature, [5, 5, 10]);
      continue;
    }
    const reward = branch.rewardCells[0];
    if (reward) {
      const chestValue = Math.max(25, Math.floor(budgets.optional * 0.7 * chestMultiplier));
      placeGoldOnCell(reward.r, reward.c, chestValue, { chest: true, preview: true });
    }

    const biomeExtraChestChance = economy.goldBranchExtraChestChance ?? 0;
    if (Math.random() < biomeExtraChestChance) {
      const extraChestValue = Math.max(15, Math.floor(budgets.optional * (economy.goldBranchExtraChestMultiplier ?? 0.18) * chestMultiplier));
      placeExtraGoldBranchChest(branch, extraChestValue);
    }

    if (hasArtifact('extra_chest')) {
      const extraChestValue = Math.max(15, Math.floor(budgets.optional * 0.25 * chestMultiplier));
      placeExtraGoldBranchChest(branch, extraChestValue);
    }

    const branchGoldCells = branch.cells.filter(cell => {
      if (cell.r === branch.entrance.r && cell.c === branch.entrance.c) return false;
      if (branch.rewardCells.some(rewardCell => rewardCell.r === cell.r && rewardCell.c === cell.c)) return false;
      return getGrid()[cell.r][cell.c].type === 'empty';
    });
    distributeGold(branchGoldCells, Math.floor(budgets.optional * 0.3), [5, 5, 10]);
  }
}

function placeCrystalAt(meta, cell) {
  const gridCell = getGrid()[cell.r][cell.c];
  if (gridCell.type !== 'empty') return false;
  if (gridCell.item || gridCell.preview) return false;
  gridCell.crystal = true;
  gridCell.crystalUsed = false;
  gridCell.crystalGoldValue = meta.biome?.economy?.crystalGold ?? 0;
  gridCell.crystalClueCount = meta.biome?.generation?.crystalClueCount ?? 1;
  gridCell.crystalClueRadius = meta.biome?.generation?.crystalClueRadius ?? 1;
  if (Math.random() < (meta.biome?.generation?.crystalPreviewChance ?? 0)) {
    gridCell.preview = 'crystal';
  }
  if (!meta.crystalCells) meta.crystalCells = [];
  meta.crystalCells.push({ r: cell.r, c: cell.c });
  return true;
}

function placeBiomeCrystals(meta) {
  const requested = meta.biome?.generation?.crystalCells ?? 0;
  if (requested <= 0) return 0;
  const branches = meta.regions.filter(region => region.kind === 'branch');
  const candidates = [];
  for (const branch of branches) {
    for (const cell of branch.cells) {
      if (isBranchEntryCell(branch, cell)) continue;
      if (isBranchReservedCell(branch, cell, { nearEntrance: false })) continue;
      const gridCell = getGrid()[cell.r][cell.c];
      if (gridCell.type !== 'empty') continue;
      if (gridCell.item || gridCell.preview) continue;
      if (gridCell.adjacent <= 0) continue;
      candidates.push({ ...cell, branchPurpose: branch.purpose });
    }
  }
  const sorted = shuffleInPlace(candidates).sort((a, b) => {
    const aGold = a.branchPurpose === 'gold' ? 1 : 0;
    const bGold = b.branchPurpose === 'gold' ? 1 : 0;
    return bGold - aGold;
  });
  const target = Math.min(requested, sorted.length);
  let placed = 0;
  for (const cell of sorted) {
    if (placeCrystalAt(meta, cell)) placed++;
    if (placed >= target) break;
  }
  return placed;
}

function placeRegionalItemDrops(meta) {
  const dropCount = meta.requestedItemDrops ?? 0;
  if (dropCount <= 0) return;

  const itemBranch = meta.regions.find(region => region.purpose === 'item');
  if (!itemBranch?.featureCell) return;

  const candidates = [
    itemBranch.featureCell,
    ...shuffleInPlace(itemBranch.cells.filter(cell =>
      !(cell.r === itemBranch.entrance?.r && cell.c === itemBranch.entrance?.c) &&
      !(cell.r === itemBranch.featureCell.r && cell.c === itemBranch.featureCell.c)
    )),
  ];

  let placed = 0;
  for (const candidate of candidates) {
    const cell = getGrid()[candidate.r][candidate.c];
    if (cell.type === 'gas' || cell.type === 'wall') continue;
    if (cell.crystal) continue;
    if (cell.item) continue;
    cell.item = randomItemType();
    cell.preview = 'item';
    placed++;
    if (placed >= dropCount) break;
  }
}

function branchSizeBudget(rows, branchCount) {
  if (rows <= 12) {
    if (branchCount >= 4) return { corridorLen: 2, roomDepth: 2, roomWidth: 2 };
    if (branchCount >= 3) return { corridorLen: 2, roomDepth: 3, roomWidth: 3 };
    return { corridorLen: 3, roomDepth: 4, roomWidth: 5 };
  }
  if (rows <= 14) {
    if (branchCount >= 4) return { corridorLen: 3, roomDepth: 3, roomWidth: 3 };
    if (branchCount >= 3) return { corridorLen: 3, roomDepth: 4, roomWidth: 5 };
    return { corridorLen: 4, roomDepth: 5, roomWidth: 5 };
  }
  if (branchCount >= 4) return { corridorLen: 4, roomDepth: 5, roomWidth: 5 };
  if (branchCount >= 3) return { corridorLen: 4, roomDepth: 6, roomWidth: 6 };
  return {
    corridorLen: Math.max(4, Math.floor(rows * 0.22)),
    roomDepth: Math.max(5, Math.floor(rows * 0.42)),
    roomWidth: Math.max(5, Math.floor(rows * 0.38)),
  };
}

function buildRegionalLayout(meta, features = {}) {
  const tx = makeCornerTransform(meta.start);
  const rows = getRows();
  const cols = getCols();
  const spine = createRegion(meta, 'spine_0', 'spine');
  const compact = rows <= 12;
  const plannedBranchCount = 1 +
    (features.merchant ? 1 : 0) +
    (features.fountain ? 1 : 0) +
    (features.itemDrop ? 1 : 0) +
    (features.joker ? 1 : 0);
  const route = chooseSpineWaypoints(rows, cols, {
    avoidDense: compact && plannedBranchCount >= 3,
  });
  meta.layoutVariant = route.name;

  carveCanonicalRect(meta, spine, tx, 0, 0, 2, 2, 'start_room');
  carveCanonicalRect(meta, spine, tx, rows - 3, cols - 3, rows - 1, cols - 1, 'exit_room');

  const spineWidth = rows <= 12 ? 2 : (Math.random() < 0.35 ? 3 : 2);
  for (let i = 1; i < route.points.length; i++) {
    carveCanonicalWideLine(meta, spine, tx, route.points[i - 1], route.points[i], spineWidth, 'spine_path');
    carveCanonicalRect(meta, spine, tx, route.points[i].r - 1, route.points[i].c - 1, route.points[i].r + 1, route.points[i].c + 1, 'spine_bend');
  }

  const branchMax = branchSizeBudget(rows, plannedBranchCount);
  const branchPlans = [];
  branchPlans.push({
    id: 'gold_branch_0',
    purpose: 'gold',
    corridorLen: Math.min(compact ? randInt(2, 3) : randInt(2, 4), branchMax.corridorLen),
    roomDepth: Math.min(compact ? 3 : randInt(3, 4), branchMax.roomDepth),
    roomWidth: Math.min(compact ? 4 : randInt(4, 5), branchMax.roomWidth),
    maxCorridorLen: branchMax.corridorLen,
    maxRoomDepth: branchMax.roomDepth,
    maxRoomWidth: branchMax.roomWidth,
    riskGates: meta.level <= 4 ? 0 : 1,
  });
  if (features.joker) {
    branchPlans.push({
      id: 'joker_branch_0',
      purpose: 'joker',
      corridorLen: Math.min(compact ? 2 : randInt(2, 3), branchMax.corridorLen),
      roomDepth: Math.min(compact ? 2 : 3, branchMax.roomDepth),
      roomWidth: Math.min(compact ? 2 : 4, branchMax.roomWidth),
      maxCorridorLen: branchMax.corridorLen,
      maxRoomDepth: branchMax.roomDepth,
      maxRoomWidth: branchMax.roomWidth,
      riskGates: meta.level <= 4 ? 0 : 1,
    });
  }
  if (features.merchant) {
    branchPlans.push({
      id: 'merchant_branch_0',
      purpose: 'merchant',
      corridorLen: Math.min(compact ? 2 : randInt(2, 3), branchMax.corridorLen),
      roomDepth: Math.min(compact ? 2 : 3, branchMax.roomDepth),
      roomWidth: Math.min(compact ? 2 : 4, branchMax.roomWidth),
      maxCorridorLen: branchMax.corridorLen,
      maxRoomDepth: branchMax.roomDepth,
      maxRoomWidth: branchMax.roomWidth,
      riskGates: meta.level <= 4 ? 0 : 1,
    });
  }
  if (features.fountain) {
    branchPlans.push({
      id: 'fountain_branch_0',
      purpose: 'fountain',
      corridorLen: Math.min(compact ? 2 : randInt(2, 3), branchMax.corridorLen),
      roomDepth: Math.min(compact ? 2 : 3, branchMax.roomDepth),
      roomWidth: Math.min(compact ? 2 : 4, branchMax.roomWidth),
      maxCorridorLen: branchMax.corridorLen,
      maxRoomDepth: branchMax.roomDepth,
      maxRoomWidth: branchMax.roomWidth,
      riskGates: meta.level <= 4 ? 0 : 1,
    });
  }
  if (features.itemDrop) {
    branchPlans.push({
      id: 'item_branch_0',
      purpose: 'item',
      corridorLen: Math.min(compact ? 2 : randInt(2, 3), branchMax.corridorLen),
      roomDepth: Math.min(compact ? 2 : 3, branchMax.roomDepth),
      roomWidth: Math.min(compact ? 2 : 3, branchMax.roomWidth),
      maxCorridorLen: branchMax.corridorLen,
      maxRoomDepth: branchMax.roomDepth,
      maxRoomWidth: branchMax.roomWidth,
      riskGates: meta.level <= 4 ? 0 : 1,
    });
  }

  for (const plan of branchPlans) {
    const branch = addBranch(meta, plan);
    if (!branch) meta.failedBranchPlans.push(plan.purpose);
  }
}

function sumRegionGold(region) {
  let total = 0;
  for (const cell of region.cells) {
    total += getGrid()[cell.r][cell.c].goldValue || 0;
  }
  return total;
}

function countRegionGas(region) {
  let total = 0;
  for (const cell of region.cells) {
    if (getGrid()[cell.r][cell.c].type === 'gas') total++;
  }
  return total;
}

function regionalMetrics(meta, revealed = null) {
  const spine = meta.regions.find(region => region.kind === 'spine');
  const branches = meta.regions.filter(region => region.kind === 'branch');
  let branchLeak = 0;
  let branchGold = 0;
  let branchGas = 0;
  let gates = 0;

  for (const branch of branches) {
    branchGold += sumRegionGold(branch);
    branchGas += countRegionGas(branch);
    gates += branch.actualRiskGates || 0;
    if (!revealed) continue;
    const branchCells = branch.cells.filter(cell =>
      !(branch.entrance && cell.r === branch.entrance.r && cell.c === branch.entrance.c)
    );
    const revealedCount = branchCells.filter(cell => revealed[cell.r]?.[cell.c]).length;
    branchLeak = Math.max(branchLeak, branchCells.length ? revealedCount / branchCells.length : 0);
  }

  return {
    spineCells: spine?.cells.length ?? 0,
    branchCells: branches.reduce((sum, branch) => sum + branch.cells.length, 0),
    spineGold: spine ? sumRegionGold(spine) : 0,
    optionalGold: branchGold,
    spineGas: spine ? countRegionGas(spine) : 0,
    optionalGas: branchGas,
    crystalCells: meta.crystalCells?.length ?? 0,
    gates,
    branchLeak,
  };
}

export function countBranchEntrances(meta, branch = null) {
  const target = branch ?? meta?.regions?.find(region => region.kind === 'branch');
  if (!meta || !target) return 0;
  const branchCellKeys = new Set(target.cells.map(cell => cellKey(cell.r, cell.c)));
  const entrances = new Set();
  for (const cell of target.cells) {
    for (const [dr, dc] of DIRS_8) {
      const nr = cell.r + dr;
      const nc = cell.c + dc;
      const nKey = cellKey(nr, nc);
      if (!meta.spineCells.has(nKey)) continue;
      if (branchCellKeys.has(nKey)) continue;
      entrances.add(cellKey(cell.r, cell.c));
    }
  }
  return entrances.size;
}

export function validateRegionalGeneration(meta, revealed = null) {
  if (!meta) return { ok: true, issues: [], branchLeak: 0 };
  const issues = [];
  let branchLeak = 0;

  for (const branch of meta.regions.filter(region => region.kind === 'branch')) {
    const entrances = countBranchEntrances(meta, branch);
    if (entrances !== 1) issues.push(`branch ${branch.id} entrances=${entrances}`);
    if (!branch.entrance) {
      issues.push(`branch ${branch.id} missing entrance`);
      continue;
    }
    const entranceCell = getGrid()[branch.entrance.r]?.[branch.entrance.c];
    if (!entranceCell || entranceCell.adjacent <= 0) {
      issues.push(`branch ${branch.id} zero airlock`);
    }

    if (!revealed) continue;
    const nonAirlockCells = branch.cells.filter(cell =>
      !(cell.r === branch.entrance.r && cell.c === branch.entrance.c)
    );
    const revealedCount = nonAirlockCells.filter(cell => revealed[cell.r]?.[cell.c]).length;
    const leak = nonAirlockCells.length ? revealedCount / nonAirlockCells.length : 0;
    const leakLimit = branch.purpose === 'gold'
      ? 0.45
      : 0.60;
    const allowedLeakCells = Math.max(1, Math.floor(nonAirlockCells.length * leakLimit));
    branchLeak = Math.max(branchLeak, leak);
    if (revealedCount > allowedLeakCells) {
      issues.push(`branch ${branch.id} leak=${leak.toFixed(2)}`);
    }
    for (const reward of branch.rewardCells) {
      if (revealed[reward.r]?.[reward.c]) {
        issues.push(`branch ${branch.id} reward revealed`);
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    branchLeak,
  };
}

export function getRegionalMetrics(meta, revealed = null) {
  return regionalMetrics(meta, revealed);
}

export function generateRegionalGrid({ level = 1, start, exit, features = {}, biome = null } = {}) {
  if (!start || !exit) {
    throw new Error('generateRegionalGrid requires start and exit positions');
  }
  const rawRequestedItemDrops = regionalItemDropCount(features);
  const plan = resolveRegionalFeatures(features, rawRequestedItemDrops, biome?.generation ?? {});
  const regionalFeatures = plan.features;

  setGrid(Array.from({ length: getRows() }, () =>
    Array.from({ length: getCols() }, () => makeCell('wall'))
  ));

  const meta = {
    version: REGIONAL_VERSION,
    generator: 'regional-risk-v1',
    level,
    biomeId: biome?.id ?? null,
    biome,
    start: { ...start },
    exit: { ...exit },
    regions: [],
    regionById: new Map(),
    regionByCell: new Map(),
    spineCells: new Set(),
    branchCells: new Set(),
    rewardCells: [],
    protectedCells: [],
    protectedCellKeys: new Set(),
    failedBranchPlans: [],
    suppressedBranchPlans: [...plan.suppressedBranchPlans],
    branchCapacity: plan.branchCapacity,
    requestedItemDrops: plan.requestedItemDrops,
    activeFeatures: {
      merchant: !!regionalFeatures.merchant,
      fountain: !!regionalFeatures.fountain,
      joker: !!regionalFeatures.joker,
      itemDrop: !!regionalFeatures.itemDrop,
    },
    metrics: null,
  };

  buildRegionalLayout(meta, regionalFeatures);
  placeBranchRoomStructure(meta, level);
  placeRegionalGas(meta, level);
  recomputeAllAdjacency();
  placeRegionalRewards(meta, level);
  placeBiomeCrystals(meta);
  placeRegionalItemDrops(meta);
  meta.metrics = regionalMetrics(meta);
  return meta;
}

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
      cell.item = null;
      cell.chest = false;
      cell.preview = null;
      cell.crystal = false;
      cell.crystalUsed = false;
      cell.crystalGoldValue = 0;
      cell.crystalClueCount = 0;
      cell.crystalClueRadius = 0;
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
