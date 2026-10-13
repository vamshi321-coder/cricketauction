import { createHmac } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const STUN = { urls: 'stun:stun.l.google.com:19302' };
export function turnCredentials(uid, secret, urls, now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + 3600;
  const username = `${expiresAt}:${uid}`;
  return { iceServers: [STUN, { urls, username,
    credential: createHmac('sha1', secret).update(username).digest('base64') }], expiresAt, relay: true };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Method not allowed' }); }
  const roomId = req.query?.roomId;
  if (typeof roomId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(roomId)) return res.status(400).json({ error: 'Invalid room' });
  const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return res.status(401).json({ error: 'Sign in required' });
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  const databaseURL = process.env.FIREBASE_DATABASE_URL || process.env.VITE_FIREBASE_DATABASE_URL;
  if (!projectId || !databaseURL) return res.status(503).json({ error: 'Voice server configuration missing' });
  let uid;
  try {
    const app = getApps().find(a => a.name === 'voice-token-verifier') || initializeApp({ projectId }, 'voice-token-verifier');
    // Signature/audience/expiry verified with Firebase public keys; no private key in browser.
    ({ uid } = await getAuth(app).verifyIdToken(token));
  } catch { return res.status(401).json({ error: 'Sign in again' }); }
  try {
    const url = new URL(databaseURL);
    if (url.protocol !== 'https:' || !/\.(firebaseio\.com|firebasedatabase\.app)$/.test(url.hostname))
      return res.status(503).json({ error: 'Invalid database configuration' });
    url.pathname = `/auctions/${roomId}/room.json`;
    url.search = new URLSearchParams({ auth: token }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return res.status(403).json({ error: 'Room access denied' });
    const room = await response.json();
    if (!room || (room.bannedPlayers || []).includes(uid) ||
      (room.hostId !== uid && !(room.players || []).some(p => p.id === uid)))
      return res.status(403).json({ error: 'Join the auction room first' });
    const secret = process.env.TURN_SHARED_SECRET;
    const urls = (process.env.TURN_URLS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!secret && !urls.length) return res.status(200).json({ iceServers: [STUN], relay: false });
    if (!secret || !urls.length || urls.some(u => !/^turns?:[^\s]+$/.test(u)))
      return res.status(503).json({ error: 'Relay configuration incomplete' });
    return res.status(200).json(turnCredentials(uid, secret, urls));
  } catch { return res.status(503).json({ error: 'Voice service temporarily unavailable' }); }
}
