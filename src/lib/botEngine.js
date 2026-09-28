/**
 * Bot Engine v6.7 — Realistic IPL Auction Engine
 * Dynamic per-player per-franchise valuation.
 * Prices emerge naturally from competing valuations.
 * No fixed caps. No uniform stopping points.
 */

import { ref, runTransaction, push } from 'firebase/database';
import { rtdb } from './firebase';
import { IPL_PLAYERS } from '../data/players';

// ── Franchise profiles ────────────────────────────────────────────────────────
export const FRANCHISE_OWNERS = {
  CSK: {
    ownerName: 'N. Srinivasan',
    strategy: 'balanced',
    avatar: '👔',
    rolePriority: { Batsman: 8, 'Wicket-Keeper': 7, 'All-Rounder': 9, Bowler: 7 },
    preferExperience: true,
    nameAffinities: ['dhoni', 'jadeja', 'chahar', 'gaikwad', 'ruturaj'],
  },
  MI: {
    ownerName: 'Mukesh Ambani',
    strategy: 'aggressive',
    avatar: '💼',
    rolePriority: { Batsman: 9, 'Wicket-Keeper': 8, 'All-Rounder': 10, Bowler: 8 },
    preferExperience: false,
    nameAffinities: ['rohit', 'bumrah', 'hardik', 'pandya', 'suryakumar', 'sky'],
  },
  RCB: {
    ownerName: 'Virat Kohli XI',
    strategy: 'star_hunter',
    avatar: '🔴',
    rolePriority: { Batsman: 10, 'Wicket-Keeper': 7, 'All-Rounder': 8, Bowler: 6 },
    preferExperience: true,
    nameAffinities: ['kohli', 'maxwell', 'du plessis', 'faf', 'patidar', 'siraj'],
  },
  KKR: {
    ownerName: 'Shah Rukh Khan',
    strategy: 'unpredictable',
    avatar: '⭐',
    rolePriority: { Batsman: 8, 'Wicket-Keeper': 7, 'All-Rounder': 9, Bowler: 8 },
    preferExperience: false,
    nameAffinities: ['russell', 'narine', 'rinku', 'starc', 'venkatesh'],
  },
  DC: {
    ownerName: 'Parth Jindal',
    strategy: 'data_driven',
    avatar: '📊',
    rolePriority: { Batsman: 7, 'Wicket-Keeper': 8, 'All-Rounder': 9, Bowler: 9 },
    preferExperience: false,
    nameAffinities: ['pant', 'axar', 'kuldeep', 'warner', 'hetmyer'],
  },
  PBKS: {
    ownerName: 'Preity Zinta',
    strategy: 'squad_need',
    avatar: '🌟',
    rolePriority: { Batsman: 9, 'Wicket-Keeper': 9, 'All-Rounder': 8, Bowler: 7 },
    preferExperience: true,
    nameAffinities: ['bairstow', 'curran', 'arshdeep', 'shikhar', 'dhawan'],
  },
  RR: {
    ownerName: 'Manoj Badale',
    strategy: 'value_hunter',
    avatar: '🧮',
    rolePriority: { Batsman: 7, 'Wicket-Keeper': 7, 'All-Rounder': 9, Bowler: 8 },
    preferExperience: false,
    nameAffinities: ['samson', 'jaiswal', 'boult', 'buttler', 'ashwin'],
  },
  SRH: {
    ownerName: 'Kalanithi Maran',
    strategy: 'aggressive',
    avatar: '📺',
    rolePriority: { Batsman: 8, 'Wicket-Keeper': 7, 'All-Rounder': 8, Bowler: 10 },
    preferExperience: true,
    nameAffinities: ['cummins', 'klaasen', 'head', 'bhuvneshwar', 'shaheen'],
  },
  GT: {
    ownerName: 'CVC Capital',
    strategy: 'balanced',
    avatar: '💹',
    rolePriority: { Batsman: 8, 'Wicket-Keeper': 7, 'All-Rounder': 9, Bowler: 8 },
    preferExperience: false,
    nameAffinities: ['gill', 'rashid', 'shami', 'sudharsan', 'tewatia'],
  },
  LSG: {
    ownerName: 'Sanjiv Goenka',
    strategy: 'squad_need',
    avatar: '🏗️',
    rolePriority: { Batsman: 8, 'Wicket-Keeper': 8, 'All-Rounder': 8, Bowler: 8 },
    preferExperience: false,
    nameAffinities: ['kl rahul', 'quinton', 'mark wood', 'stoinis', 'pooran'],
  },
};

