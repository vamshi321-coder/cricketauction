import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAuction } from '../contexts/AuctionContext';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  Loader2, Users, Crown, UserMinus, LogOut, Home, Gavel,
  ShieldAlert, Copy, MessageSquare, Settings as SettingsIcon,
  CheckCircle2, Check, Rocket, TrendingUp, Zap, Star,
  Bot, BotOff, Heart, HeartOff, List as ListIcon, X, Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ref, set, onValue, off } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { IPL_PLAYERS } from '../data/players';
import { TEAMS } from '../data/teams';
import TextChat from '../components/TextChat';
import Footer from '../components/Footer';
import PageLoader from '../components/PageLoader';

const Lobby = () => {
  const { id } = useParams();
  const { user, loginWithGoogle, loginAsGuest, logout, loading: authLoading } = useAuth();
  const { joinAuction, currentAuction, kickPlayer, updatePlayerTeam, updateRoomSettings, startAuction, joinRoomDb } = useAuction();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState('players');
  const [copied, setCopied] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isSelectingTeam, setIsSelectingTeam] = useState(null);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [banError, setBanError] = useState(null);
  const [botsEnabled, setBotsEnabled] = useState(true);
  const [showChoosePlayers, setShowChoosePlayers] = useState(false);
  const [myPool, setMyPool] = useState({});        // { playerId: true } — my personal pool
  const [allPools, setAllPools] = useState({});    // { uid: { playerId: true } } — everyone's pools
  const [poolFilter, setPoolFilter] = useState('ALL');
  const [poolSearch, setPoolSearch] = useState('');
  const [nextSeason, setNextSeason] = useState(1);

  // All unique set names in order
  const ALL_SETS = ['ALL', ...new Set(IPL_PLAYERS.map(p => p.set))];
  const myPoolCount = Object.keys(myPool).length;

  const isAdmin = currentAuction?.hostId === user?.uid;
  const players = currentAuction?.players || [];
  
  const teamAssignments = players.reduce((acc, p) => {
    if (p.team) acc[p.team] = p.name;
    return acc;
  }, {});

  const currentUserPlayer = players.find(p => p.id === user?.uid);

  const isJoined = players.some(p => p.id === user?.uid);

  useEffect(() => {
    if (id && user?.uid) {
      const unsub = joinAuction(id, user.uid);
      
      // Auto-join record if not present
      const autoJoin = async () => {
        try {
          await joinRoomDb(id, user.uid, { name: user.displayName || 'Manager' });
        } catch (e) {
          // Auto-join record if not present
          if (e.message.includes("kicked")) {
            setBanError(e.message);
          }
        }
      };
      autoJoin();

      return () => unsub();
    }
  }, [id, user?.uid, user?.displayName, joinAuction, joinRoomDb]);

  useEffect(() => {
    if (currentAuction?.status === 'active') {
      navigate(`/auction/${id}`, { replace: true });
    } else if (currentAuction?.status === 'completed') {
      navigate(`/summary/${id}`, { replace: true });
    }
  }, [currentAuction?.status, id, navigate]);

  useEffect(() => {
    if (currentAuction && user) {
      const isUserBanned = currentAuction.bannedPlayers?.includes(user.uid);
      if (isUserBanned) {
        setBanError("You have been kicked from this room and cannot rejoin.");
      }
    }
  }, [currentAuction, user]);

  // Sync bots enabled setting from Firebase (host writes, all read)
  useEffect(() => {
    if (!id) return;
    const r = ref(rtdb, `auctions/${id}/room/botsEnabled`);
    const unsub = onValue(r, snap => {
      setBotsEnabled(snap.val() !== false); // default true
    });
    return () => off(r, 'value', unsub);
  }, [id]);

  // Sync all participant player pools from Firebase
  useEffect(() => {
    if (!id) return;
    const r = ref(rtdb, `auctions/${id}/playerPools`);
    const unsub = onValue(r, snap => {
      const val = snap.val() || {};
      setAllPools(val);
      if (user?.uid && val[user.uid]) {
        setMyPool(val[user.uid]);
      } else if (user?.uid) {
        setMyPool({});
      }
    });
    return () => off(r, 'value', unsub);
  }, [id, user?.uid]);

  // Live season counter from Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'meta', 'seasonCounter'), snap => {
      setNextSeason((snap.exists() ? (snap.data().count || 0) : 0) + 1);
    }, () => {});
    return () => unsub();
  }, []);

  const handleToggleBots = async () => {
    if (!isAdmin) return;
    const newVal = !botsEnabled;
    setBotsEnabled(newVal);
    try {
      await set(ref(rtdb, `auctions/${id}/room/botsEnabled`), newVal);
    } catch (e) {
      console.warn('Bot toggle error:', e?.message);
    }
  };

  const handleTogglePlayer = useCallback(async (playerId) => {
    if (!user?.uid || currentAuction?.status === 'active') return;
    const updated = { ...myPool };
    if (updated[playerId]) {
      delete updated[playerId];
    } else {
      updated[playerId] = true;
    }
    setMyPool(updated);
    try {
      await set(
        ref(rtdb, `auctions/${id}/playerPools/${user.uid}`),
        Object.keys(updated).length > 0 ? updated : null
      );
    } catch (e) {
      console.warn('Pool update error:', e?.message);
    }
  }, [myPool, user?.uid, id, currentAuction?.status]);

  const handleClearPool = useCallback(async () => {
    setMyPool({});
    try {
      await set(ref(rtdb, `auctions/${id}/playerPools/${user.uid}`), null);
    } catch (e) {}
  }, [id, user?.uid]);

  if (currentAuction?.status === 'completed' || currentAuction?.status === 'active') return null;

  // ─── Handlers ───
  const handleStartAuction = async () => {
    if (isAdmin) {
      setIsStarting(true);
      try {
        await startAuction(id, { botsEnabled });
        navigate(`/auction/${id}`);
      } catch (error) {
        setIsStarting(false);
      }
    }
  };

  const handleKickPlayer = async (playerObj) => {
    if (isAdmin) await kickPlayer(id, playerObj);
  };

  const handleTeamSelect = async (teamId) => {
    if (teamAssignments[teamId] && teamId !== currentUserPlayer?.team) return;
    setIsSelectingTeam(teamId);
    try {
      await updatePlayerTeam(id, user.uid, teamId);
    } finally {
      setIsSelectingTeam(null);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsUpdatingSettings(true);
    try {
      await loginWithGoogle();
    } catch (error) {
      // Login failed
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const handleGuestSignIn = async (e) => {
    e.preventDefault();
    if (!guestName.trim()) return;
    setIsUpdatingSettings(true);
    try {
      await loginAsGuest(guestName);
    } catch (error) {
       // Guest login failed
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareWhatsApp = () => {
    const text = `Join my IPL Auction room! Code: ${id}\n${window.location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleUpdateBidTimer = async (seconds) => {
    if (!isAdmin) return;
    setIsUpdatingSettings(true);
    try {
      await updateRoomSettings(id, { 
        ...currentAuction.settings,
        bidTimer: seconds 
      });
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  // ─── Unauthenticated State: Show Login Gateway ───
  if (banError) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 font-primary text-white">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white/5 border border-white/10 p-12 rounded-[3.5rem] text-center backdrop-blur-3xl relative overflow-hidden"
        >
           <div className="absolute top-0 right-0 p-8 w-32 h-32 bg-red-500/10 rounded-full -mr-16 -mt-16 blur-3xl" />
           <div className="absolute bottom-0 left-0 p-8 w-32 h-32 bg-red-500/10 rounded-full -ml-16 -mb-16 blur-3xl" />
           
           <div className="w-24 h-24 bg-red-500/10 border border-red-500/20 rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 shadow-2xl shadow-red-500/20 relative group">
              <ShieldAlert size={48} className="text-red-500 group-hover:scale-110 transition-transform duration-500" />
           </div>

           <h1 className="text-4xl font-black mb-4 uppercase tracking-tighter">BANNED FROM ROOM</h1>
           <p className="text-gray-400 font-bold text-sm leading-relaxed uppercase tracking-widest mb-10 opacity-70">
             {banError}
           </p>

           <button 
             onClick={() => navigate('/')}
             className="w-full py-6 bg-white text-black font-black uppercase tracking-widest rounded-[2rem] hover:bg-gray-100 transition-all active:scale-95 flex items-center justify-center gap-3"
           >
             <Home size={20} />
             BACK TO HOME
           </button>
        </motion.div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <PageLoader />
    );
  }

  if (!user) {
    return (
      <div className="relative min-h-screen bg-[#050505] flex flex-col items-center justify-center py-12 px-4 font-sans text-white overflow-x-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-orange-600/20 blur-[120px] rounded-full" />
          <div className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 w-full max-md bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-3 backdrop-blur-3xl shadow-2xl"
        >
          <div className="bg-[#0c0c0c] rounded-[2.2rem] p-8 border border-white/5 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-orange-600/10 border border-orange-500/20 rounded-2xl flex items-center justify-center text-orange-500 mb-6 shadow-2xl">
               <Gavel size={32} strokeWidth={2.5} />
            </div>

            <h2 className="text-2xl font-black tracking-tighter uppercase mb-2">Joining Arena</h2>
            <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.3em] mb-8">Room ID: <span className="text-orange-500">{id}</span></p>

            {!isGuestMode ? (
              <div className="w-full space-y-4">
                <button
                  onClick={handleGoogleSignIn}
                  disabled={isUpdatingSettings}
                  className="w-full h-14 bg-white text-black rounded-xl flex items-center justify-center gap-3 hover:bg-gray-100 transition-all font-black uppercase tracking-widest text-xs cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {isUpdatingSettings ? <Loader2 size={18} className="animate-spin text-black" /> : (
                    <>
                      <svg viewBox="0 0 24 24" width="18" height="18" className="mr-1">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83c.87-2.6 3.3-4.52 6.16-4.52z"/>
                      </svg>
                      Continue with Google
                    </>
                  )}
                </button>

                <div className="relative py-2 flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5" /></div>
                  <span className="relative bg-[#0c0c0c] px-4 text-[9px] font-black text-gray-700 uppercase tracking-widest italic">Or enter as temporary guest</span>
                </div>

                <button
                  onClick={() => setIsGuestMode(true)}
                  className="w-full h-14 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center gap-3 text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all font-black uppercase tracking-widest text-xs cursor-pointer active:scale-95"
                >
                  <Users size={18} /> Join as Guest
                </button>
              </div>
            ) : (
              <form onSubmit={handleGuestSignIn} className="w-full space-y-5">
                <div className="space-y-2 text-left">
                  <label className="block text-[10px] font-black text-gray-600 uppercase tracking-widest ml-1">Manager Identity</label>
                  <input 
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="e.g. THALA"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white font-black uppercase text-sm tracking-[0.2em] placeholder:text-gray-800 focus:outline-none focus:border-orange-500/50 transition-all"
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={isUpdatingSettings || !guestName.trim()}
                  className="w-full h-14 bg-gradient-to-r from-orange-600 to-orange-500 rounded-xl flex items-center justify-center gap-3 text-white font-black uppercase tracking-widest text-xs shadow-[0_10px_30px_rgba(255,85,0,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100"
                >
                  {isUpdatingSettings ? <Loader2 size={18} className="animate-spin" /> : <span>Step into Hub</span>}
                </button>

                <button
                  type="button"
                  onClick={() => setIsGuestMode(false)}
                  className="w-full text-[9px] font-black text-gray-600 hover:text-white uppercase tracking-[0.4em] transition-colors"
                >
                  ← Use Google Account
                </button>
              </form>
            )}
          </div>
        </motion.div>
        
        <button onClick={() => navigate('/')} className="mt-8 text-[10px] font-black text-gray-600 hover:text-white uppercase tracking-[0.4em] transition-all flex items-center gap-2">
           <Home size={14} /> Back to Base
        </button>
      </div>
    );
  }

  if (!isJoined || !currentUserPlayer?.team) {
    // ═══ TEAM SELECTION OVERLAY ═══
    return (
      <div className="relative min-h-screen bg-[#050505] flex flex-col items-center py-12 px-4 font-sans text-white overflow-x-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-orange-600/20 blur-[120px] rounded-full" />
          <div className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full" />
        </div>

        <motion.div 
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           className="w-full max-w-4xl z-10"
        >
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-4">Select Your Squad</h1>
            <p className="text-gray-500 font-bold text-xs uppercase tracking-[0.3em]">Choose a vacant franchise to enter the auction hub</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {TEAMS.map((team) => {
              const isTaken = teamAssignments[team.id];
              return (
                <button
                  key={team.id}
                  onClick={() => !isTaken && handleTeamSelect(team.id)}
                  disabled={!!isTaken}
                  className={`relative group/sel p-6 rounded-[2rem] border transition-all duration-500 flex flex-col items-center gap-4 ${
                    isTaken 
                      ? 'bg-white/[0.01] border-white/5 opacity-20 grayscale cursor-not-allowed' 
                      : 'bg-white/[0.03] border-white/10 hover:bg-white/10 hover:border-white/20 hover:scale-105 active:scale-95 shadow-2xl'
                  }`}
                >
                  <div className="w-20 h-20 bg-white/5 border border-white/5 rounded-2xl p-2 flex items-center justify-center">
                    {isSelectingTeam === team.id ? <Loader2 className="animate-spin text-orange-500" /> : <img src={team.logo} alt="" className="w-full h-full object-contain" />}
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white">{team.id}</p>
                    <p className="text-[8px] font-bold uppercase tracking-widest text-gray-500 mt-1">{isTaken ? (isTaken.split(' ')[0]) : 'Available'}</p>
                  </div>
                </button>
              );
            })}
          </div>
          
          <button 
            onClick={() => navigate('/')}
            className="mx-auto mt-16 flex items-center gap-2 text-[10px] font-black text-gray-600 hover:text-white uppercase tracking-[0.4em] transition-all"
          >
            ← Cancel & Exit
          </button>
        </motion.div>
      </div>
    );
  }

  // ─── Authenticated State ───
  return (
    <div className="relative min-h-screen bg-[#050505] flex flex-col items-center py-8 px-4 font-sans text-white overflow-x-hidden">
      
      {/* Premium Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-orange-600/20 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03]" />
      </div>

      {/* Top Navigation */}
      <div className="w-full max-w-6xl flex flex-wrap items-center justify-between gap-3 sm:gap-4 mb-6 md:mb-10 z-20 px-2 sm:px-4">
        <div className="flex items-center gap-2 sm:gap-4">
          <button 
            onClick={() => navigate('/')}
            className="p-2.5 sm:p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl sm:rounded-2xl transition-all group flex items-center gap-2"
            title="Exit Hub"
          >
            <Home size={18} className="group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-black uppercase tracking-widest hidden sm:block">Exit Hub</span>
          </button>
          <button 
            onClick={logout}
            className="p-2.5 sm:p-3 bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 rounded-xl sm:rounded-2xl transition-all group flex items-center gap-2 text-gray-400 hover:text-red-400"
            title="Logout"
          >
            <LogOut size={18} className="group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-black uppercase tracking-widest hidden sm:block">Logout</span>
          </button>
          <div className="h-8 sm:h-10 w-px bg-white/10" />
          <div className="flex flex-col">
            <span className="text-[7px] sm:text-[9px] font-black text-gray-500 uppercase tracking-widest leading-none mb-0.5 sm:mb-1">Room ID</span>
            <span className="text-base sm:text-xl font-black text-white tracking-tight leading-none">{id}</span>
          </div>
          <div className="h-8 sm:h-10 w-px bg-white/10" />
          <div className="flex flex-col items-center">
            <span className="text-[7px] sm:text-[9px] font-black text-gray-500 uppercase tracking-widest leading-none mb-0.5 sm:mb-1">Season</span>
            <span className="text-base sm:text-xl font-black text-orange-400 tracking-tight leading-none">S{nextSeason}</span>
          </div>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Bots ON/OFF toggle — clearly labelled, slightly larger */}
            <button
              onClick={handleToggleBots}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl border font-black text-[9px] sm:text-[10px] uppercase tracking-widest transition-all ${
                botsEnabled
                  ? 'bg-blue-500/20 border-blue-500/40 text-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.2)]'
                  : 'bg-white/5 border-white/15 text-gray-500 hover:border-white/25'
              }`}
              title={botsEnabled ? 'Bots ON — click to disable' : 'Bots OFF — click to enable'}
            >
              {botsEnabled ? <Bot size={15} /> : <BotOff size={15} />}
              <span>BOTS {botsEnabled ? 'ON' : 'OFF'}</span>
            </button>

            <button
              onClick={handleStartAuction}
              disabled={isStarting}
              className="relative overflow-hidden group px-4 sm:px-8 py-2.5 sm:py-3 bg-gradient-to-r from-[#ff5500] to-[#ff8c00] rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-wider sm:tracking-widest shadow-[0_10px_30px_rgba(255,85,0,0.3)] disabled:opacity-50 transition-all active:scale-95 cursor-pointer shrink-0"
            >
              <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              <div className="relative flex items-center gap-1.5 sm:gap-2">
                {isStarting && <Loader2 size={16} className="animate-spin" />}
                <span>{isStarting ? 'Igniting...' : 'Start Auction'}</span>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Choose Players button — visible to all joined participants */}
      {isJoined && currentAuction?.status !== 'active' && (
        <div className="w-full max-w-6xl px-2 sm:px-4 mb-3">
          <button
            disabled
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest border bg-white/[0.02] border-white/5 text-gray-700 cursor-not-allowed opacity-40"
          >
            <ListIcon size={13} />
            Choose Players
            <span className="text-gray-700 text-[8px] font-bold normal-case tracking-normal">Coming soon</span>
          </button>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-6xl bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-3 backdrop-blur-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-10 relative mt-2"
      >
        {/* Subtle Glow behind panel */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#ff5500]/[0.02] via-[#ff5500]/[0.01] to-transparent rounded-[2.5rem] blur-xl pointer-events-none -z-10" />
        <div className="absolute -inset-2 bg-gradient-to-r from-[#ff5500]/5 to-[#0088ff]/2 rounded-[2.5rem] blur-3xl opacity-40 pointer-events-none -z-10" />
        
        <div className="bg-[#0c0c0c] rounded-[2.2rem] border border-white/5 grid grid-cols-1 lg:grid-cols-12 gap-0 items-stretch divide-y lg:divide-y-0 lg:divide-x divide-white/5 overflow-hidden">
          
          {/* Left Column: Management Hub */}
          <div className="lg:col-span-5 w-full flex flex-col p-6 md:p-8 relative gap-6">
            {/* Background glow blob */}
            <div className="absolute -top-12 -right-12 w-24 h-24 bg-white/5 blur-[40px] rounded-full pointer-events-none" />

            {/* Battle Rules Section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                 <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Battle Rules</h3>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
                  <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest block mb-1">Auction Mode</span>
                  <span className="text-[11px] font-black text-white uppercase tracking-tight">
                    {currentAuction?.auctionType === 'sprint5' ? '5-Player Sprint' : 
                     currentAuction?.auctionType === 'sprint11' ? '11-Player Classic' : 
                     'Mega Auction'}
                  </span>
                </div>
                <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
                  <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest block mb-1">Initial Budget</span>
                  <span className="text-[11px] font-black text-yellow-500 uppercase tracking-tight">
                    ₹{currentAuction?.settings?.budget || 120}.0 Cr
                  </span>
                </div>
                <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
                  <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest block mb-1">Squad Capacity</span>
                  <span className="text-[11px] font-black text-blue-400 uppercase tracking-tight">
                    {currentAuction?.squadLimit || 25} Players
                  </span>
                </div>
                <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
                  <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest block mb-1">Overseas Quota</span>
                  <span className="text-[11px] font-black text-purple-400 uppercase tracking-tight">
                    Max {currentAuction?.overseasLimit || 8}
                  </span>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-white/5" />

            {/* Franchise Selector */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                   <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Claim Franchise</h3>
                </div>
                {currentUserPlayer?.team && (
                  <div className="text-[9px] font-black text-green-500 bg-green-500/10 px-2 py-0.5 rounded uppercase tracking-wider">Locked In</div>
                )}
              </div>

              <div className="grid grid-cols-5 gap-2.5">
                {TEAMS.map((team) => {
                  const isTaken = teamAssignments[team.id];
                  const isMine = currentUserPlayer?.team === team.id;

                  return (
                    <button
                      key={team.id}
                      onClick={() => handleTeamSelect(team.id)}
                      disabled={!!isTaken && !isMine}
                      className={`relative group/team flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-200 border ${
                        isMine 
                          ? 'bg-[#1b1b1b] border-white/[0.12] scale-[1.02] shadow-[0_4px_20px_rgba(0,0,0,0.4)]' 
                          : isTaken 
                            ? 'border-transparent opacity-20 grayscale cursor-not-allowed' 
                            : 'border-transparent hover:bg-white/[0.04]'
                      }`}
                    >
                      {isMine && (
                        <div className="absolute top-2 right-2 text-white z-20">
                          <Check size={10} strokeWidth={3} />
                        </div>
                      )}

                      <div className={`w-9 h-9 rounded-xl bg-white/5 border border-white/5 p-1.5 flex items-center justify-center mb-2 transition-all duration-300 ${isMine ? 'scale-105 border-white/[0.12] shadow-lg' : 'group-hover/team:scale-105'}`}>
                        {isSelectingTeam === team.id ? <Loader2 size={14} className="animate-spin text-white" /> : <img src={team.logo} alt="" className="w-full h-full object-contain" />}
                      </div>
                      
                      <span className={`text-[8px] font-black uppercase text-center tracking-tighter truncate w-full ${isMine ? 'text-white' : 'text-gray-500'}`}>
                        {isTaken ? isTaken.split(' ')[0] : team.id}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-white/5" />

            {/* Share Section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                 <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Invite Crew Members</h3>
              </div>

              <div className="flex gap-3">
                <div className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-gray-500 font-medium truncate flex items-center">
                  {window.location.href}
                </div>
                <button onClick={copyLink} className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5 relative group/copy cursor-pointer">
                  {copied ? <CheckCircle2 size={18} className="text-green-500" /> : <Copy size={18} className="group-hover/copy:scale-110 transition-transform" />}
                </button>
                <button 
                  onClick={shareWhatsApp} 
                  className="p-3 bg-[#25D366]/5 hover:bg-[#25D366]/10 rounded-xl transition-all border border-[#25D366]/10 text-[#25D366] group/wa cursor-pointer"
                >
                  <MessageSquare size={18} className="group-hover/wa:scale-110 transition-transform" />
                </button>
              </div>
            </div>

          </div>

          {/* Right Column: Engagement Hub */}
          <div className="lg:col-span-7 w-full p-6 md:p-8 flex flex-col justify-start">
            {/* Tabs Header */}
            <div className="flex bg-white/[0.02] p-1.5 gap-1.5 rounded-2xl mb-6 border border-white/5">
              {[
                { id: 'players', icon: Users, label: `Crew` },
                { id: 'chat', icon: MessageSquare, label: 'Chat' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-3 flex flex-col items-center justify-center gap-1.5 transition-all rounded-xl cursor-pointer ${activeTab === tab.id
                      ? 'bg-white/5 text-[#ff5500] border border-white/10 shadow-inner'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.01]'
                    }`}
                >
                  <tab.icon size={16} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
                  <span className="text-[9px] font-black uppercase tracking-widest">{tab.id === 'players' ? `${tab.label} (${players.length})` : tab.label}</span>
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto max-h-[500px] custom-scrollbar pr-1">
              <AnimatePresence mode="wait">
                {activeTab === 'players' && (
                  <motion.div 
                    key="p-list"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-4"
                  >
                    {players.map((player, idx) => {
                      const playerTeam = TEAMS.find(t => t.id === player.team);
                      return (
                        <motion.div
                          key={`${player.id}-${idx}`}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0, transition: { delay: idx * 0.05 } }}
                          className="flex items-center justify-between bg-white/[0.01] border border-white/5 p-4 rounded-2xl group transition-all hover:bg-white/[0.03] hover:border-white/10"
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl border border-white/10 flex items-center justify-center shadow-2xl relative overflow-hidden bg-white/5 p-1.5`}>
                              <div className="absolute inset-x-0 bottom-0 top-1/2 bg-black/5 pointer-events-none" />
                              {playerTeam ? (
                                <img src={playerTeam.logo} alt="" className="w-full h-full object-contain relative z-10" />
                              ) : (
                                <span className="text-gray-500 relative z-10 text-xs">?</span>
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-black text-sm text-white uppercase tracking-tight">{player.name}</p>
                                {player.isHost && <Crown size={14} className="text-yellow-500 fill-yellow-500 " />}
                                {player.id === user?.uid && <span className="text-[8px] font-black bg-white/10 px-1.5 py-0.5 rounded text-gray-400">YOU</span>}
                              </div>
                              <p className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.2em] mt-0.5">
                                {playerTeam?.name || (player.team === '' ? 'CALIBRATING...' : player.team)}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="flex flex-col items-end">
                               <div className={`w-1.5 h-1.5 rounded-full shadow-lg ${player.isOnline ? 'bg-green-500 shadow-green-500/50' : 'bg-gray-700'}`} />
                               <span className={`text-[8px] font-black uppercase tracking-tighter mt-1 ${player.isOnline ? 'text-green-500' : 'text-gray-700'}`}>
                                  {player.isOnline ? 'Online' : 'Offline'}
                               </span>
                            </div>
                            {isAdmin && !player.isHost && (
                              <button
                                onClick={() => handleKickPlayer(player)}
                                className="opacity-0 group-hover:opacity-100 p-2 text-gray-700 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer"
                              >
                                <UserMinus size={18} />
                              </button>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}

                {activeTab === 'chat' && (
                  <motion.div 
                    key="chat"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="h-[400px]"
                  >
                    <TextChat roomId={id} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.div>

      <Footer />

      {/* Choose Players Modal */}
      <AnimatePresence>
        {showChoosePlayers && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-2 sm:p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowChoosePlayers(false); }}
          >
            <motion.div
              initial={{ y: 80, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
              className="w-full max-w-2xl bg-[#0e0e0e] border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0 bg-[#111]">
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight text-white flex items-center gap-2">
                    <ListIcon size={16} className="text-orange-400" />
                    Choose Players
                  </h3>
                  <p className="text-[9px] text-gray-500 font-bold mt-0.5">
                    {myPoolCount > 0
                      ? `${myPoolCount} players selected — only these will be in your auction pool`
                      : 'No selection = ALL players included (default)'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {myPoolCount > 0 && (
                    <button
                      onClick={handleClearPool}
                      className="text-[9px] font-black text-gray-500 hover:text-red-400 uppercase tracking-widest transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20"
                    >
                      Clear all
                    </button>
                  )}
                  <button
                    onClick={() => setShowChoosePlayers(false)}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <X size={16} className="text-gray-400" />
                  </button>
                </div>
              </div>

              {/* Set filter tabs */}
              <div className="px-4 pt-3 pb-2 border-b border-white/5 shrink-0 overflow-x-auto">
                <div className="flex gap-1.5 w-max">
                  {ALL_SETS.map(s => {
                    const count = s === 'ALL'
                      ? Object.keys(myPool).length
                      : IPL_PLAYERS.filter(p => p.set === s && myPool[p.id]).length;
                    return (
                      <button
                        key={s}
                        onClick={() => setPoolFilter(s)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                          poolFilter === s
                            ? 'bg-orange-500 text-white shadow-[0_0_12px_rgba(255,85,0,0.3)]'
                            : 'bg-white/5 text-gray-500 hover:text-white hover:bg-white/8'
                        }`}
                      >
                        {s}
                        {count > 0 && (
                          <span className={`text-[7px] font-black px-1 py-0.5 rounded-full ${
                            poolFilter === s ? 'bg-white/20 text-white' : 'bg-orange-500/30 text-orange-400'
                          }`}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Search */}
              <div className="px-4 py-2.5 border-b border-white/5 shrink-0">
                <div className="relative">
                  <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                  <input
                    value={poolSearch}
                    onChange={e => setPoolSearch(e.target.value)}
                    placeholder="Search by name..."
                    className="w-full bg-white/5 border border-white/8 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-gray-600 font-medium focus:outline-none focus:border-orange-500/40 transition-colors"
                  />
                  {poolSearch && (
                    <button onClick={() => setPoolSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                      <X size={11} className="text-gray-500 hover:text-white" />
                    </button>
                  )}
                </div>
              </div>

              {/* Player list */}
              <div className="overflow-y-auto flex-1 p-3 space-y-1">
                {(() => {
                  const filtered = IPL_PLAYERS.filter(p => {
                    const matchSet = poolFilter === 'ALL' || p.set === poolFilter;
                    const matchSearch = !poolSearch || p.name.toLowerCase().includes(poolSearch.toLowerCase());
                    return matchSet && matchSearch;
                  });

                  if (filtered.length === 0) return (
                    <div className="py-16 text-center text-gray-600">
                      <p className="text-xs font-black uppercase tracking-widest">No players found</p>
                    </div>
                  );

                  // Group by role within current view
                  const roleOrder = ['Batsman', 'All-Rounder', 'Wicket-Keeper', 'Bowler'];
                  const grouped = {};
                  roleOrder.forEach(r => { grouped[r] = filtered.filter(p => p.role === r); });

                  return roleOrder.map(role => {
                    const group = grouped[role];
                    if (!group.length) return null;
                    const selectedInGroup = group.filter(p => myPool[p.id]).length;
                    return (
                      <div key={role} className="mb-3">
                        {/* Role header */}
                        <div className="flex items-center gap-2 px-2 py-1.5 mb-1.5">
                          <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{role}s</span>
                          <div className="flex-1 h-px bg-white/5" />
                          {selectedInGroup > 0 && (
                            <span className="text-[8px] font-black text-orange-400">{selectedInGroup} selected</span>
                          )}
                        </div>
                        {/* Players in role */}
                        <div className="grid grid-cols-1 gap-1">
                          {group.map(player => {
                            const isSelected = !!myPool[player.id];
                            // Who else selected this player
                            const otherSelectors = players.filter(p =>
                              p.id !== user?.uid && allPools[p.id]?.[player.id]
                            );
                            return (
                              <motion.button
                                key={player.id}
                                onClick={() => handleTogglePlayer(player.id)}
                                whileTap={{ scale: 0.98 }}
                                className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left border ${
                                  isSelected
                                    ? 'bg-orange-500/12 border-orange-500/35 shadow-[0_0_8px_rgba(255,85,0,0.1)]'
                                    : 'bg-white/[0.02] border-white/5 hover:border-white/12 hover:bg-white/[0.04]'
                                }`}
                              >
                                {/* Player image */}
                                <div className={`relative shrink-0 ${isSelected ? 'ring-2 ring-orange-500/60 rounded-lg' : ''}`}>
                                  <img
                                    src={player.image}
                                    alt={player.name}
                                    className="w-9 h-9 rounded-lg object-cover border border-white/10"
                                  />
                                  {isSelected && (
                                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center border border-black">
                                      <Check size={9} className="text-white" strokeWidth={3} />
                                    </div>
                                  )}
                                </div>

                                {/* Player info */}
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs font-black truncate ${isSelected ? 'text-orange-300' : 'text-white'}`}>
                                    {player.name}
                                  </p>
                                  <p className="text-[8px] text-gray-600 font-bold">
                                    {player.type} · ₹{player.basePrice} Cr base
                                  </p>
                                </div>

                                {/* Others who selected */}
                                {otherSelectors.length > 0 && (
                                  <div className="flex -space-x-1 shrink-0">
                                    {otherSelectors.slice(0, 3).map(p => (
                                      <div
                                        key={p.id}
                                        title={p.name}
                                        className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 border border-black flex items-center justify-center"
                                      >
                                        <span className="text-[7px] font-black text-white">
                                          {(p.name || '?')[0].toUpperCase()}
                                        </span>
                                      </div>
                                    ))}
                                    {otherSelectors.length > 3 && (
                                      <div className="w-5 h-5 rounded-full bg-white/10 border border-black flex items-center justify-center">
                                        <span className="text-[7px] font-black text-gray-400">+{otherSelectors.length - 3}</span>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Selection indicator */}
                                <div className={`w-4 h-4 rounded-md border shrink-0 flex items-center justify-center transition-all ${
                                  isSelected
                                    ? 'bg-orange-500 border-orange-500'
                                    : 'border-white/15 bg-white/5'
                                }`}>
                                  {isSelected && <Check size={9} className="text-white" strokeWidth={3} />}
                                </div>
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Footer */}
              <div className="px-5 py-3.5 border-t border-white/5 flex items-center justify-between shrink-0 bg-[#111]">
                <div className="text-[9px] text-gray-500 font-bold">
                  {myPoolCount > 0
                    ? <span className="text-orange-400">{myPoolCount} players in your pool</span>
                    : <span>No selection → <span className="text-gray-400">all {IPL_PLAYERS.length} players included</span></span>
                  }
                </div>
                <button
                  onClick={() => setShowChoosePlayers(false)}
                  className="px-5 py-2 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl text-[9px] font-black text-white uppercase tracking-widest shadow-lg"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Lobby;