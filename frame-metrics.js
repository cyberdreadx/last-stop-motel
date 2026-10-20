const percentile=(values,fraction)=>{if(!values.length)return 0;const sorted=values.toSorted((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*fraction))]};
const round=n=>+n.toFixed(2);
export class FrameMetrics {
  start(now,simulationTime=0){this.started=now;this.baseSim=simulationTime;this.frames=[];this.physics=[];this.lastStats=null;this.totalFrameMs=0;this.lastReport=-Infinity;this.active=true;this.result=null;this.maxBodies=0}
  sample(now,frameMs,stats){if(!this.active)return;this.frames.push(frameMs);this.totalFrameMs+=frameMs;this.maxBodies=Math.max(this.maxBodies,stats.bodies??0);if(stats!==this.lastStats){if(stats.steps)this.physics.push(stats.worldMs/stats.steps);this.lastStats=stats}const seconds=(now-this.started)/1000;if(now-this.lastReport<500&&seconds<18)return;this.lastReport=now;this.result={complete:seconds>=18,wallSeconds:round(seconds),simulationSeconds:round((stats.benchmarkElapsed??stats.simulationTime??0)-this.baseSim),simulationRate:round(((stats.benchmarkElapsed??stats.simulationTime??0)-this.baseSim)/Math.max(.001,seconds)),meanFps:round(1000/(this.totalFrameMs/this.frames.length)),p95FrameMs:round(percentile(this.frames,.95)),p95PhysicsStepMs:round(percentile(this.physics,.95)),peakBodies:this.maxBodies};if(seconds>=18)this.active=false}
}