// ── Strategy configs ──────────────────────────────────────────────────────────
const STRATEGY = {
  aggressive: {
    bidProbabilityBase: 0.82,
    valuationMultiplier: 1.20,
    fightBaseChance: 0.75,
    thinkMin: 3000, thinkMax: 6000,
    budgetReserveRatio: 0.12,
    maxSingleSpendRatio: 0.50,
    futureDiscountFactor: 0.65,
    randomVariance: 0.30,
  },
  balanced: {
    bidProbabilityBase: 0.65,
    valuationMultiplier: 1.0,
    fightBaseChance: 0.58,
    thinkMin: 4000, thinkMax: 8000,
    budgetReserveRatio: 0.18,
    maxSingleSpendRatio: 0.38,
    futureDiscountFactor: 0.82,
    randomVariance: 0.20,
  },
  star_hunter: {
    bidProbabilityBase: 0.72,
    valuationMultiplier: 1.30,
    fightBaseChance: 0.82,
    thinkMin: 3500, thinkMax: 7000,
    budgetReserveRatio: 0.10,
    maxSingleSpendRatio: 0.60,
    futureDiscountFactor: 0.55,
    randomVariance: 0.25,
  },
  data_driven: {
    bidProbabilityBase: 0.58,
    valuationMultiplier: 0.88,
    fightBaseChance: 0.48,
    thinkMin: 5000, thinkMax: 9000,
    budgetReserveRatio: 0.22,
    maxSingleSpendRatio: 0.32,
    futureDiscountFactor: 0.92,
    randomVariance: 0.12,  // most predictable
  },
  unpredictable: {
    bidProbabilityBase: 0.70,
    valuationMultiplier: 1.05,
    fightBaseChance: 0.62,
    thinkMin: 2000, thinkMax: 10000,
    budgetReserveRatio: 0.08,
    maxSingleSpendRatio: 0.65,
    futureDiscountFactor: 0.48,
    randomVariance: 0.70,  // wildly unpredictable
  },
  squad_need: {
    bidProbabilityBase: 0.73,
    valuationMultiplier: 1.12,
    fightBaseChance: 0.70,
    thinkMin: 4000, thinkMax: 8000,
    budgetReserveRatio: 0.20,
    maxSingleSpendRatio: 0.42,
    futureDiscountFactor: 0.78,
    randomVariance: 0.18,
  },
  value_hunter: {
    bidProbabilityBase: 0.55,
    valuationMultiplier: 0.82,
    fightBaseChance: 0.42,
    thinkMin: 5000, thinkMax: 10000,
    budgetReserveRatio: 0.25,
    maxSingleSpendRatio: 0.28,
    futureDiscountFactor: 0.88,
    randomVariance: 0.15,
  },
};

// ── Player rating 0–10 ────────────────────────────────────────────────────────
function ratePlayer(player) {
  if (!player?.stats) return 2;
  const s = player.stats;
  const n = v => (typeof v === 'number' && isFinite(v)) ? v : null;
  const role = (player.role || '').toLowerCase();

  const runs = n(s.runs); const avg = n(s.avg); const sr = n(s.sr);
  const wk = n(s.wickets); const ec = n(s.econ);
  const matches = n(s.matches);

  let finalScore;
  if (role.includes('bowler')) {
    const parts = [];
    if (wk !== null) parts.push(Math.min(10, wk / 18));
    if (ec !== null) parts.push(Math.min(10, (11 - ec) / 2));
    finalScore = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 2;
  } else if (role.includes('all')) {
    const parts = [];
    if (runs !== null) parts.push(Math.min(10, runs / 600));
    if (avg !== null)  parts.push(Math.min(10, (avg - 10) / 3.5));
    if (sr !== null)   parts.push(Math.min(10, (sr - 90) / 9));
    if (wk !== null)   parts.push(Math.min(10, wk / 18));
    if (ec !== null)   parts.push(Math.min(10, (11 - ec) / 2));
    finalScore = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 3;
  } else {
    // Batsman / WK
    const parts = [];
    if (runs !== null) parts.push(Math.min(10, runs / 600));
    if (avg !== null)  parts.push(Math.min(10, (avg - 10) / 3.5));
    if (sr !== null)   parts.push(Math.min(10, (sr - 90) / 9));
    finalScore = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 2;
  }

  // Experience bonus
  if (matches !== null && matches > 100) finalScore = Math.min(10, finalScore + 0.6);
  else if (matches !== null && matches > 60) finalScore = Math.min(10, finalScore + 0.3);

  return Math.max(0, Math.min(10, finalScore));
}

