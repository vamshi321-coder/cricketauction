/** Phase 2: deterministic tournament squads. Pure data; no auction/database writes. */
import { IPL_PLAYERS } from '../data/players.js';
import { ratePlayer, rateSquad } from './playerRating.js';

const ROLES = ['Batsman', 'Wicket-Keeper', 'All-Rounder', 'Bowler'];
const MIN_SQUAD = 18;
const MAX_OVERSEAS_SQUAD = 8;
const MAX_OVERSEAS_XI = 4;

// Extend the existing franchise biases. Targets sum to 20–22, rather than
// depleting one role for early teams. Experience uses recorded matches only.
const PROFILES = {
  MI:   { label: 'Balanced',       targets: [5, 2, 6, 8] },
  CSK:  { label: 'Experienced',    targets: [6, 2, 5, 8], experience: 0.4 },
  RCB:  { label: 'Batting depth',  targets: [7, 2, 5, 7] },
  KKR:  { label: 'All-round depth', targets: [4, 2, 8, 7] },
  DC:   { label: 'Bowling depth',  targets: [5, 2, 6, 8] },
  PBKS: { label: 'Batting depth',  targets: [6, 2, 5, 8] },
  RR:   { label: 'Value picks',    targets: [5, 2, 6, 7], value: 0.4 },
  SRH:  { label: 'Bowling depth',  targets: [4, 2, 6, 9] },
  GT:   { label: 'Emerging core',  targets: [5, 2, 7, 7], experience: -0.3 },
  LSG:  { label: 'Squad depth',    targets: [5, 3, 6, 8] },
};
const DEFAULT_PROFILE = { label: 'Balanced', targets: [5, 2, 6, 8] };
const overseas = p => p.country !== 'IND'; // same rule as SquadSelector
export const playerId = entry => typeof entry === 'string' ? entry : entry?.id;
/** Returns true for players reserved exclusively for AI squads. */
export const isAIOnly = player => player?.aiOnly === true;
const compareIds = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function hash(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function uniquePlayers(players) {
  const seen = new Set();
  return (players || []).filter(p => {
    if (!p?.id || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

export function resolvePlayers(entries, players = IPL_PLAYERS) {
  const byId = new Map(players.map(p => [p.id, p]));
  return (Array.isArray(entries) ? entries : []).map(e => byId.get(playerId(e))).filter(Boolean);
}

/** Validate existing human XIs without changing them; AI adds role constraints. */
export function getXIProblems(squad, playingXI, players = IPL_PLAYERS, requireBalance = false) {
  const ids = (Array.isArray(playingXI) ? playingXI : []).map(playerId);
  const owned = new Set((Array.isArray(squad) ? squad : []).map(playerId));
  const known = new Set(players.map(p => p.id));
  const problems = [];
  if (ids.length !== 11) problems.push('Select exactly 11 players.');
  if (new Set(ids).size !== ids.length) problems.push('The XI contains a duplicate player.');
  if (ids.some(id => !id || !known.has(id))) problems.push('The XI contains an unknown player.');
  if (ids.some(id => !owned.has(id))) problems.push('Every XI player must belong to this squad.');
  const resolved = resolvePlayers(ids, players);
  if (resolved.filter(overseas).length > MAX_OVERSEAS_XI) problems.push('The XI allows at most 4 overseas players.');
  if (requireBalance) {
    if (!resolved.some(p => p.role === 'Wicket-Keeper')) problems.push('A wicketkeeper is needed.');
    if (resolved.filter(p => p.role === 'Bowler' || p.role === 'All-Rounder').length < 5) problems.push('At least 5 bowling options are needed.');
    if (resolved.filter(p => p.role === 'Batsman' || p.role === 'Wicket-Keeper').length < 3) problems.push('At least 3 specialist batting options are needed.');
  }
  return problems;
}

/**
 * Find the highest-rated legal balanced XI using the existing ratePlayer.
 * A small dynamic program considers substitutions across ALL roles, so a
 * greedy overseas pick cannot accidentally block a needed domestic keeper.
 * Missing roles/pool shortages produce diagnostics, never fabricated players.
 */
export function selectAIPlayingXI(squad) {
  const candidates = uniquePlayers(squad).sort((a, b) => compareIds(a.id, b.id));
  let states = new Map([['0/0/0/0/0', { ids: [], score: 0, os: 0, wk: 0, bowl: 0, bat: 0 }]]);
  for (const p of candidates) {
    const next = new Map(states);
    for (const s of states.values()) {
      const os = s.os + Number(overseas(p));
      if (s.ids.length === 11 || os > MAX_OVERSEAS_XI) continue;
      const wk = Math.min(1, s.wk + Number(p.role === 'Wicket-Keeper'));
      const bowl = Math.min(5, s.bowl + Number(p.role === 'Bowler' || p.role === 'All-Rounder'));
      const bat = Math.min(3, s.bat + Number(p.role === 'Batsman' || p.role === 'Wicket-Keeper'));
      const candidate = { ids: [...s.ids, p], score: s.score + ratePlayer(p), os, wk, bowl, bat };
      const key = `${candidate.ids.length}/${os}/${wk}/${bowl}/${bat}`;
      if (!next.has(key) || candidate.score > next.get(key).score) next.set(key, candidate);
    }
    states = next;
  }
  const options = [...states.values()];
  const balanced = options.filter(s => s.ids.length === 11 && s.wk && s.bowl === 5 && s.bat === 3);
  const chosen = (balanced.length ? balanced : options).sort((a, b) =>
    b.ids.length - a.ids.length || b.score - a.score
  )[0];
  // Role grouping is display order, not an invented batting position.
  return (chosen?.ids || []).sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || ratePlayer(b) - ratePlayer(a) || compareIds(a.id, b.id));
}

/**
 * AI-only players remain in the eligible pool, but human ownership always wins.
 * Canonical team ordering + a seeded preference score make output independent
 * of snapshot/input ordering. Snake drafting gives each team a core before depth.
 * Optional players argument supports honest shortage/edge-case tests.
 */
export function buildAISquads(aiTeamIds, humanOwnedIds = new Set(), players = IPL_PLAYERS) {
  const teamIds = [...new Set(aiTeamIds || [])].sort(compareIds);
  const owned = new Set([...humanOwnedIds].map(playerId));
  // aiOnly players are reserved for AI squads and never enter the human auction.
  // humanOwnedIds (from the auction room) can never contain an aiOnly player,
  // but we filter both directions for safety.
  const pool = uniquePlayers(players).filter(p => !owned.has(p.id) && ROLES.includes(p.role));
  const assigned = new Set(owned);
  const squads = Object.fromEntries(teamIds.map(id => [id, []]));
  const scores = new Map();
  for (const id of teamIds) {
    const profile = PROFILES[id] || DEFAULT_PROFILE;
    for (const p of pool) {
      const experience = Math.min(1, (Number(p.stats?.matches) || 0) / 150);
      const value = 1 - Math.min(1, (Number(p.basePrice) || 0) / 2);
      // Real ratings drive preference; a stable variation spreads ability
      // instead of every franchise taking only the top remaining stars.
      scores.set(`${id}/${p.id}`, ratePlayer(p) * 0.65 + hash(`${id}/${p.id}`) / 2 ** 32 * 3
        + (profile.experience || 0) * experience + (profile.value || 0) * value);
    }
  }
  function pick(id, role, core = false) {
    const squad = squads[id];
    const osLimit = core ? MAX_OVERSEAS_XI : MAX_OVERSEAS_SQUAD;
    const osCount = squad.filter(overseas).length;
    const available = pool.filter(p => !assigned.has(p.id) && (!role || p.role === role)
      && (!overseas(p) || osCount < osLimit));
    available.sort((a, b) => scores.get(`${id}/${b.id}`) - scores.get(`${id}/${a.id}`) || compareIds(a.id, b.id));
    const p = available[0];
    if (p) { squad.push(p); assigned.add(p.id); }
  }
  // Give every franchise the same minimum role coverage before filling benches.
  const coreRoles = ['Wicket-Keeper', 'Batsman', 'All-Rounder', 'Bowler', 'Batsman', 'Bowler', 'All-Rounder', 'Bowler', 'Batsman', 'Bowler', null];
  coreRoles.forEach((role, round) => {
    const order = round % 2 ? [...teamIds].reverse() : teamIds;
    order.forEach(id => pick(id, role, true));
  });
  for (let round = 0; round < 22; round++) {
    const order = round % 2 ? [...teamIds].reverse() : teamIds;
    for (const id of order) {
      const profile = PROFILES[id] || DEFAULT_PROFILE;
      const squad = squads[id];
      if (squad.length >= profile.targets.reduce((a, b) => a + b, 0)) continue;
      const needed = ROLES.map((role, i) => ({ role, deficit: profile.targets[i] - squad.filter(p => p.role === role).length }))
        .filter(x => x.deficit > 0).sort((a, b) => b.deficit - a.deficit);
      const before = squad.length;
      for (const { role } of needed) { pick(id, role); if (squad.length > before) break; }
      if (squad.length === before) pick(id, null);
    }
  }
  return Object.fromEntries(teamIds.map(teamId => {
    const squad = squads[teamId];
    const xi = selectAIPlayingXI(squad);
    const issues = getXIProblems(squad, xi, players, true);
    if (squad.length < MIN_SQUAD) issues.unshift(`Only ${squad.length} eligible players could be allocated; at least 18 are needed.`);
    return [teamId, {
      teamId, isAI: true, isHuman: false,
      squad: squad.map(p => ({ id: p.id, bid: 0 })),
      playingXI: xi.map(p => p.id),
      rating: rateSquad(xi),
      personality: (PROFILES[teamId] || DEFAULT_PROFILE).label,
      ready: issues.length === 0, issues,
    }];
  }));
}
