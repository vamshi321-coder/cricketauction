import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTournamentTeams } from '../src/lib/tournamentTeams.js';
import { simulateT20Match, simulateInnings, compactResult, validateMatchTeam } from '../src/lib/t20Engine.js';
import { createTournament, advanceRound, roundKey, standingsFor, prepareTeam, missingPreparations, replayFixture, matchTeam } from '../src/lib/tournamentSeason.js';
const teams = buildTournamentTeams().teams;
const fresh = id => createTournament(teams, { id, hostId:'host', createdAt:1 });
const initial = fresh('test');
const a = matchTeam(initial.roster[0]), b = matchTeam(initial.roster[1]);
function invariant(inn) {
  const sum = (arr,key) => arr.reduce((n,p)=>n+p[key],0);
  assert.equal(sum(inn.batting,'runs') + Object.values(inn.extras).reduce((x,y)=>x+y,0), inn.runs);
  assert.equal(sum(inn.bowling,'runs') + inn.extras.byes + inn.extras.legByes, inn.runs);
  assert.equal(sum(inn.bowling,'balls'),inn.balls);
  assert.equal(inn.events.filter(e=>e.legal).length,inn.balls);
  assert.equal(inn.events.filter(e=>e.wicket).length,inn.wickets);
  assert.equal(sum(inn.bowling,'wickets'),inn.events.filter(e=>e.wicket?.bowlerId).length);
  assert(inn.balls <= inn.limit);
  assert(inn.wickets <= (inn.limit===6 ? 2 : 10));
  assert(inn.bowling.every(p=>p.balls <= (inn.limit===6 ? 6 : 24)));
  let runs=0, wickets=0;
  for (const e of inn.events) { runs+=e.batRuns+e.extras; wickets+=Number(!!e.wicket); assert.equal(e.runsTotal,runs); assert.equal(e.wicketsTotal,wickets); if(e.freeHit && e.wicket) assert.equal(e.wicket.kind,'run out'); }
  const overBowlers = new Map();
  for(const e of inn.events.filter(e=>e.legal)) { const over=Math.floor((e.ball-1)/6); if(overBowlers.has(over)) assert.equal(overBowlers.get(over),e.bowlerId); overBowlers.set(over,e.bowlerId); }
  for(let i=1;i<overBowlers.size;i++) assert.notEqual(overBowlers.get(i),overBowlers.get(i-1));
}
test('300 seeded matches conserve runs, wickets, legal balls, and bowling quotas including Super Overs',()=>{
  let superOvers=0;
  for(let i=0;i<300;i++){
    const result=simulateT20Match(a,b,{seed:`property-${i}`});
    result.innings.forEach(invariant);
    for(const round of result.superOvers){superOvers++;round.innings.forEach(invariant);}
    const [first,second]=result.innings;
    if(second.runs>first.runs) assert(second.events.slice(0,-1).every(e=>e.runsTotal<=first.runs));
  }
  assert(superOvers>0,'tie resolution was exercised');
});
test('fixed seeds reproduce scorecards and ball events; tactics affect the match',()=>{
  const result=simulateT20Match(a,b,{seed:'repeat'});
  assert.deepEqual(result,simulateT20Match(a,b,{seed:'repeat'}));
  assert.notDeepEqual(result.innings,simulateT20Match(a,b,{seed:'repeat',plans:{[a.teamId]:{tactic:'attack'}}}).innings);
});
function sequence(values,fallback=.5) { let i=0; return ()=>values[i++] ?? fallback; }
test('wide and no-ball penalties finish a chase without a legal delivery',()=>{
  for(const delivery of [.01,.03]) { const inn=simulateInnings({battingTeam:a,bowlingTeam:b,random:()=>delivery,target:1});assert.equal(inn.runs,1);assert.equal(inn.balls,0);assert.equal(inn.events.length,1);invariant(inn); }
});
test('free hit survives a wide and cannot award a bowler wicket',()=>{
  const inn=simulateInnings({battingTeam:a,bowlingTeam:b,random:sequence([.03,.5,0,.01,.5,.01,.5,.5]),superOver:true,superBowler:b.players.find(p=>p.role==='Bowler')});
  assert.equal(inn.events[0].extraType,'noBalls');
  assert.equal(inn.events[1].extraType,'wides');
  assert.equal(inn.events[2].freeHit,true);
  assert.equal(inn.events[2].wicket,null);
  invariant(inn);
});
test('ten wickets end innings; no player bats twice',()=>{
  const inn=simulateInnings({battingTeam:a,bowlingTeam:b,random:sequence(Array.from({length:10},()=>[.5,0,.7]).flat())});
  assert.equal(inn.wickets,10);assert.equal(inn.balls,10);invariant(inn);
  assert.equal(new Set(inn.events.map(e=>e.batterId)).size,10);
});
test('ownership and bowling/keeper rules reject invalid XIs',()=>{
  assert.throws(()=>validateMatchTeam({...a,players:a.players.slice(1)}));
  assert.throws(()=>validateMatchTeam({...a,players:[...a.players.slice(1),a.players[1]]}));
  assert.throws(()=>validateMatchTeam({...a,players:a.players.map(p=>({...p,role:'Batsman'}))}));
  assert.throws(()=>simulateT20Match(a,{...a,teamId:'OTHER'},{seed:'bad'}));
});
test('complete season produces 45 league matches plus four correctly wired playoffs',()=>{
  let s=fresh('full-season');const original=JSON.stringify(s);
  let leagueTable;
  while(s.status!=='completed') { s=advanceRound(s,'host',roundKey(s),1);if(s.stage==='qualifiers')leagueTable=standingsFor(s); }
  assert.equal(s.fixtures.length,49);assert.equal(Object.keys(s.results).length,49);assert.equal(s.revision,12);
  assert(standingsFor(s).every(t=>t.played===9));assert.deepEqual(standingsFor(s),leagueTable);
  const fixture=stage=>s.fixtures.find(f=>f.stage===stage);
  const q1=fixture('qualifier1'),el=fixture('eliminator'),q2=fixture('qualifier2'),final=fixture('final');
  assert.deepEqual([q1.teamA,q1.teamB],leagueTable.slice(0,2).map(t=>t.teamId));
  assert.deepEqual([el.teamA,el.teamB],leagueTable.slice(2,4).map(t=>t.teamId));
  assert.equal(q2.teamA,s.results[q1.fixtureId].loser);assert.equal(q2.teamB,s.results[el.fixtureId].winner);
  assert.equal(final.teamA,s.results[q1.fixtureId].winner);assert.equal(final.teamB,s.results[q2.fixtureId].winner);
  assert.equal(s.champion,s.results[final.fixtureId].winner);
  for(const f of s.fixtures){const {completedAt,...stored}=s.results[f.fixtureId]; assert.deepEqual(compactResult(replayFixture(s,f.fixtureId)),stored);}
  assert.equal(JSON.stringify(fresh('full-season')),original,'original snapshot was not mutated');
});
test('host authorization and expected-round check block repeat/unauthorized advancement',()=>{
  const s=fresh('atomic'),key=roundKey(s);
  assert.throws(()=>advanceRound(s,'intruder',key,1),/host/);
  const next=advanceRound(s,'host',key,1);
  assert.throws(()=>advanceRound(next,'host',key,1),/changed/);
  assert.equal(Object.keys(next.results).length,5);
});
test('human plans require every manager, stay in owned squads, and expire after a round',()=>{
  const s=fresh('human');s.roster[0].isAI=false;s.roster[0].userId='host';s.roster[1].isAI=false;s.roster[1].userId='guest';
  const key=roundKey(s),plan=t=>({playingXI:t.playingXI,tactic:'attack',tossDecision:'bat'});
  assert.equal(missingPreparations(s).length,2);
  assert.throws(()=>advanceRound(s,'host',key,1),/Waiting/);
  assert.throws(()=>prepareTeam(s,'host',{...plan(s.roster[0]),playingXI:s.roster[1].playingXI},key),/outside/);
  assert.throws(()=>prepareTeam(s,'outsider',plan(s.roster[0]),key),/no match/);
  let ready=prepareTeam(s,'host',plan(s.roster[0]),key);
  ready=prepareTeam(ready,'guest',plan(s.roster[1]),key);
  assert.equal(missingPreparations(ready).length,0);
  const next=advanceRound(ready,'host',key,1);
  assert.equal(missingPreparations(next).length,2);
  assert.throws(()=>prepareTeam(next,'host',plan(s.roster[0]),key),/changed/);
});
test('NRR charges a full quota for all out and aggregates across innings',()=>{
  const s=fresh('nrr'),f=s.fixtures[0];
  s.results={[f.fixtureId]:{winner:f.teamB,innings:[{battingTeamId:f.teamA,runs:100,wickets:10,balls:60,limit:120},{battingTeamId:f.teamB,runs:101,wickets:0,balls:60,limit:120}]}};
  const rows=standingsFor(s);assert.equal(rows.find(t=>t.teamId===f.teamA).nrr,5-10.1);
  assert.equal(rows.find(t=>t.teamId===f.teamB).points,2);
});
test('Firebase removal of nulls and empty objects does not break resume or replay',()=>{
  const prune=v=>Array.isArray(v)?v.map(prune):v && typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([,x])=>x!==null && !(typeof x==='object' && !Array.isArray(x) && Object.keys(x).length===0)).map(([k,x])=>[k,prune(x)])):v;
  let s=prune(fresh('firebase'));s=prune(advanceRound(s,'host',roundKey(s),1));
  const replay=replayFixture(s,s.fixtures[0].fixtureId);assert.equal(replay.summary,s.results[s.fixtures[0].fixtureId].summary);
  s=advanceRound(s,'host',roundKey(s),2);assert.equal(s.currentMatchday,3);
});
