import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { VoiceSession, voiceError, STUN_SERVERS } from '../src/lib/voiceSession.js';
import handler, { turnCredentials } from '../api/voice-ice.js';

const flush = async () => { for (let i = 0; i < 25; i++) await new Promise(r => setImmediate(r)); };
const media = () => {
  const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
  return { track, getTracks: () => [track], getAudioTracks: () => [track] };
};
class Peer {
  constructor(config) { this.config = config; this.signalingState = 'stable'; this.connectionState = 'new'; this.added = []; }
  addTrack(t) { this.track = t; }
  async createOffer(options) { this.offerOptions = options; return { type: 'offer', sdp: 'offer-sdp' }; }
  async createAnswer() { return { type: 'answer', sdp: 'answer-sdp' }; }
  async setLocalDescription(d) {
    this.localDescription = d; this.signalingState = d.type === 'offer' ? 'have-local-offer' : 'stable';
    this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: 'candidate' }) } });
  }
  async setRemoteDescription(d) { this.remoteDescription = d; this.signalingState = d.type === 'offer' ? 'have-remote-offer' : 'stable'; }
  async addIceCandidate(c) { assert(this.remoteDescription, 'ICE waits for remote description'); this.added.push(c); }
  setConfiguration(c) { this.config = c; }
  close() { this.connectionState = 'closed'; }
}
function harness(id = 'a', overrides = {}) {
  const stream = media(), pcs = [], states = [], sent = [], streams = [], listeners = new Set();
  const transport = {
    id, uid: id, async checkAccess() {}, async open() { this.opened = true; },
    async touch(s) { this.state = s; }, async close() { this.closed = true; },
    watchMembers(cb) { this.roster = cb; listeners.add(cb); return () => listeners.delete(cb); },
    watchConnection(cb) { this.connection = cb; listeners.add(cb); cb(true); return () => listeners.delete(cb); },
    watchSignals(_, cb) { this.signal = cb; listeners.add(cb); return () => listeners.delete(cb); },
    async send(peer, m) { sent.push({ peer, ...m }); },
  };
  const session = new VoiceSession({ transport, getMedia: async () => stream,
    createPeer: config => { const pc = new Peer(config); pcs.push(pc); return pc; },
    getIce: async () => STUN_SERVERS, onChange: s => states.push(s),
    onStream: (...args) => streams.push(args), ...overrides });
  return { session, transport, stream, pcs, states, sent, streams, listeners };
}
const member = (id, more = {}) => ({ id, uid: id, name: id, updatedAt: Date.now(), ...more });

