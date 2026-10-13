import React, { useState, useEffect, useMemo } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import {
  Trophy, Lock, Shield, Users, Target, ChevronRight,
  CheckCircle2, Swords, Star, MapPin, Zap, Calendar,
  ArrowRight, Clock, Crown, TrendingUp
} from 'lucide-react';
import { ref, onValue } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { resolvePlayers, playerId } from '../lib/aiSquadBuilder.js';
import { buildTournamentTeams } from '../lib/tournamentTeams.js';
import { groupFixturesByMatchday, getPlayoffPath } from '../lib/tournamentModel.js';
import TournamentSeason from './TournamentSeason';
import DreamMatch from './DreamMatch';
import AISquadPanel from './AISquadPanel';

// ── Team hex colors for subtle accents ─────────────────────────────────────
const TEAM_HEX = {
  MI: '#005BA2', CSK: '#F9CD02', RCB: '#CC2121', KKR: '#3A225D',
  DC: '#2561AE', PBKS: '#ED1B24', RR: '#EA1A85', SRH: '#F7A721',
  GT: '#1B4068', LSG: '#A72B4B',
};
const teamHex = (id) => TEAM_HEX[id] || '#555';

// ── Stage progress dots ─────────────────────────────────────────────────────
const TOTAL_MATCHDAYS = 9;

// ── Sub-components ──────────────────────────────────────────────────────────

function TeamLogo({ teamId, logo, size = 32 }) {
  return logo
    ? <img src={logo} alt={teamId} style={{ width: size, height: size }} className="object-contain" />
    : <Shield size={size * 0.6} className="text-gray-600" />;
}

function FixtureCard({ fixture, myTeamId, teams, isHero = false }) {
  const tA = teams.find(t => t.id === fixture.teamA || t.teamId === fixture.teamA);
  const tB = teams.find(t => t.id === fixture.teamB || t.teamId === fixture.teamB);
  const isMyMatch = fixture.teamA === myTeamId || fixture.teamB === myTeamId;
  const hexA = teamHex(fixture.teamA);
  const hexB = teamHex(fixture.teamB);

  if (isHero) {
    return (
      <Motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative rounded-2xl overflow-hidden border border-white/10"
        style={{
          background: `linear-gradient(135deg, ${hexA}22 0%, #0a0a0a 45%, #0a0a0a 55%, ${hexB}22 100%)`,
        }}
      >
        {/* Glow line at top */}
        <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${hexA}, ${hexB})` }} />
        <div className="p-5 sm:p-6">
          <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
            <Star size={9} fill="currentColor" /> Your Match
          </p>
          <div className="flex items-center justify-between gap-3">
            {/* Team A */}
            <div className="flex-1 flex flex-col items-center gap-2 text-center">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-white/5 border border-white/10 p-2 flex items-center justify-center">
                <TeamLogo teamId={fixture.teamA} logo={tA?.logo} size={44} />
              </div>
              <span className="text-xs font-black text-white uppercase">{fixture.teamA}</span>
              <span className="text-[9px] text-gray-500 font-bold">{tA?.name?.split(' ').slice(-1)[0]}</span>
            </div>

            {/* VS */}
            <div className="flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                <span className="text-[10px] font-black text-gray-400">VS</span>
              </div>
              <span className="text-[8px] text-gray-600 uppercase tracking-widest">T20</span>
            </div>

            {/* Team B */}
            <div className="flex-1 flex flex-col items-center gap-2 text-center">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-white/5 border border-white/10 p-2 flex items-center justify-center">
                <TeamLogo teamId={fixture.teamB} logo={tB?.logo} size={44} />
              </div>
              <span className="text-xs font-black text-white uppercase">{fixture.teamB}</span>
              <span className="text-[9px] text-gray-500 font-bold">{tB?.name?.split(' ').slice(-1)[0]}</span>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <div className="flex-1 h-px bg-white/5" />
            <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest">{fixture.status === 'simulated' ? (fixture.winner ? `${fixture.winner} won` : 'Tied') : 'Scheduled'}</span>
            <div className="flex-1 h-px bg-white/5" />
          </div>
        </div>
      </Motion.div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/10 transition-all">
      <div className="w-6 h-6 flex items-center justify-center">
        <TeamLogo teamId={fixture.teamA} logo={tA?.logo} size={22} />
      </div>
      <span className="text-[10px] font-black text-gray-400 uppercase">{fixture.teamA}</span>
      <span className="text-[9px] text-gray-600 mx-auto">vs</span>
      <span className="text-[10px] font-black text-gray-400 uppercase">{fixture.teamB}</span>
      <div className="w-6 h-6 flex items-center justify-center">
        <TeamLogo teamId={fixture.teamB} logo={tB?.logo} size={22} />
      </div>
      <span className="text-[8px] font-black text-blue-400/70 ml-auto uppercase tracking-wide">AI</span>
    </div>
  );
}

function MatchdayCard({ matchday, fixtures, myTeamId, teams, isCurrent, isCompleted, isLocked }) {
  const [expanded, setExpanded] = useState(isCurrent);
  useEffect(() => { if (isCurrent) setExpanded(true); }, [isCurrent]);
  const myFixture = fixtures.find(f => f.teamA === myTeamId || f.teamB === myTeamId);
  const otherFixtures = fixtures.filter(f => f !== myFixture);

  return (
    <Motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={`rounded-2xl border transition-all ${
        isCurrent
          ? 'border-orange-500/30 bg-gradient-to-br from-orange-500/5 to-transparent'
          : isCompleted
          ? 'border-green-500/20 bg-green-500/[0.02]'
          : 'border-white/5 bg-white/[0.015]'
      }`}
    >
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        {/* Status dot */}
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
          isCompleted ? 'bg-green-400' :
          isCurrent ? 'bg-orange-400 shadow-[0_0_8px_#f97316]' :
          'bg-gray-700'
        }`} />

        <span className={`text-xs font-black uppercase tracking-widest flex-1 ${
          isCurrent ? 'text-orange-400' :
          isCompleted ? 'text-green-400' :
          isLocked ? 'text-gray-600' : 'text-gray-400'
        }`}>
          Matchday {matchday}
        </span>

        {isCurrent && (
          <span className="text-[8px] font-black bg-orange-500 text-black px-2 py-0.5 rounded-full uppercase tracking-wider">
            Active
          </span>
        )}
        {isCompleted && (
          <CheckCircle2 size={13} className="text-green-400" />
        )}
        {isLocked && !isCurrent && !isCompleted && (
          <Lock size={11} className="text-gray-700" />
        )}

        <ChevronRight
          size={13}
          className={`text-gray-600 transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`}
        />
      </button>

      <AnimatePresence>
        {expanded && (
          <Motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-2">
              {myFixture && (
                <FixtureCard
                  fixture={myFixture}
                  myTeamId={myTeamId}
                  teams={teams}
                  isHero={true}
                />
              )}
              <div className="space-y-1 mt-1">
                {otherFixtures.map(f => (
                  <FixtureCard
                    key={f.fixtureId}
                    fixture={f}
                    myTeamId={myTeamId}
                    teams={teams}
                  />
                ))}
              </div>
            </div>
          </Motion.div>
        )}
      </AnimatePresence>
    </Motion.div>
  );
}

