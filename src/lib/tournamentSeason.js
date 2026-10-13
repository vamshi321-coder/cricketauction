import { buildSeasonShape } from './tournamentModel.js';
import { resolvePlayers, playerId } from './aiSquadBuilder.js';
import { ENGINE_VERSION, normalizeTactic, validateMatchTeam, simulateT20Match, compactResult } from './t20Engine.js';

export const SEASON_SCHEMA = 3;
export function matchTeam(team, xi = team.playingXI) {
  const lookup = new Map(team.players.map(p => [p.id, p]));
  const ids = (xi || []).map(playerId);
  if (ids.some(id => !lookup.has(id))) throw new Error(`${team.teamId}: selected player is outside the season squad.`);
  return { teamId: team.teamId, players: ids.map(id => lookup.get(id)) };
}
export function createTournament(teams, { id, hostId, createdAt }) {
  if (!id || !hostId || teams.length !== 10 || new Set(teams.map(t => t.teamId)).size !== 10) throw new Error('A host and ten unique franchises are required.');
  const assigned = new Set();
  const roster = teams.map(t => {
    // Allow teams without Playing XI — they will get AI-default selections at match time
    const players = resolvePlayers(t.squad).map(p => ({ id: p.id, name: p.name, role: p.role, country: p.country, stats: { ...p.stats } }));
    for (const p of players) { if (assigned.has(p.id)) throw new Error(`Duplicate ownership for ${p.name}.`); assigned.add(p.id); }
    const xi = (t.playingXI && t.playingXI.length >= 11) ? t.playingXI.map(playerId) : players.slice(0, 11).map(p => p.id);
    const team = { teamId: t.teamId, name: t.teamName || t.name || t.teamId, userId: t.userId || '', isAI: !!t.isAI, players, squad: players.map(p => p.id), playingXI: xi };
    validateMatchTeam(matchTeam(team));
    return team;
  });
  const humans = roster.filter(t => !t.isAI);
  if (humans.some(t => !t.userId) || new Set(humans.map(t => t.userId)).size !== humans.length) throw new Error('Each human franchise needs its own manager.');
  return { ...buildSeasonShape(id, roster.map(t => t.teamId)), schema: SEASON_SCHEMA, engineVersion: ENGINE_VERSION, id, hostId, createdAt, roster, status: 'league', stage: 'league', revision: 0, results: {}, preparations: {}, champion: null };
}
export function assertSeason(season) {
  if (!season || season.schema !== SEASON_SCHEMA || season.engineVersion !== ENGINE_VERSION) throw new Error('This season uses an unsupported match-engine version.');
}
export const roundKey = season => `${season.id}:${season.revision}:${season.stage}:${season.currentMatchday}`;
export function currentFixtures(season) {
  if (!season || season.status === 'completed') return [];
  return (season.fixtures || []).filter(f => season.stage === 'league' ? f.stage === 'league' && f.matchday === season.currentMatchday : season.stage === 'qualifiers' ? ['qualifier1', 'eliminator'].includes(f.stage) : f.stage === season.stage);
}
export function missingPreparations(season) {
  const ids = new Set(currentFixtures(season).flatMap(f => [f.teamA, f.teamB]));
  return season.roster.filter(t => !t.isAI && ids.has(t.teamId) && season.preparations?.[t.teamId]?.round !== roundKey(season));
}
export function prepareTeam(season, actorId, { playingXI, tactic, tossDecision }, expectedRound) {
  assertSeason(season);
  if (season.status === 'completed' || expectedRound !== roundKey(season)) throw new Error('The round changed. Review the next fixture before confirming.');
  const team = season.roster.find(t => !t.isAI && t.userId === actorId);
  if (!team || !currentFixtures(season).some(f => f.teamA === team.teamId || f.teamB === team.teamId)) throw new Error('Your team has no match this round.');
  const xi = (playingXI || []).map(playerId);
  validateMatchTeam(matchTeam(team, xi));
  return { ...season, preparations: { ...(season.preparations || {}), [team.teamId]: { playingXI: xi, tactic: normalizeTactic(tactic), ...(['bat','bowl'].includes(tossDecision) ? {tossDecision} : {}), round: expectedRound } } };
}
export function standingsFor(season) {
  const rows = new Map(season.teams.map(teamId => [teamId, { teamId, played: 0, wins: 0, losses: 0, ties: 0, points: 0, runsFor: 0, ballsFor: 0, runsAgainst: 0, ballsAgainst: 0, wicketsTaken: 0, legalBallsBowled: 0, nrr: 0 }]));
  for (const fixture of season.fixtures.filter(f => f.stage === 'league')) {
    const result = season.results?.[fixture.fixtureId];
    if (!result) continue;
    for (const id of [fixture.teamA, fixture.teamB]) {
      const row = rows.get(id); row.played++;
      if (result.winner === id) { row.wins++; row.points += 2; }
      else if (result.winner) row.losses++;
      else { row.ties++; row.points++; }
      // Only regular innings count: Super Overs are excluded from NRR.
      for (const innings of result.innings) {
        const nrrBalls = innings.wickets === 10 ? innings.limit : innings.balls;
        if (innings.battingTeamId === id) { row.runsFor += innings.runs; row.ballsFor += nrrBalls; }
        else { row.runsAgainst += innings.runs; row.ballsAgainst += nrrBalls; row.wicketsTaken += innings.wickets; row.legalBallsBowled += innings.balls; }
      }
    }
  }
  for (const row of rows.values()) row.nrr = (row.ballsFor ? row.runsFor * 6 / row.ballsFor : 0) - (row.ballsAgainst ? row.runsAgainst * 6 / row.ballsAgainst : 0);
  return [...rows.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || b.nrr - a.nrr || (b.wicketsTaken / (b.legalBallsBowled || 1)) - (a.wicketsTaken / (a.legalBallsBowled || 1)) || season.teams.indexOf(a.teamId) - season.teams.indexOf(b.teamId));
}
const playoffFixture = (stage, a, b) => ({ fixtureId: `PO-${stage}-${a}-${b}`, matchday: 0, stage, teamA: a, teamB: b, status: 'scheduled', winner: null, result: null });

