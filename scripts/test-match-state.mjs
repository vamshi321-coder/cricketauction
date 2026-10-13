import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTournamentTeams } from '../src/lib/tournamentTeams.js';
import { createTournament, matchTeam, prepareTeam, roundKey, currentFixtures, fixturePlans, advanceRound, replayFixture } from '../src/lib/tournamentSeason.js';
import { simulateT20Match, simulateInnings, inningsAtEvent, matchSetup, compactResult } from '../src/lib/t20Engine.js';
const teams=buildTournamentTeams().teams;
const season=createTournament(teams,{id:'score-state',hostId:'host',createdAt:1});
const a=matchTeam(season.roster[0]),b=matchTeam(season.roster[1]);

test('scorecards start empty and every delivery prefix conserves batting, bowling and extras',()=>{
 for(let i=0;i<40;i++)for(const inn of simulateT20Match(a,b,{seed:`live-${i}`}).innings){
  const zero=inningsAtEvent(inn,0);
  assert.equal(zero.runs,0);assert.equal(zero.balls,0);assert.equal(zero.wickets,0);
  assert.equal(zero.batting.filter(p=>p.didBat).length,2);
  assert(zero.batting.every(p=>!p.runs&&!p.balls&&!p.dismissal));
  assert(zero.bowling.every(p=>!p.runs&&!p.balls&&!p.wickets));
  for(let n=1;n<=inn.events.length;n++){
   const view=inningsAtEvent(inn,n),sum=(list,key)=>list.reduce((s,p)=>s+p[key],0);
   assert.equal(view.runs,inn.events[n-1].runsTotal);
   assert.equal(sum(view.batting,'runs')+Object.values(view.extras).reduce((x,y)=>x+y,0),view.runs);
   assert.equal(sum(view.bowling,'runs')+view.extras.byes+view.extras.legByes,view.runs);
   assert.equal(sum(view.bowling,'balls'),view.balls);
   assert.equal(view.batting.filter(p=>p.dismissal).length,view.wickets);
   if(n<inn.events.length){
    assert.equal(view.strikerId,inn.events[n].batterId);
    assert.equal(view.nonStrikerId,inn.events[n].nonStrikerId);
    assert.equal(view.bowlerId,inn.events[n].bowlerId);
   }
  }
  const full=inningsAtEvent(inn,inn.events.length);
  for(const k of ['batting','bowling','extras','runs','wickets','balls','fallOfWickets'])assert.deepEqual(full[k],inn[k],k);
 }
});
test('a chase-ending wide or no-ball updates 1/0 at 0.0, without phantom batter balls',()=>{
 for(const delivery of [.01,.03]){
  const inn=simulateInnings({battingTeam:a,bowlingTeam:b,random:()=>delivery,target:1});
  const view=inningsAtEvent(inn,1);
  assert.equal(view.runs,1);assert.equal(view.balls,0);assert.equal(view.batting.reduce((n,p)=>n+p.balls,0),0);
  assert.equal(view.bowling.reduce((n,p)=>n+p.runs,0),1);
 }
});
test('both toss decisions select the correct first batting side',()=>{
 const seed='toss-choice', winner=matchSetup(seed,a.teamId,b.teamId).tossWinner;
 for(const decision of ['bat','bowl']){
  const result=simulateT20Match(a,b,{seed,plans:{[winner]:{tossDecision:decision}}});
  assert.equal(result.toss.decision,decision);
  assert.equal(result.innings[0].battingTeamId,decision==='bat'?winner:[a.teamId,b.teamId].find(t=>t!==winner));
 }
});
test('new tactics change future deliveries, never revealed events or previous innings',()=>{
 let changed=0;
 for(let i=0;i<30;i++){
  const seed=`tactics-${i}`,normal=simulateT20Match(a,b,{seed});
  const side=normal.innings[0].battingTeamId;
  const attack=simulateT20Match(a,b,{seed,plans:{[side]:{tacticTimeline:{0:{12:{tactic:'attack',players:{}}}}}}});
  assert.deepEqual(attack.innings[0].events.slice(0,12),normal.innings[0].events.slice(0,12));
  if(JSON.stringify(attack.innings[0].events)!==JSON.stringify(normal.innings[0].events))changed++;
  const second=simulateT20Match(a,b,{seed,plans:{[side]:{tacticTimeline:{1:{6:{tactic:'defend',players:{}}}}}}});
  assert.deepEqual(second.innings[0],normal.innings[0]);
  assert.deepEqual(second.innings[1].events.slice(0,6),normal.innings[1].events.slice(0,6));
 }
 assert(changed>20);
});
test('season saves and replays the exact played result, keeps schedule, and rejects stale/changed results',()=>{
 const humanTeams=teams.map((t,i)=>i===0?{...t,isAI:false,userId:'host'}:t);
 let s=createTournament(humanTeams,{id:'played-result',hostId:'host',createdAt:1});
 const me=s.roster[0]; s=prepareTeam(s,'host',{playingXI:me.playingXI},roundKey(s));
 const f=currentFixtures(s).find(f=>[f.teamA,f.teamB].includes(me.teamId));
 const plans=fixturePlans(s,f),ta=s.roster.find(t=>t.teamId===f.teamA),tb=s.roster.find(t=>t.teamId===f.teamB);
 const seed=`${s.id}:${f.fixtureId}`;
 if(matchSetup(seed,f.teamA,f.teamB).tossWinner===me.teamId)plans[me.teamId].tossDecision='bat';
 plans[me.teamId].tacticTimeline={0:{6:{tactic:'attack',players:{}}},1:{0:{tactic:'defend',players:{}}}};
 const result=simulateT20Match(matchTeam(ta,plans[ta.teamId].playingXI),matchTeam(tb,plans[tb.teamId].playingXI),{seed,plans});
 const reorder=v=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reorder(x)])):v;
 const next=advanceRound(s,'host',roundKey(s),2,{fixtureId:f.fixtureId,result:reorder(result)});
 const {completedAt,...saved}=next.results[f.fixtureId];assert.deepEqual(saved,compactResult(result));
 assert.deepEqual(compactResult(replayFixture(next,f.fixtureId)),saved);
 assert.deepEqual(next.fixtures.map(f=>[f.fixtureId,f.teamA,f.teamB,f.matchday]),s.fixtures.map(f=>[f.fixtureId,f.teamA,f.teamB,f.matchday]));
 assert.throws(()=>advanceRound(next,'host',roundKey(s),2,{fixtureId:f.fixtureId,result}),/already finished/);
 assert.throws(()=>advanceRound(s,'host',roundKey(s),2,{fixtureId:f.fixtureId,result:{...result,summary:'Wrong result'}}),/changed before saving/);
});
