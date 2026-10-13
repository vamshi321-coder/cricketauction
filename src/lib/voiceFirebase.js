import { ref, get, set, remove, push, onValue, onChildAdded, onDisconnect,
  serverTimestamp, query, limitToLast } from 'firebase/database';
import { rtdb, getServerTime } from './firebase';
import { STUN_SERVERS } from './voiceSession';

export const validRoomId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id);
export function canUseVoice(room, uid) {
  return !!room && !(room.bannedPlayers || []).includes(uid) &&
    (room.hostId === uid || (room.players || []).some(p => p.id === uid && p.team));
}
const timeout = (promise, ms = 12000) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Voice connection timed out. Check your internet and try again.')), ms);
  })]).finally(() => clearTimeout(timer));
};

export function createVoiceTransport(roomId, user, displayName) {
  if (!validRoomId(roomId)) throw new Error('Invalid room. Open your auction room again.');
  const uid = user.uid, id = crypto.randomUUID();
  const base = `voiceRooms/${roomId}`;
  const own = ref(rtdb, `${base}/members/${uid}/${id}`);
  const outbox = ref(rtdb, `${base}/signals/${uid}/${id}`);
  let closed = false;
  const member = { name: (displayName || 'Manager').slice(0, 50), muted: true };
  return {
    uid, id,
    async checkAccess() {
      const [room, connected] = await timeout(Promise.all([
        get(ref(rtdb, `auctions/${roomId}/room`)), new Promise((resolve, reject) => onValue(ref(rtdb, '.info/connected'), resolve, reject, { onlyOnce: true })),
      ]));
      if (!connected.val()) throw new Error('You are offline. Connect to the internet and try again.');
      if (!canUseVoice(room.val(), uid)) throw new Error('Join this auction room before joining voice.');
      // Verify new voice rules before requesting the microphone.
      await timeout(get(ref(rtdb, `${base}/members`)));
    },
    async open(state) {
      await timeout(Promise.all([onDisconnect(own).remove(), onDisconnect(outbox).remove()]));
      if (closed) return;
      await timeout(set(own, { ...member, ...state, updatedAt: serverTimestamp() }));
      if (closed) await remove(own);
    },
    touch(state) {
      if (closed) return Promise.resolve();
      Object.assign(member, state);
      return timeout(set(own, { ...member, updatedAt: serverTimestamp() }));
    },
    watchMembers(callback, onError) {
      return onValue(ref(rtdb, `${base}/members`), snap => {
        const members = [];
        for (const [memberUid, sessions] of Object.entries(snap.val() || {}))
          for (const [sessionId, value] of Object.entries(sessions || {}))
            if (value && typeof value.updatedAt === 'number')
              members.push({ ...value, uid: memberUid, id: sessionId });
        callback(members);
      }, onError);
    },
    watchConnection(callback) { return onValue(ref(rtdb, '.info/connected'), s => callback(s.val() === true)); },
    watchSignals(peer, callback, onError) {
      return onChildAdded(query(ref(rtdb, `${base}/signals/${peer.uid}/${peer.id}/${id}`), limitToLast(200)),
        s => { const v = s.val(); if (v && getServerTime() - v.at < 90000) callback(v); }, onError);
    },
    send(peer, message) {
      if (closed) return Promise.resolve();
      return timeout(push(ref(rtdb, `${base}/signals/${uid}/${id}/${peer.id}`), { ...message, at: serverTimestamp() }));
    },
    async close() {
      closed = true;
      // Leave disconnect removals armed if offline; queued removals are idempotent.
      await timeout(Promise.all([remove(own), remove(outbox)]));
    },
  };
}

export async function loadVoiceIce(user, roomId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    // user may be a plain object (guest) without getIdToken — fall back to STUN
    if (typeof user?.getIdToken !== 'function') return STUN_SERVERS;
    const token = await user.getIdToken();
    const response = await fetch(`/api/voice-ice?roomId=${encodeURIComponent(roomId)}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
    });
    // Vite/static hosting has no server function. Direct connectivity still works.
    if (response.status === 404 || response.headers.get('content-type')?.includes('text/html')) return STUN_SERVERS;
    if (!response.ok) throw new Error('Voice service is unavailable. Try again shortly.');
    let data;
    try { data = await response.json(); } catch { return STUN_SERVERS; }
    if (!Array.isArray(data.iceServers) || data.iceServers.length === 0) throw new Error('Invalid voice service configuration.');
    return data.iceServers;
  } finally { clearTimeout(timer); }
}
