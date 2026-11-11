/** Exact fraction arithmetic so 8 / (3 - 8 / 3) really equals 24 (no float drift). */

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function rational(n, d = 1) {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw new RangeError('Number out of range');
  if (d === 0) throw new RangeError('Division by zero');
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1;
  return { n: n / g + 0, d: d / g };
}

export const add = (a, b) => rational(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a, b) => rational(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a, b) => rational(a.n * b.n, a.d * b.d);
export const div = (a, b) => {
  if (b.n === 0) throw new RangeError('Division by zero');
  return rational(a.n * b.d, a.d * b.n);
};
export const equals = (a, b) => a.n === b.n && a.d === b.d;
export const toString = (a) => (a.d === 1 ? String(a.n) : `${a.n}/${a.d}`);