// ── Banded market value — realistic IPL price tiers ──────────────────────────
// Based on actual player rating distribution (max real rating ~8.9)
// Only true elites reach ₹15+ Cr. Average players ₹2–5 Cr. Backups < ₹1.5 Cr.
function baseMarketValue(rating) {
  if (rating >= 8.5) return 15 + (rating - 8.5) * 8;   // ₹15–19 Cr (true elite)
  if (rating >= 7.5) return 7  + (rating - 7.5) * 8;   // ₹7–15 Cr  (quality)
  if (rating >= 6.0) return 3  + (rating - 6.0) * 2.6; // ₹3–7 Cr   (good)
  if (rating >= 4.0) return 1.2 + (rating - 4.0) * 0.9;// ₹1.2–3 Cr (average)
  return 0.3 + rating * 0.2;                             // ₹0.3–1 Cr (backup)
}

// ── Squad analysis ────────────────────────────────────────────────────────────
function analyseSquad(squad) {
  const counts = { Batsman: 0, Bowler: 0, 'All-Rounder': 0, 'Wicket-Keeper': 0 };
  squad.forEach(entry => {
    const pid = typeof entry === 'string' ? entry : entry?.id;
    const p = IPL_PLAYERS.find(x => x.id === pid);
    if (p?.role && counts[p.role] !== undefined) counts[p.role]++;
  });
  return { counts, totalPlayers: squad.length };
}

// ── Upcoming good players of same role ───────────────────────────────────────
function upcomingGoodPlayers(playerOrder, currentIdx, role) {
  if (!Array.isArray(playerOrder)) return 0;
  return playerOrder
    .slice(currentIdx + 1, currentIdx + 40)
    .filter(idx => {
      const p = IPL_PLAYERS[idx];
      return p?.role === role && ratePlayer(p) >= 6.5;
    }).length;
}

// ── Core valuation engine ─────────────────────────────────────────────────────
function calculateValuation(bot, player, stratCfg, squadAnalysis, playerOrder, currentIdx) {
  const rating = ratePlayer(player);
  const marketVal = baseMarketValue(rating);

  // 1. Role priority (franchise-specific)
  const rolePri = (bot.franchiseInfo?.rolePriority?.[player.role] || 7) / 10;
  const roleMult = 0.65 + rolePri * 0.7; // 0.65x to 1.35x

  // 2. Squad need
  const roleCount = squadAnalysis.counts[player.role] || 0;
  const needMult = roleCount === 0 ? 1.40
                 : roleCount === 1 ? 1.18
                 : roleCount === 2 ? 1.00
                 : 0.70;

  // 3. Name affinity (franchise-specific player preferences)
  const affinities = bot.franchiseInfo?.nameAffinities || [];
  const playerNameLower = (player.name || '').toLowerCase();
  const hasAffinity = affinities.some(a => playerNameLower.includes(a));
  const affinityMult = hasAffinity ? 1.45 : 1.0;

  // 4. Experience preference
  const matches = typeof player.stats?.matches === 'number' ? player.stats.matches : 0;
  const expMult = bot.franchiseInfo?.preferExperience
    ? (matches > 100 ? 1.12 : matches > 50 ? 1.04 : 0.94)
    : 1.0;

  // 5. Future planning — discount if better players of same role are coming
  const upcoming = upcomingGoodPlayers(playerOrder, currentIdx, player.role);
  const futureDisc = Math.max(0.55, 1 - upcoming * 0.05 * stratCfg.futureDiscountFactor);

  // 6. Purse management — hard cap based on budget situation
  const slotsLeft = Math.max(1, 25 - squadAnalysis.totalPlayers);
  const minReserve = Math.max(
    bot.budgetRemaining * stratCfg.budgetReserveRatio,
    slotsLeft * 0.3
  );
  const spendable = Math.max(0, bot.budgetRemaining - minReserve);
  const maxSpendable = spendable * stratCfg.maxSingleSpendRatio;

  // 7. Strategy multiplier + controlled random variance
  // Variance is per-franchise-per-player (set once, cached by caller)
  const stratMult = stratCfg.valuationMultiplier;

  // Combine
  let val = marketVal * roleMult * needMult * affinityMult * expMult * futureDisc * stratMult;

  // Hard cap: spendable budget
  val = Math.min(val, maxSpendable);

  // Floor: at least base price
  val = Math.max(player.basePrice || 0.3, val);

  return Number(val.toFixed(2));
}

