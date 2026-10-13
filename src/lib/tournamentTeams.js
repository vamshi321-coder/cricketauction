/** Read-only Phase 2 view. Auction ownership and saved human XIs are never written. */
import { TEAMS } from '../data/teams.js';
import { IPL_PLAYERS } from '../data/players.js';
import { rateSquad } from './playerRating.js';
import { buildAISquads, getXIProblems, playerId, resolvePlayers } from './aiSquadBuilder.js';

const list = value => Array.isArray(value) ? value : Object.values(value || {});
const isBot = entry => entry?.isBot === true || entry?.isAI === true || String(entry?.userId || entry?.uid || entry?.id || '').startsWith('bot_');

export function buildTournamentTeams({ roomTeams = [], auctionPlayers = [], userSquads = {}, players = IPL_PLAYERS } = {}) {
  const participants = list(auctionPlayers).filter(p => p?.team && !isBot(p));
  // A registered human stays human even with zero purchases. Bot docs have
  // isBot or bot_<TEAM> UIDs, including legacy Firestore copies without isBot.
  const humanDocs = list(roomTeams).filter(t => t?.teamId && !isBot(t));
  const humanTeamIds = new Set([...participants.map(p => p.team), ...humanDocs.map(t => t.teamId)]);
  const owned = new Set(humanDocs.flatMap(t => list(t.squad).map(playerId)).filter(Boolean));
  const aiTeams = buildAISquads(TEAMS.filter(t => !humanTeamIds.has(t.id)).map(t => t.id), owned, players);
  const conflicts = new Set();
  const ownership = new Map();
  for (const t of humanDocs) {
    for (const entry of list(t.squad)) {
      const id = playerId(entry);
      if (ownership.has(id)) { conflicts.add(t.teamId); conflicts.add(ownership.get(id)); }
      ownership.set(id, t.teamId);
    }
  }
  const teams = TEAMS.map(info => {
    if (!humanTeamIds.has(info.id)) return { ...info, ...aiTeams[info.id], teamName: info.name };
    const participant = participants.find(p => p.team === info.id);
    const docs = humanDocs.filter(t => t.teamId === info.id);
    const userId = participant?.uid || participant?.id || docs[0]?.userId || null;
    const doc = docs.find(t => t.userId === userId) || docs[0];
    const saved = userId ? userSquads[userId] : null;
    const squad = doc?.squad || [];
    const playingXI = Array.isArray(saved?.players) ? saved.players : [];
    const issues = getXIProblems(squad, playingXI, players);
    if (docs.length > 1 || participants.filter(p => p.team === info.id).length > 1) issues.push('Multiple human owners are recorded for this franchise.');
    if (conflicts.has(info.id)) issues.push('Auction ownership contains a duplicate player.');
    return {
      ...info, teamId: info.id, teamName: info.name,
      isAI: false, isHuman: true, userId,
      userName: participant?.name || doc?.userName || 'Manager',
      squad, playingXI, // original arrays preserved, including bids and XI order
      rating: rateSquad(resolvePlayers(playingXI, players)),
      ready: issues.length === 0, issues,
    };
  });
  return { teams, aiTeams, humanOwnedPlayerIds: owned, ready: teams.every(t => t.ready) };
}
