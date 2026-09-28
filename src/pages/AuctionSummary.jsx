import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuction } from '../contexts/AuctionContext';
import { useAuth } from '../contexts/AuthContext';
import { IPL_PLAYERS } from '../data/players';
import { TEAMS } from '../data/teams';
import {
  Trophy,
  Users,
  Home,
  ChevronDown,
  Share2,
  Wifi,
  History,
  LayoutGrid,
  Zap,
  GitCompare,
  Swords
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import FantasyDashboard from '../components/fantasy/FantasyDashboard';
import { rateSquad } from '../lib/playerRating';
import DreamMatch from '../components/DreamMatch';

const AuctionSummary = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentAuction, roomTeams, loading, joinAuction } = useAuction();
  const { user } = useAuth();
  
  const [activeTab, setActiveTab] = useState('squads');
  const [expandedTeam, setExpandedTeam] = useState(null);
  const [compareTeamA, setCompareTeamA] = useState('');
  const [compareTeamB, setCompareTeamB] = useState('');


  useEffect(() => {
    if (id && user?.uid) {
      const unsub = joinAuction(id, user.uid);
      return () => unsub();
    }
  }, [id, user?.uid, joinAuction]);

  // Derived Data
  const allSoldPlayers = useMemo(() => {
    return roomTeams.flatMap(rt => 
      (rt.squad || []).map(s => {
        const pid = typeof s === 'string' ? s : s.id;
        const bidVal = typeof s === 'string' ? 0 : s.bid;
        const teamInfo = TEAMS.find(t => t.id === rt.teamId);
        const pInfo = IPL_PLAYERS.find(p => p.id === pid);
        return { 
          ...pInfo, 
          bidVal, 
          teamName: teamInfo?.name, 
          teamId: rt.teamId, 
          teamColor: teamInfo?.color,
          teamTextColor: teamInfo?.textColor
        };
      }).filter(p => p && p.id)
    ).sort((a, b) => b.bidVal - a.bidVal);
  }, [roomTeams]);

  const topPlayers = allSoldPlayers.slice(0, 5);



  if (loading || !currentAuction) {
    return (
      <div className="h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mb-8" />
        <h2 className="text-2xl font-black italic tracking-widest uppercase animate-pulse text-gray-400">Loading Summary...</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans overflow-x-hidden selection:bg-orange-500 selection:text-black">
      
      {/* Premium Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-orange-600/20 blur-[150px] rounded-full" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] bg-blue-600/10 blur-[150px] rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:12px_12px] opacity-20" />
      </div>

      <div className="relative z-10 w-full max-w-7xl mx-auto px-3 sm:px-4 py-6 sm:py-8 md:py-12">
        
        {/* Header Section */}
        <motion.header 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 sm:mb-10 space-y-3 sm:space-y-4"
        >
          {/* Top Bar with Badges + Menu Button */}
          <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-2 flex-wrap">
              
              <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full shrink-0">
                <span className="text-gray-500 text-[9px] font-black uppercase tracking-widest leading-none">ID:</span>
                <span className="text-orange-500 font-extrabold tracking-widest text-xs">{id}</span>
              </div>
            </div>

            <button 
              onClick={() => navigate('/')}
              className="px-4 sm:px-7 py-2 sm:py-3 bg-white/5 border border-white/10 rounded-xl sm:rounded-2xl hover:bg-white text-gray-300 hover:text-black font-black uppercase text-[10px] sm:text-xs tracking-wider transition-all flex items-center gap-1.5 sm:gap-2.5 active:scale-95 touch-manipulation shrink-0 ml-auto"
            >
              <Home size={14} className="sm:w-4 sm:h-4" /> Menu
            </button>
          </div>

          {/* Title */}
          <div className="text-center md:text-left pt-1">
            <h1 className="text-3xl sm:text-5xl lg:text-7xl font-black tracking-tighter uppercase leading-none drop-shadow-2xl">
              Auction <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff5500] to-[#ff8c00]">Complete</span>
            </h1>
          </div>
        </motion.header>

        {/* Tab Navigation */}
        <div className="mb-6 sm:mb-12">
          <div className="bg-white/5 backdrop-blur-3xl p-1 sm:p-1.5 rounded-2xl sm:rounded-[2rem] border border-white/10 grid grid-cols-5 sm:flex sm:justify-center gap-1 sm:gap-2 max-w-full sm:max-w-max mx-auto">
            {[
              { id: 'squads', label: 'Squads', fullLabel: 'Team Squads', icon: Users },
              { id: 'leaderboard', label: 'Top 5', fullLabel: 'Top Expensive', icon: Trophy },
              { id: 'compare', label: 'Compare', fullLabel: 'Compare Teams', icon: GitCompare },
              { id: 'dream', label: 'Match', fullLabel: 'Dream Match', icon: Swords },
              { id: 'fantasy', label: 'Fantasy', fullLabel: 'Fantasy League', icon: Zap },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-2 sm:px-6 md:px-10 py-2.5 sm:py-3.5 md:py-4 rounded-xl sm:rounded-[1.5rem] font-black uppercase text-[9px] sm:text-[10px] tracking-tight sm:tracking-[0.2em] transition-all flex items-center justify-center gap-1.5 sm:gap-3 touch-manipulation w-full sm:w-auto ${
                  activeTab === tab.id 
                    ? 'bg-[#ff5500] text-white shadow-2xl' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <tab.icon size={14} className="shrink-0 sm:w-4 sm:h-4" />
                <span className="sm:hidden">{tab.label}</span>
                <span className="hidden sm:inline">{tab.fullLabel}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content Section */}
        <AnimatePresence mode="wait">
          {activeTab === 'leaderboard' ? (
            <motion.section
              key="leaderboard"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="max-w-4xl mx-auto space-y-4 sm:space-y-6"
            >
              <div className="flex items-center gap-4 sm:gap-6 mb-6 sm:mb-10">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#ff5500] rounded-2xl flex items-center justify-center text-white shadow-2xl shrink-0">
                    <Trophy size={22} />
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter">Leaderboard</h2>
                  <p className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] sm:tracking-[0.3em]">The Most Expensive Signings</p>
                </div>
              </div>

              <div className="space-y-3 sm:space-y-4">
                {topPlayers.map((player, idx) => (
                  <motion.div
                    initial={{ opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.08 }}
                    key={player.id}
                    className="group relative bg-white/[0.03] border border-white/5 p-3.5 sm:p-6 rounded-2xl sm:rounded-[2rem] transition-all hover:bg-white/5 hover:border-orange-500/30 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 sm:gap-6"
                  >
                    <div className="flex items-center gap-3 sm:gap-8">
                      <span className="text-2xl sm:text-5xl font-black text-white/10 group-hover:text-orange-500/20 transition-colors shrink-0">#{idx + 1}</span>
                      <div className="w-12 h-12 sm:w-20 sm:h-20 bg-black/40 border border-white/10 rounded-xl sm:rounded-2xl overflow-hidden group-hover:scale-105 transition-transform duration-500 p-1 sm:p-2 shrink-0">
                        <img 
                          src={player.image} 
                          alt={player.name}
                          decoding="async"
                          loading="lazy"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(player.name || 'Player');
                          }}
                          className="w-full h-full object-cover filter drop-shadow-2xl" 
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5 sm:mb-1">
                          <h3 className="text-base sm:text-2xl font-black uppercase tracking-tight italic leading-none truncate">{player.name}</h3>
                          {player.country !== 'IND' && <Wifi size={12} className="text-purple-400 rotate-90 shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className={`px-1.5 py-0.5 rounded text-[7px] sm:text-[8px] font-black uppercase shrink-0 ${player.teamColor} ${player.teamTextColor}`}>
                            {player.teamId}
                          </div>
                          <p className="text-[8px] sm:text-[10px] font-black text-gray-500 uppercase tracking-widest truncate">
                            {player.role} • {player.teamName}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-white/5 flex sm:block items-center justify-between">
                      <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest sm:hidden">Winning Bid</p>
                      <div className="text-2xl sm:text-4xl font-black text-[#ff5500] tracking-tighter">
                        ₹{player.bidVal.toFixed(2)}<span className="text-xs ml-1 font-bold not-italic text-gray-500">Cr</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          ) : activeTab === 'compare' ? (
            <motion.section
              key="compare"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-5xl mx-auto"
            >
              <div className="flex items-center gap-4 sm:gap-6 mb-6 sm:mb-10">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#ff5500] rounded-2xl flex items-center justify-center text-white shadow-2xl shrink-0">
                  <GitCompare size={22} />
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter">Compare Teams</h2>
                  <p className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] sm:tracking-[0.3em]">Side-by-Side Squad Analysis</p>
                </div>
              </div>

              {/* Team selectors */}
              <div className="grid grid-cols-2 gap-4 mb-8">
                {[
                  { label: 'Team A', value: compareTeamA, setter: setCompareTeamA },
                  { label: 'Team B', value: compareTeamB, setter: setCompareTeamB },
                ].map(({ label, value, setter }) => (
                  <div key={label}>
                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-2">{label}</p>
                    <select
                      value={value}
                      onChange={e => setter(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm font-bold uppercase tracking-wider focus:outline-none focus:border-orange-500/50"
                    >
                      <option value="">Select team…</option>
                      {roomTeams.map(rt => {
                        const t = TEAMS.find(x => x.id === rt.teamId);
                        return <option key={rt.teamId} value={rt.teamId}>{t?.name || rt.teamId}</option>;
                      })}
                    </select>
                  </div>
                ))}
              </div>

              {/* Comparison grid */}
              {compareTeamA && compareTeamB && compareTeamA !== compareTeamB ? (() => {
                const buildStats = (teamId) => {
                  const rt = roomTeams.find(r => r.teamId === teamId);
                  const squad = (rt?.squad || []).map(s => {
                    const pid = typeof s === 'string' ? s : s.id;
                    const bid = typeof s === 'string' ? 0 : (s.bid || 0);
                    const p = IPL_PLAYERS.find(x => x.id === pid);
                    return p ? { ...p, bid } : null;
                  }).filter(Boolean);
                  const spent = squad.reduce((sum, p) => sum + (p.bid || 0), 0);
                  const rating = rateSquad(squad);
                  const overseas = squad.filter(p => p.country !== 'IND').length;
                  const roles = { Batsman: 0, Bowler: 0, 'All-Rounder': 0, 'Wicket-Keeper': 0 };
                  squad.forEach(p => { if (roles[p.role] !== undefined) roles[p.role]++; });
                  const teamInfo = TEAMS.find(t => t.id === teamId);
                  return { squad, spent, rating, overseas, roles, teamInfo, rt };
                };

                const a = buildStats(compareTeamA);
                const b = buildStats(compareTeamB);

                const StatRow = ({ label, valA, valB, higherBetter = true }) => {
                  const numA = parseFloat(valA);
                  const numB = parseFloat(valB);
                  const aWins = higherBetter ? numA > numB : numA < numB;
                  const bWins = higherBetter ? numB > numA : numB < numA;
                  return (
                    <div className="grid grid-cols-3 items-center py-3 border-b border-white/5">
                      <span className={`text-right text-sm sm:text-base font-black ${aWins ? 'text-green-400' : 'text-white'}`}>{valA}</span>
                      <span className="text-center text-[8px] font-black text-gray-500 uppercase tracking-widest px-2">{label}</span>
                      <span className={`text-left text-sm sm:text-base font-black ${bWins ? 'text-green-400' : 'text-white'}`}>{valB}</span>
                    </div>
                  );
                };

                return (
                  <div className="bg-[#0c0c0c] border border-white/5 rounded-[2rem] overflow-hidden">
                    {/* Team headers */}
                    <div className="grid grid-cols-3 bg-white/[0.02] border-b border-white/5">
                      {[a, b].map((side, i) => (
                        <div key={i} className={`flex flex-col items-center gap-2 py-4 px-3 ${i === 0 ? 'col-start-1' : 'col-start-3'}`}>
                          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 p-1.5 flex items-center justify-center">
                            {side.teamInfo?.logo
                              ? <img src={side.teamInfo.logo} alt="" className="w-full h-full object-contain" />
                              : <span className="text-lg font-black">{side.teamInfo?.name?.[0]}</span>}
                          </div>
                          <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest text-center">{side.teamInfo?.name || side.rt?.teamId}</span>
                        </div>
                      ))}
                      <div className="col-start-2 row-start-1 flex items-center justify-center">
                        <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">VS</span>
                      </div>
                    </div>

                    {/* Stats rows */}
                    <div className="px-6 py-2">
                      <StatRow label="Players" valA={a.squad.length} valB={b.squad.length} higherBetter={true} />
                      <StatRow label="Rating /10" valA={a.rating ?? '—'} valB={b.rating ?? '—'} higherBetter={true} />
                      <StatRow label="Spent (Cr)" valA={`₹${a.spent.toFixed(1)}`} valB={`₹${b.spent.toFixed(1)}`} higherBetter={false} />
                      <StatRow label="Overseas" valA={a.overseas} valB={b.overseas} higherBetter={false} />
                      <StatRow label="Batsmen" valA={a.roles['Batsman']} valB={b.roles['Batsman']} higherBetter={true} />
                      <StatRow label="Bowlers" valA={a.roles['Bowler']} valB={b.roles['Bowler']} higherBetter={true} />
                      <StatRow label="All-Rounders" valA={a.roles['All-Rounder']} valB={b.roles['All-Rounder']} higherBetter={true} />
                      <StatRow label="Keepers" valA={a.roles['Wicket-Keeper']} valB={b.roles['Wicket-Keeper']} higherBetter={false} />
                    </div>

                    {/* Player lists */}
                    <div className="grid grid-cols-2 gap-px bg-white/5">
                      {[a, b].map((side, si) => (
                        <div key={si} className="bg-[#0c0c0c] p-4 space-y-2">
                          {side.squad.map(p => (
                            <div key={p.id} className="flex items-center gap-2">
                              <img src={p.image} alt={p.name} className="w-7 h-7 rounded-lg object-cover border border-white/10 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[9px] font-black text-white truncate">{p.name}</p>
                                <p className="text-[8px] text-gray-500 font-bold">{p.role} · ₹{(p.bid||0).toFixed(1)}Cr</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })() : (
                <div className="py-24 text-center bg-[#0c0c0c] rounded-[2rem] border border-white/5 opacity-50">
                  <GitCompare size={48} className="mx-auto mb-4 text-gray-700" />
                  <p className="text-xs font-black uppercase tracking-[0.4em] text-gray-500">
                    {compareTeamA === compareTeamB && compareTeamA ? 'Pick two different teams' : 'Select two teams above to compare'}
                  </p>
                </div>
              )}
            </motion.section>
          ) : activeTab === 'dream' ? (
            <motion.section
              key="dream"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <DreamMatch roomTeams={roomTeams} currentAuction={currentAuction} />
            </motion.section>
          ) : activeTab === 'fantasy' ? (
            <motion.section
              key="fantasy"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="max-w-5xl mx-auto"
            >
              <FantasyDashboard 
                auctionId={id} 
                user={user} 
                roomTeams={roomTeams}
                currentAuction={currentAuction}
              />
            </motion.section>
          ) : (
            <motion.section
              key="squads"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              className="max-w-5xl mx-auto space-y-3 sm:space-y-4"
            >
              {TEAMS.map((t, idx) => {
                const teamDoc = roomTeams.find(doc => doc.teamId === t.id);
                const manager = currentAuction?.players?.find(p => p.team === t.id);
                const isExpanded = expandedTeam === t.id;
                
                const squad = (teamDoc?.squad || []).map(s => {
                  const pid = typeof s === 'string' ? s : s.id;
                  const bid = typeof s === 'string' ? 0 : s.bid;
                  return { ...IPL_PLAYERS.find(p => p.id === pid), bid };
                });

                if (squad.length === 0) return null;

                const osCount = squad.filter(p => p.country !== 'IND').length;
                const totalBudget = currentAuction?.settings?.budget || 120;
                const totalSpent = totalBudget - (teamDoc?.budgetRemaining || totalBudget);

                return (
                  <div key={t.id} className="group flex flex-col gap-2">
                    {/* Team Accordion Toggle */}
                    <button
                      onClick={() => setExpandedTeam(isExpanded ? null : t.id)}
                      className={`w-full flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-4 sm:p-6 rounded-2xl sm:rounded-[2.5rem] bg-[#0c0c0c] border transition-all duration-300 relative overflow-hidden group active:scale-[0.99] touch-manipulation gap-4 ${
                        isExpanded ? 'border-orange-500/50 bg-white/5 shadow-2xl' : 'border-white/5 hover:border-white/10'
                      }`}
                    >
                      {/* Massive Background Logo */}
                      <div className="absolute -right-8 -bottom-8 w-40 sm:w-64 h-40 sm:h-64 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity pointer-events-none grayscale">
                         <img src={t.logo} alt="" decoding="async" loading="lazy" className="w-full h-full object-contain" />
                      </div>

                      <div className="flex items-center gap-3 sm:gap-6 relative z-10">
                        <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-white/5 border border-white/10 p-1.5 sm:p-2 flex items-center justify-center shadow-2xl shrink-0">
                           <img src={t.logo} alt="" decoding="async" loading="lazy" className="w-full h-full object-contain" />
                        </div>
                        <div className="text-left min-w-0">
                          <h3 className="text-lg sm:text-2xl font-black uppercase tracking-tighter group-hover:text-orange-500 transition-colors truncate">{t.name}</h3>
                          <p className="text-[9px] sm:text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] sm:tracking-[0.4em] leading-none mt-1 truncate">Managed by {manager?.name || 'N/A'}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-8 relative z-10 border-t sm:border-t-0 pt-3 sm:pt-0 border-white/5">
                        {/* Summary Stats */}
                        <div className="flex items-center gap-4 sm:gap-6 md:gap-12 text-left sm:text-right sm:border-r border-white/5 sm:pr-6 md:pr-12">
                          <div>
                            <span className="block text-[7px] sm:text-[8px] font-black text-blue-500 uppercase tracking-widest mb-0.5">Players</span>
                            <span className="text-xs sm:text-lg font-black">{squad.length}</span>
                          </div>
                          <div>
                            <span className="block text-[7px] sm:text-[8px] font-black text-purple-500 uppercase tracking-widest mb-0.5">Overseas</span>
                            <span className="text-xs sm:text-lg font-black">{osCount}</span>
                          </div>
                          <div>
                            <span className="block text-[7px] sm:text-[8px] font-black text-orange-500 uppercase tracking-widest mb-0.5">Spent</span>
                            <span className="text-xs sm:text-lg font-black">₹{totalSpent.toFixed(1)}Cr</span>
                          </div>
                        </div>

                        <div className={`w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-white/5 flex items-center justify-center transition-transform duration-300 shrink-0 ${isExpanded ? 'rotate-180 bg-orange-600 text-white' : 'text-gray-500'}`}>
                          <ChevronDown size={20} />
                        </div>
                      </div>
                    </button>

                    {/* Squad Content */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden px-2 sm:px-4 md:px-8 mb-4"
                        >
                          <div className="bg-white/[0.02] border-x border-b border-white/5 rounded-b-2xl sm:rounded-b-[3rem] p-4 sm:p-8 space-y-6 sm:space-y-12">
                            {['Batsman', 'Wicket-Keeper', 'All-Rounder', 'Bowler'].map(role => {
                              const rolePlayers = squad.filter(p => p.role === role);
                              if (rolePlayers.length === 0) return null;

                              return (
                                <div key={role} className="space-y-3 sm:space-y-6">
                                  <div className="flex items-center gap-3 sm:gap-4">
                                    <h4 className="text-[9px] sm:text-[10px] font-black text-orange-500 uppercase tracking-[0.2em] sm:tracking-[0.4em]">{role}s</h4>
                                    <div className="flex-1 h-px bg-orange-500/20" />
                                    <span className="text-[9px] sm:text-[10px] font-black text-gray-600">{rolePlayers.length} Members</span>
                                  </div>
                                  
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
                                    {rolePlayers.map((p, pidx) => (
                                      <motion.div 
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: pidx * 0.04 }}
                                        key={p.id} 
                                        className="bg-white/5 border border-white/10 p-2.5 sm:p-4 rounded-2xl sm:rounded-3xl flex items-center justify-between group/p hover:bg-white/10 transition-all"
                                      >
                                        <div className="flex items-center gap-3 min-w-0">
                                          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-black/40 border border-white/10 rounded-xl p-1 shrink-0 overflow-hidden">
                                            <img 
                                              src={p.image} 
                                              alt={p.name}
                                              decoding="async"
                                              loading="lazy"
                                              onError={(e) => {
                                                e.target.onerror = null;
                                                e.target.src = 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(p.name || 'Player');
                                              }}
                                              className="w-full h-full object-cover" 
                                            />
                                          </div>
                                          <div className="overflow-hidden min-w-0">
                                            <h5 className="text-[11px] sm:text-[12px] font-black uppercase tracking-tight truncate">{p.name}</h5>
                                            <div className="flex items-center gap-1.5">
                                              <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">{p.type}</span>
                                              {p.country !== 'IND' && <Wifi size={10} className="text-purple-400 rotate-90 shrink-0" />}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <div className="text-[13px] sm:text-[14px] font-black text-green-500">₹{p.bid.toFixed(2)}Cr</div>
                                        </div>
                                      </motion.div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}

                            {/* Summary Footer for Team */}
                            <div className="pt-4 sm:pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 opacity-70 hover:opacity-100 transition-opacity">
                               <div className="flex items-center gap-3">
                                  <LayoutGrid size={14} className="text-gray-600" />
                                  <p className="text-[8px] sm:text-[9px] font-black text-gray-600 uppercase tracking-[0.3em] sm:tracking-[0.5em]">Composition Verified by Arena Engine</p>
                               </div>
                               <div className="flex gap-4">
                                  <button className="flex items-center gap-2 text-[9px] font-black uppercase text-gray-400 hover:text-orange-500 transition-colors touch-manipulation">
                                     <Share2 size={12} /> Share Squad
                                  </button>
                               </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </motion.section>
          )}
        </AnimatePresence>

        {/* Global Footer Buttons */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-12 sm:mt-20 flex flex-col items-center gap-6 sm:gap-8"
        >
          <div className="flex items-center gap-3 text-gray-600 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.3em] sm:tracking-[0.5em]">
            <History size={14} /> End of Session
          </div>
          <button 
            onClick={() => navigate('/')}
            className="group relative px-10 sm:px-16 py-4 sm:py-6 bg-white text-black font-black uppercase text-xs sm:text-sm tracking-[0.2em] sm:tracking-[0.3em] rounded-2xl sm:rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.5)] active:scale-95 transition-all overflow-hidden touch-manipulation"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-orange-600 to-orange-500 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
            <div className="relative flex items-center gap-3 sm:gap-4 group-hover:text-white transition-colors">
              <Home size={18} /> Exit to Main Menu
            </div>
          </button>
        </motion.div>

      </div>
    </div>
  );
};

export default AuctionSummary;
