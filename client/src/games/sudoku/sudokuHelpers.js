/** Pure grid helpers (no React). Cells are indexed 0–80, row-major. */

export const rowOf = (i) => Math.floor(i / 9);
export const colOf = (i) => i % 9;
export const boxOf = (i) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

export const isPeer = (a, b) => a !== b && (rowOf(a) === rowOf(b) || colOf(a) === colOf(b) || boxOf(a) === boxOf(b));

export function firstEmpty(board) {
  const i = board.indexOf('0');
  return i === -1 ? 0 : i;
}

/** Arrow-key movement with wrap-around. */
export function move(index, key) {
  const r = rowOf(index);
  const c = colOf(index);
  switch (key) {
    case 'ArrowUp':
      return ((r + 8) % 9) * 9 + c;
    case 'ArrowDown':
      return ((r + 1) % 9) * 9 + c;
    case 'ArrowLeft':
      return r * 9 + ((c + 8) % 9);
    case 'ArrowRight':
      return r * 9 + ((c + 1) % 9);
    default:
      return index;
  }
}

/** How many of each digit are already placed (givens + correct entries). */
export function digitCounts(board) {
  const counts = new Array(10).fill(0);
  for (const ch of board) counts[ch.charCodeAt(0) - 48]++;
  return counts;
}

/** After a correct placement, remove that digit from the notes of every peer. */
export function clearNotesAfterPlacement(notes, cell, value) {
  const bit = 1 << value;
  const next = {};
  for (const [key, mask] of Object.entries(notes)) {
    const i = Number(key);
    if (i === cell) continue;
    const updated = isPeer(cell, i) ? mask & ~bit : mask;
    if (updated) next[i] = updated;
  }
  return next;
}

export function omit(obj, key) {
  if (!(key in obj)) return obj;
  const { [key]: _removed, ...rest } = obj;
  return rest;
}