function PlayoffPath({ season }) {
  const nodes = [
    {
      id: 'q1',
      label: 'Qualifier 1',
      sub: '1st vs 2nd',
      note: 'Winner → Final',
      side: 'top',
      locked: true,
    },
    {
      id: 'elim',
      label: 'Eliminator',
      sub: '3rd vs 4th',
      note: 'Loser eliminated',
      side: 'bottom',
      locked: true,
    },
    {
      id: 'q2',
      label: 'Qualifier 2',
      sub: 'Q1 loser vs Elim winner',
      note: 'Winner → Final',
      side: 'center',
      locked: true,
    },
    {
      id: 'final',
      label: 'FINAL',
      sub: 'Q1 winner vs Q2 winner',
      note: '🏆 Champion',
      side: 'center',
      locked: true,
      isFinal: true,
    },
  ];

  return (
    <div className="space-y-2">
      {/* Top pair */}
      <div className="grid grid-cols-2 gap-2">
        {nodes.slice(0, 2).map((node, i) => (
          <Motion.div
            key={node.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="relative rounded-xl border border-white/5 bg-white/[0.015] p-3 text-center"
          >
            <div className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-2">
              <Lock size={10} className="text-gray-600" />
            </div>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide">{node.label}</p>
            <p className="text-[9px] text-gray-700 mt-0.5">{node.sub}</p>
            <p className="text-[9px] text-gray-600 mt-1">{node.note}</p>
          </Motion.div>
        ))}
      </div>

      {/* Arrow */}
      <div className="flex justify-center">
        <div className="flex flex-col items-center gap-0.5">
          <div className="w-px h-3 bg-white/10" />
          <ArrowRight size={12} className="text-gray-700 rotate-90" />
        </div>
      </div>

      {/* Q2 */}
      <Motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.14 }}
        className="rounded-xl border border-white/5 bg-white/[0.015] p-3 text-center"
      >
        <div className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-2">
          <Lock size={10} className="text-gray-600" />
        </div>
        <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide">{nodes[2].label}</p>
        <p className="text-[9px] text-gray-700 mt-0.5">{nodes[2].sub}</p>
        <p className="text-[9px] text-gray-600 mt-1">{nodes[2].note}</p>
      </Motion.div>

      {/* Arrow */}
      <div className="flex justify-center">
        <div className="flex flex-col items-center gap-0.5">
          <div className="w-px h-3 bg-white/10" />
          <ArrowRight size={12} className="text-gray-700 rotate-90" />
        </div>
      </div>

      {/* Final */}
      <Motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.21 }}
        className="rounded-xl border border-yellow-500/10 bg-yellow-500/[0.03] p-4 text-center relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-yellow-500/[0.04] to-transparent pointer-events-none" />
        <div className="relative z-10">
          <div className="w-9 h-9 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center mx-auto mb-2">
            <Crown size={14} className="text-yellow-500/50" />
          </div>
          <p className="text-xs font-black text-yellow-500/60 uppercase tracking-widest">{nodes[3].label}</p>
          <p className="text-[9px] text-gray-600 mt-0.5">{nodes[3].sub}</p>
          <p className="text-[9px] text-yellow-600/60 mt-1">{nodes[3].note}</p>
        </div>
      </Motion.div>
    </div>
  );
}

