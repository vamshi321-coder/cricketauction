import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, CheckCircle, Clock, Trophy } from 'lucide-react';
import { ref, set, onValue, off } from 'firebase/database';
import { rtdb } from '../lib/firebase';

/**
 * Bid Prediction mini-game
 * Before each player's auction, participants predict the final sold price.
 * After SOLD, closest prediction wins that round. Shown as a subtle panel.
 *
 * Props:
 *   auctionId   - current auction room ID
 *   playerId    - current player's ID
 *   playerName  - current player's name
 *   userId      - current user's UID
 *   userName    - current user's display name
 *   status      - auction status ('active','sold','unsold')
 *   soldPrice   - final sold price (when status === 'sold')
 *   enabled     - show/hide
 */
export default function BidPrediction({
  auctionId,
  playerId,
  playerName,
  userId,
  userName,
  status,
  soldPrice,
  enabled,
}) {
  const [myPrediction, setMyPrediction] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [predictions, setPredictions] = useState({});
  const [revealed, setRevealed] = useState(false);
  const prevPlayerRef = useRef(null);

  const predPath = auctionId && playerId
    ? `predictions/${auctionId}/${playerId}`
    : null;

  // Reset when player changes
  useEffect(() => {
    if (playerId !== prevPlayerRef.current) {
      prevPlayerRef.current = playerId;
      setMyPrediction('');
      setSubmitted(false);
      setRevealed(false);
      setPredictions({});
    }
  }, [playerId]);

  // Listen to all predictions for current player
  useEffect(() => {
    if (!predPath) return;
    const r = ref(rtdb, predPath);
    const unsub = onValue(r, snap => {
      setPredictions(snap.val() || {});
    });
    return () => off(r, 'value', unsub);
  }, [predPath]);

  // Reveal results when SOLD
  useEffect(() => {
    if (status === 'sold' && !revealed) {
      setRevealed(true);
    }
  }, [status, revealed]);

  const handleSubmit = async () => {
    const val = parseFloat(myPrediction);
    if (!val || val < 0.2 || !predPath) return;
    try {
      await set(ref(rtdb, `${predPath}/${userId}`), {
        name: userName,
        prediction: val,
        submittedAt: Date.now(),
      });
      setSubmitted(true);
    } catch (e) {
      console.error('Prediction submit error:', e);
    }
  };

  // Find winner (closest to soldPrice)
  const getWinner = () => {
    if (!soldPrice || !Object.keys(predictions).length) return null;
    let best = null;
    let bestDiff = Infinity;
    Object.entries(predictions).forEach(([uid, data]) => {
      const diff = Math.abs((data.prediction || 0) - soldPrice);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = { uid, ...data, diff };
      }
    });
    return best;
  };

  if (!enabled || !playerId || status === 'idle') return null;

  const winner = revealed ? getWinner() : null;
  const myEntry = predictions[userId];

  return (
    <AnimatePresence>
      <motion.div
        key={`pred-${playerId}`}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        className="bg-[#111] border border-white/10 rounded-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
          <Target size={14} className="text-orange-400 shrink-0" />
          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex-1">
            Bid Prediction
          </span>
          {!revealed && (
            <div className="flex items-center gap-1 text-[8px] text-gray-600 font-bold">
              <Clock size={10} />
              {Object.keys(predictions).length} submitted
            </div>
          )}
        </div>

        <div className="p-4">
          {!revealed ? (
            // ── Prediction input ──
            submitted || myEntry ? (
              <div className="text-center py-2">
                <CheckCircle size={20} className="text-green-400 mx-auto mb-1" />
                <p className="text-[10px] font-black text-green-400">
                  Your prediction: ₹{(myEntry?.prediction || parseFloat(myPrediction)).toFixed(1)} Cr
                </p>
                <p className="text-[8px] text-gray-600 mt-0.5">Waiting for result…</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[9px] text-gray-500 font-bold">
                  What price will <span className="text-white">{playerName}</span> sell for?
                </p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0.2"
                    max="30"
                    step="0.1"
                    value={myPrediction}
                    onChange={e => setMyPrediction(e.target.value)}
                    placeholder="e.g. 8.5"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm font-bold focus:outline-none focus:border-orange-500/50"
                  />
                  <span className="text-[9px] text-gray-500 font-black self-center">Cr</span>
                  <button
                    onClick={handleSubmit}
                    disabled={!myPrediction}
                    className="px-4 py-2 bg-orange-500 rounded-xl text-[9px] font-black text-white uppercase tracking-widest disabled:opacity-40"
                  >
                    Lock
                  </button>
                </div>
              </div>
            )
          ) : (
            // ── Results ──
            <div className="space-y-2">
              <div className="text-center mb-3">
                <p className="text-[8px] text-gray-500 uppercase tracking-widest">Final Price</p>
                <p className="text-2xl font-black text-orange-400">₹{soldPrice?.toFixed(1)} Cr</p>
              </div>
              {winner && (
                <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2 mb-2">
                  <Trophy size={12} className="text-yellow-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-black text-yellow-400 truncate">
                      🎯 {winner.uid === userId ? 'You' : winner.name} — closest!
                    </p>
                    <p className="text-[8px] text-gray-500">
                      Predicted ₹{winner.prediction?.toFixed(1)} Cr (off by ₹{winner.diff?.toFixed(1)} Cr)
                    </p>
                  </div>
                </div>
              )}
              {Object.entries(predictions)
                .sort((a, b) => Math.abs(a[1].prediction - soldPrice) - Math.abs(b[1].prediction - soldPrice))
                .slice(0, 4)
                .map(([uid, data], i) => (
                  <div key={uid} className={`flex items-center gap-2 py-1.5 px-3 rounded-xl ${uid === userId ? 'bg-white/5' : ''}`}>
                    <span className="text-[8px] text-gray-600 w-4 font-bold">{i + 1}</span>
                    <span className="text-[9px] font-black text-gray-300 flex-1 truncate">
                      {uid === userId ? 'You' : data.name}
                    </span>
                    <span className="text-[9px] font-black text-white">₹{data.prediction?.toFixed(1)}</span>
                    <span className="text-[8px] text-gray-500">
                      (±{Math.abs(data.prediction - soldPrice).toFixed(1)})
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
