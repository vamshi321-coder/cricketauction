/**
 * MatchArena — Cricket Manager Journey style
 * Mobile-first, over-by-over interactive match engine
 * 
 * FLOW:
 *   Toss → [Bat/Bowl decision] → Innings 1 (over-by-over) → Innings Break → Innings 2 → Result
 * 
 * MODES per over:
 *   "over"    — set tactics for whole over, simulate all 6 balls, show summary
 *   "ball"    — watch ball by ball (auto or manual step)
 *   "innings" — simulate entire remaining innings at once
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import {
  X, Play, Pause, ChevronRight, SkipForward,
  Shield, Trophy, Zap, Target, Activity,
  RefreshCw, AlertCircle, Loader2, Volume2, VolumeX,
  ChevronUp, ChevronDown, RotateCcw
} from 'lucide-react';
import { simulateT20Match, matchSetup, oversText, defaultTossDecision, inningsAtEvent } from '../lib/t20Engine.js';
import { TEAMS } from '../data/teams.js';

// ── constants ────────────────────────────────────────────────────────────────
const TEAM_HEX = {
  MI:'#005BA2', CSK:'#F9CD02', RCB:'#CC2121', KKR:'#3A225D',
  DC:'#2561AE', PBKS:'#ED1B24', RR:'#EA1A85', SRH:'#F7A721',
  GT:'#1B4068', LSG:'#A72B4B',
};
const hex = id => TEAM_HEX[id] || '#4a6080';
const logo = id => TEAMS.find(t => t.id === id)?.logo || null;
const tname = id => TEAMS.find(t => t.id === id)?.name || id;

// ── commentary lines ─────────────────────────────────────────────────────────
const COMM = {
  six:    ['MAXIMUM! Into the stands!','SIX! What a hit!','Gone over the rope for six!','Cleared the boundary easily!'],
  four:   ['FOUR! Races to the boundary!','Beautifully timed, four runs!','Through the gap, four!','Cracked away for a boundary!'],
  wicket: ['OUT! Big wicket falls!','He\'s gone! Walking back slowly.','Clean bowled! Stumps shattered!','Caught at the boundary!','LBW! Finger goes up!'],
  dot:    ['Dot ball. Well defended.','No run, tight line and length.','Played back carefully.','Beaten outside off!'],
  one:    ['Quick single taken.','They run one, rotate strike.','Good running — one run.'],
  two:    ['Two runs, good cricket.','They push hard for two!'],
  three:  ['Three! Excellent running between wickets!'],
  wide:   ['Wide down leg side.','Too wide outside off — extra.'],
  nb:     ['No ball! Free hit next delivery!'],
};
let _ci = 0;
const pick = arr => { _ci = (_ci + 7) % arr.length; return arr[_ci]; };
const getComm = ev => {
  if (!ev) return 'Ready for first ball…';
  if (ev.wicket) return pick(COMM.wicket);
  if (ev.extraType === 'wides') return pick(COMM.wide);
  if (ev.extraType === 'noBalls') return pick(COMM.nb);
  const r = ev.batRuns;
  if (r === 6) return pick(COMM.six);
  if (r === 4) return pick(COMM.four);
  if (r === 3) return pick(COMM.three);
  if (r === 2) return pick(COMM.two);
  if (r === 1) return pick(COMM.one);
  return pick(COMM.dot);
};

// ── helpers ──────────────────────────────────────────────────────────────────
const phase = balls => balls >= 90 ? 'death' : balls < 36 ? 'powerplay' : 'middle';
const phaseLabel = balls => balls >= 90 ? '💀 Death' : balls < 36 ? '⚡ Powerplay' : '🎯 Middle';

// Simulate one over (up to 6 legal balls) from a full innings events array
function getOverEvents(events, overNo) {
  // group by over number (legal ball index)
  let legal = 0; let overEvents = []; let inOver = false;
  for (const ev of events) {
    const thisOver = Math.floor(legal / 6);
    if (thisOver === overNo) { inOver = true; overEvents.push(ev); if (ev.legal) legal++; }
    else if (thisOver > overNo) break;
    else if (ev.legal) legal++;
  }
  return overEvents;
}

// ── Ball chip ────────────────────────────────────────────────────────────────
function BallChip({ ev, small }) {
  if (!ev) return <div className={`rounded-full bg-white/8 border border-white/10 flex items-center justify-center font-bold text-gray-600 ${small ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs'}`}>·</div>;
  const isW = !!ev.wicket;
  const is6 = ev.batRuns === 6; const is4 = ev.batRuns === 4;
  const isWd = ev.extraType === 'wides'; const isNB = ev.extraType === 'noBalls';
  const label = isW ? 'W' : isWd ? 'Wd' : isNB ? 'NB' : String(ev.batRuns + (ev.extras||0));
  const cls = isW ? 'bg-red-500 border-red-400 text-white' :
    is6 ? 'bg-orange-500 border-orange-400 text-white' :
    is4 ? 'bg-sky-500 border-sky-400 text-white' :
    (isWd||isNB) ? 'bg-amber-500/30 border-amber-400/60 text-amber-300' :
    ev.batRuns === 0 ? 'bg-white/5 border-white/10 text-gray-500' :
    'bg-white/15 border-white/20 text-white';
  return (
    <Motion.div initial={{scale:0.4,opacity:0}} animate={{scale:1,opacity:1}} transition={{type:'spring',stiffness:400,damping:20}}
      className={`rounded-full border-2 flex items-center justify-center font-black shrink-0 ${small?'w-7 h-7 text-[9px]':'w-9 h-9 text-[11px]'} ${cls}`}>
      {label}
    </Motion.div>
  );
}

// ── 2D Field ─────────────────────────────────────────────────────────────────
function Field2D({ lastBall, recentEvents, hexA, hexB }) {
  const shots = useMemo(() => (recentEvents||[]).filter(e=>e.batRuns>0&&!e.extraType).slice(-30).map((e,i)=>{
    const ang = ((e.ball*43+i*19)%360)*Math.PI/180;
    const dist = e.batRuns>=6?145:e.batRuns>=4?108:40+e.batRuns*14;
    return {x:160+Math.cos(ang)*dist,y:130+Math.sin(ang)*dist*.75,r:e.batRuns,k:`${e.ball}-${i}`};
  }),[recentEvents]);

  const landing = useMemo(()=>{
    if(!lastBall) return null;
    if(lastBall.wicket) return {x:160,y:128,type:'wicket'};
    const r=lastBall.batRuns; if(!r&&!lastBall.extraType) return null;
    const ang=((lastBall.ball*37+11)%360)*Math.PI/180;
    if(r===6) return {x:160+Math.cos(ang)*148,y:130+Math.sin(ang)*110,type:'six'};
    if(r===4) return {x:160+Math.cos(ang)*112,y:130+Math.sin(ang)*84,type:'four'};
    if(r>0) return {x:160+Math.cos(ang)*(38+r*12),y:130+Math.sin(ang)*(28+r*9),type:'run'};
    return null;
  },[lastBall]);

  const bc = landing?.type==='six'?'#f97316':landing?.type==='four'?'#38bdf8':landing?.type==='wicket'?'#ef4444':'#ffffff';

  return (
    <svg viewBox="0 0 320 260" className="w-full" style={{maxHeight:180}} aria-label="Cricket field">
      <defs>
        <radialGradient id="grass" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1e4d25"/>
          <stop offset="100%" stopColor="#132e17"/>
        </radialGradient>
      </defs>
      <ellipse cx="160" cy="130" rx="154" ry="122" fill="url(#grass)" stroke="#2d6635" strokeWidth="1.5"/>
      <ellipse cx="160" cy="130" rx="93" ry="72" fill="none" stroke="#2d6635" strokeWidth="1" strokeDasharray="4 3" opacity=".6"/>
      <rect x="147" y="72" width="26" height="116" rx="2" fill="#c8a86b" opacity=".88"/>
      <line x1="140" y1="90" x2="180" y2="90" stroke="white" strokeWidth="1.2" opacity=".7"/>
      <line x1="140" y1="170" x2="180" y2="170" stroke="white" strokeWidth="1.2" opacity=".7"/>
      {[154,159,164].map(x=><rect key={x} x={x} y="78" width="2.5" height="13" rx="1" fill={hexA} opacity=".9"/>)}
      {[154,159,164].map(x=><rect key={x+'b'} x={x} y="169" width="2.5" height="13" rx="1" fill={hexB} opacity=".9"/>)}
      {shots.map(s=><circle key={s.k} cx={s.x} cy={s.y} r={s.r>=6?4:s.r>=4?3:2} fill={s.r>=6?'#f97316':s.r>=4?'#38bdf8':'#9ca3af'} opacity=".35"/>)}
      {shots.map((s,i)=>i>0&&<line key={`l${s.k}`} x1="160" y1="130" x2={s.x} y2={s.y} stroke={s.r>=6?'#f97316':s.r>=4?'#38bdf8':'#6b7280'} strokeWidth=".7" opacity=".15"/>)}
      <AnimatePresence>
        {landing&&lastBall&&(
          <>
            <Motion.line key={`ln${lastBall.ball}`} x1="160" y1="130" x2={landing.x} y2={landing.y}
              stroke={bc} strokeWidth="1.2" strokeDasharray="3 3" opacity=".6"
              initial={{pathLength:0,opacity:0}} animate={{pathLength:1,opacity:.6}} exit={{opacity:0}} transition={{duration:.22}}/>
            <Motion.circle key={`bl${lastBall.ball}`} cx={landing.x} cy={landing.y} r={landing.type==='six'?8:6}
              fill={bc} opacity=".95"
              initial={{cx:160,cy:130,r:3,opacity:0}} animate={{cx:landing.x,cy:landing.y,r:landing.type==='six'?8:6,opacity:1}}
              exit={{opacity:0,r:2}} transition={{duration:.24,ease:'easeOut'}}/>
          </>
        )}
      </AnimatePresence>
      <circle cx="160" cy="165" r="5" fill={hexB} stroke="white" strokeWidth="1.2"/>
      <circle cx="160" cy="96" r="5" fill={hexA} stroke="white" strokeWidth="1.2"/>
      <text x="160" y="244" textAnchor="middle" fill="#4b7a56" fontSize="7" fontFamily="system-ui" fontWeight="700" letterSpacing="2">
        {lastBall ? phaseLabel(lastBall.ball).toUpperCase() : 'POWERPLAY'}
      </text>
    </svg>
  );
}

// ── Score bar (sticky top) ───────────────────────────────────────────────────
function ScoreBar({ battingId, bowlingId, runs, wickets, balls, target, inningsIdx }) {
  const rr = balls>0?(runs/balls*6).toFixed(2):'0.00';
  const rrr = target&&balls<120?((target-runs)/((120-balls)/6)).toFixed(2):null;
  const hA=hex(battingId), hB=hex(bowlingId);
  return (
    <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{background:'#09121a'}}>
      {/* batting team */}
      <div className="flex items-center gap-1.5 shrink-0">
        {logo(battingId)&&<img src={logo(battingId)} alt="" className="w-6 h-6 object-contain"/>}
        <span className="text-[9px] font-black text-gray-400 uppercase hidden xs:block">{battingId}</span>
      </div>
      {/* score */}
      <div className="flex-1 text-center">
        <Motion.div key={`${runs}${wickets}`} initial={{scale:1.1}} animate={{scale:1}} transition={{duration:.15}}>
          <span className="text-2xl font-black text-white tabular-nums">{runs}</span>
          <span className="text-lg font-black text-gray-500">/{wickets}</span>
        </Motion.div>
        <div className="text-[8px] text-gray-500 font-bold">
          {oversText(balls)} ov · RR {rr}
          {rrr&&<span className="text-orange-400 ml-1">· need {rrr}/ov</span>}
        </div>
        {target&&<div className="text-[9px] font-black text-orange-400">Target {target} · need {Math.max(0,target-runs)} off {120-balls}b</div>}
      </div>
      {/* bowling team */}
      <div className="flex items-center gap-1.5 shrink-0 flex-row-reverse">
        {logo(bowlingId)&&<img src={logo(bowlingId)} alt="" className="w-6 h-6 object-contain"/>}
        <span className="text-[9px] font-black text-gray-600 uppercase hidden xs:block">{bowlingId}</span>
      </div>
    </div>
  );
}