test('join starts muted; mute/unmute controls the actual track; leave closes everything', async () => {
  const h = harness(); await h.session.join();
  assert.equal(h.session.status, 'joined'); assert.equal(h.stream.track.enabled, false);
  h.session.setMuted(false); assert.equal(h.stream.track.enabled, true);
  h.session.setMuted(true); assert.equal(h.stream.track.enabled, false);
  h.transport.roster([member('b')]); await flush(); assert.equal(h.pcs.length, 1);
  h.session.leave(); assert(h.stream.track.stopped); assert.equal(h.pcs[0].connectionState, 'closed');
  assert.equal(h.listeners.size, 0); assert(h.transport.closed); h.session.leave();
});
test('cancel while microphone prompt is pending stops the late stream without publishing presence', async () => {
  let resolve; const stream = media();
  const h = harness('a', { getMedia: () => new Promise(r => { resolve = r; }) });
  const joining = h.session.join(); await flush(); h.session.leave(); resolve(stream); await joining;
  assert(stream.track.stopped); assert(!h.transport.opened); assert.equal(h.listeners.size, 0);
});
test('permission denied produces actionable feedback and cleans up', async () => {
  const h = harness('a', { getMedia: async () => { throw Object.assign(new Error(), { name: 'NotAllowedError' }); } });
  await h.session.join(); assert.equal(h.session.status, 'error');
  assert.match(h.states.at(-1).error, /permission was denied/); assert(h.transport.closed);
});
test('relay failure stops microphone and does not publish presence', async () => {
  const h = harness('a', { getIce: async () => { throw new Error('Relay unavailable'); } });
  await h.session.join(); assert(h.stream.track.stopped); assert(!h.transport.opened);
});
test('network loss immediately releases microphone and listeners', async () => {
  const h = harness(); await h.session.join(); h.session.setMuted(false); h.transport.connection(false);
  assert(h.stream.track.stopped); assert.equal(h.listeners.size, 0); assert.match(h.states.at(-1).error, /Connection lost/);
});
test('out-of-order ICE queues until SDP; only lower session ID offers', async () => {
  const h = harness('z'); await h.session.join(); h.transport.roster([member('a')]); await flush();
  assert(!h.sent.some(s => s.type === 'description'));
  h.transport.signal({ type: 'candidate', candidate: { candidate: 'early' } });
  h.transport.signal({ type: 'description', description: { type: 'offer', sdp: 'offer' } });
  await flush(); assert.equal(h.pcs[0].added.length, 1);
  assert(h.sent.some(s => s.description?.type === 'answer')); h.session.leave();
});
test('same-account tabs, duplicate users and stale presence do not make duplicate audio connections', async () => {
  const h = harness(); await h.session.join();
  h.transport.roster([member('self-tab', { uid: 'a' }), member('b-old', { uid: 'b', updatedAt: Date.now() - 2000 }), member('b-new', { uid: 'b' }), member('c', { updatedAt: Date.now() - 60000 })]);
  assert.equal(h.pcs.length, 1); assert(h.session.peers.has('b-new'));
  h.transport.roster([]); assert.equal(h.session.peers.size, 0); assert.equal(h.pcs[0].connectionState, 'closed'); h.session.leave();
});
test('two clients negotiate concurrently through a queued signalling hub', async () => {
  const a = harness('a'), b = harness('b');
  a.transport.send = async (_, m) => b.transport.signal(m);
  b.transport.send = async (_, m) => a.transport.signal(m);
  await Promise.all([a.session.join(), b.session.join()]);
  a.transport.roster([member('b')]); b.transport.roster([member('a')]); await flush();
  assert.equal(a.pcs[0].remoteDescription.type, 'answer'); assert.equal(b.pcs[0].remoteDescription.type, 'offer');
  assert.equal(a.pcs[0].added.length, 1); assert.equal(b.pcs[0].added.length, 1);
  a.session.leave(); b.session.leave();
});
test('disconnect before remote answer does not resurrect a closed peer', async () => {
  const h = harness(); await h.session.join(); h.transport.roster([member('b')]); await flush();
  const signal = h.transport.signal; h.session.leave();
  signal({ type: 'description', description: { type: 'answer', sdp: 'late' } }); await flush();
  assert(!h.pcs[0].remoteDescription);
});
test('TURN credentials expire in one hour and are signed with server-only shared secret', () => {
  const c = turnCredentials('uid', 'test-secret', ['turn:relay.test:3478'], 1000000);
  assert.equal(c.expiresAt, 4600);
  assert.equal(c.iceServers[1].credential, createHmac('sha1', 'test-secret').update('4600:uid').digest('base64'));
  assert(!JSON.stringify(c).includes('test-secret'));
});
test('ICE endpoint rejects unsupported methods, bad rooms and missing authentication', async () => {
  const run = async req => {
    const res = { setHeader() {}, status(n) { this.code = n; return this; }, json(body) { this.body = body; return this; } };
    await handler(req, res); return res.code;
  };
  assert.equal(await run({ method: 'POST' }), 405);
  assert.equal(await run({ method: 'GET', query: { roomId: '../bad' } }), 400);
  assert.equal(await run({ method: 'GET', query: { roomId: 'ROOM' }, headers: {} }), 401);
});
test('permission and hardware errors have distinct actionable messages', () => {
  assert.match(voiceError({ code: 'PERMISSION_DENIED' }), /database rules/);
  assert.match(voiceError({ name: 'NotFoundError' }), /No microphone/);
  assert.match(voiceError({ name: 'NotReadableError' }), /busy/);
});
