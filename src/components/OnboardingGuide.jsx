import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, CheckCircle } from 'lucide-react';

/**
 * Post-auction-start coach-mark tour.
 * Each step highlights a real DOM element via data-tour attribute.
 * Tooltip + arrow positions dynamically near the target element.
 * Shows only once per device (localStorage). Only appears AFTER auction starts.
 */

const STEPS = [
  {
    target: 'squad',
    title: 'Your Squad',
    body: 'All players you win in this auction appear here. Track your team as you build it.',
    emoji: '🧑‍🤝‍🧑',
    position: 'right',
  },
  {
    target: 'auction-controls',
    title: 'Auction Controls',
    body: 'Host uses these to start, pause, resume the auction and move to the next player.',
    emoji: '🎛️',
    position: 'bottom',
  },
  {
    target: 'purse',
    title: 'Your Purse',
    body: 'This is your remaining budget. Bid smartly — once it runs out you cannot bid anymore.',
    emoji: '💰',
    position: 'bottom',
  },
  {
    target: 'current-player',
    title: 'Current Player',
    body: 'The player up for auction right now. Check their stats and base price before bidding.',
    emoji: '🏏',
    position: 'top',
  },
  {
    target: 'bid-button',
    title: 'Place Your Bid',
    body: 'Tap BID to raise the price. The highest bid when the timer hits zero wins the player!',
    emoji: '⚡',
    position: 'top',
  },
  {
    target: 'participants',
    title: 'Other Participants',
    body: 'See all managers in your room, their teams, and remaining budgets.',
    emoji: '👥',
    position: 'left',
  },
  {
    target: 'top-controls',
    title: 'Top Controls',
    body: 'Access settings, toggle auction sounds ON/OFF, and manage the room from here.',
    emoji: '⚙️',
    position: 'bottom',
  },
];

const STORAGE_KEY = 'crickauction_tour_v5_done';
const ARROW_SIZE = 10;

