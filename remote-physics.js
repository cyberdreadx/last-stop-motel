import * as THREE from 'three';
import { TransformStream } from './transform-stream.js';

export class RemotePhysics {
  constructor(scene,materials,onChange,onDust){
    Object.assign(this,{scene,materials,onChange,onDust});this.worker=new Worker(new URL('./physics-worker.js',import.meta.url),{type:'module'});this.ready=false;this.pendingReset=null;this.pendingCommands=[];this.epoch=0;this.dynamic=[];this.fragments=[];this.pieces=[];this.objects=new Map();this.entries=new Map();this.geometryCache=new Map();this.stream=new TransformStream();this.revision=0;
    this.latest={engine:'Rapier 0.19.3',bodies:0,sleeping:0,awake:0,secondaryImpacts:0,pendingCollapse:0,stepMs:0,thread:'worker'};
    this.worker.onmessage=({data})=>this.receive(data);this.worker.onerror=e=>{console.error('Physics worker:',e.message);document.querySelector('#physics-status').textContent='PHYSICS ERROR · RELOAD'};
  }
  reset(pieces){
    this.epoch++;for(const m of this.fragments)this.scene.remove(m);this.dynamic=[];this.fragments=[];this.pieces=pieces;this.objects.clear();this.entries.clear();this.stream.clear();this.revision++;
    for(let i=0;i<pieces.length;i++)this.objects.set(i,pieces[i]);this.latest={...this.latest,bodies:0,sleeping:0,frozen:0,awake:0,secondaryImpacts:0,pendingCollapse:0,stepMs:0,simulationTime:0};const names=new Map(Object.entries(this.materials).map(([k,v])=>[v,k]));
    this.pendingCommands=[];this.pendingReset={type:'reset',epoch:this.epoch,pieces:pieces.map(p=>({position:p.position.toArray(),quaternion:p.quaternion.toArray(),size:p.userData.size.toArray(),material:names.get(p.material)??'wall',assembly:p.userData.assembly}))};if(this.ready){this.worker.postMessage(this.pendingReset);this.pendingReset=null}
  }
  receive(data){
    if(data.type==='ready'){this.ready=true;if(this.pendingReset){this.worker.postMessage(this.pendingReset);this.pendingReset=null}for(const command of this.pendingCommands)this.worker.postMessage(command);this.pendingCommands=[];return}if(data.type!=='frame'||data.epoch!==this.epoch)return;
    for(const shape of data.shapes){if(this.geometryCache.has(shape.key))continue;const g=new THREE.BufferGeometry();for(const [name,array] of Object.entries(shape.attributes))g.setAttribute(name,new THREE.BufferAttribute(array,name==='uv'?2:3));for(const group of shape.groups)g.addGroup(group.start,group.count,group.materialIndex);this.geometryCache.set(shape.key,g)}
    for(const f of data.fragments){const mesh=new THREE.Mesh(this.geometryCache.get(f.shape),f.materials.map(n=>this.materials[n]??this.materials.core));mesh.castShadow=mesh.receiveShadow=true;this.scene.add(mesh);this.fragments.push(mesh);this.objects.set(f.id,mesh)}
    if(data.flags){for(let i=0;i<this.pieces.length;i++){const p=this.pieces[i],flag=data.flags[i];p.userData.active=flag===1;p.userData.fractured=flag===2;if(flag===2)p.visible=false}this.revision++}
    for(let n=0;n<data.count;n++){const i=n*9,id=data.transforms[i],mesh=this.objects.get(id);if(!mesh)continue;if(!this.entries.has(id)){const entry={mesh};this.entries.set(id,entry);this.dynamic.push(entry)}this.stream.push(id,mesh,data.transforms,i+1,data.time,data.transforms[i+8]===1)}
    for(const puff of data.dust)this.onDust(new THREE.Vector3(...puff.position),puff.count);this.latest=data.stats;this.onChange();
    this.worker.postMessage({type:'recycle',epoch:this.epoch,buffer:data.transforms.buffer},[data.transforms.buffer]);
  }
  command(data){if(this.ready)this.worker.postMessage(data);else this.pendingCommands.push(data)}
  blast(point,radius,strength){this.command({type:'blast',epoch:this.epoch,point:point.toArray(),radius,strength});return true}
  demolish(){this.command({type:'demolish',epoch:this.epoch})}
  step(){return this.stream.step(performance.timeOrigin+performance.now())}
  get stats(){return this.latest}
}
