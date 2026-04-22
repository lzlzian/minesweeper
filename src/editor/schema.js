// Schema for authored level JSON. Single source of truth — editor produces
// through this, game consumes through this.

export const SCHEMA_VERSION = 1;

export const VALID_ITEM_KEYS = ['potion', 'scanner', 'pickaxe', 'row', 'column', 'cross'];
export const VALID_CELL_TYPES = ['empty', 'wall', 'gas', 'gold', 'fountain'];

// levelToJson: returns a JSON string of the level object. The level object
// is expected to be well-formed (validation happens via validateLevel in
// validation.js; schema.js only checks structural well-formedness).
export function levelToJson(level) {
  return JSON.stringify(level, null, 2);
}

// jsonToLevel: parses and structurally validates a JSON string.
// Returns { ok: true, level } or { ok: false, errors: string[] }.
export function jsonToLevel(jsonString) {
  let obj;
  try {
    obj = JSON.parse(jsonString);
  } catch (e) {
    return { ok: false, errors: ['JSON parse error: ' + e.message] };
  }
  const errors = [];

  if (obj.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`unsupported schemaVersion: ${obj.schemaVersion} (expected ${SCHEMA_VERSION})`);
  }

  for (const field of ['id', 'name', 'rows', 'cols', 'playerStart', 'exit', 'cells', 'itemDrops']) {
    if (!(field in obj)) errors.push(`missing required field: ${field}`);
  }

  // Early out if structure is broken — downstream checks would NPE.
  if (errors.length) return { ok: false, errors };

  if (typeof obj.rows !== 'number' || typeof obj.cols !== 'number') {
    errors.push('rows and cols must be numbers');
  }
  if (!Array.isArray(obj.cells)) {
    errors.push('cells must be an array');
  } else {
    if (obj.cells.length !== obj.rows) {
      errors.push(`cells.length (${obj.cells.length}) !== rows (${obj.rows})`);
    }
    for (let r = 0; r < obj.cells.length; r++) {
      const row = obj.cells[r];
      if (!Array.isArray(row) || row.length !== obj.cols) {
        errors.push(`cells[${r}].length mismatch`);
        continue;
      }
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (!cell || typeof cell !== 'object' || !VALID_CELL_TYPES.includes(cell.type)) {
          errors.push(`cells[${r}][${c}] invalid type: ${cell?.type}`);
          continue;
        }
        if (cell.type === 'gold') {
          if (typeof cell.goldValue !== 'number' || cell.goldValue <= 0) {
            errors.push(`cells[${r}][${c}] gold missing goldValue`);
          }
        }
      }
    }
  }

  if (!isPos(obj.playerStart)) errors.push('playerStart must be {r,c}');
  if (!isPos(obj.exit)) errors.push('exit must be {r,c}');
  if (obj.merchant !== null && obj.merchant !== undefined && !isPos(obj.merchant)) {
    errors.push('merchant must be null or {r,c}');
  }
  if (obj.fountain !== null && obj.fountain !== undefined && !isPos(obj.fountain)) {
    errors.push('fountain must be null or {r,c}');
  }

  if (!Array.isArray(obj.itemDrops)) {
    errors.push('itemDrops must be an array');
  } else {
    for (let i = 0; i < obj.itemDrops.length; i++) {
      const d = obj.itemDrops[i];
      if (!isPos(d)) errors.push(`itemDrops[${i}] missing r/c`);
      if (!VALID_ITEM_KEYS.includes(d?.item)) errors.push(`itemDrops[${i}] invalid item: ${d?.item}`);
    }
  }

  if (errors.length) return { ok: false, errors };

  const level = {
    schemaVersion: obj.schemaVersion,
    id: String(obj.id),
    name: String(obj.name),
    notes: typeof obj.notes === 'string' ? obj.notes : '',
    rows: obj.rows,
    cols: obj.cols,
    playerStart: { r: obj.playerStart.r, c: obj.playerStart.c },
    exit:        { r: obj.exit.r, c: obj.exit.c },
    merchant: obj.merchant ? { r: obj.merchant.r, c: obj.merchant.c } : null,
    fountain: obj.fountain ? { r: obj.fountain.r, c: obj.fountain.c } : null,
    cells: obj.cells.map(row => row.map(cell =>
      cell.type === 'gold' ? { type: 'gold', goldValue: cell.goldValue } : { type: cell.type }
    )),
    itemDrops: obj.itemDrops.map(d => ({ r: d.r, c: d.c, item: d.item })),
  };
  return { ok: true, level };
}

function isPos(p) {
  return p && typeof p.r === 'number' && typeof p.c === 'number';
}