function getTooltipStyle(rect, position, tooltipW = 280, tooltipH = 180) {
  if (!rect) return { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 16;

  let top, left;

  if (position === 'bottom') {
    top = rect.bottom + ARROW_SIZE + margin;
    left = rect.left + rect.width / 2 - tooltipW / 2;
  } else if (position === 'top') {
    top = rect.top - tooltipH - ARROW_SIZE - margin;
    left = rect.left + rect.width / 2 - tooltipW / 2;
  } else if (position === 'right') {
    top = rect.top + rect.height / 2 - tooltipH / 2;
    left = rect.right + ARROW_SIZE + margin;
  } else {
    // left
    top = rect.top + rect.height / 2 - tooltipH / 2;
    left = rect.left - tooltipW - ARROW_SIZE - margin;
  }

  // clamp to viewport
  left = Math.max(margin, Math.min(vw - tooltipW - margin, left));
  top = Math.max(margin, Math.min(vh - tooltipH - margin, top));

  return { position: 'fixed', top, left, width: tooltipW, zIndex: 9999 };
}

function getArrowStyle(rect, position) {
  if (!rect) return {};
  const vw = window.innerWidth;
  const margin = 16;
  const tooltipW = 280;

  let style = { position: 'absolute' };

  if (position === 'bottom') {
    // arrow points up (tooltip is below target)
    style.top = -ARROW_SIZE;
    const leftRaw = rect.left + rect.width / 2;
    const clampedLeft = Math.max(margin, Math.min(vw - tooltipW - margin, leftRaw - tooltipW / 2));
    style.left = leftRaw - clampedLeft - ARROW_SIZE;
    style.borderBottom = `${ARROW_SIZE}px solid #ff5500`;
    style.borderLeft = `${ARROW_SIZE}px solid transparent`;
    style.borderRight = `${ARROW_SIZE}px solid transparent`;
    style.width = 0;
    style.height = 0;
  } else if (position === 'top') {
    style.bottom = -ARROW_SIZE;
    const leftRaw = rect.left + rect.width / 2;
    const clampedLeft = Math.max(margin, Math.min(vw - tooltipW - margin, leftRaw - tooltipW / 2));
    style.left = leftRaw - clampedLeft - ARROW_SIZE;
    style.borderTop = `${ARROW_SIZE}px solid #ff5500`;
    style.borderLeft = `${ARROW_SIZE}px solid transparent`;
    style.borderRight = `${ARROW_SIZE}px solid transparent`;
    style.width = 0;
    style.height = 0;
  } else if (position === 'right') {
    style.left = -ARROW_SIZE;
    style.top = '50%';
    style.transform = 'translateY(-50%)';
    style.borderRight = `${ARROW_SIZE}px solid #ff5500`;
    style.borderTop = `${ARROW_SIZE}px solid transparent`;
    style.borderBottom = `${ARROW_SIZE}px solid transparent`;
    style.width = 0;
    style.height = 0;
  } else {
    style.right = -ARROW_SIZE;
    style.top = '50%';
    style.transform = 'translateY(-50%)';
    style.borderLeft = `${ARROW_SIZE}px solid #ff5500`;
    style.borderTop = `${ARROW_SIZE}px solid transparent`;
    style.borderBottom = `${ARROW_SIZE}px solid transparent`;
    style.width = 0;
    style.height = 0;
  }
  return style;
}

export default function OnboardingGuide({ auctionStarted }) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [targetRect, setTargetRect] = useState(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!auctionStarted) return;
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch (e) {}
    // Small delay so auction UI is fully rendered
    const t = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(t);
  }, [auctionStarted]);

  // Track target element position in real time (handles scroll/resize/rotation)
  useLayoutEffect(() => {
    if (!visible) return;
    const measure = () => {
      const el = document.querySelector(`[data-tour="${STEPS[step]?.target}"]`);
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect({ top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height });
      } else {
        setTargetRect(null);
      }
    };
    measure();
    rafRef.current = setInterval(measure, 300);
    return () => clearInterval(rafRef.current);
  }, [visible, step]);

  const finish = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
    setVisible(false);
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else finish();
  };

  if (!visible) return null;

  const current = STEPS[step];
  const tooltipStyle = getTooltipStyle(targetRect, current.position);
  const arrowStyle = getArrowStyle(targetRect, current.position);

  return (
    <>
      {/* Dark overlay with spotlight cutout */}
      <div
        className="fixed inset-0 z-[998] pointer-events-none"
        style={{
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(1px)',
        }}
      />

      {/* Spotlight highlight on target */}
      {targetRect && (
        <div
          className="fixed z-[999] pointer-events-none rounded-xl"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            boxShadow: '0 0 0 4px #ff5500, 0 0 0 9999px rgba(0,0,0,0.55)',
            transition: 'all 0.3s ease',
          }}
        />
      )}

      {/* Tooltip */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`tour-step-${step}`}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{ duration: 0.2 }}
          style={tooltipStyle}
          className="z-[9999] pointer-events-auto"
        >
          {/* Arrow */}
          {targetRect && <div style={arrowStyle} />}

          {/* Card */}
          <div className="bg-[#111] border border-orange-500/40 rounded-2xl overflow-hidden shadow-2xl shadow-orange-500/10">
            {/* Progress bar */}
            <div className="h-1 bg-white/5">
              <motion.div
                className="h-full bg-gradient-to-r from-orange-500 to-red-500"
                initial={{ width: 0 }}
                animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                transition={{ duration: 0.35 }}
              />
            </div>

            <div className="p-4">
              {/* Header row */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-[8px] font-black text-orange-500 uppercase tracking-widest">
                  Step {step + 1} of {STEPS.length}
                </span>
                <button
                  onClick={finish}
                  className="p-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <X size={12} className="text-gray-400" />
                </button>
              </div>

              {/* Content */}
              <div className="flex items-start gap-3 mb-4">
                <span className="text-2xl shrink-0">{current.emoji}</span>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-tight text-white mb-1">
                    {current.title}
                  </h3>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    {current.body}
                  </p>
                </div>
              </div>

              {/* Dots + buttons */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 flex-1">
                  {STEPS.map((_, i) => (
                    <div
                      key={i}
                      className={`rounded-full transition-all ${
                        i === step ? 'w-4 h-1.5 bg-orange-500' :
                        i < step ? 'w-1.5 h-1.5 bg-orange-500/40' :
                        'w-1.5 h-1.5 bg-white/10'
                      }`}
                    />
                  ))}
                </div>
                <button
                  onClick={finish}
                  className="text-[9px] font-black text-gray-500 uppercase tracking-widest hover:text-gray-300 transition-colors"
                >
                  Skip
                </button>
                <button
                  onClick={next}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl text-[9px] font-black text-white uppercase tracking-widest"
                >
                  {step === STEPS.length - 1 ? (
                    <><CheckCircle size={11} /> Done</>
                  ) : (
                    <>Next <ChevronRight size={11} /></>
                  )}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
