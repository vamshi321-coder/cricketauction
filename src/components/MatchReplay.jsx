import React, { useEffect, useState } from 'react';
import { TEAMS } from '../data/teams';
import { oversText } from '../lib/t20Engine.js';

export default function MatchReplay({ result, onClose }) {
  const innings = [...result.innings.map((value, i) => ({ value, label: `Innings ${i + 1} · ${value.battingTeamId}` })), ...(result.superOvers || []).flatMap(s => s.innings.map(value => ({ value, label: `Super Over ${s.round} · ${value.battingTeamId}` })))];
  const [selected, setSelected] = useState(0);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(500);
  const current = innings[selected].value;
  const events = current.events;
  const finished = step >= events.length;
  useEffect(() => {
    if (!playing || finished) return;
    const timer = setTimeout(() => setStep(n => n + 1), speed);
    return () => clearTimeout(timer);
  }, [playing, finished, step, speed, selected]);
  const event = events[step - 1];
  const bats = Object.fromEntries(current.batting.map(p => [p.id, p.name]));
  const bowlers = Object.fromEntries(current.bowling.map(p => [p.id, p.name]));
  const runs = event?.runsTotal || 0, wickets = event?.wicketsTotal || 0, balls = event?.ball || 0;
  const outcome = e => e.wicket ? `W · ${e.wicket.kind}` : e.extraType ? `${e.batRuns + e.extras} · ${e.extraType === 'noBalls' ? 'NB' : e.extraType === 'wides' ? 'WD' : e.extraType === 'legByes' ? 'LB' : 'B'}` : `${e.batRuns}`;
  const color = id => TEAMS.find(t => t.id === id)?.color || 'bg-neutral-600';
  const cell = 'py-2 px-3';
  return <section className="rounded-2xl border border-orange-500/30 bg-[#101010] overflow-hidden" aria-label="Match scorecard and replay">
    <header className="p-5 flex justify-between items-start gap-3"><div><p className="text-xs text-orange-400 uppercase tracking-widest">Match replay</p><h3 className="text-xl font-black mt-1">{result.teamA} vs {result.teamB}</h3><p className="text-sm text-orange-200 mt-2">{result.summary}</p><p className="text-xs text-gray-400 mt-2">{result.toss.winner} chose to {result.toss.decision} · {result.conditions.pitch} pitch · {result.conditions.weather}</p></div><button aria-label="Close replay" onClick={onClose} className="rounded-lg bg-white/5 p-2 text-sm">Close</button></header>
    <div className="px-5 pb-4 flex flex-wrap gap-2">{innings.map((inn,i) => <button key={inn.label} aria-pressed={selected === i} onClick={() => { setSelected(i); setStep(0); setPlaying(false); }} className={`rounded-lg border px-3 py-2 text-xs ${selected === i ? 'border-orange-500 text-orange-300' : 'border-white/10 text-gray-400'}`}>{inn.label}</button>)}</div>
    <div className="relative px-5 py-7 overflow-hidden">
      <div aria-hidden="true" className="absolute inset-0 flex opacity-15"><div className={`w-1/2 ${color(current.battingTeamId)}`} /><div className={`w-1/2 ${color(current.bowlingTeamId)}`} /></div>
      <div className="relative text-center"><p className="text-xs font-bold uppercase tracking-widest text-gray-300">{current.battingTeamId} batting · {current.bowlingTeamId} bowling</p><p className="text-4xl sm:text-5xl font-black my-3 tabular-nums">{runs}<span className="text-gray-400">/{wickets}</span></p><p className="text-sm text-gray-300">{oversText(balls)} overs{selected === 1 ? ` · Target ${result.innings[0].runs + 1}` : ''}</p>
      <svg viewBox="0 0 440 180" className="max-w-md w-full mx-auto mt-4" role="img" aria-label="Illustrated cricket field showing the current replay delivery">
        <ellipse cx="220" cy="90" rx="205" ry="82" fill="#163728" stroke="#47744e" strokeWidth="2"/><ellipse cx="220" cy="90" rx="130" ry="58" fill="none" stroke="#88a98a" strokeDasharray="4 6" opacity=".4"/>
        <rect x="201" y="48" width="38" height="84" rx="3" fill="#b69b70"/>{[60,120].map(y => <path key={y} d={`M194 ${y}h52`} stroke="#fff" opacity=".7"/>)}
        <circle cx="215" cy="116" r="7" fill="#fb923c"/><circle cx="225" cy="49" r="7" fill="#7dd3fc"/>
        {event && <circle key={`${selected}-${step}`} cx={event.batRuns >= 4 ? 365 : event.batRuns ? 280 : 219} cy={event.batRuns >= 4 ? 55 : 98} r="4" fill="#fff"><animate attributeName="opacity" from=".2" to="1" dur="0.3s" /></circle>}
      </svg>
      <p className="text-sm font-bold min-h-6">{event ? `${event.label} · ${outcome(event)}${event.freeHit ? ' · Free hit' : ''}` : 'Ready for the first delivery'}</p>
      <p className="text-xs text-gray-400 mt-1 min-h-5">{event ? `${bowlers[event.bowlerId]} to ${bats[event.batterId]}` : 'Press Play to begin'}</p>
      <div className="flex gap-2 justify-center mt-4 flex-wrap">{events.slice(Math.max(0,step-6),step).map((e,i) => <span key={i} className={`rounded-full min-w-9 px-2 py-2 text-xs border ${e.wicket ? 'bg-red-500/20 border-red-500 text-red-200' : e.batRuns >= 4 ? 'bg-orange-500/20 border-orange-500 text-orange-200' : 'border-white/15 text-gray-300'}`}>{outcome(e)}</span>)}</div>
      </div>
    </div>
    <div className="p-5 space-y-4">
      <div className="flex gap-3 flex-wrap items-center"><button className="bg-orange-600 rounded-lg px-4 py-2 font-bold text-sm" onClick={() => { if (finished) setStep(0); setPlaying(finished || !playing); }}>{finished ? 'Replay again' : playing ? 'Pause' : 'Play'}</button><button className="border border-white/15 rounded-lg px-3 py-2 text-sm" disabled={finished} onClick={() => { setPlaying(false); setStep(n => Math.min(n+1,events.length)); }}>Next ball</button><button className="border border-white/15 rounded-lg px-3 py-2 text-sm" onClick={() => { setPlaying(false); setStep(events.length); }}>Skip to end</button><label className="text-xs text-gray-400">Speed <select aria-label="Replay speed" className="bg-neutral-900 p-2 rounded-lg text-white" value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={1000}>1×</option><option value={500}>2×</option><option value={150}>Fast</option></select></label></div>
      <p className="text-xs text-gray-500">Deterministic replay of a completed match. Playback does not change the result.</p>
      <details><summary className="text-sm font-bold cursor-pointer">Full innings scorecard · {current.runs}/{current.wickets} ({current.overs})</summary><div className="overflow-x-auto mt-4"><table className="w-full text-xs text-right whitespace-nowrap"><caption className="sr-only">Batting scorecard</caption><thead className="text-gray-500"><tr>{['Batter','R','B','4s','6s','SR'].map(h=><th key={h} className={cell}>{h}</th>)}</tr></thead><tbody>{current.batting.map(p => <tr key={p.id} className="border-t border-white/5"><th scope="row" className={`${cell} text-left font-normal`}>{p.name}<span className="block text-[10px] text-gray-500">{p.dismissal?.kind || (p.didBat ? 'not out' : 'did not bat')}</span></th>{[p.runs,p.balls,p.fours,p.sixes,p.balls ? (100*p.runs/p.balls).toFixed(1) : '—'].map((v,i)=><td key={i} className={cell}>{v}</td>)}</tr>)}</tbody></table></div><p className="text-xs text-gray-400 my-4">Extras: {Object.values(current.extras).reduce((a,b)=>a+b,0)} (WD {current.extras.wides}, NB {current.extras.noBalls}, B {current.extras.byes}, LB {current.extras.legByes})</p><div className="overflow-x-auto"><table className="w-full text-xs text-right whitespace-nowrap"><caption className="sr-only">Bowling scorecard</caption><thead className="text-gray-500"><tr>{['Bowler','O','R','W','Econ'].map(h=><th key={h} className={cell}>{h}</th>)}</tr></thead><tbody>{current.bowling.filter(p=>p.balls || p.runs).map(p=><tr key={p.id} className="border-t border-white/5"><th scope="row" className={`${cell} text-left font-normal`}>{p.name}</th>{[oversText(p.balls),p.runs,p.wickets,p.balls ? (6*p.runs/p.balls).toFixed(2) : '—'].map((v,i)=><td key={i} className={cell}>{v}</td>)}</tr>)}</tbody></table></div></details>
      <details><summary className="text-sm font-bold cursor-pointer">Delivery log ({step}/{events.length})</summary><ol className="mt-3 space-y-2 max-h-64 overflow-y-auto text-xs text-gray-400">{events.slice(0,step).map((e,i)=><li key={i}>{e.label} · {bowlers[e.bowlerId]} to {bats[e.batterId]} · {outcome(e)} · {e.runsTotal}/{e.wicketsTotal}</li>)}</ol></details>
    </div>
  </section>;
}
