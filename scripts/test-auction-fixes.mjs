// Offline regression checks; no live rooms or database writes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createAuctionAudio } from '../src/lib/auctionAudio.js';
const project = process.cwd(), require = createRequire(path.join(project, 'package.json'));
const { build } = createRequire(require.resolve('vite/package.json'))('esbuild');
const { JSDOM } = createRequire(path.join(process.env.PHASE3_QA_MODULES, 'package.json'))('jsdom');
let contexts = 0, disconnected = 0, closed = 0;
class AudioContext {
  constructor() { contexts++; this.state = 'running'; this.currentTime = 1; }
  createOscillator() { return { frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() { this.onended(); }, disconnect() { disconnected++; } }; }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() { disconnected++; } }; }
  async close() { closed++; this.state = 'closed'; }
}
const audio = createAuctionAudio(() => AudioContext);
for (let i = 0; i < 200; i++) audio.play();
assert.equal(contexts, 1); assert.equal(disconnected, 400); audio.dispose(); assert.equal(closed, 1);
createAuctionAudio(() => undefined).play();
console.log('PASS: 200 beeps reuse one audio context, release nodes, and close on exit.');
const dom = new JSDOM('<button id="opener">Roster</button><div id="root"></div>', { url: 'https://game.test/auction/TEST' });
for (const k of ['window','document','HTMLElement','Element','Node','SVGElement']) globalThis[k] = dom.window[k];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__rosterRenders = 0;
const listeners = new Map(), values = new Map();
const snap = value => ({ val: () => value, exists: () => value != null, forEach: fn => Object.entries(value || {}).forEach(([key, v]) => fn({ key, val: () => v })) });
globalThis.__db = {
  listeners, values, logs: [], transactionOverride: undefined,
  listen(p, cb) { const key = Symbol(); listeners.set(key, { p, cb }); cb(snap(values.get(p) ?? null)); return () => listeners.delete(key); },
  async transact(p, fn, options) { this.options = options; const before = this.transactionOverride ?? values.get(p); const next = fn(structuredClone(before)); if (next === undefined) return { committed: false, snapshot: snap(before) }; values.set(p, next); for (const l of listeners.values()) if (l.p === p) l.cb(snap(next)); return { committed: true, snapshot: snap(next) }; },
};
globalThis.__user = { uid: 'guest', displayName: 'Guest' };
const output = path.join(project, 'tmp/auction-fixes-test.mjs');
await fs.mkdir(path.dirname(output), { recursive: true });
await build({ stdin: { contents: `import React,{act} from 'react';import {createRoot} from 'react-dom/client';import PlayerRoster from './src/components/PlayerRoster.jsx';import BidPrediction from './src/components/BidPrediction.jsx';import {VoicePanel} from './src/components/RoomVoiceChat.jsx';import {AuctionProvider,useAuction} from './src/contexts/AuctionContext.jsx';export {React,act,createRoot,PlayerRoster,BidPrediction,VoicePanel,AuctionProvider,useAuction};`, resolveDir: project, loader: 'jsx' }, outfile: output, bundle: true, platform: 'node', format: 'esm', loader: { '.css': 'empty' }, plugins: [{ name: 'offline', setup(b) {
  b.onLoad({ filter: /PlayerRoster\.jsx$/ }, async a => ({ contents: (await fs.readFile(a.path, 'utf8')).replace("   const [activeOverlayTab", "   globalThis.__rosterRenders++;\n   const [activeOverlayTab"), loader: 'jsx' }));
  b.onResolve({ filter: /firebase\/database$|firebase\/firestore$|(?:lib\/)?firebase$|contexts\/AuthContext$|\.\/AuthContext$|\.\/QuotaContext$|lib\/voiceFirebase$/ }, a => ({ path: a.path, namespace: 'mock' }));
  b.onLoad({ filter: /.*/, namespace: 'mock' }, a => {
    if (a.path === 'firebase/database') return { contents: `const d=globalThis.__db; export const ref=(_,p)=>p;export const onValue=(p,cb)=>d.listen(p,cb);export const runTransaction=(...a)=>d.transact(...a);export const query=p=>p;export const limitToLast=()=>{};export const serverTimestamp=()=>123;export const set=async()=>{};export const update=async()=>{};export const get=async p=>({val:()=>d.values.get(p),exists:()=>d.values.has(p)});export const onDisconnect=()=>({set:async()=>{}});export const push=async(p,v)=>{d.logs.push(v);if(d.logFailure)throw Error('log unavailable')};` };
    if (a.path === 'firebase/firestore') return { contents: `export const doc=()=>({});export const onSnapshot=()=>()=>{};export const updateDoc=()=>{};export const getDoc=()=>{};export const getDocs=()=>{};export const setDoc=()=>{};export const addDoc=()=>{};export const arrayUnion=()=>{};export const arrayRemove=()=>{};export const collection=()=>{};export const runTransaction=()=>{};export const deleteDoc=()=>{};export const query=()=>{};export const where=()=>{};export const orderBy=()=>{};export const serverTimestamp=()=>123;export const increment=()=>{};export const writeBatch=()=>({});` };
    return { contents: `export const db={};export const rtdb={};export const getServerTime=()=>1000;export const useAuth=()=>({user:globalThis.__user});export const useQuota=()=>({handleFirebaseError:()=>{}});export const canUseVoice=()=>true;export const validRoomId=()=>true;export const createVoiceTransport=()=>({});export const loadVoiceIce=()=>[];` };
  });
} }] });
const { React, act, createRoot, PlayerRoster, BidPrediction, VoicePanel, AuctionProvider, useAuction } = await import(pathToFileURL(output));
const root = createRoot(document.getElementById('root'));
const render = async element => act(async () => root.render(element));
const click = async text => { const el = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text || b.getAttribute('aria-label') === text); assert(el, text); await act(async () => el.click()); };
try {
  const player = { id: 'one', name: 'First Player', role: 'Bowler', image: '/one.png', basePrice: 0.5, set: 'Set 1' };
  const categories = { upcoming: [player], sold: [{...player,id:'two',name:'Sold Player',bid:3}], unsold: [] };
  let closes = 0;
  const onClose = () => closes++;
  const roster = () => React.createElement(PlayerRoster, { playerCategories: categories, onClose });
  document.getElementById('opener').focus();
  await render(roster());
  const x = document.querySelector('[aria-label="Close player roster"]');
  assert.equal(document.activeElement, x);
  assert.equal(x.parentElement.firstElementChild, x);
  assert(x.parentElement.classList.contains('justify-start'));
  assert(document.querySelector('img[loading="lazy"][decoding="async"]'));
  const renders = globalThis.__rosterRenders;
  for (let i = 0; i < 20; i++) await render(roster());
  assert.equal(globalThis.__rosterRenders, renders, 'timer/parent renders must skip the roster');
  await click('sold'); assert.match(document.body.textContent,/Sold Player/);
  await click('unsold'); assert.match(document.body.textContent,/No unsold players/);
  await click('leaderboard'); assert.match(document.body.textContent,/Sold Player/);
  await click('upcoming'); await click('Close player roster');
  await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape'})));
  assert.equal(closes,2);
  await render(null); assert.equal(document.activeElement.id,'opener');
  console.log('PASS: left close button, Escape/focus return, all roster tabs, lazy images, no roster rerenders across 20 parent updates.');
  await render(React.createElement(React.Fragment,null,roster(),React.createElement(VoicePanel,{roomId:'TEST',user:globalThis.__user,name:'Guest'})));
  const voiceButton=document.querySelector('.room-voice-heading');
  for(let i=0;i<20;i++) await act(async()=>voiceButton.click());
  assert(document.querySelector('.room-voice.is-collapsed')); assert(document.querySelector('[aria-label="Close player roster"]'));
  const css=await fs.readFile('src/components/RoomVoiceChat.css','utf8');
  assert.match(css,/max-width: calc\(100vw - 88px\)/);
  console.log('PASS: repeated Voice expand/collapse keeps roster close control available. Layout on a real phone remains unverified.');
  for(let i=0;i<30;i++) {
    await render(React.createElement(BidPrediction,{auctionId:'TEST',playerId:`p${i}`,playerName:'Player',userId:'guest',status:'bidding',enabled:true}));
    assert.equal(listeners.size,1,'only the current player prediction listener remains');
  }
  await render(React.createElement(BidPrediction,{auctionId:'TEST',playerId:'p29',enabled:false}));
  assert.equal(listeners.size,0); await render(null);
  console.log('PASS: 30 player changes retain one prediction listener; disabling/unmount removes it.');
  const { IPL_PLAYERS }=await import('../src/data/players.js');
  const domestic=IPL_PLAYERS.find(p=>p.country==='IND');
  const live={playerId:domestic.id,status:'bidding',currentBid:3.8,highBidderId:'opponent',timerEndsAt:11000};
  values.set('auctions/TEST/room',{hostId:'host',status:'active',players:[],playerOrder:[0],settings:{bidTimer:10},botsEnabled:false});
  values.set('auctions/TEST/live',live);
  values.set('auctions/TEST/teams',{TEST_guest:{userId:'guest',teamId:'SRH',budgetRemaining:50,squad:[]}});
  values.set('auctions/TEST/messages',{});
  let api;function Probe(){api=useAuction();return null;}
  await render(React.createElement(AuctionProvider,null,React.createElement(Probe)));
  let unsubscribe;await act(async()=>{unsubscribe=api.joinAuction('TEST','guest');});
  const bid=api.placeBid;
  await act(async()=>{await bid(4);});
  assert.equal(values.get('auctions/TEST/live').currentBid,4);
  assert.equal(globalThis.__db.options.applyLocally,false);
  assert.equal(globalThis.__db.logs.length,1);
  for(const changed of [{...live,status:'sold'},{...live,playerId:'different'},{...live,highBidderId:'guest'},{...live,currentBid:100}]) {
    globalThis.__db.transactionOverride=changed;
    await act(async()=>assert.rejects(bid(4),/Bid not accepted/));
  }
  assert.equal(globalThis.__db.logs.length,1,'no successful log for rejected bids');
  globalThis.__db.transactionOverride={...live,currentBid:4.2};globalThis.__db.logFailure=true;
  await act(async()=>{await bid(4);});
  assert.equal(values.get('auctions/TEST/live').currentBid,4.4,'transaction uses latest competing bid');
  await act(async()=>unsubscribe());await render(null);
  assert.equal(listeners.size,0);
  console.log('PASS: committed bid, price race, rejected/sold/changed-player/over-budget bids, no false logs, logging failure cannot undo a bid, cleanup.');
} finally { await act(async()=>root.unmount());dom.window.close();await fs.unlink(output); }

// Motion keeps a scheduler alive in jsdom; all app listeners were checked above.
process.exit(0);