// ── BotEngine ─────────────────────────────────────────────────────────────────
export class BotEngine {
  constructor(auctionId, getSyncedTime, defaultBudget = 120) {
    this.auctionId = auctionId;
    this.getSyncedTime = getSyncedTime;
    this.defaultBudget = defaultBudget;
    this.bots = {};
    this.pendingBid = {};
    this.destroyed = false;
    this._cache = {};         // `${teamId}_${playerId}` → { maxVal, fightChance, variance }
    this._playerOrder = [];
    this._currentIdx = 0;
  }

  setPlayerOrder(order) { this._playerOrder = order || []; }

  registerBots(roomTeams, allTeamIds) {
    const occupied = new Set((roomTeams || []).map(r => r.teamId).filter(Boolean));
    allTeamIds.forEach(teamId => {
      if (occupied.has(teamId) || this.bots[teamId]) return;
      const fi = FRANCHISE_OWNERS[teamId] || {
        ownerName: `${teamId} Owner`, strategy: 'balanced',
        avatar: '🤖', rolePriority: {}, preferExperience: false, nameAffinities: [],
      };
      this.bots[teamId] = {
        teamId, ownerName: fi.ownerName, avatar: fi.avatar,
        franchiseInfo: fi, stratCfg: STRATEGY[fi.strategy] || STRATEGY.balanced,
        budgetRemaining: this.defaultBudget, squad: [], uid: `bot_${teamId}`,
      };
    });
  }

  syncBotState(teamsData) {
    if (!teamsData) return;
    Object.values(teamsData).forEach(t => {
      const bot = this.bots[t.teamId];
      if (bot) {
        bot.budgetRemaining = t.budgetRemaining ?? this.defaultBudget;
        bot.squad = t.squad || [];
      }
    });
  }

