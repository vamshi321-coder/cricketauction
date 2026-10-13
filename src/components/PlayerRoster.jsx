import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Users } from 'lucide-react';

const PlayerRoster = memo(function PlayerRoster({ playerCategories, onClose }) {
   const [activeOverlayTab, setActiveOverlayTab] = useState('upcoming');
   const closeRef = useRef(null);
   useEffect(() => {
      const previousFocus = document.activeElement;
      closeRef.current?.focus({ preventScroll: true });
      const onKey = event => { if (event.key === 'Escape') onClose(); };
      document.addEventListener('keydown', onKey);
      return () => { document.removeEventListener('keydown', onKey); previousFocus?.focus?.({ preventScroll: true }); };
   }, [onClose]);
   const filteredPlayers = useMemo(() => activeOverlayTab === 'leaderboard'
      ? [...playerCategories.sold].sort((a, b) => b.bid - a.bid)
      : playerCategories[activeOverlayTab] || [], [activeOverlayTab, playerCategories]);
   const groupedUpcomingPlayers = useMemo(() => {
      const groups = {};
      for (const player of filteredPlayers) (groups[player.set || 'General Pool'] ||= []).push(player);
      return groups;
   }, [filteredPlayers]);
   return (
               <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-labelledby="roster-title" style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 0px))' }} className="fixed inset-0 z-[100] bg-[#050505] p-4 md:p-8 flex flex-col items-center">
                  <div className="w-full max-w-7xl flex flex-col gap-4 h-full min-h-0">
                     <header className="shrink-0">
                        <div className="min-h-[60px] flex items-start justify-start">
                           <button ref={closeRef} type="button" aria-label="Close player roster" onClick={onClose} className="w-11 h-11 shrink-0 bg-white/10 rounded-xl flex items-center justify-center text-white hover:bg-red-500 focus-visible:outline-2 focus-visible:outline-yellow-400"><X size={22} /></button>
                        </div>
                        <h2 id="roster-title" className="text-xl md:text-2xl font-black uppercase tracking-tight">Mega Auction Roster</h2>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-none mt-1">Complete Player Inventory</p>
                     </header>
                     <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-white/5 no-scrollbar snap-x snap-mandatory shrink-0">
                        {['upcoming', 'sold', 'unsold', 'leaderboard'].map(tab => (
                           <button
                              key={tab}
                              onClick={() => setActiveOverlayTab(tab)}
                              className={`px-4 sm:px-6 py-2.5 sm:py-3 rounded-full transition-all uppercase text-xs sm:text-sm font-black whitespace-nowrap snap-start cursor-pointer border ${activeOverlayTab === tab
                                 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40 shadow-[0_0_15px_rgba(234,179,8,0.15)]'
                                 : 'bg-white/5 text-gray-400 border-transparent hover:text-white hover:bg-white/10'
                                 }`}
                           >
                              {tab}
                           </button>
                        ))}
                     </div>
                     <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar pr-1 sm:pr-2 pb-12">
                        {filteredPlayers.length === 0 ? (
                           <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-white/10 rounded-3xl bg-white/[0.02]">
                              <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-gray-400 mb-4 shadow-xl">
                                 <Users size={32} className="opacity-50" />
                              </div>
                              <h4 className="text-base font-black uppercase tracking-wider text-gray-300 mb-1">
                                 No {activeOverlayTab} players found
                              </h4>
                              <p className="text-xs text-gray-500 font-medium max-w-sm">
                                 {activeOverlayTab === 'unsold' && "No players have gone unsold in this auction yet."}
                                 {activeOverlayTab === 'sold' && "No players have been bought by any team yet."}
                                 {activeOverlayTab === 'leaderboard' && "Top sold players will appear here once bidding starts."}
                                 {activeOverlayTab === 'upcoming' && "No upcoming players remaining in the inventory."}
                              </p>
                           </div>
                        ) : activeOverlayTab === 'upcoming' ? (
                           <div className="space-y-8 sm:space-y-12">
                              {Object.entries(groupedUpcomingPlayers || {}).map(([setName, players]) => (
                                 <div key={setName} className="space-y-4 sm:space-y-6">
                                    <div className="flex items-center gap-4 sm:gap-6">
                                       <div className="h-px flex-1 bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent" />
                                       <h3 className="text-xs sm:text-sm font-black text-yellow-500 uppercase tracking-[0.2em] sm:tracking-[0.3em] bg-yellow-500/5 px-4 sm:px-6 py-1.5 sm:py-2 rounded-full border border-yellow-500/10 whitespace-nowrap">
                                          {setName}
                                       </h3>
                                       <div className="h-px flex-1 bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent" />
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2.5 sm:gap-3 md:gap-4">
                                       {players.map(p => (
                                          <div key={p.id} style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 170px' }} className="bg-white/5 border border-white/5 p-2.5 sm:p-3 rounded-2xl hover:bg-white/10 transition-all group flex flex-col justify-between">
                                             <div>
                                                <div className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 bg-white/10 rounded-xl sm:rounded-2xl overflow-hidden mb-2 sm:mb-3 border border-white/10 group-hover:scale-105 transition-transform mx-auto">
                                                   <img loading="lazy" decoding="async" width="80" height="80" src={p.image} className="w-full h-full object-contain" alt={p.name} />
                                                </div>
                                                <div className="text-center">
                                                   <h5 className="text-[11px] sm:text-xs font-black truncate mb-0.5 leading-tight">{p.name}</h5>
                                                   <div className="flex items-center justify-center gap-1.5 mb-2">
                                                      <span className="text-[8px] font-bold text-gray-400 uppercase bg-white/5 px-1.5 py-0.5 rounded">{p.role}</span>
                                                   </div>
                                                </div>
                                             </div>
                                             <div className="bg-black/40 px-2 py-1 rounded-lg border border-white/5 text-center">
                                                <span className="text-[9px] sm:text-[10px] font-black text-yellow-500">
                                                   ₹{p.basePrice.toFixed(2)} Cr
                                                </span>
                                             </div>
                                          </div>
                                       ))}
                                    </div>
                                 </div>
                              ))}
                           </div>
                        ) : (
                           <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2.5 sm:gap-3 md:gap-4">
                              {filteredPlayers.map(p => (
                                 <div key={p.id} style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 170px' }} className="bg-white/5 border border-white/5 p-2.5 sm:p-3 rounded-2xl hover:bg-white/10 transition-all group flex flex-col justify-between">
                                    <div>
                                       <div className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 bg-white/10 rounded-xl sm:rounded-2xl overflow-hidden mb-2 sm:mb-3 border border-white/10 group-hover:scale-105 transition-transform mx-auto">
                                          <img loading="lazy" decoding="async" width="80" height="80" src={p.image} className="w-full h-full object-contain" alt={p.name} />
                                       </div>
                                       <div className="text-center">
                                          <h5 className="text-[11px] sm:text-xs font-black truncate mb-0.5 leading-tight">{p.name}</h5>
                                          <div className="flex items-center justify-center gap-1.5 mb-2">
                                             <span className="text-[8px] font-bold text-gray-400 uppercase bg-white/5 px-1.5 py-0.5 rounded">{p.role}</span>
                                          </div>
                                       </div>
                                    </div>
                                    <div className="bg-black/40 px-2 py-1 rounded-lg border border-white/5 text-center">
                                       <span className="text-[9px] sm:text-[10px] font-black text-yellow-500">
                                          ₹{(activeOverlayTab === 'sold' || activeOverlayTab === 'leaderboard' ? p.bid : p.basePrice).toFixed(2)} Cr
                                       </span>
                                    </div>
                                 </div>
                              ))}
                           </div>
                        )}
                     </div>
                  </div>
               </motion.div>
   );
});
export default PlayerRoster;
