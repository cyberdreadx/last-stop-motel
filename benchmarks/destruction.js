import { motelFixture } from './layout.js';
const baseline=process.argv.includes('--before');
const { DestructionPhysics }=await import(baseline?'./physics-before.js':'../physics.js');
const f=motelFixture();let seed=2026;Math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
const p=new DestructionPhysics(f.scene,f.materials,()=>{},()=>{});p.reset(f.pieces);p.demolish();
const times=[],worldTimes=[];let maxBodies=0;const ticks=Number(process.env.BENCH_TICKS??600);const began=performance.now();
for(let i=0;i<ticks;i++){const t=performance.now();p.step(1/60);times.push(performance.now()-t);worldTimes.push(p.worldMs);if(i%60===0)maxBodies=Math.max(maxBodies,p.stats.bodies)}
const wallMs=performance.now()-began;const sorted=times.toSorted((a,b)=>a-b);const sum=times.reduce((a,b)=>a+b,0);const result={mode:baseline?'before':'after',simulationSeconds:ticks/60,wallSeconds:+(wallMs/1000).toFixed(3),realTimeRatio:+((ticks/60)/(wallMs/1000)).toFixed(2),meanStepMs:+(sum/ticks).toFixed(2),p95StepMs:+sorted[Math.floor(ticks*.95)].toFixed(2),maxStepMs:+sorted.at(-1).toFixed(2),maxBodies,final:p.stats};console.log(JSON.stringify(result,null,2));p.world.free();p.events.free();