function TournamentProgress({ currentMatchday, stage }) {
  const isLeague = stage === 'league' || stage === 'not_started';
  const isPlayoffs = !isLeague;

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest w-12">MD {currentMatchday}</span>
        <div className="flex-1 flex gap-1">
          {Array.from({ length: TOTAL_MATCHDAYS }).map((_, i) => {
            const md = i + 1;
            const done = isPlayoffs || md < currentMatchday;
            const active = !isPlayoffs && md === currentMatchday;
            return (
              <Motion.div
                key={md}
                className={`flex-1 h-1.5 rounded-full ${
                  done ? 'bg-green-500' :
                  active ? 'bg-orange-500' :
                  'bg-white/5'
                }`}
                initial={active ? { scaleX: 0 } : false}
                animate={active ? { scaleX: 1 } : {}}
                transition={{ duration: 0.4 }}
              />
            );
          })}
        </div>
        <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest w-10 text-right">
          {isPlayoffs ? '🏆' : `${currentMatchday}/${TOTAL_MATCHDAYS}`}
        </span>
      </div>
      <div className="flex justify-between px-0.5">
        <span className="text-[8px] text-gray-700">League Stage</span>
        <span className="text-[8px] text-gray-700">Playoffs</span>
      </div>
    </div>
  );
}