// ── Toss screen ───────────────────────────────────────────────────────────────
function TossScreen({ setup, teamA, teamB, myTeamId, onDone, onClose }) {
  const [called, setCalled] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const won = setup.tossWinner === myTeamId;
  const [decision, setDecision] = useState(null);

  const tossTimer = useRef(null);
  useEffect(() => () => clearTimeout(tossTimer.current), []);
  const callToss = c => {
    setCalled(c); setFlipping(true);
    tossTimer.current = setTimeout(()=>{setFlipping(false);setRevealed(true);},1200);
  };

  const hexA = hex(teamA?.teamId), hexB = hex(teamB?.teamId);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#070c12]"
      style={{background:`radial-gradient(ellipse at 50% 0%,${hexA}22,#070c12 55%)`}}>
      <button aria-label="Close match" onClick={onClose} className="absolute top-3 left-3 p-3 text-gray-400"><X size={18}/></button>
      {/* vs bar */}
      <div className="flex items-center gap-6 mb-6">
        <div className="flex flex-col items-center gap-2">
          {logo(teamA?.teamId)&&<img src={logo(teamA?.teamId)} alt="" className="w-14 h-14 object-contain"/>}
          <span className="text-xs font-black text-white uppercase">{teamA?.teamId}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="w-px h-6 bg-white/10"/><span className="text-[9px] font-black text-gray-600">vs</span><div className="w-px h-6 bg-white/10"/>
        </div>
        <div className="flex flex-col items-center gap-2">
          {logo(teamB?.teamId)&&<img src={logo(teamB?.teamId)} alt="" className="w-14 h-14 object-contain"/>}
          <span className="text-xs font-black text-white uppercase">{teamB?.teamId}</span>
        </div>
      </div>

      {/* pitch/weather */}
      <div className="flex gap-2 mb-6 flex-wrap justify-center px-4">
        <span className="text-[9px] font-bold text-gray-500 bg-white/5 border border-white/10 px-3 py-1 rounded-full">
          {setup.pitch==='batting'?'🏏 Batting pitch':setup.pitch==='bowling'?'🎯 Bowling pitch':'⚖️ Balanced pitch'}
        </span>
        <span className="text-[9px] font-bold text-gray-500 bg-white/5 border border-white/10 px-3 py-1 rounded-full">
          {setup.weather==='Evening dew'?'💧 Evening dew':'☀️ Clear skies'}
        </span>
      </div>

      {!revealed ? (
        <>
          <Motion.div
            animate={flipping ? { scale:[1,1.15,0.9,1.1,1], rotate:[0,15,-15,10,-5,0], y:[0,-18,0,-10,0] } : {}}
            transition={{ duration:1.2, ease:'easeInOut' }}
            className="w-20 h-20 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-600 border-4 border-yellow-200 flex items-center justify-center text-3xl mb-6 shadow-2xl shadow-yellow-500/30"
            style={{ perspective: 600 }}
          >
            <Motion.span
              animate={flipping ? { rotateX: [0, 360, 720, 1080] } : {}}
              transition={{ duration:1.2, ease:'easeInOut' }}
              style={{ display:'inline-block' }}
            >🪙</Motion.span>
          </Motion.div>
          <p className="text-[9px] font-black text-gray-500 uppercase tracking-[.25em] mb-2">The Toss</p>
          <p className="text-sm text-gray-400 mb-5">Call the coin</p>
          {!called ? (
            <div className="flex gap-3">
              {['Heads','Tails'].map(c=>(
                <button key={c} onClick={()=>callToss(c)}
                  className="px-8 py-3 rounded-2xl border border-white/20 bg-white/5 text-white font-black text-sm uppercase tracking-widest hover:bg-white/10 active:scale-95 transition-all">
                  {c}
                </button>
              ))}
            </div>
          ):<p className="text-sm text-gray-400 animate-pulse">Flipping…</p>}
        </>
      ) : (
        <Motion.div initial={{opacity:0,scale:.85}} animate={{opacity:1,scale:1}} className="text-center px-6">
          <div className="text-5xl mb-3">{won?'🎉':'😔'}</div>
          <p className="text-[9px] font-black text-orange-400 uppercase tracking-[.25em] mb-2">Toss Result</p>
          <h2 className="text-xl font-black text-white mb-1">{setup.tossWinner} won the toss</h2>
          {won ? (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-gray-400 mb-3">Choose to bat or bowl first:</p>
              <div className="flex gap-3 justify-center">
                {['bat','bowl'].map(d=>(
                  <button key={d} onClick={()=>setDecision(d)}
                    className={`px-7 py-3 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95 ${decision===d?'bg-orange-500 text-white border border-orange-400':'bg-white/5 border border-white/15 text-gray-300 hover:bg-white/10'}`}>
                    {d==='bat'?'🏏 Bat':'🎯 Bowl'}
                  </button>
                ))}
              </div>
              {decision&&(
                <button onClick={()=>onDone(decision)}
                  className="mt-4 w-full py-3.5 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-black uppercase tracking-widest active:scale-95 transition-all">
                  Start Match →
                </button>
              )}
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-sm text-gray-400 mb-5">
                {setup.tossWinner} chose to {defaultTossDecision(setup)} first
              </p>
              <button onClick={()=>onDone(null)}
                className="px-10 py-3.5 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-black uppercase tracking-widest active:scale-95 transition-all">
                Start Match →
              </button>
            </div>
          )}
        </Motion.div>
      )}
    </div>
  );
}

