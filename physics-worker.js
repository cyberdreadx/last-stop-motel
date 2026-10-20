import * as THREE from 'three';
import { DestructionPhysics } from './physics.js';

const materials={};for(const name of ['wall','cream','roof','glass','metal','teal','core','dark','red','neon','white']){materials[name]=new THREE.MeshStandardMaterial();materials[name].name=name}
let epoch=0,sources=[],sentFragments=0,last=performance.now(),lastSend=-Infinity,lastFlags=-1,dirty=false,dust=[],inFlight=0,freeBuffers=[];
const sentShapes=new Set();let benchmarkStart=0;
const engine=new DestructionPhysics(new THREE.Scene(),materials,()=>dirty=true,(p,n)=>{if(dust.length<20)dust.push({position:p.toArray(),count:n})});
self.onmessage=({data})=>{
  if(data.type==='reset'){
    epoch=data.epoch;sources=data.pieces.map((v,i)=>{const p=new THREE.Mesh(new THREE.BoxGeometry(),materials[v.material]??materials.wall);p.position.fromArray(v.position);p.quaternion.fromArray(v.quaternion);p.userData={size:new THREE.Vector3(...v.size),origin:p.position.clone(),active:true,id:i,assembly:v.assembly};return p});
    engine.reset(sources);benchmarkStart=0;sentFragments=0;dust=[];last=performance.now();lastSend=-Infinity;lastFlags=-1;inFlight=0;freeBuffers=[];dirty=true;sendFrame(0);return;
  }
  if(data.epoch!==epoch)return;
  if(data.type==='recycle'){inFlight=Math.max(0,inFlight-1);if(data.buffer?.byteLength)freeBuffers.push(data.buffer);return}
  if(data.type==='blast'){benchmarkStart=engine.clock;last=performance.now()}if(data.type==='blast')engine.blast(new THREE.Vector3(...data.point),data.radius,data.strength);
  if(data.type==='demolish'){benchmarkStart=engine.clock;last=performance.now();engine.demolish()}
};
function sendFrame(stepMs){
  if(inFlight>=2)return;
  const fragments=[],shapes=[],transfer=[];
  for(let i=sentFragments;i<engine.fragments.length;i++){
    const mesh=engine.fragments[i];mesh.userData.remoteId=sources.length+i;const shape=mesh.userData.shapeKey;
    if(!sentShapes.has(shape)){const attributes={};for(const name of ['position','normal','uv']){attributes[name]=mesh.geometry.attributes[name].array.slice();transfer.push(attributes[name].buffer)}shapes.push({key:shape,attributes,groups:mesh.geometry.groups});sentShapes.add(shape)}
    fragments.push({id:mesh.userData.remoteId,shape,materials:mesh.material.map(m=>m.name)});
  }
  sentFragments=engine.fragments.length;
  const count=engine.changedEntries.size,needed=count*9;let buffer=freeBuffers.find(b=>b.byteLength>=needed*4);
  if(buffer)freeBuffers.splice(freeBuffers.indexOf(buffer),1);else buffer=new ArrayBuffer(Math.max(256,2**Math.ceil(Math.log2(Math.max(1,needed*4)))));
  const transforms=new Float32Array(buffer);let offset=0;
  for(const d of engine.changedEntries){const m=d.mesh;transforms[offset]=m.userData.id??m.userData.remoteId;transforms[offset+1]=m.position.x;transforms[offset+2]=m.position.y;transforms[offset+3]=m.position.z;transforms[offset+4]=m.quaternion.x;transforms[offset+5]=m.quaternion.y;transforms[offset+6]=m.quaternion.z;transforms[offset+7]=m.quaternion.w;transforms[offset+8]=d.record.frozen||d.record.sleeping?1:0;offset+=9}
  engine.changedEntries.clear();let flags=null;
  if(lastFlags!==engine.flagsVersion){flags=new Uint8Array(sources.length);for(let i=0;i<sources.length;i++)flags[i]=sources[i].userData.active?1:sources[i].userData.fractured?2:0;lastFlags=engine.flagsVersion;transfer.push(flags.buffer)}
  transfer.push(buffer);lastSend=performance.now();inFlight++;
  self.postMessage({type:'frame',epoch,shapes,fragments,transforms,count,flags,dust,time:performance.timeOrigin+lastSend,stats:{...engine.stats,benchmarkElapsed:engine.clock-benchmarkStart,stepMs:+stepMs.toFixed(2),thread:'worker',transformsSent:count}},transfer);dust=[];dirty=false;
}
function tick(){
  if(sources.length){const now=performance.now(),dt=Math.max(0,Math.min(.1,(now-last)/1000));last=now;const start=performance.now();if(engine.dynamic.length||engine.collapse.length)engine.step(dt);if(now-lastSend>=1000/30&&(engine.changedEntries.size||dirty||engine.collapse.length||engine.fragments.length>sentFragments))sendFrame(performance.now()-start)}
  setTimeout(tick,sources.length?Math.max(0,1000/60-(performance.now()-last)):1000/60);
}
setTimeout(tick,1000/60);

self.postMessage({type:"ready"});
