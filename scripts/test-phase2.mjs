import test from 'node:test';
import assert from 'node:assert/strict';
import { IPL_PLAYERS } from '../src/data/players.js';
import { TEAMS } from '../src/data/teams.js';
import { rateSquad } from '../src/lib/playerRating.js';
import { buildAISquads, selectAIPlayingXI, getXIProblems, resolvePlayers } from '../src/lib/aiSquadBuilder.js';
import { buildTournamentTeams } from '../src/lib/tournamentTeams.js';
import { buildSeasonShape, getPlayoffPath } from '../src/lib/tournamentModel.js';

const teamIds = TEAMS.map(t => t.id);
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function assertAI(teams, owned = new Set()) {
  const assigned = new Set(owned);
  for (const t of Object.values(teams)) {
    assert.ok(t.squad.length >= 18 && t.squad.length <= 25, t.teamId);
    assert.equal(t.playingXI.length, 11, t.teamId);
    assert.ok(t.ready, `${t.teamId}: ${t.issues}`);
    assert.deepEqual(getXIProblems(t.squad, t.playingXI, IPL_PLAYERS, true), []);
    assert.ok(resolvePlayers(t.squad).filter(p => p.country !== 'IND').length <= 8);
    assert.ok(new Set(resolvePlayers(t.squad).map(p => p.role)).size === 4);
    assert.equal(t.rating, rateSquad(resolvePlayers(t.playingXI)));
    for (const p of t.squad) {
      assert.ok(!assigned.has(p.id), `Duplicate or human-owned ${p.id}`);
      assigned.add(p.id);
    }
  }
}

// Freeze real data: any attempted mutation fails in ESM strict mode.
freeze(IPL_PLAYERS);

test('all ten AI teams have unique balanced squads and legal rated XIs', () => assertAI(buildAISquads(teamIds)));

test('0–10 human-team scenarios preserve ownership and give remaining AI teams valid squads', () => {
  for (let humanCount = 0; humanCount <= 10; humanCount++) {
    // Distribute across the data, including both valuable and depth players.
    const players = [...IPL_PLAYERS].sort((a, b) => a.id.localeCompare(b.id));
    const humanIds = new Set(players.slice(0, humanCount * 25).map(p => p.id));
    const squads = buildAISquads(teamIds.slice(humanCount), humanIds);
    assert.equal(Object.keys(squads).length, 10 - humanCount);
    assertAI(squads, humanIds);
  }
});

test('same ownership and team/player input in another order produce identical AI squads', () => {
  const owned = new Set(IPL_PLAYERS.slice(0, 65).map(p => p.id));
  const first = buildAISquads(teamIds, owned);
  assert.deepEqual(buildAISquads([...teamIds].reverse(), new Set([...owned].reverse()), [...IPL_PLAYERS].reverse()), first);
  assert.deepEqual(buildAISquads([...teamIds, teamIds[0]], owned), first);
});

test('aiOnly players are eligible but human ownership always overrides the flag', () => {
  const reserved = IPL_PLAYERS.filter(p => p.aiOnly);
  const source = reserved[0];
  const isolated = buildAISquads(['MI'], new Set(), [source]);
  assert.equal(isolated.MI.squad[0].id, source.id);
  const owned = new Set(reserved.map(p => p.id));
  assertAI(buildAISquads(teamIds, owned), owned);
});