// ── Innings break screen ──────────────────────────────────────────────────────
function InningsBreak({ inn1, myTeamId, onContinue }) {
  const target = inn1.runs + 1;
  const myBat = inn1.battingTeamId !== myTeamId; // my team bats in inn2?
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#070c12] p-6 text-center">
      <div className="text-4xl mb-4">🏏</div>
      <p className="text-[9px] font-black text-orange-400 uppercase tracking-[.25em] mb-3">Innings Break</p>
      <h2 className="text-2xl font-black text-white mb-2">{inn1.battingTeamId}</h2>
      <p className="text-4xl font-black text-white tabular-nums mb-1">{inn1.runs}/{inn1.wickets}</p>
      <p className="text-sm text-gray-500 mb-5">({inn1.overs} overs)</p>
      <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 mb-6">
        <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1">Target</p>
        <p className="text-3xl font-black text-orange-400">{target}</p>
        <p className="text-xs text-gray-500 mt-1">{myBat?'Your team bats now':'Your team bowls now'}</p>
      </div>
      <button onClick={onContinue}
        className="px-10 py-3.5 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-black uppercase tracking-widest active:scale-95 transition-all">
        {myBat?'Start Chase →':'Bowl Now →'}
      </button>
    </div>
  );
}

// ── Result screen ─────────────────────────────────────────────────────────────
function ResultScreen({ result, myTeamId, onReplay, onClose, onCancel, saving, saveError }) {
  const won = result?.winner === myTeamId;
  const inn1 = result?.innings?.[0], inn2 = result?.innings?.[1];
  const hw = hex(result?.winner||'');
  return (
    <Motion.div initial={{opacity:0,y:24}} animate={{opacity:1,y:0}}
      className="fixed inset-0 z-50 flex flex-col bg-[#070c12]"
      style={{background:`radial-gradient(ellipse at 50% 20%,${hw}25,#070c12 58%)`}}>
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">{won?'🏆':result?.winner?'😔':'🤝'}</div>
        <p className="text-[9px] font-black text-orange-400 uppercase tracking-[.25em] mb-2">
          {won?'Victory!':result?.winner?'Defeated':'Tied'}
        </p>
        <h2 className="text-2xl font-black text-white uppercase">{result?.winner||'Tie'}</h2>
        <p className="text-sm text-gray-400 mt-2 mb-6 leading-relaxed">{result?.summary}</p>
        <div className="flex gap-8">
          {[inn1,inn2].filter(Boolean).map((inn,i)=>(
            <div key={i} className="text-center">
              <div className="flex items-center gap-1 mb-1 justify-center">
                {logo(inn.battingTeamId)&&<img src={logo(inn.battingTeamId)} alt="" className="w-5 h-5 object-contain"/>}
                <span className="text-[9px] font-black text-gray-500">{inn.battingTeamId}</span>
              </div>
              <p className="text-xl font-black text-white">{inn.runs}/{inn.wickets}</p>
              <p className="text-[9px] text-gray-600">({inn.overs})</p>
            </div>
          ))}
        </div>
      </div>
      <div className="p-5 space-y-3 border-t border-white/5" style={{paddingBottom:`max(20px,env(safe-area-inset-bottom,20px))`}}>
        {saveError && <><p role="alert" className="text-sm text-red-400">{saveError}</p><button onClick={onCancel} className="w-full py-2 text-gray-400 text-xs">Return without saving</button></>}
        <button disabled={saving} onClick={onReplay}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all">
          <RefreshCw size={14}/> Play Again
        </button>
        <button disabled={saving} onClick={onClose}
          className="w-full py-3 rounded-2xl bg-white/5 border border-white/10 text-gray-400 font-black text-sm uppercase tracking-widest active:scale-95 transition-all">
          {saving ? 'Saving…' : 'Exit'}
        </button>
      </div>
    </Motion.div>
  );
}

