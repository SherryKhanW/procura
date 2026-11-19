import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createHash, randomBytes } from 'node:crypto';
import { hashPassword, normalizeEmail, validPassword, verifyPassword } from './passwords.js';
import { publicUser, permissionsFor } from './permissions.js';

export const sessionDigest = token => createHash('sha256').update(token).digest('hex');
const invalidCredentials = { error: 'Email or password is incorrect.' };
const cookieOptions = production => ({ httpOnly: true, secure: production, sameSite: 'lax', path: '/' });
const cookieName = production => production ? '__Host-procura_session' : 'procura_session';

function sessionToken(req, production) {
  const entry = (req.headers.cookie ?? '').split(';').map(value => value.trim()).find(value => value.startsWith(`${cookieName(production)}=`));
  const token = entry?.slice(entry.indexOf('=') + 1);
  return /^[a-f0-9]{64}$/.test(token ?? '') ? token : null;
}

export function protectWrites(config) {
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    // This API has no CORS allowlist. A cross-origin site cannot send this
    // header without a successful preflight. Also verify any supplied Origin.
    if (req.get('X-Procura-Request') !== '1' || (req.get('Origin') && req.get('Origin') !== config.origin)) {
      return res.status(403).json({ error: 'Request origin could not be verified. Refresh the application and try again.' });
    }
    next();
  };
}

export function createAuth({ repository, config }) {
  const router = Router();
  const name = cookieName(config.production);
  const clearCookie = res => res.clearCookie(name, cookieOptions(config.production));
  const throttle = limit => rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many attempts. Wait 15 minutes before trying again.' } });

  const requireAuth = async (req, res, next) => {
    const token = sessionToken(req, config.production);
    const record = token ? await repository.findSession(sessionDigest(token)) : null;
    if (!record || !permissionsFor(record.role).length) {
      clearCookie(res);
      return res.status(401).json({ error: 'Sign in to continue.' });
    }
    req.user = publicUser(record);
    req.loginId = record.loginId;
    req.sessionHash = sessionDigest(token);
    next();
  };

  router.post('/login', throttle(15), async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    if (!email || typeof password !== 'string' || [...password].length > 128 || !password.length) {
      return res.status(401).json(invalidCredentials);
    }
    const record = await repository.findLogin(email);
    const correct = await verifyPassword(password, record?.passwordHash);
    if (!correct || !record?.isActive || !permissionsFor(record.role).length) return res.status(401).json(invalidCredentials);
    const token = randomBytes(32).toString('hex');
    const created = await repository.createSession(sessionDigest(token), record.loginId, record.passwordHash);
    if (!created) return res.status(401).json(invalidCredentials);
    const previous = sessionToken(req, config.production);
    if (previous) await repository.deleteSession(sessionDigest(previous));
    await repository.deleteExpiredSessions();
    res.cookie(name, token, { ...cookieOptions(config.production), maxAge: 8 * 60 * 60 * 1000 });
    res.json({ user: publicUser(record) });
  });

  router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));
  router.post('/logout', async (req, res) => {
    const token = sessionToken(req, config.production);
    if (token) await repository.deleteSession(sessionDigest(token));
    clearCookie(res);
    res.status(204).end();
  });
  router.post('/password', requireAuth, throttle(5), async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!validPassword(newPassword)) return res.status(400).json({ error: 'Use a new password between 12 and 128 characters.' });
    const record = await repository.findLogin(req.user.email);
    if (!record || !await verifyPassword(currentPassword, record.passwordHash)) return res.status(400).json({ error: 'Current password is incorrect.' });
    if (currentPassword === newPassword) return res.status(400).json({ error: 'Choose a different new password.' });
    const updated = await repository.replacePassword(record.loginId, record.passwordHash, await hashPassword(newPassword));
    if (!updated) return res.status(409).json({ error: 'Your account changed. Sign in again and retry.' });
    clearCookie(res);
    res.status(204).end();
  });
  return { router, requireAuth };
}