// Realtime Database object key order is not part of a match result.
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

export function fixturePlans(season, fixture) {
  return Object.fromEntries([fixture.teamA, fixture.teamB].map(id => {
    const team = season.roster.find(t => t.teamId === id);
    const saved = season.preparations?.[id];
    const plan = !team.isAI && saved?.round === roundKey(season) ? saved : { playingXI:team.playingXI, tactic:'balanced' };
    // Toss is decided inside the match, never by a previous readiness form.
    const {tossDecision, tacticTimeline, ...ready} = plan;
    return [id, ready];
  }));
}

/** Idempotence boundary: caller must commit only while id/revision still match. */
export function advanceRound(season, actorId, expectedRound, completedAt, played = null) {
  assertSeason(season);
  if (actorId !== season.hostId) throw new Error('Only the tournament host can run a round.');
  if (season.status === 'completed' || expectedRound !== roundKey(season)) throw new Error('This round has already finished or changed.');
  const pending = missingPreparations(season);
  if (pending.length) throw new Error(`Waiting for ${pending.map(t => t.teamId).join(', ')} to confirm their XI.`);
  const fixtures = currentFixtures(season);
  if (!fixtures.length) throw new Error('No fixtures are scheduled for this round.');
  if (played && !fixtures.some(f => f.fixtureId === played.fixtureId)) throw new Error('The played fixture is not in this round.');
  const results = { ...(season.results || {}) };
  const rank = standingsFor(season).map(t => t.teamId);
  for (const fixture of fixtures) {
    if (results[fixture.fixtureId]) throw new Error('A fixture in this round already has a result.');
    const a = season.roster.find(t => t.teamId === fixture.teamA), b = season.roster.find(t => t.teamId === fixture.teamB);
    const plans = fixturePlans(season, fixture);
    if (played?.fixtureId === fixture.fixtureId) {
      const mine = [a,b].find(t => !t.isAI && t.userId === actorId);
      if (!mine) throw new Error('This is not your fixture.');
      for (const t of [a,b]) {
        if (JSON.stringify(plans[t.teamId].playingXI) !== JSON.stringify(played.result.plans[t.teamId]?.playingXI)) throw new Error('A Playing XI changed during the match. Reopen the fixture.');
      }
      const input = played.result.plans[mine.teamId] || {};
      plans[mine.teamId] = { ...plans[mine.teamId], tactic:normalizeTactic(input.tactic),
        ...(['bat','bowl'].includes(input.tossDecision) ? {tossDecision:input.tossDecision} : {}),
        ...(input.tacticTimeline ? {tacticTimeline:input.tacticTimeline} : {}) };
    }
    const result = simulateT20Match(matchTeam(a, plans[a.teamId].playingXI), matchTeam(b, plans[b.teamId].playingXI), { seed: `${season.id}:${fixture.fixtureId}`, plans, playoffRank: fixture.stage === 'league' ? null : rank });
    if (played?.fixtureId === fixture.fixtureId && JSON.stringify(canonical(compactResult(result))) !== JSON.stringify(canonical(compactResult(played.result)))) throw new Error('The match changed before saving. Reopen the fixture.');
    results[fixture.fixtureId] = { ...compactResult(result), completedAt };
  }
  const next = { ...season, results, preparations: {}, revision: season.revision + 1, lastRoundAt: completedAt, lastRoundFixtures: fixtures.map(f => f.fixtureId) };
  next.fixtures = season.fixtures.map(f => results[f.fixtureId] ? { ...f, status: 'simulated', winner: results[f.fixtureId].winner || null } : f);
  if (season.stage === 'league' && season.currentMatchday < 9) next.currentMatchday++;
  else if (season.stage === 'league') {
    const top = standingsFor(next).map(t => t.teamId);
    next.status = 'playoffs'; next.stage = 'qualifiers';
    next.fixtures.push(playoffFixture('qualifier1', top[0], top[1]), playoffFixture('eliminator', top[2], top[3]));
  } else if (season.stage === 'qualifiers') {
    const q1 = fixtures.find(f => f.stage === 'qualifier1'), elim = fixtures.find(f => f.stage === 'eliminator');
    next.stage = 'qualifier2'; next.fixtures.push(playoffFixture('qualifier2', results[q1.fixtureId].loser, results[elim.fixtureId].winner));
  } else if (season.stage === 'qualifier2') {
    const q1 = season.fixtures.find(f => f.stage === 'qualifier1');
    next.stage = 'final'; next.fixtures.push(playoffFixture('final', results[q1.fixtureId].winner, results[fixtures[0].fixtureId].winner));
  } else if (season.stage === 'final') {
    next.status = 'completed'; next.stage = 'completed'; next.champion = results[fixtures[0].fixtureId].winner;
  }
  return next;
}

export function replayFixture(season, fixtureId) {
  assertSeason(season);
  const result = season.results?.[fixtureId];
  if (!result) throw new Error('This match has not been played.');
  const a = season.roster.find(t => t.teamId === result.teamA), b = season.roster.find(t => t.teamId === result.teamB);
  const fixture = season.fixtures.find(f => f.fixtureId === fixtureId);
  return simulateT20Match(matchTeam(a, result.plans[a.teamId].playingXI), matchTeam(b, result.plans[b.teamId].playingXI), { seed: result.seed, plans: result.plans, playoffRank: fixture.stage === 'league' ? null : standingsFor(season).map(t => t.teamId) });
}