// ── Over summary row ──────────────────────────────────────────────────────────
function OverSummary({ overEvents, overNo }) {
  const runs = overEvents.reduce((s,e)=>s+e.batRuns+(e.extras||0),0);
  const wickets = overEvents.filter(e=>e.wicket).length;
  return (
    <div className="flex items-center gap-2 py-2 px-3 border-b border-white/5">
      <span className="text-[9px] font-black text-gray-600 w-6 shrink-0">Ov {overNo+1}</span>
      <div className="flex gap-1 flex-1 flex-wrap">
        {overEvents.map((ev,i)=><BallChip key={i} ev={ev} small/>)}
      </div>
      <span className="text-[10px] font-black text-white shrink-0">{runs}{wickets>0&&<span className="text-red-400"> -{wickets}W</span>}</span>
    </div>
  );
}

// ── Batsman card ──────────────────────────────────────────────────────────────
function BatsmanCard({ batter, isStriker, tactic, onTactic, bowlerName, isMyTeam }) {
  const sr = batter.balls>0?(batter.runs/batter.balls*100).toFixed(0):'-';
  return (
    <div className={`rounded-xl border p-3 transition-all ${isStriker?'border-orange-500/40 bg-orange-500/5':'border-white/8 bg-white/[0.02]'}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full shrink-0 ${isStriker?'bg-orange-400':'bg-gray-600'}`}/>
        <span className="text-[11px] font-black text-white flex-1 truncate">{batter.name}{isStriker?' ★':''}</span>
        <div className="text-right shrink-0">
          <span className="text-base font-black text-white tabular-nums">{batter.runs}</span>
          <span className="text-[9px] text-gray-500"> ({batter.balls}b)</span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[8px] text-gray-600">SR {sr} · {batter.fours}×4 · {batter.sixes}×6</span>
        {isMyTeam&&<TacticButtons tactic={tactic} onChange={onTactic}/>}
      </div>
      {bowlerName&&<p className="text-[8px] text-gray-600 mt-1">vs {bowlerName}</p>}
    </div>
  );
}

