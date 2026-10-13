// Offline DOM/button test; real WebRTC/network tests require two physical devices.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
const project = process.cwd(), require = createRequire(path.join(project, 'package.json'));
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
const { JSDOM } = createRequire(path.join(process.env.PHASE3_QA_MODULES, 'package.json'))('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://game.test/auction/TEST' });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'SVGElement']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
window.isSecureContext = true; window.RTCPeerConnection = function () {};
Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia() {} }, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const audios = [];
globalThis.Audio = class {
  constructor() { this.block = true; audios.push(this); }
  setAttribute() {} pause() { this.paused = true; }
  async play() { if (this.block) throw new Error('gesture needed'); }
};
const output = path.join(project, '.voice-ui-test.mjs');
await build({ stdin: { contents: `import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {VoicePanel} from './src/components/RoomVoiceChat.jsx';export {React,act,createRoot,VoicePanel};`, resolveDir: project, loader: 'jsx' }, outfile: output,
  bundle: true, platform: 'node', format: 'esm', loader: { '.css': 'empty' }, plugins: [{ name: 'offline', setup(b) {
    b.onResolve({ filter: /firebase\/database$|lib\/firebase$|contexts\/AuthContext$|lib\/voiceFirebase$/ }, a => ({ path: a.path, namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `export const rtdb={};export const ref=()=>({});export const onValue=()=>()=>{};export const getServerTime=Date.now;export const useAuth=()=>({});export const canUseVoice=()=>true;export const validRoomId=()=>true;export const createVoiceTransport=()=>({});export const loadVoiceIce=()=>[];` }));
  } }] });
const { React, act, createRoot, VoicePanel } = await import(pathToFileURL(output));
let config, session, leaveCount = 0;
const makeSession = c => {
  config = c;
  let state = { status: 'joined', muted: true, error: '', peers: [{ id: 'friend', name: 'Friend', muted: false, status: 'connected' }] };
  session = { closed: false, async join() { c.onChange(state); }, setMuted(v) { state = { ...state, muted: v }; c.onChange(state); },
    leave() { this.closed = true; leaveCount++; c.onStream('friend', null); c.onChange({ status: 'idle', muted: true, peers: [], error: '' }); } };
  return session;
};
const root = createRoot(document.getElementById('root'));
const click = async label => {
  const button = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === label || b.textContent === label);
  assert(button, `Button exists: ${label}`); await act(async () => button.click());
};
try {
  await act(async () => root.render(React.createElement(VoicePanel, { roomId: 'TEST', user: { uid: 'user' }, name: 'You', makeSession })));
  assert(!session, 'no microphone/session on initial render');
  await click('Join voice'); assert(session); assert(document.querySelector('[aria-label="Unmute microphone"]'));
  await click('Unmute microphone'); assert(document.querySelector('[aria-label="Mute microphone"]'));
  await click('Mute microphone'); assert(document.querySelector('[aria-label="Unmute microphone"]'));
  // Mute friend even before its remote audio track arrives.
  await click('Mute Friend'); await act(async () => config.onStream('friend', { mockStream: true }));
  assert(audios[0].muted); assert.match(document.body.textContent, /Tap to hear friends/);
  audios[0].block = false; await click('Tap to hear friends'); assert(!document.body.textContent.includes('Tap to hear friends'));
  await click('Unmute Friend'); assert.equal(audios[0].muted, false);
  await click('Mute friends'); assert.equal(audios[0].muted, true);
  await click('Hear friends'); assert.equal(audios[0].muted, false);
  await click('Leave'); assert(audios[0].paused); assert.equal(audios[0].srcObject, null);
  await click('Join voice'); await act(async () => window.dispatchEvent(new window.Event('pagehide')));
  assert(session.closed); assert.equal(leaveCount, 2);
  await act(async () => root.unmount());
  console.log('PASS: join opt-in, mic on/off, individual mute before stream arrival, mute-all, autoplay recovery, leave, rejoin, pagehide cleanup.');
} finally { dom.window.close(); await fs.unlink(output); }
process.exit(0);
