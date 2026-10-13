import React, { useState, useEffect, useMemo } from 'react';
import { 
  Trophy, 
  Users, 
  BarChart3,
  AlertCircle,
  Shield
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, rtdb } from '../../lib/firebase';
import { ref, onValue, update as updateRtdb, set as setRtdb, get as getRtdb } from 'firebase/database';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useQuota } from '../../contexts/QuotaContext';

let cachedPlayerPoints = null;
let cachedPlayerStats = null;

import { IPL_PLAYERS } from '../../data/players';
import { TEAMS } from '../../data/teams';
import { rateSquad } from '../../lib/playerRating';
import SquadSelector from './SquadSelector';
import SquadPreview from './SquadPreview';

// Resolve an array of player ids/objects (from squad or Play XI data,
// which may store either raw id strings or {id, bid} objects) into full
// IPL_PLAYERS entries so the rating engine can read their stats.
function resolvePlayers(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(entry => {
      const pid = typeof entry === 'string' ? entry : (entry?.id || entry);
      return IPL_PLAYERS.find(p => p.id === pid) || null;
    })
    .filter(Boolean);
}

const FantasyDashboard = ({ auctionId, user, roomTeams = [], currentAuction }) => {
  const [activeSubTab, setActiveSubTab] = useState('squad');
  const [userSquad, setUserSquad] = useState(null);
  const [allSquads, setAllSquads] = useState([]);
  const [playerPoints, setPlayerPoints] = useState({});
  const [playerStats, setPlayerStats] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Current user's team doc from roomTeams
  const userTeamDoc = useMemo(() => {
    if (!user?.uid) return null;
    return roomTeams.find(rt => 
      rt.userId === user.uid || 
      rt.id === `${auctionId}_${user.uid}` ||
      (currentAuction?.players || []).some(p => (p.uid === user.uid || p.id === user.uid) && p.team === rt.teamId)
    );
  }, [roomTeams, user, auctionId, currentAuction]);

  // Owned players for squad selection
  const ownedPlayers = useMemo(() => {
    if (!userTeamDoc || !userTeamDoc.squad) return [];
    return userTeamDoc.squad.map(s => {
      const pid = typeof s === 'string' ? s : (s?.id || s);
      const bidVal = typeof s === 'string' ? 0 : (s?.bid || 0);
      const pInfo = IPL_PLAYERS.find(p => p.id === pid);
      return pInfo ? { ...pInfo, bid: bidVal, teamId: userTeamDoc.teamId } : null;
    }).filter(p => !!p && !!p.id);
  }, [userTeamDoc]);


  // LEADERBOARD: rates each participant's existing saved Play XI (from the
  // existing "Select Play XI" system / allSquads) using the static player
  // stats already in IPL_PLAYERS. No manually-entered fantasy points needed.
  // Works correctly with fewer than 11 selected players (never shows 0
  // just because the XI is short) and never touches Play XI data itself.
  const calculatedLeaderboard = useMemo(() => {
    const auctionPlayers = currentAuction?.players || [];

    return allSquads.map(squad => {
      const { userId, userName, teamId, players = [] } = squad;

      const normalizedIds = players.map(p => typeof p === 'string' ? p : (p?.id || p));
      const resolved = resolvePlayers(normalizedIds);
      const rating = rateSquad(resolved); // null if no players selected

      // Resolve manager name from multiple sources
      const auctionPlayer = auctionPlayers.find(p => p.uid === userId || p.team === teamId);
      const resolvedName = auctionPlayer?.name || userName || (userId === user?.uid ? (user.displayName || 'You') : 'Manager');

      // Resolve franchise info
      const teamInfo = TEAMS.find(t => t.id === teamId);

      return {
        userId,
        userName: resolvedName,
        teamId,
        teamName: teamInfo?.name || teamId,
        teamLogo: teamInfo?.logo || null,
        rating, // number 0-10, or null when no Play XI players selected
        playerCount: normalizedIds.length,
      };
    }).sort((a, b) => {
      if (a.rating === null && b.rating === null) return 0;
      if (a.rating === null) return 1;
      if (b.rating === null) return -1;
      return b.rating - a.rating;
    });
  }, [allSquads, currentAuction, user]);

  // BEST TEAM: rates each participant's COMPLETE auction squad (every
  // player they won, from roomTeams[].squad), independent of Play XI
  // selection or manually-entered fantasy points. Works correctly with
  // any squad size (1, 5, 8, 11+ players) and never shows 0 just because
  // the squad is small.
  const bestTeamRankings = useMemo(() => {
    const auctionPlayers = currentAuction?.players || [];

    return (roomTeams || [])
      .filter(rt => rt && rt.teamId)
      .map(rt => {
        const resolved = resolvePlayers(rt.squad || []);
        const rating = rateSquad(resolved); // null if squad is empty

        const auctionPlayer = auctionPlayers.find(p => p.uid === rt.userId || p.team === rt.teamId);
        const resolvedName = auctionPlayer?.name || rt.userName || (rt.userId === user?.uid ? (user.displayName || 'You') : 'Manager');

        const teamInfo = TEAMS.find(t => t.id === rt.teamId);

        return {
          userId: rt.userId,
          userName: resolvedName,
          teamId: rt.teamId,
          teamName: teamInfo?.name || rt.teamId,
          teamLogo: teamInfo?.logo || null,
          rating,
          playerCount: (rt.squad || []).length,
        };
      })
      .sort((a, b) => {
        if (a.rating === null && b.rating === null) return 0;
        if (a.rating === null) return 1;
        if (b.rating === null) return -1;
        return b.rating - a.rating;
      });
  }, [roomTeams, currentAuction, user]);

 
  const { handleFirebaseError } = useQuota();

  useEffect(() => {
    if (!auctionId || !user?.uid) return;

    // Legacy Scanner for squads saved previously in Firestore or alternative RTDB paths
    const scanLegacySquads = async () => {
      try {
        // 1. Check Firestore fantasySquads collection
        const q1 = query(collection(db, 'fantasySquads'), where('auctionId', '==', auctionId));
        const snap1 = await getDocs(q1);
        if (!snap1.empty) {
          const legacySquads = {};
          snap1.docs.forEach(docSnap => {
            const data = docSnap.data();
            const uId = data.userId || docSnap.id.replace(`${auctionId}_`, '');
            if (data.players?.length) {
              legacySquads[uId] = data;
              setRtdb(ref(rtdb, `auctions/${auctionId}/userSquads/${uId}`), data).catch(() => {});
            }
          });
          if (legacySquads[user.uid]) {
            setUserSquad(legacySquads[user.uid]);
            setIsEditing(false);
          }
          setAllSquads(Object.entries(legacySquads).map(([uid, squad]) => ({ id: `${auctionId}_${uid}`, ...squad })));
          return;
        }

        // 2. Check Firestore userSquads collection
        const q2 = query(collection(db, 'userSquads'), where('auctionId', '==', auctionId));
        const snap2 = await getDocs(q2);
        if (!snap2.empty) {
          const legacySquads = {};
          snap2.docs.forEach(docSnap => {
            const data = docSnap.data();
            const uId = data.userId || docSnap.id.replace(`${auctionId}_`, '');
            if (data.players?.length) {
              legacySquads[uId] = data;
              setRtdb(ref(rtdb, `auctions/${auctionId}/userSquads/${uId}`), data).catch(() => {});
            }
          });
          if (legacySquads[user.uid]) {
            setUserSquad(legacySquads[user.uid]);
            setIsEditing(false);
          }
          setAllSquads(Object.entries(legacySquads).map(([uid, squad]) => ({ id: `${auctionId}_${uid}`, ...squad })));
          return;
        }

        // 3. Check legacy RTDB paths
        const legacyRtdbRef = ref(rtdb, `userSquads/${auctionId}`);
        const legacyRtdbSnap = await getRtdb(legacyRtdbRef);
        if (legacyRtdbSnap.exists()) {
          const val = legacyRtdbSnap.val();
          const legacySquads = {};
          Object.entries(val).forEach(([uId, squad]) => {
            if (squad?.players?.length) {
              legacySquads[uId] = squad;
              setRtdb(ref(rtdb, `auctions/${auctionId}/userSquads/${uId}`), squad).catch(() => {});
            }
          });
          if (legacySquads[user.uid]) {
            setUserSquad(legacySquads[user.uid]);
            setIsEditing(false);
          }
          setAllSquads(Object.entries(legacySquads).map(([uid, squad]) => ({ id: `${auctionId}_${uid}`, ...squad })));
        }
      } catch (e) {
        // Non-blocking legacy scan
      }
    };

    // 1. Current user's own squad (from RTDB)
    const mySquadRef = ref(rtdb, `auctions/${auctionId}/userSquads/${user.uid}`);
    const unsubMySquad = onValue(mySquadRef, (snap) => {
      if (snap.exists() && snap.val()?.players?.length > 0) {
        setUserSquad(snap.val());
        setIsEditing(false);
      } else {
        scanLegacySquads();
      }
    }, (err) => handleFirebaseError(err));

    // 2. ALL squads in this auction room (from RTDB)
    const allSquadsRef = ref(rtdb, `auctions/${auctionId}/userSquads`);
    const unsubAllSquads = onValue(allSquadsRef, (snap) => {
      if (snap.exists()) {
        const val = snap.val();
        setAllSquads(Object.entries(val).map(([uid, squad]) => ({ id: `${auctionId}_${uid}`, ...squad })));
      } else {
        scanLegacySquads();
      }
    }, (err) => handleFirebaseError(err));

    // 3. Player points & stats from Firestore (cached single getDoc)
    if (cachedPlayerPoints) {
      setPlayerPoints(cachedPlayerPoints);
    } else {
      const ppRef = doc(db, 'fantasyConfig', 'playerPoints');
      getDoc(ppRef).then(snap => {
        if (snap.exists()) {
          cachedPlayerPoints = snap.data();
          setPlayerPoints(cachedPlayerPoints);
        }
      }).catch(handleFirebaseError);
    }

    if (cachedPlayerStats) {
      setPlayerStats(cachedPlayerStats);
    } else {
      const statsRef = doc(db, 'fantasyConfig', 'playerStats');
      getDoc(statsRef).then(snap => {
        if (snap.exists()) {
          cachedPlayerStats = snap.data();
          setPlayerStats(cachedPlayerStats);
        }
      }).catch(handleFirebaseError);
    }

    return () => {
      unsubMySquad();
      unsubAllSquads();
    };

  }, [auctionId, user, handleFirebaseError]);

  // Save squad handler (RTDB - 0 Firestore write cost)
  const handleSaveSquad = async (squadData) => {
    if (!user?.uid || !auctionId) return;
    setIsSaving(true);
    try {
      const squadRef = ref(rtdb, `auctions/${auctionId}/userSquads/${user.uid}`);
      await setRtdb(squadRef, {
        userId: user.uid,
        userName: user.displayName || 'Manager',
        teamId: userTeamDoc?.teamId || 'N/A',
        auctionId,
        ...squadData
      });
      setIsEditing(false);
    } catch (err) {
      handleFirebaseError(err);
      alert("Error saving squad.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-12">
      {/* Sub Tabs */}
      <div className="grid grid-cols-3 sm:flex sm:justify-start gap-2 sm:gap-4 border-b border-white/5 pb-4 sm:pb-6">
        {[
          { id: 'best-team', label: 'Best Team', icon: Shield },
          { id: 'squad', label: 'Select Play XI', icon: Users },
          { id: 'leaderboard', label: 'Leaderboard', icon: Trophy }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-3 sm:px-6 py-2.5 sm:py-3 rounded-xl font-black uppercase text-[9px] sm:text-[10px] tracking-wider sm:tracking-widest transition-all flex items-center justify-center gap-1.5 sm:gap-3 touch-manipulation ${
              activeSubTab === tab.id 
                ? 'bg-orange-600 text-white shadow-lg' 
                : 'text-gray-400 hover:text-white bg-white/5 sm:bg-transparent'
            }`}
          >
            <tab.icon size={14} className="shrink-0" /> <span className="truncate">{tab.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeSubTab === 'best-team' ? (
          <motion.div
            key="best-team-tab"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="max-w-5xl mx-auto space-y-6 sm:space-y-12 pb-24 sm:pb-32"
          >
            <div className="flex items-center gap-4 sm:gap-6 mb-6 sm:mb-12">
              <div>
                <h2 className="text-2xl sm:text-4xl md:text-5xl font-black uppercase tracking-tighter drop-shadow-2xl italic leading-none">Best <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff5500] to-[#ff8c00]">Team</span></h2>
                <p className="text-[9px] sm:text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] sm:tracking-[0.4em] mt-1 sm:mt-2">Rated From Your Complete Auction Squad</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:gap-4">
              {bestTeamRankings.length > 0 ? (
                bestTeamRankings.map((entry, idx) => (
                  <motion.div
                    key={entry.userId || entry.teamId}
                    initial={{ x: -30, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.08 }}
                    className={`group relative bg-[#0c0c0c] border p-1 rounded-2xl sm:rounded-[2.5rem] transition-all overflow-hidden ${
                      entry.userId === user?.uid
                        ? 'border-white/10 shadow-[0_0_50px_rgba(255,140,0,0.15)]'
                        : 'border-white/5 hover:border-orange-500/30'
                    }`}
                  >
                    <div className="p-4 sm:p-8 relative z-10">
                      <div className="absolute -left-2 -top-4 text-7xl sm:text-9xl italic font-black text-white/5 pointer-events-none group-hover:text-orange-500/[0.03] transition-colors leading-none select-none">
                        #{idx + 1}
                      </div>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 sm:gap-8 relative z-10">
                        <div className="flex items-center gap-3 sm:gap-6 min-w-0 flex-1">
                          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-white/5 border border-white/10 p-1.5 sm:p-2 flex items-center justify-center shadow-2xl relative transition-transform group-hover:scale-110 duration-500 shrink-0">
                            {entry.teamLogo ? (
                              <img src={entry.teamLogo} alt={entry.teamId} className="w-full h-full object-contain" />
                            ) : (
                              <span className="text-lg sm:text-xl font-black">{entry.userName?.[0]}</span>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-lg sm:text-2xl font-black uppercase tracking-tight italic truncate">
                                {entry.userName}
                              </h3>
                              {entry.userId === user?.uid && (
                                <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-500/20 border border-blue-500/30 rounded-full shrink-0">
                                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                                  <span className="text-[8px] sm:text-[10px] font-black text-blue-400 uppercase tracking-widest leading-none">YOU</span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 sm:mt-1">
                              <p className="text-[9px] sm:text-[10px] font-black text-gray-500 uppercase tracking-widest leading-tight truncate">
                                {entry.teamName} · {entry.playerCount} {entry.playerCount === 1 ? 'Player' : 'Players'}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-8 border-t sm:border-t-0 pt-3 sm:pt-0 border-white/5">
                          <div className="text-left sm:text-right sm:border-r border-white/5 sm:pr-8">
                            <div className="flex flex-col items-start sm:items-center">
                              <span className={`text-2xl sm:text-4xl font-black leading-none ${
                                entry.rating !== null && idx < 3 ? 'text-[#ff5500] drop-shadow-[0_0_20px_rgba(255,85,0,0.3)]' : entry.rating !== null ? 'text-blue-500' : 'text-gray-600'
                              }`}>
                                {entry.rating !== null ? `${entry.rating}` : '—'}
                              </span>
                              <span className="text-[7px] sm:text-[8px] font-black text-gray-500 uppercase tracking-widest mt-1">
                                {entry.rating !== null ? 'RATING / 10' : 'NO PLAYERS'}
                              </span>
                            </div>
                          </div>

                          {idx < 3 && entry.rating !== null ? (
                            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shadow-lg border shrink-0 ${
                              idx === 0 ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-500' :
                              idx === 1 ? 'bg-gray-400/20 border-gray-400/30 text-gray-300' :
                              'bg-orange-900/20 border-orange-800/30 text-orange-600'
                            }`}>
                              <Trophy size={18} className="sm:w-5 sm:h-5" />
                            </div>
                          ) : (
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-500 group-hover:text-white transition-colors shrink-0">
                              <Trophy size={16} className="opacity-20 sm:w-4 sm:h-4" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="py-40 text-center bg-[#0c0c0c] rounded-[3rem] border border-white/5 opacity-50">
                  <Shield size={64} className="mx-auto mb-6 text-gray-800" />
                  <p className="text-xs font-black uppercase tracking-[0.5em] text-gray-500">No squads yet</p>
                </div>
              )}
            </div>
          </motion.div>
        ) : activeSubTab === 'squad' ? (
          <motion.div
            key="squad-tab"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
          >
            {!userTeamDoc ? (
              <div className="bg-red-500/10 border border-red-500/20 p-6 sm:p-12 rounded-2xl sm:rounded-[2.5rem] text-center">
                 <AlertCircle size={40} className="text-red-500 mx-auto mb-3" />
                 <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white mb-2 italic">No Team Assigned</h2>
                 <p className="text-xs sm:text-sm text-gray-400">You must be part of a franchise to participate in fantasy selections.</p>
              </div>
            ) : isEditing ? (
              <SquadSelector 
                ownedPlayers={ownedPlayers} 
                currentSquad={userSquad}
                playerStats={playerStats}
                onSave={handleSaveSquad}
              />
            ) : (
              <SquadPreview 
                ownedPlayers={ownedPlayers}
                currentSquad={userSquad}
                playerStats={playerStats}
                onEdit={() => setIsEditing(true)}
              />
            )}
          </motion.div>
        ) : activeSubTab === 'leaderboard' ? (
          <motion.div
            key="lb-tab"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="max-w-5xl mx-auto space-y-6 sm:space-y-12 pb-24 sm:pb-32"
          >
            {/* Header */}
            <div className="flex items-center gap-4 sm:gap-6 mb-6 sm:mb-12">
              <div>
                <h2 className="text-2xl sm:text-4xl md:text-5xl font-black uppercase tracking-tighter drop-shadow-2xl italic leading-none">Room <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff5500] to-[#ff8c00]">Standings</span></h2>
                <p className="text-[9px] sm:text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] sm:tracking-[0.4em] mt-1 sm:mt-2">Play XI Rating Leaderboard</p>
              </div>
            </div>

            {/* Leaderboard Table */}
            <div className="grid grid-cols-1 gap-3 sm:gap-4">
               {calculatedLeaderboard.length > 0 ? (
                 calculatedLeaderboard.map((entry, idx) => (
                   <motion.div
                     key={entry.userId || entry.id}
                     initial={{ x: -30, opacity: 0 }}
                     animate={{ x: 0, opacity: 1 }}
                     transition={{ delay: idx * 0.08 }}
                     className={`group relative bg-[#0c0c0c] border p-1 rounded-2xl sm:rounded-[2.5rem] transition-all overflow-hidden ${
                       entry.userId === user?.uid 
                       ? 'border-white/10 shadow-[0_0_50px_rgba(59,130,246,0.15)]' 
                       : 'border-white/5 hover:border-blue-500/30'
                     }`}
                   >
                      <div className="p-4 sm:p-8 relative z-10">
                        <div className="absolute -left-2 -top-4 text-7xl sm:text-9xl italic font-black text-white/5 pointer-events-none group-hover:text-blue-500/[0.03] transition-colors leading-none select-none">
                           #{idx + 1}
                        </div>

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 sm:gap-8 relative z-10">
                          <div className="flex items-center gap-3 sm:gap-6 min-w-0 flex-1">
                             <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-white/5 border border-white/10 p-1.5 sm:p-2 flex items-center justify-center shadow-2xl relative transition-transform group-hover:scale-110 duration-500 shrink-0">
                                {entry.teamLogo ? (
                                  <img src={entry.teamLogo} alt={entry.teamId} className="w-full h-full object-contain" />
                                ) : (
                                  <span className="text-lg sm:text-xl font-black">{entry.userName?.[0]}</span>
                                )}
                             </div>
                             
                             <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                   <h3 className="text-lg sm:text-2xl font-black uppercase tracking-tight italic truncate">
                                     {entry.userName}
                                   </h3>
                                   {entry.userId === user?.uid && (
                                     <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-500/20 border border-blue-500/30 rounded-full shrink-0">
                                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                                        <span className="text-[8px] sm:text-[10px] font-black text-blue-400 uppercase tracking-widest leading-none">YOU</span>
                                     </div>
                                   )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 sm:mt-1">
                                   <p className="text-[9px] sm:text-[10px] font-black text-gray-500 uppercase tracking-widest leading-tight truncate">
                                     {entry.teamName} · {entry.playerCount} {entry.playerCount === 1 ? 'Player' : 'Players'} selected
                                   </p>
                                </div>
                             </div>
                          </div>

                         <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-8 border-t sm:border-t-0 pt-3 sm:pt-0 border-white/5">
                           <div className="text-left sm:text-right sm:border-r border-white/5 sm:pr-8">
                              <div className="flex flex-col items-start sm:items-center">
                                 <span className={`text-2xl sm:text-4xl font-black leading-none ${
                                   entry.rating !== null && idx < 3 ? 'text-[#ff5500] drop-shadow-[0_0_20px_rgba(255,85,0,0.3)]' : entry.rating !== null ? 'text-blue-500' : 'text-gray-600'
                                 }`}>
                                   {entry.rating !== null ? `${entry.rating}` : '—'}
                                 </span>
                                 <span className="text-[7px] sm:text-[8px] font-black text-gray-500 uppercase tracking-widest mt-1">
                                    {entry.rating !== null ? 'RATING / 10' : 'NO XI SELECTED'}
                                 </span>
                              </div>
                           </div>

                           {idx < 3 && entry.rating !== null ? (
                             <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shadow-lg border shrink-0 ${
                               idx === 0 ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-500' :
                               idx === 1 ? 'bg-gray-400/20 border-gray-400/30 text-gray-300' :
                               'bg-orange-900/20 border-orange-800/30 text-orange-600'
                             }`}>
                                <Trophy size={18} className="sm:w-5 sm:h-5" />
                             </div>
                           ) : (
                             <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-500 group-hover:text-white transition-colors shrink-0">
                                <Trophy size={16} className="opacity-20 sm:w-4 sm:h-4" />
                             </div>
                           )}
                         </div>
                        </div>
                      </div>
                   </motion.div>
                 ))
               ) : (
                 <div className="py-40 text-center bg-[#0c0c0c] rounded-[3rem] border border-white/5 opacity-50">
                    <BarChart3 size={64} className="mx-auto mb-6 text-gray-800" />
                    <p className="text-xs font-black uppercase tracking-[0.5em] text-gray-500">No Play XIs submitted yet</p>
                 </div>
               )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default FantasyDashboard;