// ── XI GATE ─────────────────────────────────────────────────────────────────
function XIGate({ xiCount, squadCount, issues, loading, error }) {
  return (
    <div className="max-w-xl mx-auto py-10 sm:py-16">
      <Motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative bg-[#0c0c0c] border border-white/10 rounded-[2rem] p-8 sm:p-10 text-center overflow-hidden"
      >
        {/* BG glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-red-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-orange-500/3 via-transparent to-transparent pointer-events-none" />

        <div className="relative z-10">
          {/* Lock icon with pulse */}
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full bg-red-500/10 animate-ping opacity-30" />
            <div className="relative w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Lock size={28} className="text-gray-500" />
            </div>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white mb-1">
            Dream Match
          </h2>
          <p className="text-[10px] font-black text-red-400 uppercase tracking-[0.3em] mb-8">🔒 Locked</p>

          {/* Progress ring */}
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="flex flex-col items-center gap-1">
              <div className="text-2xl font-black text-white">{xiCount}</div>
              <div className="text-[8px] text-gray-600 uppercase tracking-widest">Selected</div>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: 11 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-6 rounded-full ${i < xiCount ? 'bg-orange-500' : 'bg-white/5'}`}
                />
              ))}
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="text-2xl font-black text-gray-600">11</div>
              <div className="text-[8px] text-gray-600 uppercase tracking-widest">Required</div>
            </div>
          </div>

          <p className="text-sm text-gray-400 leading-relaxed mb-2">
            Select your Playing XI before entering Dream Match.
          </p>
          <p className="text-xs text-gray-600 mb-6">
            {error || (loading ? 'Loading your saved XI…' : `${xiCount}/11 players selected · Squad: ${squadCount} players`)}
          </p>

          {issues?.length > 0 && (
            <ul className="text-xs text-amber-400 space-y-1 mb-5 text-left bg-amber-500/5 border border-amber-500/10 rounded-xl p-3">
              {issues.map(issue => <li key={issue} className="flex items-start gap-2"><span className="mt-0.5">⚠</span>{issue}</li>)}
            </ul>
          )}

          <button
            onClick={() => {
              const el = document.querySelector('[data-tab="fantasy"]');
              if (el) el.click();
            }}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-black text-sm uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2"
          >
            <Users size={15} />
            Select Playing XI
          </button>
        </div>
      </Motion.div>
    </div>
  );
}

// ── Main export ─────────────────────────────────────────────────────────────
export default function TournamentHub({ auctionId, user, roomTeams, currentAuction }) {
  const [snapshot, setSnapshot] = useState({ auctionId: null, squads: {}, error: '' });
  const [seasonSnapshot, setSeasonSnapshot] = useState({ auctionId:null, season:null, loaded:false, error:'' });
  useEffect(() => {
    if (!auctionId || !user?.uid) return;
    return onValue(ref(rtdb, `auctions/${auctionId}/room/dreamTournamentV3`),
      snap => setSeasonSnapshot({ auctionId, season:snap.val(), loaded:true, error:'' }),
      () => setSeasonSnapshot({ auctionId, season:null, loaded:true, error:'Unable to load tournament fixtures.' }));
  }, [auctionId, user?.uid]);
  const season = seasonSnapshot.auctionId === auctionId ? seasonSnapshot.season : null;
  const [showSimulator, setShowSimulator] = useState(false);
  const [activeTab, setActiveTab] = useState('hub'); // 'hub' | 'season' | 'squads'

  useEffect(() => {
    if (!auctionId || !user?.uid) return;
    return onValue(ref(rtdb, `auctions/${auctionId}/userSquads`), snap => {
      setSnapshot({ auctionId, squads: snap.val() || {}, error: '' });
    }, () => {
      setSnapshot({ auctionId, squads: {}, error: 'Unable to load saved Playing XIs.' });
    });
  }, [auctionId, user?.uid]);

  const squadsLoaded = snapshot.auctionId === auctionId && !snapshot.error;

  const tournament = useMemo(() => buildTournamentTeams({
    roomTeams,
    auctionPlayers: currentAuction?.players,
    userSquads: snapshot.auctionId === auctionId ? snapshot.squads : {},
  }), [roomTeams, currentAuction?.players, snapshot, auctionId]);

  const myTeam = tournament.teams.find(t => t.isHuman && t.userId === user?.uid);
  const squadCount = myTeam?.squad?.length || 0;
  const xiCount = myTeam?.playingXI?.length || 0;
  const xiReady = squadsLoaded && myTeam?.ready;
  const teamRating = myTeam?.rating ?? null;
  const myTeamId = myTeam?.teamId || myTeam?.id;

  // The saved season is the only fixture source, shared with Season and the arena.
  const allFixtures = useMemo(() => (season?.fixtures || []).filter(f => f.stage === 'league'), [season]);
  const fixturesByMatchday = useMemo(() => groupFixturesByMatchday(allFixtures), [allFixtures]);
  const currentMatchday = season?.currentMatchday || 1;
  const stage = season?.stage || 'not_started';

  // ── XI Gate ───────────────────────────────────────────────────────────────
  if (!xiReady) {
    return (
      <XIGate
        xiCount={xiCount}
        squadCount={squadCount}
        issues={myTeam?.issues}
        loading={!squadsLoaded}
        error={snapshot.error}
      />
    );
  }

  const TABS = [
    { id: 'hub', label: 'Hub' },
    { id: 'season', label: 'Season' },
    { id: 'squads', label: 'Squads' },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-24">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <Motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4"
      >
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-2xl shrink-0">
          <Trophy size={22} className="text-white" />
        </div>
        <div>
          <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter italic">
            Dream <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-500">Match</span>
          </h2>
          <p className="text-[9px] font-black text-gray-500 uppercase tracking-[0.3em]">
            Season 1 · T20 Tournament
          </p>
        </div>
      </Motion.div>

      {/* ── MY TEAM CARD ───────────────────────────────────────────────────── */}
      <Motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="relative rounded-[1.5rem] border border-white/10 overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${teamHex(myTeamId)}18 0%, #0a0a0a 60%)`,
        }}
      >
        {/* Team color accent line */}
        <div className="h-0.5" style={{ background: teamHex(myTeamId) }} />

        <div className="p-5 sm:p-6 flex items-center gap-4">
          <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-xl bg-black/30 border border-white/10 p-2 flex items-center justify-center shrink-0">
            {myTeam?.logo
              ? <img src={myTeam.logo} alt="" className="w-full h-full object-contain" />
              : <Shield size={26} className="text-gray-600" />}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Your Team</p>
            <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight text-white truncate">
              {myTeam?.name || myTeamId}
            </h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
              <span className="text-[9px] font-bold text-gray-500">
                Squad <span className="text-white">{squadCount}</span>
              </span>
              <span className="text-[9px] font-bold text-gray-500 flex items-center gap-1">
                XI <span className="text-green-400">11/11</span>
                <CheckCircle2 size={9} className="text-green-400" />
              </span>
              {teamRating !== null && (
                <span className="text-[9px] font-bold text-gray-500">
                  Rating <span className="text-orange-400">{teamRating}/10</span>
                </span>
              )}
            </div>
          </div>

          <button
            onClick={() => {
              const el = document.querySelector('[data-tab="fantasy"]');
              if (el) el.click();
            }}
            className="shrink-0 flex flex-col items-center gap-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-white hover:border-white/20 transition-all"
          >
            <Users size={14} />
            <span className="text-[8px] font-black uppercase tracking-wider">Edit XI</span>
          </button>
        </div>
      </Motion.div>

      {/* ── TABS ───────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-white/[0.03] border border-white/5 rounded-2xl p-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === tab.id
                ? 'bg-white/10 text-white'
                : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── HUB TAB ────────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeTab === 'hub' && (
          <Motion.div
            key="hub"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-5"
          >
            {/* Tournament Progress */}
            <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tournament Progress</h3>
                <span className="text-[9px] font-black text-orange-400 uppercase">{stage === 'not_started' ? 'Not started' : stage === 'league' ? 'League Stage' : stage}</span>
              </div>
              {season ? <TournamentProgress currentMatchday={currentMatchday} stage={stage} /> : <p className="text-xs text-gray-400">{seasonSnapshot.error || (!seasonSnapshot.loaded ? 'Loading fixtures…' : 'Start the tournament in Season to see the confirmed fixtures.')}</p>}
            </div>

            {/* Matchdays */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Calendar size={11} /> League Stage
                </h3>
                <span className="text-[9px] text-gray-600">{Object.keys(fixturesByMatchday).length} matchdays</span>
              </div>

              {Object.entries(fixturesByMatchday).map(([md, fixtures], i) => {
                const mdNum = parseInt(md);
                const isCurrent = stage === 'league' && mdNum === currentMatchday;
                const isCompleted = fixtures.every(f => f.status === 'simulated');
                const isLocked = mdNum > currentMatchday;
                return (
                  <MatchdayCard
                    key={md}
                    matchday={mdNum}
                    fixtures={fixtures}
                    myTeamId={myTeamId}
                    teams={tournament.teams}
                    isCurrent={isCurrent}
                    isCompleted={isCompleted}
                    isLocked={isLocked}
                  />
                );
              })}
            </div>

            {/* Playoff Path */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Trophy size={11} /> Playoffs
                </h3>
                <div className="flex-1 h-px bg-white/5" />
                <Lock size={10} className="text-gray-700" />
                <span className="text-[8px] text-gray-700 uppercase tracking-wider">After Matchday 9</span>
              </div>
              {(season?.fixtures || []).filter(f => f.stage !== 'league').length ?
                season.fixtures.filter(f => f.stage !== 'league').map(f => <div key={f.fixtureId}><p className="text-xs text-gray-400 mb-2 capitalize">{f.stage}</p><FixtureCard fixture={f} myTeamId={myTeamId} teams={tournament.teams} isHero /></div>) : <PlayoffPath /> }
            </div>

            {/* Practice match */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => setShowSimulator(v => !v)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black text-gray-400 hover:text-white hover:border-white/20 transition-all uppercase tracking-widest"
              >
                <Swords size={12} /> Practice Match
              </button>
              <p className="text-[9px] text-gray-600">Results don't count in tournament.</p>
            </div>

            <AnimatePresence>
              {showSimulator && (
                <Motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-2">
                    <DreamMatch roomTeams={roomTeams} currentAuction={currentAuction} />
                  </div>
                </Motion.div>
              )}
            </AnimatePresence>
          </Motion.div>
        )}

        {/* ── SEASON TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'season' && (
          <Motion.div
            key="season"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <TournamentSeason
              key={auctionId}
              auctionId={auctionId}
              user={user}
              tournament={tournament}
              currentAuction={currentAuction}
            />
          </Motion.div>
        )}

        {/* ── SQUADS TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'squads' && (
          <Motion.div
            key="squads"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <AISquadPanel tournament={tournament} myTeamId={myTeamId} />
          </Motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
