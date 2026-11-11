import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

// scrypt parameters (N=2^14, r=8, p=1) use ~16 MB per hash.
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

const normalize = (password) => password.normalize('NFKC');

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(normalize(password), salt, KEY_LENGTH, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scrypt(normalize(password), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

let dummyHashPromise;
/** A real hash to verify against when the username doesn't exist (keeps timing uniform). */
export function dummyHash() {
  dummyHashPromise ??= hashPassword(crypto.randomBytes(18).toString('base64'));
  return dummyHashPromise;
}
