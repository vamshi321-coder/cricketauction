/**
 * AISquadPanel — Phase 2
 * Shows AI-constructed squads alongside human squads.
 * Read-only. No auction data is modified.
 */
import React, { useState } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { Shield, Star, Zap, Target, Users, TrendingUp, ChevronDown, Bot } from 'lucide-react';
import { resolvePlayers, playerId } from '../lib/aiSquadBuilder.js';

const ROLE_COLOR = {
  'Batsman':       'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'Wicket-Keeper': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  'All-Rounder':   'text-green-400 bg-green-500/10 border-green-500/20',
  'Bowler':        'text-red-400 bg-red-500/10 border-red-500/20',
};

const ROLE_ABBR = {
  'Batsman': 'BAT', 'Wicket-Keeper': 'WK',
  'All-Rounder': 'AR', 'Bowler': 'BOWL',
};

const TEAM_HEX = {
  MI: '#005BA2', CSK: '#F9CD02', RCB: '#CC2121', KKR: '#3A225D',
  DC: '#2561AE', PBKS: '#ED1B24', RR: '#EA1A85', SRH: '#F7A721',
  GT: '#1B4068', LSG: '#A72B4B',
};

function RolePip({ role }) {
  const cls = ROLE_COLOR[role] || 'text-gray-400 bg-white/5 border-white/10';
  return (
    <span className={`text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md border ${cls}`}>
      {ROLE_ABBR[role] || role}
    </span>
  );
}