// ── Tactic buttons ────────────────────────────────────────────────────────────
function TacticButtons({ tactic, onChange }) {
  return (
    <div className="flex gap-1">
      {[
        {id:'defend', label:'Def', icon:'🛡️'},
        {id:'balanced', label:'Nor', icon:'⚡'},
        {id:'attack', label:'Atk', icon:'💥'},
      ].map(t=>(
        <button key={t.id} onClick={()=>onChange(t.id)}
          className={`px-2 py-0.5 rounded-lg text-[8px] font-black transition-all flex items-center gap-0.5 ${
            tactic===t.id
              ? t.id==='defend'?'bg-blue-500/25 border border-blue-400/50 text-blue-300'
                :t.id==='attack'?'bg-red-500/25 border border-red-400/50 text-red-300'
                :'bg-orange-500/25 border border-orange-400/50 text-orange-300'
              :'bg-white/5 border border-white/10 text-gray-500 hover:text-gray-300'
          }`}>
          {t.icon} {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Bowler card ───────────────────────────────────────────────────────────────
function BowlerCard({ bowler, isBowling, tactic, onTactic, isMyTeam }) {
  const econ = bowler.balls>0?(bowler.runs/bowler.balls*6).toFixed(1):'-';
  return (
    <div className={`rounded-xl border p-3 transition-all ${isBowling?'border-sky-500/40 bg-sky-500/5':'border-white/8 bg-white/[0.02]'}`}>
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full shrink-0 ${isBowling?'bg-sky-400':'bg-gray-600'}`}/>
        <span className="text-[11px] font-black text-white flex-1 truncate">{bowler.name}</span>
        <div className="text-right shrink-0">
          <span className="text-[11px] font-black text-sky-400">{bowler.wickets}/{bowler.runs}</span>
          <span className="text-[8px] text-gray-500"> · {oversText(bowler.balls)} ov</span>
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[8px] text-gray-600">Econ {econ}</span>
        {isMyTeam&&<TacticButtons tactic={tactic} onChange={onTactic}/>}
      </div>
    </div>
  );
}

// ── Mode selector (over/ball/innings) ─────────────────────────────────────────
function ModeSelector({ mode, onChange }) {
  return (
    <div className="flex gap-1 bg-white/5 rounded-xl p-1">
      {[
        {id:'ball', label:'Ball by Ball'},
        {id:'over', label:'Full Over'},
        {id:'innings', label:'Skip Innings'},
      ].map(m=>(
        <button key={m.id} onClick={()=>onChange(m.id)}
          className={`flex-1 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-wide transition-all ${mode===m.id?'bg-orange-500 text-white':'text-gray-500 hover:text-gray-300'}`}>
          {m.label}
        </button>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MatchArena({ teamA, teamB, seed, onClose, myTeamId = teamA?.teamId, initialPlans, playoffRank = null, onComplete }) {
  const hexA = hex(teamA?.teamId), hexB = hex(teamB?.teamId);
  const setup = useMemo(()=>teamA&&teamB?matchSetup(seed||`${teamA.teamId}-${teamB.teamId}`,teamA.teamId,teamB.teamId):null,[teamA,teamB,seed]);

  const [plans, setPlans] = useState(() => initialPlans || Object.fromEntries([teamA,teamB].map(t => [t.teamId, {playingXI:(t.playingXI || t.players).map(p => typeof p === 'string' ? p : p.id), tactic:'balanced'}])));
  const [tactics, setTactics] = useState({});
  const [teamTactic, setTeamTactic] = useState(() => plans[myTeamId]?.tactic || 'balanced');
  const getTactic = id => tactics[id] || teamTactic;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const saveRef = useRef(false);

  // ── Phase state ─────────────────────────────────────────────────────────
  const [phase_, setPhase] = useState('toss'); // toss|live|break|result
  const [inningsIdx, setInningsIdx] = useState(0);
  const [mode, setMode] = useState('over'); // ball|over|innings
  const [activeTab, setActiveTab] = useState('field'); // field|batting|bowling|history
  const [muted, setMuted] = useState(false);

  // Both arena playback and season persistence use this exact deterministic engine.
  const {match, simErr} = useMemo(() => {
    try {
      const hydrate = t => {
        const pool = new Map(t.players.map(p => [p.id,p]));
        const ids = plans[t.teamId]?.playingXI || t.playingXI || t.players.map(p => p.id);
        const players = ids.map(p => pool.get(typeof p === 'string' ? p : p.id));
        if (players.some(p => !p)) throw new Error(`${t.teamId}: selected player is outside the squad.`);
        return {...t, players};
      };
      return {match:simulateT20Match(hydrate(teamA),hydrate(teamB),{seed,plans,playoffRank}),simErr:''};
    } catch(e) { return {match:null,simErr:e.message}; }
  }, [teamA,teamB,seed,plans,playoffRank]);

  // ── Playback cursor ─────────────────────────────────────────────────────
  const [step, setStep] = useState(0); // how many events revealed in current innings
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(800); // ms per ball
  const playRef = useRef(null);
  useEffect(() => () => clearTimeout(playRef.current), []);

  const currentInn = match?.innings?.[inningsIdx];
  const allEvents = currentInn?.events || [];
  const visibleEvents = allEvents.slice(0, step);
  const scorecard = useMemo(() => inningsAtEvent(currentInn, step), [currentInn, step]);
  const lastBall = visibleEvents.at(-1) || null;
  const currentBalls = scorecard?.balls || 0;
  const currentRuns = scorecard?.runs || 0;
  const currentWickets = scorecard?.wickets || 0;
  const target = inningsIdx===1 ? (match?.innings?.[0]?.runs||0)+1 : null;
  const inningsComplete = step >= allEvents.length && allEvents.length > 0;
  const commText = getComm(lastBall);

  // ── Current over ────────────────────────────────────────────────────────
  const currentOverNo = Math.floor(currentBalls / 6);
  const currentOverEvents = useMemo(()=>{
    let legal=0; const ov=[];
    for(const ev of visibleEvents){
      if(Math.floor(legal/6)===currentOverNo){ov.push(ev);}
      if(ev.legal)legal++;
      if(legal>0&&Math.floor(legal/6)>currentOverNo)break;
    }
    return ov;
  },[visibleEvents, currentOverNo]);

  const completedOvers = useMemo(()=>{
    const overs=[];
    for(let o=0;o<currentOverNo;o++){
      let legal=0; const ov=[];
      for(const ev of allEvents.slice(0,step)){
        const thisOv=Math.floor(legal/6);
        if(thisOv===o)ov.push(ev);
        if(ev.legal)legal++;
        if(legal>0&&Math.floor(legal/6)>o)break;
      }
      if(ov.length)overs.push({no:o,events:ov});
    }
    return overs;
  },[allEvents,step,currentOverNo]);

  // Current batters/bowlers from visible events
  const batting = scorecard?.batting || [];
  const bowling = scorecard?.bowling || [];
  const strikerId = scorecard?.strikerId;
  const nonStrikerId = scorecard?.nonStrikerId;
  const bowlerId = scorecard?.bowlerId;
  const activeBatters = batting.filter(b=>b.didBat&&!b.dismissal);
  const activeBowlers = bowling;
  const currentBowler = bowling.find(b=>b.id===bowlerId);
  const battingId = currentInn?.battingTeamId;
  const bowlingId = currentInn?.bowlingTeamId;
  const isMyBatting = battingId === myTeamId;

  // ── Auto-play (ball by ball mode) ───────────────────────────────────────
  useEffect(()=>{
    if(phase_!=='live'||mode!=='ball'||!isPlaying) return;
    if(inningsComplete){
      setIsPlaying(false);
      playRef.current = setTimeout(()=>{
        if(inningsIdx===0){setPhase('break');}else{setPhase('result');}
      },600);
      return;
    }
    const timer = setTimeout(()=>setStep(s=>s+1),speed);
    playRef.current = timer;
    return ()=>clearTimeout(timer);
  },[phase_,mode,isPlaying,step,inningsComplete,inningsIdx,speed]);

  // ── Over mode: wait at over boundary ────────────────────────────────────
  const [waitingOverChoice, setWaitingOverChoice] = useState(false);
  const canSetTactic = phase_ === 'live' && !inningsComplete && (mode === 'over' ? waitingOverChoice : mode === 'ball' && !isPlaying);
  const recordTactic = (tactic, players) => {
    if (!canSetTactic) return;
    setTeamTactic(tactic); setTactics(players);
    setPlans(prev => {
      const mine = prev[myTeamId];
      if (!mine) return prev;
      const timeline = mine.tacticTimeline || {};
      const before = Object.fromEntries(Object.entries(timeline[inningsIdx] || {}).filter(([n]) => Number(n) < step));
      return {...prev, [myTeamId]:{...mine, tacticTimeline:{...timeline, [inningsIdx]:{...before, [step]:{tactic,players}}}}};
    });
  };
  const setTactic = (id,t) => recordTactic(teamTactic, {...tactics,[id]:t});
  const finishMatch = async () => {
    if (saveRef.current) return;
    if (!onComplete) { onClose(); return; }
    saveRef.current = true; setSaving(true); setSaveError('');
    try {
      if (!await onComplete(match)) setSaveError('Could not save this round. Check team readiness or connection, then retry.');
    } catch(e) { setSaveError(e.message); }
    finally { saveRef.current = false; setSaving(false); }
  };

  const startNextOver = useCallback(()=>{
    clearTimeout(playRef.current);
    setWaitingOverChoice(false);
    // simulate entire over from current step
    const overStart = step;
    const overBalls = allEvents.slice(overStart);
    const remaining = 6 - (currentBalls % 6);
    let legalCount=0; let end=overStart;
    for(let i=0;i<overBalls.length;i++){
      end=overStart+i+1;
      if(overBalls[i].legal){legalCount++;if(legalCount>=remaining)break;}
    }
    // reveal up to end step by step at 120ms each
    let cur=overStart+1;
    const tick=()=>{
      setStep(cur);
      if(cur<end){cur++;playRef.current = setTimeout(tick,120);}
      else{
        // check innings end
        if(end>=allEvents.length){
          playRef.current = setTimeout(()=>{
            if(inningsIdx===0)setPhase('break');else setPhase('result');
          },600);
        }else{setWaitingOverChoice(true);}
      }
    };
    tick();
  },[step,allEvents,inningsIdx,currentBalls]);

  // Start innings on phase change
  const startInnings = useCallback((nextIdx)=>{
    clearTimeout(playRef.current);
    setTactics({}); setTeamTactic(plans[myTeamId]?.tactic || 'balanced');
    setInningsIdx(nextIdx); setStep(0); setIsPlaying(false); setWaitingOverChoice(false);
    playRef.current = setTimeout(()=>{
      if(mode==='over') setWaitingOverChoice(true);
      else if(mode==='ball') setIsPlaying(true);
      else {
        // innings mode: skip to end
        setStep(match.innings[nextIdx]?.events?.length||0);
        playRef.current = setTimeout(()=>{
          if(nextIdx===0)setPhase('break');else setPhase('result');
        },400);
      }
    },100);
  },[mode,match,plans,myTeamId]);

  const handleTossDone = useCallback((decision)=>{
    if (setup.tossWinner === myTeamId && decision) setPlans(prev => ({...prev,[myTeamId]:{...prev[myTeamId],tossDecision:decision}}));
    setMode('over'); setPhase('live'); setStep(0);
    playRef.current = setTimeout(() => setWaitingOverChoice(true), 200);
  },[setup,myTeamId]);

  const handleBreakContinue = useCallback(()=>{
    setPhase('live');
    startInnings(1);
  },[startInnings]);

  const handleReplay = ()=>{
    clearTimeout(playRef.current);
    setPhase('toss'); setInningsIdx(0); setStep(0);
    setIsPlaying(false); setWaitingOverChoice(false); setTactics({}); setTeamTactic('balanced');
    setPlans(prev => Object.fromEntries(Object.entries(prev).map(([id,p]) => { const {tossDecision,tacticTimeline,...base}=p; return [id,base]; })));
    setSaveError('');
  };

  // skip innings
  const handleSkipInnings = ()=>{
    clearTimeout(playRef.current); setIsPlaying(false); setWaitingOverChoice(false);
    setStep(allEvents.length);
    playRef.current = setTimeout(()=>{
      if(inningsIdx===0)setPhase('break');else setPhase('result');
    },300);
  };

  // ── Loading / error ─────────────────────────────────────────────────────
  if(simErr) return (
    <div className="fixed inset-0 z-50 bg-[#070c12] flex flex-col items-center justify-center p-6 text-center">
      <AlertCircle size={32} className="text-red-400 mb-4"/>
      <p className="text-red-400 font-bold mb-6 text-sm">{simErr}</p>
      <button onClick={onClose} className="px-8 py-3 bg-white/10 rounded-xl text-white font-black">Close</button>
    </div>
  );
  if(!match||!setup) return (
    <div className="fixed inset-0 z-50 bg-[#070c12] flex items-center justify-center">
      <Loader2 size={28} className="text-orange-400 animate-spin"/>
    </div>
  );

  const TABS = [
    {id:'field', label:'Field'},
    {id:'batting', label:'Batting'},
    {id:'bowling', label:'Bowling'},
    {id:'history', label:'Overs'},
  ];

  return (
    <div className="fixed inset-0 z-50 bg-[#070c12] flex flex-col overflow-hidden"
      style={{touchAction:'pan-y'}}>

      {/* ── TOSS ── */}
      {phase_==='toss'&&(
        <TossScreen setup={setup} teamA={teamA} teamB={teamB} myTeamId={myTeamId} onDone={handleTossDone} onClose={onClose}/>
      )}

      {/* ── INNINGS BREAK ── */}
      {phase_==='break'&&(
        <InningsBreak inn1={match.innings[0]} myTeamId={myTeamId} onContinue={handleBreakContinue}/>
      )}

      {/* ── RESULT ── */}
      {phase_==='result'&&(
        <ResultScreen result={match} myTeamId={myTeamId} onReplay={handleReplay} onClose={finishMatch} onCancel={onClose} saving={saving} saveError={saveError}/>
      )}

      {/* ── LIVE ── */}
      {phase_==='live'&&(
        <>
          {/* Top bar */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 shrink-0" style={{background:'#09121a'}}>
            <button aria-label="Close match" onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center active:scale-95">
              <X size={14} className="text-gray-400"/>
            </button>
            <div className="flex items-center gap-2">
              <Motion.div animate={{opacity:[1,.3,1]}} transition={{repeat:Infinity,duration:1.5}}
                className="w-1.5 h-1.5 rounded-full bg-red-500"/>
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                {inningsIdx===0?'1st':'2nd'} Innings · T20
              </span>
            </div>
            <button onClick={()=>setMuted(v=>!v)}
              className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
              {muted?<VolumeX size={13} className="text-gray-500"/>:<Volume2 size={13} className="text-orange-400"/>}
            </button>
          </div>

          {/* Score bar */}
          {battingId&&bowlingId&&(
            <ScoreBar battingId={battingId} bowlingId={bowlingId}
              runs={currentRuns} wickets={currentWickets} balls={currentBalls} target={target} inningsIdx={inningsIdx}/>
          )}

          {/* Current over chips */}
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/5 shrink-0" style={{background:'#09121a'}}>
            <span className="text-[8px] font-black text-gray-600 shrink-0 w-7">Ov {currentOverNo+1}</span>
            <div className="flex gap-1 flex-1">
              {Array.from({length:6}).map((_,i)=>{
                const legalBalls = currentOverEvents.filter(e=>e.legal);
                return <BallChip key={i} ev={legalBalls[i]||null} small/>;
              })}
            </div>
            <span className="text-[8px] text-gray-600 shrink-0">{phaseLabel(currentBalls).split(' ')[0]}</span>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-white/5 shrink-0" style={{background:'#09121a'}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setActiveTab(t.id)}
                className={`flex-1 py-2 text-[9px] font-black uppercase tracking-wide transition-all ${activeTab===t.id?'text-orange-400 border-b-2 border-orange-500':'text-gray-600 hover:text-gray-400'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content — scrollable */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <AnimatePresence mode="wait">

              {/* FIELD TAB */}
              {activeTab==='field'&&(
                <Motion.div key="field" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="p-3 space-y-3">
                  <Field2D lastBall={lastBall} recentEvents={visibleEvents} hexA={hexA} hexB={hexB}/>
                  {!muted&&lastBall&&(
                    <Motion.p key={commText} initial={{opacity:0,y:4}} animate={{opacity:1,y:0}}
                      className={`text-center text-[11px] font-bold px-4 leading-snug ${lastBall.wicket?'text-red-400':lastBall.batRuns>=4?'text-orange-300':'text-gray-400'}`}>
                      {commText}
                    </Motion.p>
                  )}
                  {/* mode selector */}
                  <ModeSelector mode={mode} onChange={m=>{
                    clearTimeout(playRef.current);
                    setMode(m);
                    setIsPlaying(false);
                    setWaitingOverChoice(m === 'over');
                    if (m === 'innings') handleSkipInnings();
                  }}/>
                </Motion.div>
              )}

              {/* BATTING TAB */}
              {activeTab==='batting'&&(
                <Motion.div key="bat" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="p-3 space-y-2">
                  <p className="text-[8px] font-black text-gray-600 uppercase tracking-widest mb-1">{battingId} Batting</p>
                  {activeBatters.slice(0,2).map(b=>(
                    <BatsmanCard key={b.id} batter={b}
                      isStriker={b.id===strikerId}
                      tactic={getTactic(b.id)}
                      onTactic={t=>setTactic(b.id,t)}
                      bowlerName={b.id===strikerId?currentBowler?.name:null}
                      isMyTeam={battingId===myTeamId && canSetTactic}/>
                  ))}
                  {/* upcoming batters */}
                  {batting.filter(b=>!b.didBat).map(b=>(
                    <div key={b.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.02] border border-white/5">
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-700"/>
                      <span className="text-[10px] text-gray-500 flex-1 truncate">{b.name}</span>
                      <span className="text-[8px] text-gray-700">Yet to bat</span>
                    </div>
                  ))}
                  {/* dismissed */}
                  {batting.filter(b=>b.dismissal).map(b=>(
                    <div key={b.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl opacity-50">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-800"/>
                      <span className="text-[10px] text-gray-600 flex-1 truncate line-through">{b.name}</span>
                      <span className="text-[9px] font-black text-gray-600">{b.runs}({b.balls})</span>
                    </div>
                  ))}
                </Motion.div>
              )}

              {/* BOWLING TAB */}
              {activeTab==='bowling'&&(
                <Motion.div key="bowl" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="p-3 space-y-2">
                  <p className="text-[8px] font-black text-gray-600 uppercase tracking-widest mb-1">{bowlingId} Bowling</p>
                  {activeBowlers.map(b=>(
                    <BowlerCard key={b.id} bowler={b}
                      isBowling={b.id===bowlerId}
                      tactic={getTactic(b.id)}
                      onTactic={t=>setTactic(b.id,t)}
                      isMyTeam={bowlingId===myTeamId && canSetTactic}/>
                  ))}
                </Motion.div>
              )}

              {/* OVERS HISTORY TAB */}
              {activeTab==='history'&&(
                <Motion.div key="hist" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
                  {completedOvers.length===0?(
                    <div className="p-6 text-center text-gray-600 text-xs">No completed overs yet</div>
                  ):([...completedOvers].reverse().map(o=>(
                    <OverSummary key={o.no} overNo={o.no} overEvents={o.events}/>
                  )))}
                </Motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── BOTTOM CONTROL ZONE ── */}
          <div className="shrink-0 border-t border-white/5" style={{background:'#09121a',paddingBottom:`max(12px,env(safe-area-inset-bottom,12px))`}}>

            {/* Over mode — tactics + confirm */}
            {mode==='over'&&waitingOverChoice&&(
              <Motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Over {currentOverNo+1} Tactics</p>
                  <span className="text-[8px] text-gray-600">{phaseLabel(currentBalls)}</span>
                </div>
                <p className="text-[9px] text-gray-600">
                  {isMyBatting ? `Set your batsmen's approach for this over` : `Set your bowler's plan`}
                </p>
                {/* Quick overall tactic */}
                <div className="grid grid-cols-3 gap-2">
                  {[{id:'defend',label:'Defend',icon:'🛡️',desc:isMyBatting?'Protect wickets':'Contain runs'},{id:'balanced',label:'Normal',icon:'⚡',desc:'Steady cricket'},{id:'attack',label:'Attack',icon:'💥',desc:isMyBatting?'Go for runs':'Attack wickets'}].map(t=>(
                    <button key={t.id} onClick={()=>{
                      recordTactic(t.id, {});
                    }}
                      className={`rounded-xl border p-2.5 text-center transition-all active:scale-95 ${
                        teamTactic === t.id
                          ?t.id==='defend'?'border-blue-400/50 bg-blue-500/15 text-blue-300'
                            :t.id==='attack'?'border-red-400/50 bg-red-500/15 text-red-300'
                            :'border-orange-400/50 bg-orange-500/15 text-orange-300'
                          :'border-white/8 bg-white/[0.03] text-gray-400'
                      }`}>
                      <div className="text-lg mb-0.5">{t.icon}</div>
                      <div className="text-[9px] font-black uppercase">{t.label}</div>
                      <div className="text-[7px] text-current opacity-60">{t.desc}</div>
                    </button>
                  ))}
                </div>
                <button onClick={startNextOver}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-black text-sm uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2">
                  <Play size={14}/> Bowl Over {currentOverNo+1}
                </button>
              </Motion.div>
            )}

            {/* Over mode — simulating (show skip) */}
            {mode==='over'&&!waitingOverChoice&&(
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-[9px] text-gray-600">Simulating over…</span>
                <button onClick={handleSkipInnings}
                  className="flex items-center gap-1 px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black text-gray-400 active:scale-95 transition-all">
                  <SkipForward size={11}/> Skip Innings
                </button>
              </div>
            )}

            {/* Ball-by-ball mode controls */}
            {mode==='ball'&&(
              <div className="px-4 py-3 space-y-2">
                {/* progress bar */}
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-black text-gray-700 tabular-nums w-7">{oversText(currentBalls)}</span>
                  <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                    <Motion.div className="h-full bg-orange-500 rounded-full"
                      style={{width:`${(currentBalls/120)*100}%`}}/>
                  </div>
                  <span className="text-[8px] font-black text-gray-700 w-7 text-right">20.0</span>
                </div>
                {/* buttons */}
                <div className="flex items-center justify-center gap-4">
                  <button onClick={()=>{clearTimeout(playRef.current);setIsPlaying(false);setStep(s=>Math.max(0,s-1));}}
                    className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center active:scale-95">
                    <RotateCcw size={13} className="text-gray-400"/>
                  </button>
                  <button onClick={()=>{
                    if(inningsComplete){
                      if(inningsIdx===0)setPhase('break');else setPhase('result');
                    }else setIsPlaying(v=>!v);
                  }}
                    className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/25 active:scale-95 transition-all">
                    {isPlaying?<Pause size={20} className="text-white"/>:<Play size={20} className="text-white ml-0.5"/>}
                  </button>
                  <button onClick={()=>{
                    clearTimeout(playRef.current);setIsPlaying(false);
                    setStep(s=>Math.min(s+1,allEvents.length));
                  }}
                    className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center active:scale-95">
                    <ChevronRight size={16} className="text-gray-300"/>
                  </button>
                </div>
                {/* speed */}
                <div className="flex justify-center gap-1.5">
                  {[{l:'1×',ms:1000},{l:'2×',ms:500},{l:'4×',ms:180},{l:'⚡',ms:60}].map(s=>(
                    <button key={s.l} onClick={()=>setSpeed(s.ms)}
                      className={`px-2.5 py-0.5 rounded-lg text-[8px] font-black transition-all ${speed===s.ms?'bg-orange-500/20 border border-orange-500/40 text-orange-300':'bg-white/5 border border-white/10 text-gray-500'}`}>
                      {s.l}
                    </button>
                  ))}
                  <button onClick={handleSkipInnings}
                    className="px-2.5 py-0.5 rounded-lg text-[8px] font-black bg-white/5 border border-white/10 text-gray-500 flex items-center gap-0.5">
                    <SkipForward size={9}/> Skip
                  </button>
                </div>
              </div>
            )}

            {/* Innings skip mode */}
            {mode==='innings'&&(
              <div className="px-4 py-3 text-center">
                <p className="text-[9px] text-gray-600">Innings simulated instantly.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
