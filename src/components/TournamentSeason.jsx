import React, { useEffect, useMemo, useState } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { onValue, ref, runTransaction } from 'firebase/database';
import { rtdb, getServerTime } from '../lib/firebase';
import MatchArena from './MatchArena.jsx';
import {
  createTournament, prepareTeam, advanceRound,
  currentFixtures, missingPreparations, roundKey,
  standingsFor, replayFixture, assertSeason, fixturePlans
} from '../lib/tournamentSeason.js';
import { matchSetup, oversText } from '../lib/t20Engine.js';
import { TEAMS } from '../data/teams.js';
import {
  Trophy, Play, Pause, ChevronRight, Swords, Shield, Star,
  Clock, CheckCircle2, Lock, TrendingUp, Users,
  Target, Zap, BarChart3, RefreshCw, Eye, Crown,
  ArrowRight, AlertCircle, Loader2
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────────────
const TEAM_HEX = {
  MI:'#005BA2',CSK:'#F9CD02',RCB:'#CC2121',KKR:'#3A225D',
  DC:'#2561AE',PBKS:'#ED1B24',RR:'#EA1A85',SRH:'#F7A721',
  GT:'#1B4068',LSG:'#A72B4B',
};
const hex = id => TEAM_HEX[id] || '#555';
const teamLogo = id => TEAMS.find(t => t.id === id)?.logo || null;

const STAGE_LABELS = {
  qualifiers:'Qualifier 1 & Eliminator', qualifier1:'Qualifier 1',
  eliminator:'Eliminator', qualifier2:'Qualifier 2',
  final:'Final', completed:'Season Complete'
};
const roundTitle = s =>
  s.stage === 'league' ? `Matchday ${s.currentMatchday}` : STAGE_LABELS[s.stage] || s.stage;



// ── Small helpers ────────────────────────────────────────────────────────────
function TeamLogoSmall({ id, size = 28 }) {
  const logo = teamLogo(id);
  return (
    <div
      className="rounded-lg bg-white/5 border border-white/5 flex items-center justify-center overflow-hidden shrink-0"
      style={{ width: size, height: size, padding: 3 }}
    >
      {logo
        ? <img src={logo} alt={id} className="w-full h-full object-contain" />
        : <Shield size={size * 0.5} className="text-gray-600" />}
    </div>
  );
}

function Pill({ children, color = 'gray' }) {
  const cls = {
    orange: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
    green:  'bg-green-500/10 border-green-500/20 text-green-400',
    blue:   'bg-blue-500/10 border-blue-500/20 text-blue-400',
    amber:  'bg-amber-500/10 border-amber-500/20 text-amber-400',
    gray:   'bg-white/5 border-white/10 text-gray-400',
    red:    'bg-red-500/10 border-red-500/20 text-red-400',
  }[color];
  return (
    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${cls}`}>
      {children}
    </span>
  );
}

// ── Match vs card ─────────────────────────────────────────────────────────────
function MatchVsCard({ teamA, teamB, label, isMyMatch, result, onReplay }) {
  const hexA = hex(teamA), hexB = hex(teamB);
  const won = result?.winner;

  return (
    <Motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border overflow-hidden ${
        isMyMatch
          ? 'border-orange-500/30'
          : result ? 'border-white/8' : 'border-white/5'
      }`}
    >
      {/* gradient header */}
      <div
        className="h-0.5"
        style={{ background: `linear-gradient(90deg, ${hexA}, ${hexB})` }}
      />
      <div
        className="p-4"
        style={{
          background: `linear-gradient(135deg, ${hexA}14 0%, #0a0a0a 45%, #0a0a0a 55%, ${hexB}14 100%)`,
        }}
      >
        {label && (
          <p className="text-[8px] font-black text-orange-400 uppercase tracking-widest mb-3">
            {label}
          </p>
        )}

        <div className="flex items-center gap-3">
          {/* Team A */}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <TeamLogoSmall id={teamA} size={32} />
            <div className="min-w-0">
              <p className={`text-xs font-black uppercase ${won === teamA ? 'text-white' : result ? 'text-gray-400' : 'text-white'}`}>
                {teamA}
              </p>
              {result && (
                <p className="text-[9px] text-gray-500">
                  {result.innings.find(i => i.battingTeamId === teamA)
                    ? (() => { const i = result.innings.find(x => x.battingTeamId === teamA); return `${i.runs}/${i.wickets} (${i.overs})`; })()
                    : '—'}
                </p>
              )}
            </div>
          </div>

          {/* Centre */}
          <div className="flex flex-col items-center gap-0.5 shrink-0">
            {result ? (
              <div className="px-2 py-1 rounded-lg bg-white/5 border border-white/5 text-center">
                <p className="text-[8px] font-black text-orange-400 uppercase">Result</p>
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/5 border border-white/5 flex items-center justify-center">
                <span className="text-[9px] font-black text-gray-500">VS</span>
              </div>
            )}
          </div>

          {/* Team B */}
          <div className="flex-1 flex items-center gap-2 min-w-0 flex-row-reverse text-right">
            <TeamLogoSmall id={teamB} size={32} />
            <div className="min-w-0">
              <p className={`text-xs font-black uppercase ${won === teamB ? 'text-white' : result ? 'text-gray-400' : 'text-white'}`}>
                {teamB}
              </p>
              {result && (
                <p className="text-[9px] text-gray-500">
                  {result.innings.find(i => i.battingTeamId === teamB)
                    ? (() => { const i = result.innings.find(x => x.battingTeamId === teamB); return `${i.runs}/${i.wickets} (${i.overs})`; })()
                    : '—'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Result summary */}
        {result && (
          <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between gap-2">
            <p className="text-[10px] text-orange-300 font-bold flex-1">{result.summary}</p>
            {onReplay && (
              <button
                onClick={onReplay}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[9px] font-black text-gray-300 hover:text-white hover:border-white/20 transition-all uppercase tracking-wide"
              >
                <Eye size={9} /> Scorecard
              </button>
            )}
          </div>
        )}

        {!result && isMyMatch && (
          <div className="mt-3 pt-3 border-t border-white/5">
            <Pill color="orange">Your Match</Pill>
          </div>
        )}
        {!result && !isMyMatch && (
          <div className="mt-3 pt-3 border-t border-white/5">
            <Pill color="blue">AI Simulation</Pill>
          </div>
        )}
      </div>
    </Motion.div>
  );
}

// ── Scorecard modal ───────────────────────────────────────────────────────────
function ScorecardModal({ result, onClose }) {
  const [tab, setTab] = useState(0);
  if (!result) return null;
  const innings = [
    ...result.innings.map((v, i) => ({ v, label: `${v.battingTeamId} Innings` })),
    ...(result.superOvers || []).flatMap(s =>
      s.innings.map(v => ({ v, label: `Super Over ${s.round} · ${v.battingTeamId}` }))
    ),
  ];
  const inn = innings[tab]?.v;

  return (
    <Motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <Motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="relative z-10 w-full sm:max-w-lg bg-[#0d0d0d] border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <div>
            <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest">Scorecard</p>
            <h3 className="text-base font-black text-white mt-0.5">
              {result.teamA} vs {result.teamB}
            </h3>
            <p className="text-[10px] text-orange-300 mt-0.5">{result.summary}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-3 border-b border-white/5">
          {innings.map((inn, i) => (
            <button
              key={i}
              onClick={() => setTab(i)}
              className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wide transition-all ${
                tab === i ? 'bg-orange-500/20 text-orange-400 border border-orange-500/20' : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              {inn.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {inn && (
            <>
              {/* Score hero */}
              <div
                className="rounded-2xl p-4 text-center relative overflow-hidden"
                style={{ background: `linear-gradient(135deg, ${hex(inn.battingTeamId)}20, #0a0a0a)` }}
              >
                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{inn.battingTeamId} batting</p>
                <p className="text-4xl font-black text-white mt-1">{inn.runs}<span className="text-gray-500">/{inn.wickets}</span></p>
                <p className="text-xs text-gray-400 mt-0.5">({inn.overs} overs)</p>
              </div>

              {/* Batting */}
              <div>
                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">Batting</p>
                <div className="space-y-1">
                  {(inn.batting || []).filter(b => b.didBat).map(b => (
                    <div key={b.id} className="flex items-center gap-2 py-2 px-3 bg-white/[0.02] rounded-xl border border-white/5">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-white truncate">{b.name}</p>
                        <p className="text-[8px] text-gray-600">{b.dismissal ? `${b.dismissal.kind}` : 'not out'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-black text-white">{b.runs}</p>
                        <p className="text-[8px] text-gray-600">({b.balls}b)</p>
                      </div>
                      <div className="text-right shrink-0 hidden sm:block">
                        <p className="text-[9px] text-gray-500">
                          SR {b.balls ? (b.runs / b.balls * 100).toFixed(0) : 0}
                        </p>
                        <p className="text-[8px] text-gray-600">{b.fours}×4 {b.sixes}×6</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[9px] text-gray-600 mt-2 px-1">
                  Extras: {Object.values(inn.extras || {}).reduce((a,b)=>a+b,0)} 
                  (WD {inn.extras?.wides||0} NB {inn.extras?.noBalls||0})
                </p>
              </div>

              {/* Bowling */}
              <div>
                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">Bowling</p>
                <div className="space-y-1">
                  {(inn.bowling || []).filter(b => b.balls > 0).map(b => (
                    <div key={b.id} className="flex items-center gap-2 py-2 px-3 bg-white/[0.02] rounded-xl border border-white/5">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-white truncate">{b.name}</p>
                      </div>
                      <div className="flex items-center gap-3 text-right shrink-0">
                        <div>
                          <p className="text-xs font-black text-blue-400">{b.wickets}/{b.runs}</p>
                          <p className="text-[8px] text-gray-600">{oversText(b.balls)} ov</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-gray-500">
                            {b.balls ? (b.runs / b.balls * 6).toFixed(1) : '0.0'}
                          </p>
                          <p className="text-[8px] text-gray-600">econ</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Over chart */}
              {inn.events?.length > 0 && (
                <div>
                  <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">Runs Per Over</p>
                  <OverChart events={inn.events} totalOvers={Math.ceil(inn.balls / 6)} />
                </div>
              )}
            </>
          )}
        </div>
      </Motion.div>
    </Motion.div>
  );
}

function OverChart({ events, totalOvers }) {
  const byOver = [];
  for (let o = 0; o < totalOvers; o++) {
    const deliveries = events.filter(e => Math.floor(e.ball / 6) === o && e.legal);
    const runs = deliveries.reduce((sum, e) => sum + e.batRuns + e.extras, 0);
    const wickets = deliveries.filter(e => e.wicket).length;
    byOver.push({ over: o + 1, runs, wickets });
  }
  const max = Math.max(...byOver.map(o => o.runs), 1);
  return (
    <div className="flex items-end gap-0.5 h-14 px-1">
      {byOver.map((o, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end">
          <div
            className={`w-full rounded-t-sm ${o.wickets ? 'bg-red-500' : 'bg-orange-500'} opacity-70`}
            style={{ height: `${Math.max(6, (o.runs / max) * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

// ── Standings table ───────────────────────────────────────────────────────────
function StandingsTable({ standings, myTeamId }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/5">
      <table className="w-full text-xs whitespace-nowrap">
        <thead>
          <tr className="border-b border-white/5">
            {['#','Team','P','W','L','Pts','NRR'].map(h => (
              <th key={h} className={`py-2 px-3 font-black text-gray-600 uppercase tracking-wide ${h === 'Team' ? 'text-left' : 'text-right'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {standings.map((row, i) => {
            const isMe = row.teamId === myTeamId;
            const qualifies = i < 4;
            return (
              <tr
                key={row.teamId}
                className={`border-t border-white/5 ${
                  isMe ? 'bg-orange-500/5' :
                  qualifies ? 'bg-green-500/[0.02]' : ''
                }`}
              >
                <td className="py-2.5 px-3 text-right">
                  {i < 4
                    ? <span className="text-green-400 font-black">{i+1}</span>
                    : <span className="text-gray-600">{i+1}</span>}
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <TeamLogoSmall id={row.teamId} size={20} />
                    <span className={`font-bold ${isMe ? 'text-orange-400' : qualifies ? 'text-white' : 'text-gray-400'}`}>
                      {row.teamId}
                    </span>
                    {isMe && <Pill color="orange">You</Pill>}
                  </div>
                </td>
                {[row.played, row.wins, row.losses, row.points].map((v, j) => (
                  <td key={j} className={`py-2.5 px-3 text-right font-bold ${j === 3 ? 'text-orange-400' : 'text-gray-400'}`}>
                    {v}
                  </td>
                ))}
                <td className={`py-2.5 px-3 text-right font-bold ${row.nrr > 0 ? 'text-green-400' : row.nrr < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                  {row.nrr > 0 ? '+' : ''}{row.nrr.toFixed(3)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-3 py-2 border-t border-white/5 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-400" />
        <span className="text-[9px] text-gray-600">Top 4 qualify for playoffs</span>
      </div>
    </div>
  );
}

// ── Pre-match setup card ───────────────────────────────────────────────────────
function PreMatchCard({ myFixture, setup, onConfirm, prepared, busy }) {
  const hexA = hex(myFixture.teamA), hexB = hex(myFixture.teamB);

  return (
    <Motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-orange-500/20 overflow-hidden"
    >
      {/* Hero */}
      <div
        className="p-5 relative"
        style={{ background: `linear-gradient(135deg, ${hexA}20 0%, #0a0a0a 45%, #0a0a0a 55%, ${hexB}20 100%)` }}
      >
        <div className="h-0.5 absolute top-0 left-0 right-0"
          style={{ background: `linear-gradient(90deg, ${hexA}, ${hexB})` }} />

        <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
          <Star size={9} fill="currentColor" /> Your Match
        </p>

        <div className="flex items-center gap-4">
          <div className="flex-1 flex flex-col items-center gap-1.5 text-center">
            <TeamLogoSmall id={myFixture.teamA} size={44} />
            <p className="text-xs font-black text-white uppercase">{myFixture.teamA}</p>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-black text-gray-600">VS</span>
          </div>
          <div className="flex-1 flex flex-col items-center gap-1.5 text-center">
            <TeamLogoSmall id={myFixture.teamB} size={44} />
            <p className="text-xs font-black text-white uppercase">{myFixture.teamB}</p>
          </div>
        </div>

        {setup && (
          <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
            <Pill color="gray">
              {setup.pitch === 'batting' ? '🏏 Batting pitch' : setup.pitch === 'bowling' ? '🎯 Bowling pitch' : '⚖️ Balanced pitch'}
            </Pill>
            <Pill color="gray">
              {setup.weather === 'Evening dew' ? '💧 Evening dew' : '☀️ Clear skies'}
            </Pill>

          </div>
        )}
      </div>

      <div className="p-5 space-y-4 bg-[#0a0a0a]">
        <p className="text-xs text-gray-400">Confirm your Playing XI. The toss and match tactics happen inside the match.</p>
        <button
          onClick={onConfirm}
          disabled={busy}
          className="w-full py-3 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-black text-sm uppercase tracking-widest hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
          {prepared ? 'Update XI' : 'Confirm XI'}
        </button>

        {prepared && (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-500/5 border border-green-500/10 rounded-xl">
            <CheckCircle2 size={13} className="text-green-400 shrink-0" />
            <p className="text-[10px] text-green-400">
              Playing XI confirmed
            </p>
          </div>
        )}
      </div>
    </Motion.div>
  );
}

// ── Champion screen ───────────────────────────────────────────────────────────
function ChampionScreen({ champion }) {
  return (
    <Motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-3xl border border-yellow-500/20 overflow-hidden text-center"
    >
      <div className="h-1 bg-gradient-to-r from-yellow-600 via-yellow-400 to-yellow-600" />
      <div className="p-8 sm:p-12"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, #92400e20, #0a0a0a 60%)' }}
      >
        <div className="text-5xl mb-4">🏆</div>
        <p className="text-[9px] font-black text-yellow-500 uppercase tracking-widest mb-2">Tournament Champions</p>
        <h2 className="text-3xl sm:text-4xl font-black text-white uppercase">{champion}</h2>
        <p className="text-gray-500 text-sm mt-3">All 49 matches complete. Season over.</p>
      </div>
    </Motion.div>
  );
}

// ── Empty state for no season ─────────────────────────────────────────────────
function StartSeason({ onStart, busy, startIssue, isHost }) {
  return (
    <Motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/5 overflow-hidden"
    >
      <div className="h-0.5 bg-gradient-to-r from-orange-500 to-red-500" />
      <div className="p-6 sm:p-8 space-y-5 bg-[#0a0a0a]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shrink-0">
            <Trophy size={22} className="text-white" />
          </div>
          <div>
            <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest">Season Engine</p>
            <h3 className="text-xl font-black text-white">Ready to Start</h3>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: '📅', label: '9 Matchdays', sub: '45 league matches' },
            { icon: '⚡', label: 'Simultaneous', sub: '5 matches per day' },
            { icon: '📊', label: 'Live Standings', sub: 'NRR tracking' },
            { icon: '🏆', label: 'Playoffs', sub: 'Top 4 qualify' },
          ].map(({ icon, label, sub }) => (
            <div key={label} className="bg-white/[0.02] border border-white/5 rounded-xl p-3">
              <span className="text-lg">{icon}</span>
              <p className="text-[10px] font-black text-gray-300 mt-1">{label}</p>
              <p className="text-[8px] text-gray-600">{sub}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-500 leading-relaxed">
          Starting the tournament freezes squad ownership for this season.
          Each human manager confirms their Playing XI before the host runs each round.
          AI teams are handled automatically.
        </p>

        {startIssue && (
          <div className="flex items-start gap-2 p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl">
            <AlertCircle size={13} className="text-amber-400 mt-0.5 shrink-0" />
            <p className="text-[10px] text-amber-400">{startIssue}</p>
          </div>
        )}

        {isHost ? (
          <button
            onClick={onStart}
            disabled={busy || !!startIssue}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-black text-sm uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            {busy ? 'Starting…' : 'Start Tournament'}
          </button>
        ) : (
          <div className="flex items-center gap-2 px-4 py-3 bg-white/[0.02] border border-white/5 rounded-xl">
            <Clock size={13} className="text-gray-500 shrink-0" />
            <p className="text-xs text-gray-500">Waiting for the room host to start the tournament.</p>
          </div>
        )}
      </div>
    </Motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TournamentSeason({ auctionId, user, tournament, currentAuction }) {
  const [snapshot, setSnapshot] = useState({ loaded: false, season: null, error: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [selectedDay, setSelectedDay] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [activeTab, setActiveTab] = useState('matchday'); // 'matchday' | 'standings' | 'fixtures'
  const [arenaMatch, setArenaMatch] = useState(null); // { teamA, teamB, seed }

  const path = `auctions/${auctionId}/room/dreamTournamentV3`;

  useEffect(() => {
    if (!auctionId || !user?.uid) return;
    return onValue(
      ref(rtdb, path),
      snap => setSnapshot({ loaded: true, season: snap.val(), error: '' }),
      () => setSnapshot(prev => ({ ...prev, loaded: true, error: 'Cannot sync the tournament.' }))
    );
  }, [auctionId, user?.uid, path]);

  const season = snapshot.season;

  const compatibility = useMemo(() => {
    if (!season) return '';
    try { assertSeason(season); return ''; } catch (e) { return e.message; }
  }, [season]);

  // Host can always start — players who haven't set XI get AI defaults
  const startIssue = '';

  async function commit(change, success) {
    if (busy) return;
    setBusy(true); setNotice('');
    let reason = '';
    try {
      const outcome = await runTransaction(ref(rtdb, path), current => {
        reason = '';
        try { return change(current); }
        catch (e) { reason = e.message; return undefined; }
      }, { applyLocally: false });
      setNotice(outcome.committed ? success : reason || 'Round changed. Review and try again.');
      return outcome.committed;
    } catch (e) { setNotice(`Could not save: ${e.message}`); return false; }
    finally { setBusy(false); }
  }

  function start() {
    const candidate = createTournament(tournament.teams, {
      id: crypto.randomUUID(),
      hostId: currentAuction.hostId,
      createdAt: getServerTime(),
    });
    commit(current => {
      if (current) throw new Error('A season has already started.');
      if (user.uid !== currentAuction.hostId) throw new Error('Only the room host can start a season.');
      return candidate;
    }, 'Tournament started! Confirm your Playing XI.');
  }

  function openScorecard(fixtureId) {
    try { setViewing({ fixtureId, result: replayFixture(season, fixtureId) }); }
    catch (e) { setNotice(e.message); }
  }

  // ── Loading ─────────────────────────────────────────────────────────────
  if (!snapshot.loaded) {
    return (
      <div className="flex items-center gap-3 p-6 bg-[#0a0a0a] border border-white/5 rounded-2xl">
        <Loader2 size={16} className="text-orange-400 animate-spin shrink-0" />
        <p className="text-sm text-gray-400">Loading tournament…</p>
      </div>
    );
  }

  if (snapshot.error || compatibility) {
    return (
      <div className="flex items-start gap-2 p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl">
        <AlertCircle size={14} className="text-amber-400 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-400">{snapshot.error || compatibility}</p>
      </div>
    );
  }

  // ── No season yet ──────────────────────────────────────────────────────
  if (!season) {
    return (
      <>
        <StartSeason
          onStart={start}
          busy={busy}
          startIssue={startIssue}
          isHost={currentAuction?.hostId === user?.uid}
        />
        {notice && (
          <p className="text-sm text-orange-300 px-1">{notice}</p>
        )}
      </>
    );
  }

  // ── Active season ──────────────────────────────────────────────────────
  const fixtures = currentFixtures(season);
  const mine = season.roster.find(t => !t.isAI && t.userId === user?.uid);
  const liveTeam = tournament.teams.find(t => t.userId === user?.uid && t.isHuman);
  const myFixture = mine && fixtures.find(f => [f.teamA, f.teamB].includes(mine.teamId));
  const pending = missingPreparations(season);
  const prepared = mine && season.preparations?.[mine.teamId]?.round === roundKey(season);
  const setup = myFixture && matchSetup(`${season.id}:${myFixture.fixtureId}`, myFixture.teamA, myFixture.teamB);
  const displayDay = selectedDay ?? (season.stage === 'league' ? season.currentMatchday : 'playoffs');
  const visible = season.fixtures.filter(f =>
    displayDay === 'playoffs'
      ? f.stage !== 'league'
      : f.stage === 'league' && f.matchday === displayDay
  );
  const standings = standingsFor(season);
  const expectedRound = roundKey(season);
  const isHost = season.hostId === user?.uid;

  return (
    <div className="space-y-5">
      {/* ── Champion ── */}
      {season.champion && <ChampionScreen champion={season.champion} />}

      {/* ── Round header ── */}
      {!season.champion && (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest">Season · {season.stage}</p>
            <h3 className="text-xl font-black text-white">{roundTitle(season)}</h3>
          </div>
          <Pill color={season.status === 'completed' ? 'green' : 'orange'}>
            {season.status === 'completed' ? 'Complete' : 'In Progress'}
          </Pill>
        </div>
      )}

      {/* ── Inner tabs ── */}
      {!season.champion && (
        <div className="flex gap-1 bg-white/[0.02] border border-white/5 rounded-xl p-1">
          {[
            { id: 'matchday', label: 'Matchday' },
            { id: 'standings', label: 'Standings' },
            { id: 'fixtures', label: 'All Fixtures' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                activeTab === t.id ? 'bg-white/10 text-white' : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Matchday tab ── */}
      <AnimatePresence mode="wait">
        {activeTab === 'matchday' && !season.champion && (
          <Motion.div key="matchday" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

            {/* My pre-match setup */}
            {myFixture && myFixture.status === 'scheduled' && (
              <PreMatchCard
                myFixture={myFixture}
                setup={setup}
                onConfirm={() => commit(
                  current => prepareTeam(current, user.uid,
                    { playingXI: liveTeam?.playingXI || mine.playingXI, tactic:'balanced' },
                    expectedRound
                  ),
                  'Playing XI confirmed!'
                )}
                prepared={prepared}
                busy={busy}
                isHost={isHost}
              />
            )}

            {/* Other matches */}
            <div className="space-y-2">
              <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">This Round's Matches</p>
              {fixtures.map(f => (
                <MatchVsCard
                  key={f.fixtureId}
                  teamA={f.teamA}
                  teamB={f.teamB}
                  isMyMatch={mine && [f.teamA, f.teamB].includes(mine.teamId)}
                  result={season.results?.[f.fixtureId] ? {
                    innings: season.results[f.fixtureId].innings,
                    summary: season.results[f.fixtureId].summary,
                    winner: season.results[f.fixtureId].winner,
                  } : null}
                  onReplay={season.results?.[f.fixtureId] ? () => openScorecard(f.fixtureId) : null}
                />
              ))}
            </div>

            {/* Team readiness */}
            <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-4 space-y-3">
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Team Readiness</p>
              <div className="flex flex-wrap gap-2">
                {season.roster
                  .filter(t => fixtures.some(f => [f.teamA, f.teamB].includes(t.teamId)))
                  .map(t => {
                    const ready = t.isAI || !pending.some(p => p.teamId === t.teamId);
                    return (
                      <div key={t.teamId} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[9px] font-black ${
                        ready ? 'border-green-500/20 bg-green-500/5 text-green-400' : 'border-white/5 bg-white/[0.02] text-gray-500'
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${ready ? 'bg-green-400' : 'bg-gray-600'}`} />
                        {t.teamId} · {t.isAI ? 'AI' : ready ? 'Ready' : 'Waiting'}
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Run round button — opens live arena for human match, then simulates AI matches */}
            {isHost && !season.champion && (
              <button
                disabled={busy || pending.length > 0}
                onClick={() => {
                  if (myFixture && myFixture.status === 'scheduled' && mine) {
                    // Build full team objects from roster for MatchArena
                    const rA = season.roster.find(t => t.teamId === myFixture.teamA);
                    const rB = season.roster.find(t => t.teamId === myFixture.teamB);
                    const plans = fixturePlans(season, myFixture);
                    const toArenaTeam = r => r ? {
                      teamId: r.teamId,
                      players: r.players,
                      playingXI: plans[r.teamId].playingXI,
                      squad: r.squad,
                    } : null;
                    setArenaMatch({
                      teamA: toArenaTeam(rA) || { teamId: myFixture.teamA, players: [], playingXI: [], squad: [] },
                      teamB: toArenaTeam(rB) || { teamId: myFixture.teamB, players: [], playingXI: [], squad: [] },
                      seed: `${season.id}:${myFixture.fixtureId}`,
                      plans,
                      playoffRank: myFixture.stage === 'league' ? null : standings.map(t => t.teamId),
                      onArenaComplete: async result => {
                        const saved = await commit(
                          current => advanceRound(current, user.uid, expectedRound, getServerTime(), {fixtureId:myFixture.fixtureId, result}),
                          'Round complete!'
                        );
                        if (saved) setArenaMatch(null);
                        return saved;
                      },
                    });
                  } else {
                    // No human match this round — simulate directly
                    const time = getServerTime();
                    commit(
                      current => advanceRound(current, user.uid, expectedRound, time),
                      'Round complete!'
                    );
                  }
                }}
                className="w-full py-4 rounded-2xl border font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-orange-600 to-red-600 text-white hover:opacity-90 active:scale-95"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                {busy ? 'Simulating…' : myFixture && myFixture.status === 'scheduled' && mine ? `▶ Play Your Match` : `Play ${roundTitle(season)}`}
              </button>
            )}
            {!isHost && !season.champion && (
              <div className="flex items-center gap-2 px-4 py-3 bg-white/[0.02] border border-white/5 rounded-xl">
                <Clock size={13} className="text-gray-500 shrink-0" />
                <p className="text-xs text-gray-500">
                  {pending.length
                    ? `Waiting for ${pending.map(t => t.teamId).join(', ')} to confirm…`
                    : 'Waiting for the host to run the round.'}
                </p>
              </div>
            )}
            {pending.length > 0 && isHost && (
              <div className="flex items-start gap-2 px-3 py-2 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                <AlertCircle size={12} className="text-amber-400 mt-0.5 shrink-0" />
                <p className="text-[10px] text-amber-400">
                  {pending.map(t => t.teamId).join(', ')} must confirm their Playing XI before the round starts.
                </p>
              </div>
            )}

            {/* Latest results */}
            {season.lastRoundFixtures?.length > 0 && (
              <div className="space-y-2">
                <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Last Round Results</p>
                {season.lastRoundFixtures.map(id => {
                  const r = season.results?.[id];
                  if (!r) return null;
                  return (
                    <MatchVsCard
                      key={id}
                      teamA={r.teamA}
                      teamB={r.teamB}
                      result={{ innings: r.innings, summary: r.summary, winner: r.winner }}
                      isMyMatch={mine && [r.teamA, r.teamB].includes(mine.teamId)}
                      onReplay={() => openScorecard(id)}
                    />
                  );
                })}
              </div>
            )}
          </Motion.div>
        )}

        {/* ── Standings tab ── */}
        {activeTab === 'standings' && (
          <Motion.div key="standings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            <StandingsTable standings={standings} myTeamId={mine?.teamId} />
          </Motion.div>
        )}

        {/* ── All fixtures tab ── */}
        {activeTab === 'fixtures' && (
          <Motion.div key="fixtures" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            {/* Day selector */}
            <div className="flex overflow-x-auto gap-1.5 pb-1">
              {[1,2,3,4,5,6,7,8,9,'playoffs'].map(d => (
                <button
                  key={d}
                  onClick={() => setSelectedDay(d)}
                  className={`shrink-0 px-3 py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-wide transition-all ${
                    displayDay === d
                      ? 'border-orange-500/40 bg-orange-500/10 text-orange-400'
                      : 'border-white/5 text-gray-600 hover:text-gray-400'
                  }`}
                >
                  {d === 'playoffs' ? 'Playoffs' : `MD ${d}`}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {visible.length === 0 && (
                <div className="p-6 text-center bg-white/[0.01] border border-white/5 rounded-2xl">
                  <Lock size={20} className="text-gray-700 mx-auto mb-2" />
                  <p className="text-xs text-gray-600">
                    {displayDay === 'playoffs'
                      ? 'Playoffs unlock after Matchday 9. Top 4 qualify.'
                      : 'This matchday is not yet scheduled.'}
                  </p>
                </div>
              )}
              {visible.map(f => (
                <MatchVsCard
                  key={f.fixtureId}
                  teamA={f.teamA}
                  teamB={f.teamB}
                  label={f.stage !== 'league' ? STAGE_LABELS[f.stage] : null}
                  isMyMatch={mine && [f.teamA, f.teamB].includes(mine.teamId)}
                  result={season.results?.[f.fixtureId] ? {
                    innings: season.results[f.fixtureId].innings,
                    summary: season.results[f.fixtureId].summary,
                    winner: season.results[f.fixtureId].winner,
                  } : null}
                  onReplay={season.results?.[f.fixtureId] ? () => openScorecard(f.fixtureId) : null}
                />
              ))}
            </div>
          </Motion.div>
        )}
      </AnimatePresence>

      {/* ── Notice ── */}
      {notice && (
        <Motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`text-sm px-1 ${notice.includes('complete') || notice.includes('confirmed') || notice.includes('started') ? 'text-green-400' : 'text-orange-300'}`}
        >
          {notice}
        </Motion.p>
      )}

      {/* ── Scorecard modal ── */}
      <AnimatePresence>
        {viewing && (
          <ScorecardModal
            result={viewing.result}
            onClose={() => setViewing(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Match Arena ── */}
      <AnimatePresence>
        {arenaMatch && (
          <MatchArena
            teamA={arenaMatch.teamA}
            teamB={arenaMatch.teamB}
            seed={arenaMatch.seed}
            myTeamId={mine?.teamId}
            initialPlans={arenaMatch.plans}
            playoffRank={arenaMatch.playoffRank}
            onComplete={arenaMatch.onArenaComplete}
            onClose={() => setArenaMatch(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
