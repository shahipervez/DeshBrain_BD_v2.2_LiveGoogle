import crypto from 'crypto';

const secret = process.env.SESSION_SECRET || 'change-me-in-production-desbrain';
const ttlSeconds = 60 * 60 * 24 * 14;

const b64 = value => Buffer.from(value).toString('base64url');
const unb64 = value => Buffer.from(value, 'base64url').toString('utf8');
const sign = value => crypto.createHmac('sha256', secret).update(value).digest('base64url');

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, expected) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createSessionToken(user) {
  const payload = b64(JSON.stringify({ sub: String(user.id), email: user.email, name: user.name, exp: Math.floor(Date.now()/1000)+ttlSeconds }));
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token) {
  try {
    if (!token || !token.includes('.')) return null;
    const [payload, sig] = token.split('.');
    const expected = sign(payload);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const data = JSON.parse(unb64(payload));
    if (!data.exp || data.exp < Math.floor(Date.now()/1000)) return null;
    return data;
  } catch { return null; }
}

export function parseCookies(header='') {
  return Object.fromEntries(header.split(';').map(x=>x.trim()).filter(Boolean).map(pair=>{
    const i = pair.indexOf('=');
    return i < 0 ? [pair,''] : [decodeURIComponent(pair.slice(0,i)), decodeURIComponent(pair.slice(i+1))];
  }));
}

export const cookieName = 'deshbrain_session';
export const sessionMaxAge = ttlSeconds;
