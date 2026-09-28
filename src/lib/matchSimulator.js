/**
 * Match Simulator Engine
 * Simulates T20 and ODI matches using existing player stats from players.js
 * No external API needed — purely based on runs, avg, sr, wickets, econ
 */

import { IPL_PLAYERS } from '../data/players';

function toNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' && (v.trim() === '-' || v.trim() === '')) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// Resolve squad (array of {id, bid} or strings) to full player objects
function resolvePlayers(squad) {
  return squad
    .map(s => {
      const pid = typeof s === 'string' ? s : s?.id;
      return IPL_PLAYERS.find(p => p.id === pid) || null;
    })
    .filter(Boolean);
}

// Get batting rating 0-1
function getBatRating(player) {
  const stats = player?.stats || {};
  const runs = toNum(stats.runs);
  const avg = toNum(stats.avg);
  const sr = toNum(stats.sr);
  const parts = [];
  if (runs !== null) parts.push(clamp(runs / 5000, 0, 1));
  if (avg !== null) parts.push(clamp((avg - 15) / 30, 0, 1));
  if (sr !== null) parts.push(clamp((sr - 100) / 80, 0, 1));
  if (parts.length === 0) return 0.45;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

// Get bowling rating 0-1
function getBowlRating(player) {
  const stats = player?.stats || {};
  const wickets = toNum(stats.wickets);
  const econ = toNum(stats.econ);
  const parts = [];
  if (wickets !== null) parts.push(clamp(wickets / 150, 0, 1));
  if (econ !== null) parts.push(clamp((10 - econ) / 3.5, 0, 1));
  if (parts.length === 0) return 0.35;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function getRoleScore(player) {
  const role = (player?.role || '').toLowerCase();
  const bat = getBatRating(player);
  const bowl = getBowlRating(player);
  if (role.includes('all-rounder')) return { bat: (bat + 0.5) / 2, bowl: (bowl + 0.5) / 2 };
  if (role.includes('bowler')) return { bat: bat * 0.3, bowl: bowl };
  if (role.includes('wicket')) return { bat: Math.min(1, bat + 0.1), bowl: 0 };
  return { bat, bowl: bowl * 0.2 };
}

// seeded random for reproducibility per matchId
function seededRand(seed) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function pickBatters(players) {
  const roles = ['Wicket-Keeper', 'Batsman', 'All-Rounder', 'Bowler'];
  const sorted = [...players].sort((a, b) => {
    return roles.indexOf(a.role) - roles.indexOf(b.role);
  });
  return sorted;
}

function pickBowlers(players) {
  const bowlers = players.filter(p =>
    p.role === 'Bowler' || p.role === 'All-Rounder'
  );
  if (bowlers.length === 0) return players.slice(0, 4);
  return bowlers;
}

/**
 * Simulate one innings
 * @param {object[]} battingTeam - resolved player objects
 * @param {object[]} bowlingTeam - resolved player objects
 * @param {number} totalOvers - 20 for T20, 50 for ODI
 * @param {function} rand - seeded random function
 * @returns {object} { runs, wickets, overs, topScorer, topBowler, overByOver }
 */
function simulateInnings(battingTeam, bowlingTeam, totalOvers, rand) {
  const batters = pickBatters(battingTeam);
  const bowlers = pickBowlers(bowlingTeam);

  let totalRuns = 0;
  let totalWickets = 0;
  const overByOver = [];
  const batterScores = {};
  batters.forEach(p => { batterScores[p.id] = { name: p.name, runs: 0, balls: 0, image: p.image }; });
  const bowlerFigures = {};
  bowlers.forEach(p => { bowlerFigures[p.id] = { name: p.name, wickets: 0, runs: 0, overs: 0 }; });

  let batIdx = 0; // current batsman index
  let wickets = 0;
  const maxWickets = Math.min(batters.length, 10);

  for (let over = 0; over < totalOvers; over++) {
    if (wickets >= maxWickets) break;

    const bowler = bowlers[over % bowlers.length];
    const bowlRating = getBowlRating(bowler);
    let overRuns = 0;

    for (let ball = 0; ball < 6; ball++) {
      if (wickets >= maxWickets) break;
      const batter = batters[Math.min(batIdx, batters.length - 1)];
      const batRating = getBatRating(batter);

      // Wicket probability: bowler good + low batter rating → higher
      const wicketProb = clamp(0.04 + bowlRating * 0.08 - batRating * 0.04, 0.02, 0.20);
      if (rand() < wicketProb) {
        wickets++;
        if (bowlerFigures[bowler.id]) bowlerFigures[bowler.id].wickets++;
        if (batterScores[batter.id]) batterScores[batter.id].balls++;
        batIdx++;
        continue;
      }

      // Runs per ball: based on SR and format
      const baseSR = toNum(batter.stats?.sr) || 130;
      const formatMult = totalOvers === 20 ? 1.0 : 0.75;
      const avgRunsPerBall = clamp((baseSR / 100) * formatMult * (0.7 + rand() * 0.6), 0, 3.5);
      // Reduce if bowler is good
      const adjRuns = avgRunsPerBall * (1 - bowlRating * 0.25);
      const ballRuns = Math.floor(adjRuns + rand() * 2);
      const actualRuns = clamp(ballRuns, 0, 6);

      overRuns += actualRuns;
      totalRuns += actualRuns;
      if (batterScores[batter.id]) {
        batterScores[batter.id].runs += actualRuns;
        batterScores[batter.id].balls++;
      }
      if (bowlerFigures[bowler.id]) bowlerFigures[bowler.id].runs += actualRuns;
    }

    if (bowlerFigures[bowler.id]) bowlerFigures[bowler.id].overs++;
    overByOver.push({ over: over + 1, runs: overRuns, wickets: totalWickets });
    totalWickets = wickets;
  }

  // Top scorer
  const topScorer = Object.values(batterScores)
    .filter(b => b.runs > 0)
    .sort((a, b) => b.runs - a.runs)[0] || null;

  // Top bowler
  const topBowler = Object.values(bowlerFigures)
    .filter(b => b.wickets > 0 || b.overs > 0)
    .sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)[0] || null;

  return {
    runs: totalRuns,
    wickets: totalWickets,
    overs: Math.min(overByOver.length, totalOvers),
    topScorer,
    topBowler,
    overByOver,
    batterScores: Object.values(batterScores),
    bowlerFigures: Object.values(bowlerFigures),
  };
}

/**
 * Simulate a full match between two squads
 * @param {object} teamA - { teamId, teamName, teamLogo, squad: [{id,bid},...] }
 * @param {object} teamB - same shape
 * @param {'t20'|'odi'} format
 * @param {string} matchId - used for seeded random (same matchId = same result)
 * @returns {object} full match result
 */
export function simulateMatch(teamA, teamB, format = 't20', matchId = 'match1') {
  const totalOvers = format === 'odi' ? 50 : 20;
  const seed = matchId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) + totalOvers;
  const rand = seededRand(seed);

  const playersA = resolvePlayers(teamA.squad || []);
  const playersB = resolvePlayers(teamB.squad || []);

  // Pad with generic players if squad is very small
  const minPlayers = 5;
  const padded = (players) => {
    if (players.length >= minPlayers) return players;
    const filler = IPL_PLAYERS.slice(0, minPlayers - players.length);
    return [...players, ...filler];
  };

  const pA = padded(playersA);
  const pB = padded(playersB);

  // Toss
  const tossWinner = rand() > 0.5 ? 'A' : 'B';
  const batFirst = rand() > 0.5 ? tossWinner : (tossWinner === 'A' ? 'B' : 'A');

  const [firstBat, firstBowl] = batFirst === 'A' ? [pA, pB] : [pB, pA];
  const [firstTeam, secondTeam] = batFirst === 'A'
    ? [teamA, teamB]
    : [teamB, teamA];

  const innings1 = simulateInnings(firstBat, firstBowl, totalOvers, rand);
  const innings2 = simulateInnings(
    batFirst === 'A' ? pB : pA,
    batFirst === 'A' ? pA : pB,
    totalOvers,
    rand,
    innings1.runs + 1 // target
  );

  const team1Won = innings1.runs > innings2.runs;
  const tie = innings1.runs === innings2.runs;

  return {
    format,
    totalOvers,
    tossWinner: tossWinner === 'A' ? teamA.teamName : teamB.teamName,
    batFirst: firstTeam.teamName,
    teamA: {
      ...teamA,
      innings: batFirst === 'A' ? innings1 : innings2,
    },
    teamB: {
      ...teamB,
      innings: batFirst === 'B' ? innings1 : innings2,
    },
    winner: tie ? null : (team1Won ? firstTeam.teamName : (batFirst === 'A' ? teamB.teamName : teamA.teamName)),
    winnerTeamId: tie ? null : (team1Won ? firstTeam.teamId : (batFirst === 'A' ? teamB.teamId : teamA.teamId)),
    tie,
    margin: tie ? 0 : Math.abs(innings1.runs - innings2.runs),
    matchId,
  };
}
