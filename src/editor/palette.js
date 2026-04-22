// Brush taxonomy. Order here is the order shown in the palette.
// Each brush has a key (unique id), a label (emoji), and a kind
// describing what it paints: 'terrain' (cell.type), 'placement'
// (unique per-level marker: player/exit/merchant/fountain),
// or 'drop' (itemDrops[] entry).

export const BRUSHES = [
  // Terrain
  { key: 'empty',    label: '·',  kind: 'terrain', cellType: 'empty' },
  { key: 'wall',     label: '▓',  kind: 'terrain', cellType: 'wall' },
  { key: 'gas',      label: '💀', kind: 'terrain', cellType: 'gas' },
  { key: 'fountain', label: '💧', kind: 'terrain', cellType: 'fountain' },

  // Gold values — four distinct brushes to keep painting fast.
  { key: 'gold1',  label: '💰1',  kind: 'terrain', cellType: 'gold', goldValue: 1 },
  { key: 'gold5',  label: '💰5',  kind: 'terrain', cellType: 'gold', goldValue: 5 },
  { key: 'gold10', label: '💰10', kind: 'terrain', cellType: 'gold', goldValue: 10 },
  { key: 'gold25', label: '💰25', kind: 'terrain', cellType: 'gold', goldValue: 25 },

  // Unique placements — painting moves the marker.
  { key: 'playerStart', label: '🙂', kind: 'placement', slot: 'playerStart' },
  { key: 'exit',        label: '🚪', kind: 'placement', slot: 'exit' },
  { key: 'merchant',    label: '🧙', kind: 'placement', slot: 'merchant' },

  // Item drops.
  { key: 'drop-potion',  label: '🍺', kind: 'drop', item: 'potion' },
  { key: 'drop-scanner', label: '🔍', kind: 'drop', item: 'scanner' },
  { key: 'drop-pickaxe', label: '⛏️', kind: 'drop', item: 'pickaxe' },
  { key: 'drop-row',     label: '↔️', kind: 'drop', item: 'row' },
  { key: 'drop-column',  label: '↕️', kind: 'drop', item: 'column' },
  { key: 'drop-cross',   label: '✖️', kind: 'drop', item: 'cross' },
];

// Note: fountain has a terrain brush (sets cell.type = 'fountain') AND needs
// to go into level.fountain. We treat fountain specially in the paint
// handler — painting it sets BOTH cell.type and the fountain placement,
// and there can only be one fountain per level.
// This keeps the palette ergonomic while still producing valid schema
// (top-level level.fountain + cells[r][c].type === 'fountain').

export function findBrush(key) {
  return BRUSHES.find(b => b.key === key) || null;
}
