import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, Trophy, RotateCcw, Play, ChevronRight,
  Target, TrendingUp, Shield, Award, Clock, Swords
} from 'lucide-react';
import { TEAMS } from '../data/teams';
import { simulateMatch } from '../lib/matchSimulator';

// ─── helpers ────────────────────────────────────────────────────────────────
const FORMAT_CONFIG = {
  t20: { label: 'T20', overs: 20, color: 'from-orange-500 to-red-600', badge: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  odi: { label: 'ODI', overs: 50, color: 'from-blue-500 to-indigo-600', badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
};

const MEDAL_COLORS = [
  'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  'text-gray-300 bg-gray-400/10 border-gray-400/20',
  'text-orange-400 bg-orange-500/10 border-orange-500/20',
];

function ScoreCard({ team, innings, isWinner, format }) {
  const cfg = FORMAT_CONFIG[format];
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative rounded-2xl border overflow-hidden ${
        isWinner
          ? 'border-yellow-500/40 bg-gradient-to-br from-yellow-500/10 via-[#0c0c0c] to-[#0c0c0c]'
          : 'border-white/5 bg-[#0c0c0c]'
      }`}
    >
      {isWinner && (
        <div className="absolute top-3 right-3">
          <span className="text-[9px] font-black text-yellow-400 uppercase tracking-widest bg-yellow-500/20 border border-yellow-500/30 px-2 py-0.5 rounded-full">
            🏆 Winner
          </span>
        </div>
      )}
      <div className="p-4 sm:p-6">
        {/* Team header */}
        <div className="flex items-center gap-3 mb-4">
          {team.teamLogo && (
            <img src={team.teamLogo} alt="" className="w-10 h-10 object-contain" />
          )}
          <div>
            <h3 className="text-sm font-black uppercase tracking-tight text-white">{team.teamName}</h3>
            <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{team.userName}</p>
          </div>
        </div>

        {/* Score */}
        <div className="flex items-end gap-2 mb-4">
          <span className={`text-5xl sm:text-6xl font-black leading-none ${isWinner ? 'text-yellow-400' : 'text-white'}`}>
            {innings.runs}
          </span>
          <span className="text-xl font-black text-gray-400 mb-1">/{innings.wickets}</span>
          <span className="text-xs font-bold text-gray-500 mb-1.5 ml-1">({innings.overs} ov)</span>
        </div>

        {/* Top performers */}
        <div className="space-y-2">
          {innings.topScorer && (
            <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
              <Target size={12} className="text-orange-400 shrink-0" />
              <span className="text-[10px] font-black text-gray-300 truncate">{innings.topScorer.name}</span>
              <span className="text-[10px] font-black text-orange-400 ml-auto shrink-0">
                {innings.topScorer.runs} ({innings.topScorer.balls}b)
              </span>
            </div>
          )}
          {innings.topBowler && (
            <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
              <Zap size={12} className="text-blue-400 shrink-0" />
              <span className="text-[10px] font-black text-gray-300 truncate">{innings.topBowler.name}</span>
              <span className="text-[10px] font-black text-blue-400 ml-auto shrink-0">
                {innings.topBowler.wickets}/{innings.topBowler.runs} ({innings.topBowler.overs} ov)
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function OverChart({ overByOver, color }) {
  const max = Math.max(...overByOver.map(o => o.runs), 1);
  return (
    <div className="flex items-end gap-0.5 h-16 w-full">
      {overByOver.map((o, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
          <div
            className={`w-full rounded-t-sm bg-gradient-to-t ${color} opacity-80`}
            style={{ height: `${Math.max(4, (o.runs / max) * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function DreamMatch({ roomTeams, currentAuction }) {
  const [format, setFormat] = useState('t20');
  const [teamAId, setTeamAId] = useState('');
  const [teamBId, setTeamBId] = useState('');
  const [result, setResult] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [activeInnings, setActiveInnings] = useState(0);
  const matchCounter = useRef(0);

  const validTeams = (roomTeams || []).filter(rt => rt?.teamId && (rt.squad || []).length > 0);

  const buildTeamObj = useCallback((teamId) => {
    const rt = validTeams.find(t => t.teamId === teamId);
    if (!rt) return null;
    const teamInfo = TEAMS.find(t => t.id === teamId);
    const auctionPlayers = currentAuction?.players || [];
    const ap = auctionPlayers.find(p => p.uid === rt.userId || p.team === teamId);
    return {
      teamId,
      teamName: teamInfo?.name || teamId,
      teamLogo: teamInfo?.logo || null,
      userName: ap?.name || rt.userName || 'Manager',
      squad: rt.squad || [],
    };
  }, [validTeams, currentAuction]);

  const handleSimulate = useCallback(() => {
    if (!teamAId || !teamBId || teamAId === teamBId) return;
    setSimulating(true);
    setResult(null);
    setShowDetails(false);

    setTimeout(() => {
      try {
        const tA = buildTeamObj(teamAId);
        const tB = buildTeamObj(teamBId);
        matchCounter.current += 1;
        const matchId = `${teamAId}-${teamBId}-${format}-${matchCounter.current}`;
        const res = simulateMatch(tA, tB, format, matchId);
        setResult(res);
        setActiveInnings(0);
      } catch (e) {
        console.error('Simulation error:', e);
      }
      setSimulating(false);
    }, 1800);
  }, [teamAId, teamBId, format, buildTeamObj]);

  const cfg = FORMAT_CONFIG[format];

  // ─── Leaderboard across all possible matchups ────────────────────────────
  const allMatchups = [];
  for (let i = 0; i < validTeams.length; i++) {
    for (let j = i + 1; j < validTeams.length; j++) {
      allMatchups.push([validTeams[i].teamId, validTeams[j].teamId]);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-24">

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${cfg.color} flex items-center justify-center shadow-2xl shrink-0`}>
          <Swords size={22} className="text-white" />
        </div>
        <div>
          <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-tighter italic">
            Dream <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-500">Match</span>
          </h2>
          <p className="text-[9px] font-black text-gray-500 uppercase tracking-[0.3em]">
            Simulate · Compete · Dominate
          </p>
        </div>
      </div>

      {/* Format toggle */}
      <div className="flex gap-2">
        {Object.entries(FORMAT_CONFIG).map(([key, c]) => (
          <button
            key={key}
            onClick={() => { setFormat(key); setResult(null); }}
            className={`flex-1 py-3 rounded-2xl border font-black text-xs uppercase tracking-widest transition-all ${
              format === key
                ? `bg-gradient-to-r ${c.color} border-transparent text-white shadow-lg`
                : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
            }`}
          >
            {c.label} · {c.overs} Overs
          </button>
        ))}
      </div>

      {/* Team selectors */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {[
          { label: 'Team A', value: teamAId, setter: setTeamAId, exclude: teamBId },
          { label: 'Team B', value: teamBId, setter: setTeamBId, exclude: teamAId },
        ].map(({ label, value, setter, exclude }) => (
          <div key={label} className="space-y-2">
            <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{label}</p>
            <div className="relative">
              <select
                value={value}
                onChange={e => { setter(e.target.value); setResult(null); }}
                className="w-full appearance-none bg-[#111] border border-white/10 rounded-2xl px-4 py-3 text-white text-xs font-black uppercase tracking-wider focus:outline-none focus:border-orange-500/50 cursor-pointer"
              >
                <option value="">Select team…</option>
                {validTeams
                  .filter(rt => rt.teamId !== exclude)
                  .map(rt => {
                    const t = TEAMS.find(x => x.id === rt.teamId);
                    return (
                      <option key={rt.teamId} value={rt.teamId}>
                        {t?.name || rt.teamId}
                      </option>
                    );
                  })}
              </select>
              <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 rotate-90 pointer-events-none" />
            </div>
            {value && (() => {
              const rt = validTeams.find(t => t.teamId === value);
              const t = TEAMS.find(x => x.id === value);
              return (
                <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-xl">
                  {t?.logo && <img src={t.logo} alt="" className="w-6 h-6 object-contain" />}
                  <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">
                    {(rt?.squad || []).length} players
                  </span>
                </div>
              );
            })()}
          </div>
        ))}
      </div>

      {/* VS divider */}
      {teamAId && teamBId && teamAId !== teamBId && (
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-white/5" />
          <span className="text-xs font-black text-gray-600 uppercase tracking-widest">VS</span>
          <div className="flex-1 h-px bg-white/5" />
        </div>
      )}

      {/* Simulate button */}
      <button
        onClick={handleSimulate}
        disabled={!teamAId || !teamBId || teamAId === teamBId || simulating}
        className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${
          teamAId && teamBId && teamAId !== teamBId && !simulating
            ? `bg-gradient-to-r ${cfg.color} text-white shadow-2xl hover:opacity-90 active:scale-95`
            : 'bg-white/5 border border-white/10 text-gray-600 cursor-not-allowed'
        }`}
      >
        {simulating ? (
          <>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
              className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white"
            />
            Simulating match…
          </>
        ) : (
          <>
            <Play size={18} />
            {result ? 'Simulate Again' : `Start ${cfg.label} Match`}
          </>
        )}
      </button>

      {/* ── Result ── */}
      <AnimatePresence>
        {result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Winner banner */}
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className={`relative overflow-hidden rounded-3xl border bg-gradient-to-br ${cfg.color} border-transparent p-6 text-center`}
            >
              <div className="absolute inset-0 bg-black/40" />
              <div className="relative z-10">
                {result.tie ? (
                  <>
                    <div className="text-4xl mb-2">🤝</div>
                    <h3 className="text-xl font-black uppercase tracking-tight text-white">It's a Tie!</h3>
                  </>
                ) : (
                  <>
                    <div className="text-4xl mb-2">🏆</div>
                    <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mb-1">Winner</p>
                    <h3 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">{result.winner}</h3>
                    <p className="text-sm font-bold text-white/70 mt-1">
                      by {result.margin} runs
                    </p>
                  </>
                )}
                <div className="flex items-center justify-center gap-3 mt-3">
                  <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${cfg.badge}`}>
                    {cfg.label} · {cfg.overs} Overs
                  </span>
                  <span className="text-[9px] font-black text-white/50 uppercase tracking-widest">
                    Toss: {result.tossWinner} · Batted First: {result.batFirst}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Scorecards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ScoreCard
                team={result.teamA}
                innings={result.teamA.innings}
                isWinner={result.winnerTeamId === result.teamA.teamId}
                format={format}
              />
              <ScoreCard
                team={result.teamB}
                innings={result.teamB.innings}
                isWinner={result.winnerTeamId === result.teamB.teamId}
                format={format}
              />
            </div>

            {/* Over-by-over charts */}
            <div className="bg-[#0c0c0c] border border-white/5 rounded-2xl p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-black uppercase tracking-widest text-gray-400">Over-by-Over Runs</h4>
                <div className="flex gap-1">
                  {[result.teamA, result.teamB].map((t, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveInnings(i)}
                      className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                        activeInnings === i ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {t.teamId}
                    </button>
                  ))}
                </div>
              </div>
              {(() => {
                const t = activeInnings === 0 ? result.teamA : result.teamB;
                return (
                  <>
                    <OverChart
                      overByOver={t.innings.overByOver}
                      color={activeInnings === 0 ? 'from-orange-500 to-red-500' : 'from-blue-500 to-indigo-500'}
                    />
                    <div className="flex justify-between mt-2">
                      <span className="text-[8px] text-gray-600 font-bold">Over 1</span>
                      <span className="text-[8px] text-gray-600 font-bold">Over {t.innings.overs}</span>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Detailed scorecards toggle */}
            <button
              onClick={() => setShowDetails(v => !v)}
              className="w-full py-3 bg-white/5 border border-white/10 rounded-2xl text-xs font-black uppercase tracking-widest text-gray-400 hover:text-white hover:border-white/20 transition-all flex items-center justify-center gap-2"
            >
              <TrendingUp size={14} />
              {showDetails ? 'Hide' : 'Show'} Full Scorecard
            </button>

            <AnimatePresence>
              {showDetails && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[result.teamA, result.teamB].map((team, ti) => (
                      <div key={ti} className="bg-[#0c0c0c] border border-white/5 rounded-2xl p-4">
                        <h5 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">{team.teamId} Batting</h5>
                        <div className="space-y-1">
                          {(team.innings.batterScores || [])
                            .filter(b => b.balls > 0)
                            .sort((a, b) => b.runs - a.runs)
                            .map((b, i) => (
                              <div key={i} className="flex items-center gap-2 py-1 border-b border-white/5">
                                <span className="text-[9px] font-bold text-gray-400 w-4">{i + 1}</span>
                                <span className="text-[9px] font-black text-white flex-1 truncate">{b.name}</span>
                                <span className="text-[9px] font-black text-orange-400">{b.runs}</span>
                                <span className="text-[8px] text-gray-600">({b.balls}b)</span>
                              </div>
                            ))}
                        </div>
                        <h5 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3 mt-4">{team.teamId} Bowling</h5>
                        <div className="space-y-1">
                          {(team.innings.bowlerFigures || [])
                            .filter(b => b.overs > 0)
                            .sort((a, b) => b.wickets - a.wickets)
                            .map((b, i) => (
                              <div key={i} className="flex items-center gap-2 py-1 border-b border-white/5">
                                <span className="text-[9px] font-bold text-gray-400 w-4">{i + 1}</span>
                                <span className="text-[9px] font-black text-white flex-1 truncate">{b.name}</span>
                                <span className="text-[9px] font-black text-blue-400">{b.wickets}/{b.runs}</span>
                                <span className="text-[8px] text-gray-600">({b.overs} ov)</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Play Again */}
            <div className="flex gap-3">
              <button
                onClick={handleSimulate}
                className="flex-1 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs font-black uppercase tracking-widest text-gray-400 hover:text-white hover:border-white/20 transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw size={14} />
                Replay Match
              </button>
              <button
                onClick={() => { setResult(null); setTeamAId(''); setTeamBId(''); }}
                className="flex-1 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs font-black uppercase tracking-widest text-gray-400 hover:text-white hover:border-white/20 transition-all flex items-center justify-center gap-2"
              >
                <Swords size={14} />
                New Matchup
              </button>
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* All Matchups section (when 3+ teams) */}
      {validTeams.length >= 3 && !result && (
        <div className="space-y-3">
          <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Quick Matchups</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {allMatchups.slice(0, 6).map(([aId, bId], i) => {
              const tA = TEAMS.find(t => t.id === aId);
              const tB = TEAMS.find(t => t.id === bId);
              return (
                <button
                  key={i}
                  onClick={() => { setTeamAId(aId); setTeamBId(bId); }}
                  className="flex items-center gap-3 p-3 bg-white/5 border border-white/5 rounded-2xl hover:border-orange-500/30 hover:bg-white/8 transition-all text-left"
                >
                  {tA?.logo && <img src={tA.logo} alt="" className="w-7 h-7 object-contain" />}
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">vs</span>
                  {tB?.logo && <img src={tB.logo} alt="" className="w-7 h-7 object-contain" />}
                  <span className="text-[9px] font-black text-gray-300 truncate flex-1">
                    {tA?.name?.split(' ').slice(-1)[0]} vs {tB?.name?.split(' ').slice(-1)[0]}
                  </span>
                  <ChevronRight size={12} className="text-gray-600 shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
