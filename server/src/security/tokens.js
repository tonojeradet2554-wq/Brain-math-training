import crypto from 'node:crypto';

export const newToken = () => crypto.randomBytes(32).toString('base64url');

/** Only the hash of a session token is stored, so a leaked DB can't be replayed. */
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