  onLiveState(liveState, settings) {
    if (this.destroyed || !liveState) return;
    if (liveState.status !== 'bidding') {
      Object.keys(this.pendingBid).forEach(tid => {
        clearTimeout(this.pendingBid[tid]);
        delete this.pendingBid[tid];
      });
      return;
    }

    if (typeof liveState.playerOrderIndex === 'number') {
      this._currentIdx = liveState.playerOrderIndex;
    }

    const currentBid = liveState.currentBid || 0;
    const highBidderId = liveState.highBidderId || '';
    const playerId = liveState.playerId;
    const timerEndsAt = liveState.timerEndsAt || 0;
    const player = IPL_PLAYERS.find(p => p.id === playerId);
    if (!player) return;

    Object.values(this.bots).forEach(bot => {
      if (this.destroyed || this.pendingBid[bot.teamId]) return;
      if (highBidderId === bot.uid) return;

      const sqAnalysis = analyseSquad(bot.squad);
      const cacheKey = `${bot.teamId}_${playerId}`;

      // Calculate valuation ONCE per player per bot — cached
      if (!this._cache[cacheKey]) {
        const baseVal = calculateValuation(
          bot, player, bot.stratCfg, sqAnalysis,
          this._playerOrder, this._currentIdx
        );
        // Apply random variance here (once, stable for this player)
        const variance = bot.stratCfg.randomVariance;
        const swing = 1 + (Math.random() * 2 - 1) * variance;
        const finalMaxVal = Math.max(player.basePrice || 0.3, baseVal * Math.max(0.3, swing));

        // Fight chance — how persistent this bot is on THIS player
        const roleCount = sqAnalysis.counts[player.role] || 0;
        const needBonus = roleCount === 0 ? 0.18 : roleCount === 1 ? 0.08 : 0;
        const affinities = bot.franchiseInfo?.nameAffinities || [];
        const hasAffinity = affinities.some(a => (player.name || '').toLowerCase().includes(a));
        const affinityBonus = hasAffinity ? 0.14 : 0;
        const fightChance = Math.min(0.94,
          bot.stratCfg.fightBaseChance + needBonus + affinityBonus
          + (Math.random() * 0.12 - 0.06)
        );

        this._cache[cacheKey] = { maxVal: Number(finalMaxVal.toFixed(2)), fightChance };
      }

      const { maxVal, fightChance } = this._cache[cacheKey];

      // Next bid
      const inc = currentBid < 2 ? 0.10
                : currentBid < 5 ? 0.20
                : currentBid < 10 ? 0.25
                : 0.50;
      const nextBid = currentBid === 0 ? (player.basePrice || 0.3) : currentBid + inc;

      // Exit if beyond max valuation
      if (nextBid > maxVal) return;

      // Budget safety check
      const slotsLeft = Math.max(1, 25 - sqAnalysis.totalPlayers - 1);
      if (nextBid > bot.budgetRemaining - slotsLeft * 0.3) return;

      // Bid probability — higher when price is well below max (more interest)
      const headroom = (maxVal - nextBid) / Math.max(1, maxVal);
      const bidProb = bot.stratCfg.bidProbabilityBase * (0.4 + headroom * 1.2);
      if (Math.random() > bidProb) return;

      // Fight chance — may back off even within valuation for realism
      if (currentBid > 0 && Math.random() > fightChance) return;

      // Think time
      const timeLeft = timerEndsAt - this.getSyncedTime();
      const think = Math.min(
        bot.stratCfg.thinkMin + Math.random() * (bot.stratCfg.thinkMax - bot.stratCfg.thinkMin),
        timeLeft - 2000
      );
      if (think < 500) return;

      this.pendingBid[bot.teamId] = setTimeout(() => {
        delete this.pendingBid[bot.teamId];
        if (!this.destroyed) this._executeBid(bot, nextBid, settings, player);
      }, think);
    });
  }

  async _executeBid(bot, amount, settings, player) {
    if (this.destroyed) return;
    try {
      const liveRef = ref(rtdb, `auctions/${this.auctionId}/live`);
      let finalAmount = amount;
      let aborted = false;

      await runTransaction(liveRef, currentData => {
        if (!currentData || currentData.status !== 'bidding') { aborted = true; return; }
        if (currentData.highBidderId === bot.uid) { aborted = true; return; }

        const cBid = currentData.currentBid || 0;
        const inc = cBid < 2 ? 0.10 : cBid < 5 ? 0.20 : cBid < 10 ? 0.25 : 0.50;
        const nBid = cBid === 0 ? (player?.basePrice || 0.3) : cBid + inc;

        const cached = this._cache[`${bot.teamId}_${currentData.playerId}`];
        if (cached && nBid > cached.maxVal) { aborted = true; return; }
        if (nBid > bot.budgetRemaining) { aborted = true; return; }

        finalAmount = Number(nBid.toFixed(2));
        currentData.currentBid = finalAmount;
        currentData.highBidderId = bot.uid;
        currentData.highBidderName = bot.ownerName;
        currentData.highBidderTeamId = bot.teamId;
        currentData.timerEndsAt = this.getSyncedTime() + (settings?.bidTimer || 10) * 1000;
        return currentData;
      });

      if (aborted) return;

      await push(ref(rtdb, `auctions/${this.auctionId}/messages`), {
        userId: 'system', userName: 'System',
        text: `₹${finalAmount.toFixed(2)} Cr — ${bot.ownerName} ${bot.avatar} (${bot.teamId})`,
        type: 'log', timestamp: Date.now(),
      });
    } catch (e) {
      console.warn('Bot bid error:', e?.message);
    }
  }

  destroy() {
    this.destroyed = true;
    Object.keys(this.pendingBid).forEach(tid => clearTimeout(this.pendingBid[tid]));
    this.pendingBid = {};
    this._cache = {};
  }
}
