/**
 * Tournament Data Model — V7 Alpha Phase 1
 * ------------------------------------------------------------------
 * Pure data-shape helpers for the CricAuction tournament system.
 * NO simulation logic lives here. NO Firebase writes happen here.
 * This file only describes shapes and builds the Phase 1 fixture map
 * (who plays whom, on which matchday) from the list of teams present
 * in the auction room.
 *
 * Reused/depended on by: TournamentHub.jsx
 * Firebase node (future, not written yet in Phase 1): auctions/{id}/tournament
 * ------------------------------------------------------------------
 */

// ── Conceptual shapes (documentation only — plain objects, not classes) ──────
//
// season = {
//   seasonId: string,
//   status: 'not_started' | 'league' | 'playoffs' | 'completed',
//   currentMatchday: number,       // 1-9 during league stage
//   stage: 'league' | 'qualifier1' | 'eliminator' | 'qualifier2' | 'final' | 'completed',
//   teams: string[],               // team IDs participating (max 10)
//   fixtures: fixture[],
//   standings: teamSeason[],
//   playoffs: { q1, eliminator, q2, final } // each a fixture or null until reached
// }
//
// teamSeason = {
//   teamId: string,
//   squad: Array<{id, bid}>,       // reused from existing roomTeams[].squad — NOT duplicated
//   playingXI: string[],           // reused from existing userSquads/{uid}.players — NOT duplicated
//   rating: number|null,           // from existing rateSquad()
//   matchesPlayed: number,
//   wins: number,
//   losses: number,
//   noResults: number,
//   points: number,
//   nrr: number,
// }
//
// fixture = {
//   fixtureId: string,             // e.g. "MD1-RCB-MI"
//   matchday: number,              // 1-9, or 0 for playoffs
//   stage: 'league' | 'qualifier1' | 'eliminator' | 'qualifier2' | 'final',
//   teamA: string,                 // team ID
//   teamB: string,                 // team ID
//   status: 'scheduled' | 'simulated' | 'live',  // 'live' reserved for later phases
//   winner: string|null,
//   result: object|null,           // reserved for Phase 3 match engine output
// }

/**
 * Build the round-robin league fixture list for up to 10 teams.
 * Each team plays every other team exactly once.
 * Matches are grouped into matchdays of 5 games each (standard
 * circle method so no team plays twice on the same matchday).
 *
 * @param {string[]} teamIds - team IDs present in this auction room (2-10)
 * @returns {fixture[]} all league fixtures, each tagged with its matchday
 */
export function buildLeagueFixtures(teamIds, seed = 'default') {
  // Seed-based shuffle so every season has different fixture ordering
  let rng = 2166136261;
  for (const c of String(seed)) rng = Math.imul(rng ^ c.charCodeAt(0), 16777619);
  const rand = () => { rng += 0x6D2B79F5; let t = rng; t = Math.imul(t^t>>>15,t|1); t ^= t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; };
  const shuffle = arr => { for (let i=arr.length-1;i>0;i--){ const j=Math.floor(rand()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; };

  const teams = shuffle([...teamIds]);
  if (teams.length < 2) return [];

  // Circle method round-robin scheduling — guarantees each team plays
  // once per round and every pair meets exactly once across all rounds.
  const isOdd = teams.length % 2 !== 0;
  if (isOdd) teams.push(null); // bye slot

  const n = teams.length;
  const rounds = n - 1;
  const half = n / 2;
  const fixtures = [];
  let matchday = 1;

  const arr = [...teams];
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const teamA = arr[i];
      const teamB = arr[n - 1 - i];
      if (teamA !== null && teamB !== null) {
        fixtures.push({
          fixtureId: `MD${matchday}-${teamA}-${teamB}`,
          matchday,
          stage: 'league',
          teamA,
          teamB,
          status: 'scheduled',
          winner: null,
          result: null,
        });
      }
    }
    // Rotate — keep first element fixed, rotate the rest
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr.splice(0, arr.length, fixed, ...rest);
    matchday++;
  }

  return fixtures;
}

/**
 * Group a flat fixture list into matchdays for display.
 * @param {fixture[]} fixtures
 * @returns {Record<number, fixture[]>} matchday number -> fixtures
 */
export function groupFixturesByMatchday(fixtures) {
  const grouped = {};
  fixtures.forEach(f => {
    if (!grouped[f.matchday]) grouped[f.matchday] = [];
    grouped[f.matchday].push(f);
  });
  return grouped;
}

/**
 * Initialize empty standings for a set of teams. Points/wins/losses
 * all start at zero — Phase 1 never simulates results, so standings
 * stay at this initial state until a future phase's match engine
 * writes real results.
 *
 * @param {string[]} teamIds
 * @returns {teamSeason[]}
 */
export function initStandings(teamIds) {
  return teamIds.map(teamId => ({
    teamId,
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    noResults: 0,
    points: 0,
    nrr: 0,
  }));
}

/**
 * Build the complete Phase-1 season shape for a room, with fixtures
 * and empty standings pre-computed. This is a pure function — it does
 * NOT write to Firebase. The caller decides when/whether to persist it
 * (Phase 1 does not persist a permanent season; see "Season Safety"
 * in the product spec).
 *
 * @param {string} seasonId
 * @param {string[]} teamIds
 * @returns {object} season shape
 */
export function buildSeasonShape(seasonId, teamIds) {
  const fixtures = buildLeagueFixtures(teamIds, seasonId);
  const totalMatchdays = teamIds.length % 2 === 0 ? teamIds.length - 1 : teamIds.length;

  return {
    seasonId,
    status: 'not_started',
    currentMatchday: 1,
    stage: 'league',
    teams: teamIds,
    fixtures,
    standings: initStandings(teamIds),
    totalMatchdays,
    playoffs: {
      qualifier1: null,   // becomes a fixture object once league stage completes
      eliminator: null,
      qualifier2: null,
      final: null,
    },
  };
}

/**
 * The four-stage standard playoff path, described structurally for the
 * UI to render as a map. No results are computed in Phase 1 — every
 * node starts locked until the prior stage feeds into it.
 *
 * @returns {Array<{id, label, feedsFrom, locked}>}
 */
export function getPlayoffPath() {
  return [
    { id: 'qualifier1', label: 'Qualifier 1', description: '1st vs 2nd — winner goes straight to the Final', locked: true },
    { id: 'eliminator', label: 'Eliminator', description: '3rd vs 4th — loser is out', locked: true },
    { id: 'qualifier2', label: 'Qualifier 2', description: 'Qualifier 1 loser vs Eliminator winner', locked: true },
    { id: 'final', label: 'Final', description: 'Qualifier 1 winner vs Qualifier 2 winner', locked: true },
  ];
}