test('depleted pool stays unique, reports shortage, and never fabricates enough players', () => {
  const pool = IPL_PLAYERS.slice(0, 13);
  const r = buildAISquads(['MI', 'CSK'], new Set(), pool);
  const ids = Object.values(r).flatMap(t => t.squad.map(p => p.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length <= pool.length);
  for (const t of Object.values(r)) { assert.equal(t.ready, false); assert.ok(t.issues.length); }
});

test('missing keepers and too few domestic players cannot be reported ready', () => {
  for (const pool of [IPL_PLAYERS.filter(p => p.role !== 'Wicket-Keeper'), IPL_PLAYERS.filter(p => p.country !== 'IND')]) {
    const r = buildAISquads(['MI'], new Set(), pool).MI;
    assert.equal(r.ready, false);
    assert.ok(r.issues.length);
    assert.ok(resolvePlayers(r.playingXI).filter(p => p.country !== 'IND').length <= 4);
  }
});

test('XI optimizer can substitute a domestic batter to fit a needed overseas keeper', () => {
  const pool = IPL_PLAYERS.filter(p => p.country === 'IND' && p.role !== 'Wicket-Keeper').slice(0, 16);
  pool.push(...IPL_PLAYERS.filter(p => p.country !== 'IND' && p.role === 'Wicket-Keeper').slice(0, 3));
  const xi = selectAIPlayingXI(pool);
  assert.deepEqual(getXIProblems(pool, xi, pool, true), []);
});

test('duplicate source IDs cannot create duplicate squad entries', () => {
  assert.deepEqual(buildAISquads(['MI'], new Set(), [...IPL_PLAYERS, ...IPL_PLAYERS.slice(0, 30)]), buildAISquads(['MI']));
});

function humanRoom() {
  const squads = buildAISquads(['MI', 'RCB']);
  return freeze({
    roomTeams: Object.values(squads).map((t, i) => ({ teamId: t.teamId, userId: `human${i}`, squad: t.squad.map((p, j) => ({ ...p, bid: j + 0.5 })) })),
    auctionPlayers: Object.values(squads).map((t, i) => ({ id: `human${i}`, name: `Manager ${i}`, team: t.teamId })),
    userSquads: Object.fromEntries(Object.values(squads).map((t, i) => [`human${i}`, { teamId: t.teamId, players: t.playingXI, captain: t.playingXI[0] }])),
  });
}

test('ten-team view preserves human arrays, bids and saved XIs exactly; rates XI only', () => {
  const input = humanRoom();
  const before = JSON.stringify(input);
  const output = buildTournamentTeams(input);
  assert.equal(output.teams.length, 10);
  for (const doc of input.roomTeams) {
    const t = output.teams.find(x => x.teamId === doc.teamId);
    assert.equal(t.squad, doc.squad);
    assert.equal(t.playingXI, input.userSquads[doc.userId].players);
    assert.equal(t.rating, rateSquad(resolvePlayers(t.playingXI)));
    assert.equal(t.isHuman, true);
    assert.equal(t.ready, true);
  }
  assertAI(output.aiTeams, output.humanOwnedPlayerIds);
  assert.equal(JSON.stringify(input), before);
});

test('empty human franchises stay human, including participants whose team doc has not loaded', () => {
  const output = buildTournamentTeams({ roomTeams: [{ teamId: 'MI', userId: 'h1', squad: [] }], auctionPlayers: [{ id: 'h2', team: 'RCB' }] });
  for (const id of ['MI', 'RCB']) {
    const t = output.teams.find(x => x.teamId === id);
    assert.equal(t.isHuman, true); assert.equal(t.squad.length, 0); assert.equal(t.ready, false);
    assert.equal(output.aiTeams[id], undefined);
  }
});

test('existing and legacy auction bot docs are AI-controlled without changing their auction data', () => {
  const docs = freeze([{ teamId: 'MI', userId: 'bot_MI', isBot: true, squad: [{ id: IPL_PLAYERS[0].id, bid: 12 }] }, { teamId: 'CSK', userId: 'bot_CSK', squad: [] }]);
  const output = buildTournamentTeams({ roomTeams: docs });
  assert.equal(Object.keys(output.aiTeams).length, 10);
  assert.equal(docs[0].squad[0].bid, 12);
  assertAI(output.aiTeams);
});

test('saved XI edits propagate to every human team while AI squads stay unchanged', () => {
  const input = humanRoom();
  const before = buildTournamentTeams(input);
  const doc = input.roomTeams[1];
  const replacement = doc.squad.find(p => !input.userSquads[doc.userId].players.includes(p.id) && resolvePlayers([p])[0].country === 'IND');
  const xi = [...input.userSquads[doc.userId].players]; xi[0] = replacement.id;
  const next = buildTournamentTeams({ ...input, userSquads: { ...input.userSquads, [doc.userId]: { players: xi } } });
  assert.deepEqual(next.teams.find(t => t.teamId === doc.teamId).playingXI, xi);
  assert.deepEqual(next.aiTeams, before.aiTeams);
});

test('stale, duplicate and foreign-player human XIs stay locked', () => {
  const input = humanRoom(); const doc = input.roomTeams[0];
  const xi = input.userSquads[doc.userId].players;
  for (const players of [[...xi.slice(0, 10), xi[0]], [...xi.slice(0, 10), 'unknown'], [...xi.slice(0, 10), input.roomTeams[1].squad[0].id], xi.slice(0, 10)]) {
    const t = buildTournamentTeams({ ...input, userSquads: { ...input.userSquads, [doc.userId]: { players } } }).teams.find(t => t.teamId === doc.teamId);
    assert.equal(t.ready, false); assert.ok(t.issues.length);
  }
});

test('conflicting human ownership is reported and protected from all AI teams', () => {
  const player = IPL_PLAYERS[0].id;
  const r = buildTournamentTeams({ roomTeams: [{ teamId: 'MI', userId: 'a', squad: [player] }, { teamId: 'RCB', userId: 'b', squad: [player] }] });
  for (const id of ['MI', 'RCB']) assert.ok(r.teams.find(t => t.teamId === id).issues.some(s => s.includes('duplicate')));
  assertAI(r.aiTeams, new Set([player]));
});

test('fixture calendar remains 45 unique pairings over nine matchdays; playoffs start locked', () => {
  const s = buildSeasonShape('test', teamIds);
  assert.equal(s.fixtures.length, 45); assert.equal(s.totalMatchdays, 9);
  assert.equal(new Set(s.fixtures.map(f => [f.teamA, f.teamB].sort().join('/'))).size, 45);
  for (let md = 1; md <= 9; md++) {
    const f = s.fixtures.filter(f => f.matchday === md);
    assert.equal(f.length, 5); assert.equal(new Set(f.flatMap(f => [f.teamA, f.teamB])).size, 10);
  }
  assert.equal(s.status, 'not_started');
  assert.ok(s.fixtures.every(f => f.result === null && f.winner === null));
  assert.deepEqual(getPlayoffPath().map(p => p.id), ['qualifier1', 'eliminator', 'qualifier2', 'final']);
  assert.ok(getPlayoffPath().every(p => p.locked));
});
