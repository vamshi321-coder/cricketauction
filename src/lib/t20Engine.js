/** Deterministic T20 game simulation, v1. Stats inform probabilities, not predictions. */
export const ENGINE_VERSION = 't20-v1';
export const TACTICS = ['balanced', 'attack', 'defend'];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const number = (v, fallback) => v !== null && v !== undefined && v !== '-' && Number.isFinite(Number(v)) ? Number(v) : fallback;
export const oversText = balls => `${Math.floor(balls / 6)}.${balls % 6}`;
export const normalizeTactic = value => TACTICS.includes(value) ? value : 'balanced';
export function seededRandom(seed) {
  let n = 2166136261;
  for (const c of String(seed)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return () => { n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const battingStrength = p => clamp((number(p.stats?.avg, 24) / 45 + number(p.stats?.sr, 115) / 170) / 2, .15, 1);
const bowlingStrength = p => clamp((number(p.stats?.wickets, 25) / 150 + (11 - number(p.stats?.econ, 9)) / 5) / 2, .15, 1);
export const isBowlingOption = p => p.role === 'Bowler' || p.role === 'All-Rounder';
export function validateMatchTeam(team) {
  const players = team?.players || [];
  if (!team?.teamId || players.length !== 11 || new Set(players.map(p => p.id)).size !== 11) throw new Error('Each team needs 11 unique players.');
  if (players.filter(p => p.country !== 'IND').length > 4) throw new Error(`${team.teamId}: maximum 4 overseas players.`);
  if (!players.some(p => p.role === 'Wicket-Keeper')) throw new Error(`${team.teamId}: select a wicketkeeper.`);
  if (players.filter(isBowlingOption).length < 5) throw new Error(`${team.teamId}: select at least 5 bowling options (bowlers/all-rounders).`);
}
export function matchSetup(seed, teamA, teamB) {
  const random = seededRandom(`${seed}:setup`);
  return {
    tossWinner: random() < .5 ? teamA : teamB,
    pitch: ['balanced', 'batting', 'bowling'][Math.floor(random() * 3)],
    weather: random() < .35 ? 'Evening dew' : 'Clear skies',
  };
}
export const defaultTossDecision = setup => setup.weather === 'Evening dew' ? 'bowl' : setup.pitch === 'batting' ? 'bat' : 'bowl';

function deliveryTactic(base, timeline, index, playerId) {
  const key = Object.keys(timeline || {}).map(Number).filter(n => n <= index).sort((a,b) => b-a)[0];
  const plan = key === undefined ? null : timeline[key];
  return normalizeTactic(plan?.players?.[playerId] || plan?.tactic || base);
}

function drawRuns(random, batter, bowler, aggression, phase, conditions, secondInnings) {
  const strength = battingStrength(batter) - bowlingStrength(bowler);
  const pitch = conditions.pitch === 'batting' ? .12 : conditions.pitch === 'bowling' ? -.10 : 0;
  const dew = secondInnings && conditions.weather === 'Evening dew' ? .06 : 0;
  const factor = clamp(1 + strength * .45 + aggression * .20 + pitch + dew + (phase === 'death' ? .18 : phase === 'powerplay' ? .08 : -.05), .55, 1.6);
  const weights = [.31 / factor, .38, .09, .005, .145 * factor, .07 * factor];
  const outcomes = [0, 1, 2, 3, 4, 6];
  let pick = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) { pick -= weights[i]; if (pick <= 0) return outcomes[i]; }
  return 6;
}

/** Legal-ball accounting, strike rotation, 4-over limits, extras and free hits. */
export function simulateInnings({ battingTeam, bowlingTeam, random, target = null, conditions = { pitch: 'balanced', weather: 'Clear skies' }, tactic = 'balanced', bowlingTactic = 'balanced', secondInnings = false, superOver = false, superBatters, superBowler, battingTimeline, bowlingTimeline }) {
  const batters = superBatters || [...battingTeam.players].sort((a, b) => {
    const order = p => p.role === 'Bowler' ? 2 : p.role === 'All-Rounder' ? 1 : 0;
    return order(a) - order(b) || battingStrength(b) - battingStrength(a) || a.id.localeCompare(b.id);
  });
  const bowlers = superBowler ? [superBowler] : [...bowlingTeam.players].filter(isBowlingOption).sort((a, b) => bowlingStrength(b) - bowlingStrength(a) || a.id.localeCompare(b.id)).slice(0, 5).reverse();
  if (batters.length < 2 || (!superOver && bowlers.length < 5) || !bowlers.length) throw new Error('Insufficient batting or bowling options.');
  const limit = superOver ? 6 : 120;
  const wicketLimit = superOver ? 2 : 10;
  const batting = batters.map(p => ({ id: p.id, name: p.name, runs: 0, balls: 0, fours: 0, sixes: 0, didBat: false, dismissal: null }));
  const bowling = bowlers.map(p => ({ id: p.id, name: p.name, balls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0 }));
  const extras = { wides: 0, noBalls: 0, byes: 0, legByes: 0 };
  const events = []; const fallOfWickets = [];
  let runs = 0, wickets = 0, balls = 0, striker = 0, nonStriker = 1, next = 2, freeHit = false;
  batting[0].didBat = true; batting[1].didBat = true;
  while (balls < limit && wickets < wicketLimit && (target === null || runs < target)) {
    // A malicious/test RNG cannot produce infinite consecutive illegal balls.
    if (events.length > limit * 20) throw new Error('Too many illegal deliveries to complete this innings.');
    const bowlerIndex = superOver ? 0 : Math.floor(balls / 6) % 5;
    const bowler = bowlers[bowlerIndex]; const figure = bowling[bowlerIndex];
    const batter = batters[striker]; const score = batting[striker];
    const aggression = { attack: 1, defend: -1, balanced: 0 }[deliveryTactic(tactic, battingTimeline, events.length, batter.id)];
    const bowlingAggression = { attack: 1, defend: -1, balanced: 0 }[deliveryTactic(bowlingTactic, bowlingTimeline, events.length, bowler.id)];
    const phase = superOver || balls >= 90 ? 'death' : balls < 36 ? 'powerplay' : 'middle';
    const event = { label: `${Math.floor(balls / 6)}.${balls % 6 + 1}`, ball: balls, batterId: batter.id, bowlerId: bowler.id, nonStrikerId: batters[nonStriker].id, batRuns: 0, ballsFaced: 0, extras: 0, extraType: null, wicket: null, legal: true, freeHit, phase };
    const delivery = random();
    if (delivery < .023) {
      event.legal = false; event.extras = 1; event.extraType = 'wides';
      extras.wides++; figure.wides++; figure.runs++; runs++;
    } else {
      const noBall = delivery < .035;
      event.legal = !noBall;
      if (noBall) { event.extras = 1; event.extraType = 'noBalls'; extras.noBalls++; figure.noBalls++; figure.runs++; runs++; }
      // A no-ball penalty can itself complete the chase; no later runs count.
      if (target === null || runs < target) {
        score.balls++; event.ballsFaced = 1;
        const wicketChance = clamp(.041 + (bowlingStrength(bowler) - battingStrength(batter)) * .04 + aggression * .011 + bowlingAggression * .004 + (phase === 'death' ? .014 : 0) + (conditions.pitch === 'bowling' ? .007 : 0), .015, .12);
        const wicketRoll = random();
        const protectedBall = freeHit || noBall;
        const dismissed = wicketRoll < (protectedBall ? .003 : wicketChance);
        if (dismissed) {
          const kindRoll = random();
          const kind = protectedBall || kindRoll < .13 ? 'run out' : kindRoll < .65 ? 'caught' : kindRoll < .88 ? 'bowled' : 'lbw';
          wickets++;
          event.wicket = { playerId: batter.id, kind, bowlerId: kind === 'run out' ? null : bowler.id };
          score.dismissal = event.wicket;
          if (kind !== 'run out') figure.wickets++;
          fallOfWickets.push({ runs, wickets, playerId: batter.id, ball: balls + Number(!noBall) });
          if (wickets < wicketLimit) { striker = next++; batting[striker].didBat = true; }
        } else {
          const bye = !noBall && random() < .022;
          const raw = bye ? (random() < .85 ? 1 : 2) : drawRuns(random, batter, bowler, aggression + bowlingAggression * .1, phase, conditions, secondInnings);
          // Boundaries are credited in full; running stops once the target is reached.
          const scored = target !== null && raw < 4 ? Math.min(raw, Math.max(0, target - runs)) : raw;
          if (bye) {
            const type = random() < .4 ? 'byes' : 'legByes'; event.extraType = type; event.extras = scored; extras[type] += scored;
          } else {
            event.batRuns = scored; score.runs += scored; figure.runs += scored;
            if (scored === 4) score.fours++; if (scored === 6) score.sixes++;
          }
          runs += scored;
          if (scored % 2) [striker, nonStriker] = [nonStriker, striker];
        }
      }
      if (!noBall) { balls++; figure.balls++; }
      freeHit = noBall; // legal delivery consumes a free hit; wides preserve it
      if (!noBall && balls % 6 === 0) [striker, nonStriker] = [nonStriker, striker];
    }
    event.ball = balls; event.runsTotal = runs; event.wicketsTotal = wickets;
    event.nextStrikerId = batters[striker].id;
    event.nextNonStrikerId = batters[nonStriker].id;
    event.nextBowlerId = bowlers[superOver ? 0 : Math.floor(balls / 6) % 5].id;
    events.push(event);
  }
  return { battingTeamId: battingTeam.teamId, bowlingTeamId: bowlingTeam.teamId, runs, wickets, balls, limit, overs: oversText(balls), extras, batting, bowling, fallOfWickets, events };
}

export function simulateT20Match(teamA, teamB, { seed, plans = {}, playoffRank = null } = {}) {
  validateMatchTeam(teamA); validateMatchTeam(teamB);
  if (teamA.teamId === teamB.teamId || teamA.players.some(p => teamB.players.some(q => p.id === q.id))) throw new Error('Teams must be different and cannot share players.');
  const setup = matchSetup(seed, teamA.teamId, teamB.teamId);
  const tossPlan = plans[setup.tossWinner] || {};
  const decision = ['bat', 'bowl'].includes(tossPlan.tossDecision) ? tossPlan.tossDecision : defaultTossDecision(setup);
  const firstId = decision === 'bat' ? setup.tossWinner : [teamA.teamId, teamB.teamId].find(id => id !== setup.tossWinner);
  const first = firstId === teamA.teamId ? teamA : teamB; const second = first === teamA ? teamB : teamA;
  const random = seededRandom(`${seed}:innings`);
  const innings = [];
  function play(battingTeam, bowlingTeam, target, opts = {}) {
    return simulateInnings({ battingTeam, bowlingTeam, target, random, conditions: setup, tactic: plans[battingTeam.teamId]?.tactic, bowlingTactic: plans[bowlingTeam.teamId]?.tactic, battingTimeline: opts.superOver ? null : plans[battingTeam.teamId]?.tacticTimeline?.[innings.length], bowlingTimeline: opts.superOver ? null : plans[bowlingTeam.teamId]?.tacticTimeline?.[innings.length], ...opts });
  }
  innings.push(play(first, second, null));
  innings.push(play(second, first, innings[0].runs + 1, { secondInnings: true }));
  let winner = innings[1].runs > innings[0].runs ? second.teamId : innings[0].runs > innings[1].runs ? first.teamId : null;
  let summary = winner === second.teamId ? `${winner} won by ${10 - innings[1].wickets} wickets` : winner ? `${winner} won by ${innings[0].runs - innings[1].runs} runs` : 'Match tied';
  const superOvers = [];
  let tieBreak = null;
  const excluded = { [first.teamId]: new Set(), [second.teamId]: new Set() }; const previousBowler = {};
  let superFirst = second, superSecond = first;
  // Five rounds are the alpha's explicit tie-break time limit. Unresolved league
  // ties share points; playoffs use league position, never boundary counts.
  for (let round = 1; !winner && round <= 5; round++) {
    const battingFor = t => t.players.filter(p => !excluded[t.teamId].has(p.id)).sort((a, b) => battingStrength(b) - battingStrength(a) || a.id.localeCompare(b.id)).slice(0, 3);
    const bowlingFor = t => t.players.filter(p => isBowlingOption(p) && p.id !== previousBowler[t.teamId]).sort((a, b) => bowlingStrength(b) - bowlingStrength(a) || a.id.localeCompare(b.id))[0];
    const bats1 = battingFor(superFirst), bats2 = battingFor(superSecond);
    const bowl1 = bowlingFor(superSecond), bowl2 = bowlingFor(superFirst);
    if (bats1.length < 3 || bats2.length < 3 || !bowl1 || !bowl2) break;
    const a = play(superFirst, superSecond, null, { superOver: true, superBatters: bats1, superBowler: bowl1 });
    const b = play(superSecond, superFirst, a.runs + 1, { superOver: true, superBatters: bats2, superBowler: bowl2, secondInnings: true });
    superOvers.push({ round, innings: [a, b] });
    for (const inn of [a, b]) { inn.batting.filter(p => p.dismissal).forEach(p => excluded[inn.battingTeamId].add(p.id)); previousBowler[inn.bowlingTeamId] = inn.bowling[0].id; }
    winner = b.runs > a.runs ? superSecond.teamId : a.runs > b.runs ? superFirst.teamId : null;
    if (winner) { summary = `${winner} won in Super Over ${round}`; tieBreak = 'super_over'; }
    [superFirst, superSecond] = [superSecond, superFirst];
  }
  if (!winner && playoffRank) {
    winner = playoffRank.indexOf(teamA.teamId) < playoffRank.indexOf(teamB.teamId) ? teamA.teamId : teamB.teamId;
    summary = `${winner} advance on league position after unresolved Super Overs`; tieBreak = 'league_position';
  }
  return { engineVersion: ENGINE_VERSION, seed, teamA: teamA.teamId, teamB: teamB.teamId, toss: { winner: setup.tossWinner, decision }, conditions: { pitch: setup.pitch, weather: setup.weather }, innings, superOvers, winner, loser: winner ? [teamA.teamId, teamB.teamId].find(id => id !== winner) : null, summary, tieBreak, plans };
}

export function compactResult(result) {
  const compact = innings => innings.map(innings => { const copy = { ...innings }; delete copy.events; return copy; });
  return { ...result, innings: compact(result.innings), superOvers: result.superOvers.map(s => ({ ...s, innings: compact(s.innings) })) };
}

/** A scorecard contains only deliveries the viewer has actually reached. */
export function inningsAtEvent(innings, count = 0) {
  if (!innings) return null;
  const events = innings.events.slice(0, Math.max(0, count));
  const batting = innings.batting.map((p, i) => ({ id:p.id, name:p.name, runs:0, balls:0, fours:0, sixes:0, didBat:i<2, dismissal:null }));
  const bowling = innings.bowling.map(p => ({ id:p.id, name:p.name, balls:0, runs:0, wickets:0, wides:0, noBalls:0 }));
  const bat = new Map(batting.map(p => [p.id,p])), bowl = new Map(bowling.map(p => [p.id,p]));
  const extras = { wides:0, noBalls:0, byes:0, legByes:0 };
  const fallOfWickets = [];
  for (const e of events) {
    const b = bat.get(e.batterId), f = bowl.get(e.bowlerId);
    b.didBat = true; b.runs += e.batRuns; b.balls += e.ballsFaced;
    if (e.batRuns === 4) b.fours++; if (e.batRuns === 6) b.sixes++;
    f.balls += Number(e.legal); f.runs += e.batRuns;
    if (e.extraType) extras[e.extraType] += e.extras;
    if (e.extraType === 'wides' || e.extraType === 'noBalls') { f[e.extraType] += e.extras; f.runs += e.extras; }
    if (e.wicket) {
      bat.get(e.wicket.playerId).dismissal = e.wicket;
      if (e.wicket.bowlerId) f.wickets++;
      fallOfWickets.push({ runs:e.runsTotal, wickets:e.wicketsTotal, playerId:e.wicket.playerId, ball:e.ball });
    }
    if (bat.has(e.nextStrikerId)) bat.get(e.nextStrikerId).didBat = true;
    if (bat.has(e.nextNonStrikerId)) bat.get(e.nextNonStrikerId).didBat = true;
  }
  const last = events.at(-1);
  const balls = last?.ball || 0;
  return { battingTeamId:innings.battingTeamId, bowlingTeamId:innings.bowlingTeamId, runs:last?.runsTotal || 0, wickets:last?.wicketsTotal || 0,
    balls, overs:oversText(balls), limit:innings.limit, batting, bowling, extras, fallOfWickets, events,
    strikerId:last?.nextStrikerId || batting[0]?.id, nonStrikerId:last?.nextNonStrikerId || batting[1]?.id,
    bowlerId:last?.nextBowlerId || bowling[0]?.id };
}