function PlayerRow({ player, isXI, idx }) {
  return (
    <Motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.02 }}
      className={`flex items-center gap-2.5 py-2 px-2 rounded-lg transition-all ${
        isXI ? 'bg-orange-500/5 border border-orange-500/10' : 'border border-transparent'
      }`}
    >
      <span className="text-[9px] font-black text-gray-700 w-4 shrink-0 text-right">{idx + 1}</span>
      <div className="w-7 h-7 rounded-full overflow-hidden bg-white/5 border border-white/5 shrink-0">
        {player.image
          ? <img src={player.image} alt="" className="w-full h-full object-cover object-top" />
          : <div className="w-full h-full flex items-center justify-center">
              <Users size={10} className="text-gray-600" />
            </div>
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[11px] font-bold truncate leading-none ${isXI ? 'text-white' : 'text-gray-400'}`}>
          {player.name}
        </p>
        <p className="text-[8px] text-gray-600 mt-0.5">{player.country}</p>
      </div>
      <RolePip role={player.role} />
      {isXI && (
        <span className="text-[8px] font-black text-orange-400 shrink-0">XI</span>
      )}
    </Motion.div>
  );
}

function SquadStats({ squad, playingXI }) {
  const xiSet = new Set((playingXI || []).map(playerId));
  const roles = squad.reduce((acc, p) => {
    acc[p.role] = (acc[p.role] || 0) + 1;
    return acc;
  }, {});
  const overseas = squad.filter(p => p.country !== 'IND').length;

  return (
    <div className="grid grid-cols-4 gap-2 py-3 border-b border-white/5 mb-3">
      {[
        { label: 'Total', val: squad.length },
        { label: 'XI', val: xiSet.size },
        { label: 'Overseas', val: overseas },
        { label: 'Indian', val: squad.length - overseas },
      ].map(({ label, val }) => (
        <div key={label} className="text-center">
          <p className="text-sm font-black text-white">{val}</p>
          <p className="text-[8px] text-gray-600 uppercase tracking-wider">{label}</p>
        </div>
      ))}
    </div>
  );
}

function TeamSquadCard({ team, myTeamId }) {
  const [open, setOpen] = useState(false);
  const hex = TEAM_HEX[team.teamId] || '#555';
  const xiSet = new Set((team.playingXI || []).map(playerId));
  const squadResolved = resolvePlayers(team.squad || []);
  // Sort: XI first, then by role
  const ROLE_ORDER = ['Batsman', 'Wicket-Keeper', 'All-Rounder', 'Bowler'];
  const sorted = [...squadResolved].sort((a, b) => {
    const aXI = xiSet.has(a.id) ? 0 : 1;
    const bXI = xiSet.has(b.id) ? 0 : 1;
    if (aXI !== bXI) return aXI - bXI;
    return ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
  });

  const isMe = team.teamId === myTeamId;

  return (
    <Motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border overflow-hidden"
      style={{ borderColor: open ? `${hex}40` : 'rgba(255,255,255,0.05)' }}
    >
      {/* Top accent */}
      <div className="h-0.5" style={{ background: open ? hex : 'transparent', transition: 'background 0.2s' }} />

      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 p-3.5 bg-[#0a0a0a] hover:bg-white/[0.02] transition-all text-left"
      >
        {/* Logo */}
        <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/5 p-1 flex items-center justify-center shrink-0">
          {team.logo
            ? <img src={team.logo} alt="" className="w-full h-full object-contain" />
            : <Shield size={14} className="text-gray-600" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-black text-white uppercase">{team.teamId}</span>

            {isMe && (
              <span className="text-[8px] font-black text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded-md">
                YOU
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[9px] text-gray-600">
              {(team.squad || []).length} players · XI {(team.playingXI || []).length}/11
            </span>
            {team.rating !== null && team.rating !== undefined && (
              <span className="text-[9px] text-orange-400 font-bold">⭐ {team.rating}/10</span>
            )}
          </div>
        </div>

        {/* Ready badge */}
        <div className={`w-2 h-2 rounded-full shrink-0 ${team.ready ? 'bg-green-400' : 'bg-amber-400'}`} />
        <ChevronDown
          size={14}
          className={`text-gray-600 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <Motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-4 bg-[#080808]">
              {team.issues?.length > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3 mb-3">
                  {team.issues.map(i => (
                    <p key={i} className="text-[9px] text-amber-400">⚠ {i}</p>
                  ))}
                </div>
              )}

              <SquadStats squad={squadResolved} playingXI={team.playingXI} />

              {/* Role breakdown bar */}
              <div className="flex gap-1 mb-4 h-1.5 rounded-full overflow-hidden">
                {['Batsman', 'Wicket-Keeper', 'All-Rounder', 'Bowler'].map(role => {
                  const count = squadResolved.filter(p => p.role === role).length;
                  const pct = squadResolved.length ? (count / squadResolved.length) * 100 : 0;
                  const colors = {
                    'Batsman': 'bg-blue-500',
                    'Wicket-Keeper': 'bg-yellow-500',
                    'All-Rounder': 'bg-green-500',
                    'Bowler': 'bg-red-500',
                  };
                  return <div key={role} className={colors[role]} style={{ width: `${pct}%` }} />;
                })}
              </div>

              {/* Player list */}
              <div className="space-y-0.5">
                {sorted.map((p, i) => (
                  <PlayerRow
                    key={p.id}
                    player={p}
                    isXI={xiSet.has(p.id)}
                    idx={i}
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

export default function AISquadPanel({ tournament, myTeamId }) {
  const [filter, setFilter] = useState('all'); // 'all' | 'human' | 'ai'
  const teams = tournament?.teams || [];
  const filtered = teams.filter(t =>
    filter === 'all' ? true :
    filter === 'human' ? t.isHuman :
    t.isAI
  );
  const readyCount = teams.filter(t => t.ready).length;
  const humanCount = teams.filter(t => t.isHuman).length;
  const aiCount = teams.filter(t => t.isAI).length;

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Total Teams', val: teams.length, icon: Users, color: 'text-gray-400' },
          { label: 'Human Teams', val: humanCount, icon: Target, color: 'text-green-400' },
          { label: 'AI Teams', val: aiCount, icon: Bot, color: 'text-blue-400' },
        ].map(({ label, val, icon: Icon, color }) => (
          <div key={label} className="bg-[#0a0a0a] border border-white/5 rounded-xl p-3 text-center">
            <Icon size={14} className={`${color} mx-auto mb-1`} />
            <p className="text-lg font-black text-white">{val}</p>
            <p className="text-[8px] text-gray-600 uppercase tracking-wider">{label}</p>
          </div>
        ))}
      </div>

      {/* Readiness bar */}
      <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Tournament Readiness</span>
          <span className={`text-[9px] font-black ${readyCount === 10 ? 'text-green-400' : 'text-amber-400'}`}>
            {readyCount}/10 Ready
          </span>
        </div>
        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
          <Motion.div
            className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${(readyCount / 10) * 100}%` }}
            transition={{ duration: 0.6 }}
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-white/[0.03] border border-white/5 rounded-xl p-1">
        {[
          { id: 'all', label: 'All 10' },
          { id: 'human', label: `Human (${humanCount})` },
          { id: 'ai', label: `AI (${aiCount})` },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
              filter === tab.id ? 'bg-white/10 text-white' : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {[
          { color: 'bg-blue-500', label: 'Batsman' },
          { color: 'bg-yellow-500', label: 'WK' },
          { color: 'bg-green-500', label: 'All-Rounder' },
          { color: 'bg-red-500', label: 'Bowler' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${color}`} />
            <span className="text-[9px] text-gray-600">{label}</span>
          </div>
        ))}
      </div>

      {/* Team cards */}
      <div className="space-y-2">
        {filtered.map(team => (
          <TeamSquadCard
            key={team.teamId}
            team={team}
            myTeamId={myTeamId}
          />
        ))}
      </div>

      {/* AI pool note */}
      {(filter === 'ai' || filter === 'all') && (
        <div className="bg-blue-500/[0.04] border border-blue-500/10 rounded-xl p-4">
          <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">AI Pool Rule</p>
          <p className="text-[10px] text-gray-500 leading-relaxed">
            AI teams are built from the available player pool after all human auction purchases.
            A small reserved subset of Set 2 & Set 3 players is AI-only and cannot be purchased by humans.
            Human-owned players are never moved to or shared with AI teams.
          </p>
        </div>
      )}
    </div>
  );
}
