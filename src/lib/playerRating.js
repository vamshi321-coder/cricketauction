// Player rating engine — derives a 0-10 rating for any IPL_PLAYERS entry
// purely from the static statistics already present in src/data/players.js
// (matches, runs, avg, sr, wickets, econ). No external API, no manual
// fantasy points required.
//
// Used by:
//   - Fantasy "Best Team" tab (rates a participant's full auction squad)
//   - Fantasy "Leaderboard" tab (rates a participant's saved Play XI)

// Helper: treat "-", null, undefined, NaN, Infinity all as "no data"
function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    if (value.trim() === '' || value.trim() === '-') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

// Clamp any number into [0, 10], and guard against NaN/Infinity entirely.
function clamp010(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(10, value));
}

// Normalize a raw stat into a 0-10 sub-score using a soft min/max scale.
// higherIsBetter=false is used for economy (lower economy = better bowler).
function normalize(value, min, max, higherIsBetter = true) {
  if (value === null) return null;
  const clampedInput = Math.max(min, Math.min(max, value));
  const ratio = (clampedInput - min) / (max - min || 1);
  const score = higherIsBetter ? ratio * 10 : (1 - ratio) * 10;
  return clamp010(score);
}

// Calibrated against the real distribution of stats in players.js
// (see inspection: runs p90 ~4332, avg p90 ~44, sr p90 ~152, wickets p90 ~128, econ p90 ~8.4)
const SCALES = {
  runs: { min: 0, max: 5000 },
  avg: { min: 15, max: 45 },
  sr: { min: 100, max: 170 },
  wickets: { min: 0, max: 150 },
  econ: { min: 6.5, max: 10 }, // lower is better
};

function battingScore(stats) {
  const runs = normalize(toNumber(stats.runs), SCALES.runs.min, SCALES.runs.max, true);
  const avg = normalize(toNumber(stats.avg), SCALES.avg.min, SCALES.avg.max, true);
  const sr = normalize(toNumber(stats.sr), SCALES.sr.min, SCALES.sr.max, true);
  const parts = [runs, avg, sr].filter(v => v !== null);
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function bowlingScore(stats) {
  const wickets = normalize(toNumber(stats.wickets), SCALES.wickets.min, SCALES.wickets.max, true);
  const econ = normalize(toNumber(stats.econ), SCALES.econ.min, SCALES.econ.max, false);
  const parts = [wickets, econ].filter(v => v !== null);
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

/**
 * Rate a single player out of 10, based on their role and whatever
 * statistics are actually present. Never returns 0 just because a
 * field is missing — averages only over the fields that exist, and
 * only falls back to a neutral mid-score if truly nothing is usable.
 *
 * @param {object} player - an entry (or partial entry) from IPL_PLAYERS
 * @returns {number} rating clamped between 0 and 10
 */
export function ratePlayer(player) {
  if (!player || !player.stats) return 5; // neutral fallback, never 0/NaN

  const stats = player.stats;
  const role = (player.role || '').toLowerCase();

  const bat = battingScore(stats);
  const bowl = bowlingScore(stats);

  let combined;
  if (role.includes('all-rounder')) {
    // All-rounders: blend both disciplines; if one is missing, use the other.
    const parts = [bat, bowl].filter(v => v !== null);
    combined = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
  } else if (role.includes('bowler')) {
    combined = bowl !== null ? bowl : bat; // fall back to batting if no bowling stats at all
  } else if (role.includes('wicket')) {
    // Wicket-keepers are rated on batting (keepers don't bowl); small floor bump
    // since keeping contribution isn't captured in the available stats.
    combined = bat !== null ? Math.min(10, bat + 0.3) : null;
  } else {
    // Batsman or unknown role
    combined = bat !== null ? bat : bowl;
  }

  if (combined === null) return 5; // no usable stats at all -> neutral, not 0
  const clamped = clamp010(combined);
  return clamped === null ? 5 : Number(clamped.toFixed(1));
}

/**
 * Rate a list of players (already-resolved player objects, not ids) and
 * return an aggregate squad/XI rating. Never returns 0 purely because
 * the list is short — 1 player, 5 players, or 11 players all produce a
 * meaningful average of whatever ratings are available.
 *
 * @param {object[]} players - array of IPL_PLAYERS-shaped objects
 * @returns {number|null} rating clamped 0-10, or null if the list is empty
 */
export function rateSquad(players) {
  if (!Array.isArray(players) || players.length === 0) return null;
  const ratings = players
    .map(p => ratePlayer(p))
    .filter(r => Number.isFinite(r));
  if (ratings.length === 0) return null;
  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const clamped = clamp010(avg);
  return clamped === null ? null : Number(clamped.toFixed(1));
}
