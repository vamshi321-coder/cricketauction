import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, History, X, TrendingUp } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

/**
 * PlayerHistory
 * Shows the highest auction record for a player on the auction card,
 * plus a history button that opens a full modal with all past seasons.
 * Only reflects officially completed seasons (host pressed END).
 */
export default function PlayerHistory({ playerId, playerName }) {
  const [historyData, setHistoryData] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!playerId) return;
    const unsub = onSnapshot(
      doc(db, 'playerHistory', playerId),
      snap => setHistoryData(snap.exists() ? snap.data() : null),
      () => setHistoryData(null)
    );
    return () => unsub();
  }, [playerId]);

  if (!historyData?.highestSeason) return null;

  const { highestBid, highestSeason, seasons = [] } = historyData;

  return (
    <>
      {/* Compact highest record — shown on player card */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 mt-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/25 rounded-xl"
      >
        <Trophy size={11} className="text-yellow-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[8px] font-black text-yellow-400 uppercase tracking-widest leading-none">
            🏆 Highest Record
          </p>
          <p className="text-[9px] font-black text-white mt-0.5 truncate">
            {highestSeason.seasonLabel} · {highestSeason.franchiseName} · {highestSeason.participantName} · ₹{highestBid?.toFixed(1)} Cr
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="shrink-0 p-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
          title="View full auction history"
        >
          <History size={12} className="text-gray-400 hover:text-white" />
        </button>
      </motion.div>

      {/* Full history modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[500] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
          >
            <motion.div
              initial={{ scale: 0.93, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.93, opacity: 0 }}
              className="w-full max-w-sm bg-[#111] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#0e0e0e]">
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-tight">{playerName}</h3>
                  <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Auction History</p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <X size={15} className="text-gray-400" />
                </button>
              </div>

              {/* Highest record banner */}
              <div className="mx-4 mt-4 flex items-center gap-3 p-3 bg-yellow-500/10 border border-yellow-500/25 rounded-2xl">
                <Trophy size={18} className="text-yellow-400 shrink-0" />
                <div>
                  <p className="text-[8px] font-black text-yellow-400 uppercase tracking-widest">🏆 All-Time Highest</p>
                  <p className="text-sm font-black text-white mt-0.5">₹{highestBid?.toFixed(1)} Cr</p>
                  <p className="text-[9px] text-gray-400">
                    {highestSeason.seasonLabel} · {highestSeason.franchiseName} · {highestSeason.participantName}
                  </p>
                </div>
              </div>

              {/* Season by season list */}
              <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
                {[...seasons].reverse().map((s, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${
                      s.soldPrice === highestBid
                        ? 'bg-yellow-500/8 border-yellow-500/20'
                        : 'bg-white/[0.02] border-white/5'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      s.soldPrice === highestBid ? 'bg-yellow-500/20' : 'bg-white/5'
                    }`}>
                      <span className={`text-[9px] font-black ${s.soldPrice === highestBid ? 'text-yellow-400' : 'text-gray-400'}`}>
                        {s.seasonLabel}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black text-white truncate">{s.franchiseName}</p>
                      <p className="text-[8px] text-gray-500 font-bold truncate">{s.participantName}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-black ${s.soldPrice === highestBid ? 'text-yellow-400' : 'text-white'}`}>
                        ₹{s.soldPrice?.toFixed(1)}
                      </p>
                      <p className="text-[7px] text-gray-600 font-bold">Cr</p>
                    </div>
                    {s.soldPrice === highestBid && (
                      <TrendingUp size={12} className="text-yellow-400 shrink-0" />
                    )}
                  </div>
                ))}
              </div>

              <div className="px-4 pb-4">
                <p className="text-[8px] text-gray-600 text-center font-bold uppercase tracking-widest">
                  {seasons.length} official season{seasons.length !== 1 ? 's' : ''} · host-confirmed only
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
