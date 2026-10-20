import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();

// Planar Voronoi fracture: clipped cells share an exact boundary, with exposed concrete edges.
function clip(poly,nx,ny,c){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];const da=a[0]*nx+a[1]*ny-c,db=b[0]*nx+b[1]*ny-c;if(da<=1e-7)out.push(a);if((da<0)!==(db<0)){const t=da/(da-db);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t])}}return out}
export function fractureCells(size,count,random=Math.random){
  const dims=[size.x,size.y,size.z],axis=dims.indexOf(Math.min(...dims));
  const axes=[0,1,2].filter(a=>a!==axis),w=dims[axes[0]],h=dims[axes[1]],t=dims[axis];
  const seeds=Array.from({length:count},(_,i)=>[(i%Math.ceil(Math.sqrt(count))+.2+random()*.6)/Math.ceil(Math.sqrt(count))*w-w/2,(Math.floor(i/Math.ceil(Math.sqrt(count)))+.2+random()*.6)/Math.ceil(count/Math.ceil(Math.sqrt(count)))*h-h/2]);
  const results=[];
  for(let k=0;k<seeds.length;k++){
    const a=seeds[k];let poly=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]];
    for(let j=0;j<seeds.length;j++){if(j===k)continue;const b=seeds[j];poly=clip(poly,b[0]-a[0],b[1]-a[1],(b[0]**2+b[1]**2-a[0]**2-a[1]**2)/2);if(!poly.length)break}
    if(poly.length<3)continue;
    const center=new THREE.Vector3(),coords=[];const positions=[],uv=[];
    const vertex=(p,depth)=>{const v=[0,0,0];v[axes[0]]=p[0];v[axes[1]]=p[1];v[axis]=depth;return new THREE.Vector3(...v)};
    for(const p of poly){coords.push(vertex(p,-t/2),vertex(p,t/2))}for(const v of coords)center.add(v);center.divideScalar(coords.length);
    const tri=(a,b,c)=>{if(axis===1)[b,c]=[c,b];for(const v of [a,b,c]){positions.push(v.x-center.x,v.y-center.y,v.z-center.z);uv.push(v.getComponent(axes[0])/3,v.getComponent(axes[1])/3)}};
    for(let i=1;i<poly.length-1;i++){tri(vertex(poly[0],t/2),vertex(poly[i],t/2),vertex(poly[i+1],t/2));tri(vertex(poly[0],-t/2),vertex(poly[i+1],-t/2),vertex(poly[i],-t/2))}
    const surfaceCount=positions.length/3;
    for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length];tri(vertex(p,-t/2),vertex(q,-t/2),vertex(q,t/2));tri(vertex(p,-t/2),vertex(q,t/2),vertex(p,t/2))}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.addGroup(0,surfaceCount,0);g.addGroup(surfaceCount,positions.length/3-surfaceCount,1);g.computeVertexNormals();
    // Winding depends on the thin axis. Double-sided materials cover both orientations.
    const points=new Float32Array(coords.flatMap(v=>[v.x-center.x,v.y-center.y,v.z-center.z]));
    const lookup=new Map();for(let j=0;j<points.length;j+=3)lookup.set([points[j],points[j+1],points[j+2]].join(','),j/3);
    const positions32=g.attributes.position.array,indices=new Uint32Array(positions32.length/3);for(let j=0;j<positions32.length;j+=3)indices[j/3]=lookup.get([positions32[j],positions32[j+1],positions32[j+2]].join(','));
    results.push({geometry:g,center,points,indices});
  }return results;
}

export class DestructionPhysics {
  constructor(scene,materials,onChange,onDust){
    Object.assign(this,{scene,materials,onChange,onDust});this.world=null;this.events=null;this.fragments=[];this.reset([]);
  }
  reset(pieces){
    this.world?.free();this.events?.free();for(const m of this.fragments){this.scene.remove(m);if(!m.userData.shapeKey)m.geometry.dispose()}
    this.world=new RAPIER.World({x:0,y:-9.81,z:0});this.world.timestep=1/60;this.world.numSolverIterations=4;this.world.integrationParameters.numInternalPgsIterations=1;this.world.integrationParameters.minIslandSize=16;this.world.maxCcdSubsteps=2;this.world.profilerEnabled=true;
    this.events=new RAPIER.EventQueue(true);this.dynamic=[];this.fragments=[];this.records=new Map();this.bodies=new Map();this.colliderMeshes=new Map();this.dormantColliders=new Map();this.assemblyMembers=new Map();this.pieces=pieces;this.accumulator=0;this.clock=0;this.tick=0;this.impactCount=0;this.collapse=[];this.supportDirty=false;this.changedEntries=new Set();this.flagsVersion=0;this.worldMs=0;this.stepCount=0;
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(180,.5,180).setTranslation(0,-.48,0).setFriction(.95));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(17,.14,1).setTranslation(0,.14,6.1).setFriction(.85));
    for(let x=-23;x<=24;x+=6)this.world.createCollider(RAPIER.ColliderDesc.cuboid(1.5,.09,.15).setTranslation(x+2.8,.1,12.5).setFriction(.9));
    const groups=new Map();for(const p of pieces){p.userData.damage=0;p.userData.scheduled=false;if(p.userData.assembly){const key=p.userData.assembly;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p)}else this.addFixed(p)}
    for(const members of groups.values())this.addAssembly(members);
    this.supportBaseline=this.supportTotals();this.remainingSupport=this.supportBaseline.map(x=>x.slice());
    const columns=pieces.filter(p=>p.userData.size.y>2&&p.userData.size.x<.25&&p.userData.size.z<.25);
    this.walkways=pieces.filter(p=>p.userData.origin.z>=4.3&&p.userData.origin.y>=3);
    for(const p of this.walkways)p.userData.supportColumns=columns.filter(c=>Math.abs(c.userData.origin.x-p.userData.origin.x)<2.2&&c.userData.origin.y<p.userData.origin.y);
    this.fractureCache??=new Map();this.prewarmFractures();this._offset=new THREE.Vector3();this._quaternion=new THREE.Quaternion();
  }
  properties(p){const m=p.material;return {density:m===this.materials.glass?2500:m===this.materials.metal?1800:m===this.materials.teal?650:2100,friction:m===this.materials.glass?.42:.82,restitution:m===this.materials.glass?.12:.035}}
  addFixed(p){
    const s=p.userData.size,props=this.properties(p);const b=this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...p.position.toArray()));
    const c=this.world.createCollider(RAPIER.ColliderDesc.cuboid(Math.max(.007,s.x/2-.004),Math.max(.007,s.y/2-.004),Math.max(.007,s.z/2-.004)).setRotation(p.quaternion).setDensity(props.density).setFriction(props.friction).setRestitution(props.restitution).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(8000),b);
    this.bind(b,[p],[c]);
  }
  addAssembly(members){
    // Collision proxies describe the assembly envelope, while every visible grille/slat/handle stays intact.
    const bounds=new THREE.Box3();let mass=0;for(const p of members){const s=p.userData.size;bounds.union(new THREE.Box3(p.position.clone().addScaledVector(s,-.5),p.position.clone().addScaledVector(s,.5)));mass+=s.x*s.y*s.z*this.properties(p).density}
    const center=bounds.getCenter(new THREE.Vector3());const size=bounds.getSize(new THREE.Vector3());
    const b=this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...center.toArray()));const colliders=[];
    const rails=members[0].userData.assembly.startsWith('rail-');
    const shapes=rails?[members[0],members[1],members.at(-1)].filter(Boolean):[{position:center,userData:{size}}];
    let volume=0;for(const p of shapes){const s=p.userData.size;volume+=s.x*s.y*s.z}
    for(const p of shapes){const s=p.userData.size;const offset=p.position.clone().sub(center);const c=this.world.createCollider(RAPIER.ColliderDesc.cuboid(Math.max(.007,s.x/2-.003),Math.max(.007,s.y/2-.003),Math.max(.007,s.z/2-.003)).setTranslation(...offset.toArray()).setMass(mass*s.x*s.y*s.z/volume).setFriction(.75).setRestitution(.035).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(8000),b);colliders.push(c)}
    this.bind(b,members,colliders);
  }
  bind(body,members,colliders){
    const t=body.translation();this.assemblyMembers.set(body.handle,members);
    for(const p of members){this.bodies.set(p,body);p.userData.assemblyOffset=p.position.clone().sub(new THREE.Vector3(t.x,t.y,t.z));p.userData.collider=colliders[0].handle}
    for(const c of colliders)this.colliderMeshes.set(c.handle,members[0]);
  }
  deactivate(p){
    if(!p.userData.active)return;p.userData.active=false;this.flagsVersion++;this.supportDirty=true;
    const u=p.userData,s=u.size;if((p.material===this.materials.wall||(s.x<.25&&s.z<.25&&s.y>2))&&u.origin.y<=6.4){const bay=Math.max(0,Math.min(7,Math.floor((u.origin.x+16)/4))),floor=u.origin.y>=3.3?1:0;this.remainingSupport[bay][floor]=Math.max(0,this.remainingSupport[bay][floor]-Math.min(s.x*s.z,.8)*s.y)}
  }
  track(body){let r=this.records.get(body.handle);if(!r){const t=body.translation(),q=body.rotation();r={body,entries:[],frozen:false,sleeping:false,age:0,restTime:0,restPosition:new THREE.Vector3(t.x,t.y,t.z),restRotation:new THREE.Quaternion(q.x,q.y,q.z,q.w),lastPosition:new THREE.Vector3(t.x,t.y,t.z),lastRotation:new THREE.Quaternion(q.x,q.y,q.z,q.w),position:new THREE.Vector3(t.x,t.y,t.z),rotation:new THREE.Quaternion(q.x,q.y,q.z,q.w)};this.records.set(body.handle,r)}return r}
  activate(p,point=null,strength=0){
    if(!p.userData.active)return;const b=this.bodies.get(p);if(!b)return;b.setBodyType(RAPIER.RigidBodyType.Dynamic,true);b.enableCcd(false);b.setLinearDamping(.2);b.setAngularDamping(.35);
    for(let i=0;i<b.numColliders();i++)b.collider(i).setActiveEvents(RAPIER.ActiveEvents.NONE);
    const r=this.track(b);for(const member of this.assemblyMembers.get(b.handle)??[p]){if(!member.userData.active)continue;this.deactivate(member);const entry={mesh:member,body:b,offset:member.userData.assemblyOffset,localRotation:member.quaternion.clone(),record:r};r.entries.push(entry);this.dynamic.push(entry);this.changedEntries.add(entry)}
    if(point)this.impulse(b,p.position,point,strength);
  }
  wake(r){if(!r.frozen){r.body.wakeUp();r.restTime=0;return}r.frozen=false;r.sleeping=false;r.restTime=0;r.restPosition.copy(r.position);r.restRotation.copy(r.rotation);r.body.setBodyType(RAPIER.RigidBodyType.Dynamic,true);for(let i=0;i<r.body.numColliders();i++){const c=r.body.collider(i);c.setActiveEvents(RAPIER.ActiveEvents.NONE);this.dormantColliders.delete(c.handle)}for(const e of r.entries)this.changedEntries.add(e)}
  impulse(body,position,point,strength){
    const r=this.records.get(body.handle);if(r?.frozen)this.wake(r);const dir=position.clone().sub(point),dist=Math.max(.4,dir.length());dir.normalize();dir.y+=.15;const mass=body.mass(),speed=strength/(1+dist*dist*.22)/Math.pow(Math.max(.3,mass/80),.18);if(speed>18)body.enableCcd(true);body.applyImpulseAtPoint(dir.multiplyScalar(mass*speed),{x:position.x+.004,y:position.y+.006,z:position.z+.003},true);
  }
  cachedCells(size,count,variant=0){const key=[size.x,size.y,size.z,count,variant].join(',');let cells=this.fractureCache.get(key);if(!cells){let seed=2166136261;for(const c of key)seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};cells=fractureCells(size,count,random);cells.forEach((cell,i)=>cell.key=key+":"+i);this.fractureCache.set(key,cells)}return cells}
  prewarmFractures(){for(const p of this.pieces){const s=p.userData.size,thin=Math.min(s.x,s.y,s.z),area=s.x*s.y*s.z/thin;if(p.userData.assembly||area<.45||thin>.5||![this.materials.wall,this.materials.cream,this.materials.roof,this.materials.glass].includes(p.material))continue;const count=p.material===this.materials.glass?6:Math.min(5,Math.max(2,Math.ceil(area*.8)));for(let i=0;i<3;i++)this.cachedCells(s,count,i)}}
  fracture(p,point,strength){
    if(!p.userData.active)return;const s=p.userData.size,thin=Math.min(s.x,s.y,s.z),area=s.x*s.y*s.z/thin;
    if(p.userData.assembly||((p.material!==this.materials.wall&&p.material!==this.materials.cream&&p.material!==this.materials.roof&&p.material!==this.materials.glass)||area<.45||thin>.5)){this.activate(p,point,strength);return}
    const old=this.bodies.get(p);this.colliderMeshes.delete(p.userData.collider);this.world.removeRigidBody(old);this.assemblyMembers.delete(old.handle);this.bodies.delete(p);this.deactivate(p);p.userData.fractured=true;p.visible=false;
    const count=p.material===this.materials.glass?6:Math.min(5,Math.max(2,Math.ceil(area*.8)));
    const variant=Math.abs(Math.round(p.userData.origin.x*7+p.userData.origin.y*11+p.userData.origin.z*13))%3;
    for(const cell of this.cachedCells(s,count,variant)){
      const mesh=new THREE.Mesh(cell.geometry,[p.material,p.material===this.materials.glass?p.material:this.materials.core]);mesh.userData.shapeKey=cell.key;mesh.position.copy(p.position).add(cell.center.clone().applyQuaternion(p.quaternion));mesh.quaternion.copy(p.quaternion);mesh.castShadow=mesh.receiveShadow=true;this.scene.add(mesh);this.fragments.push(mesh);
      const props=this.properties(p),b=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...mesh.position.toArray()).setRotation(mesh.quaternion).setLinearDamping(.15).setAngularDamping(.24));
      const cd=RAPIER.ColliderDesc.convexMesh(cell.points,cell.indices);if(!cd){this.world.removeRigidBody(b);continue}this.world.createCollider(cd.setDensity(props.density).setFriction(props.friction).setRestitution(props.restitution),b);
      const r=this.track(b),entry={mesh,body:b,record:r};r.entries.push(entry);this.dynamic.push(entry);this.changedEntries.add(entry);this.impulse(b,mesh.position,point,strength);
    }
  }
  blast(point,radius=3.4,strength=13){
    let hits=0;for(const p of this.pieces){if(!p.userData.active)continue;const s=p.userData.size;const dx=Math.max(0,Math.abs(point.x-p.position.x)-s.x/2),dy=Math.max(0,Math.abs(point.y-p.position.y)-s.y/2),dz=Math.max(0,Math.abs(point.z-p.position.z)-s.z/2);if(dx*dx+dy*dy+dz*dz>radius*radius)continue;this.fracture(p,point,strength);hits++}
    for(const r of this.records.values())if(r.position.distanceToSquared(point)<radius*radius*1.69)this.impulse(r.body,r.position,point,strength*.2);
    if(hits){this.onDust(point,Math.min(25,hits));this.checkSupports();this.onChange()}return hits;
  }
  supportTotals(){const totals=Array.from({length:8},()=>[0,0]);for(const p of this.pieces){if(!p.userData.active)continue;const s=p.userData.size;if(!(p.material===this.materials.wall||(s.x<.25&&s.z<.25&&s.y>2)))continue;const y=p.userData.origin.y;if(y>6.4)continue;const bay=Math.max(0,Math.min(7,Math.floor((p.userData.origin.x+16)/4)));totals[bay][y>=3.3?1:0]+=Math.min(s.x*s.z,.8)*s.y}return totals}
  checkSupports(){
    // Recompute once on demand, also supporting direct edits/removal by tools and tests.
    this.remainingSupport=this.supportTotals();this.supportDirty=false;
    for(let bay=0;bay<8;bay++)for(let floor=0;floor<2;floor++){const base=this.supportBaseline[bay][floor];if(base&&this.remainingSupport[bay][floor]/base<.42)for(const p of this.pieces){const u=p.userData;if(!u.active||u.scheduled||Math.abs(u.origin.x-(-14+bay*4))>2.15||u.origin.y<floor*3.3+.1)continue;u.scheduled=true;this.collapse.push({p,time:this.clock+.12+Math.max(0,u.origin.y-floor*3.3)*.1+Math.random()*.2})}}
    for(const p of this.walkways){const u=p.userData;if(u.active&&!u.scheduled&&!u.supportColumns.some(c=>c.userData.active)){u.scheduled=true;this.collapse.push({p,time:this.clock+.2+Math.random()*.3})}}
  }
  demolish(){for(const p of this.pieces){const u=p.userData;if(u.origin.y<3.2&&u.active&&(p.material===this.materials.wall||u.size.y>2)){u.scheduled=true;this.collapse.push({p,foundation:true,time:this.clock+(u.origin.x+16)*.035+Math.random()*.15})}}}
  supported(r){let yes=false;for(let i=0;i<r.body.numColliders()&&!yes;i++)this.world.contactPairsWith(r.body.collider(i),c=>{this.world.contactPair(r.body.collider(i),c,m=>{if(m.numSolverContacts()>0)yes=true})});return yes}
  stabilize(dt){
    for(const r of this.records.values()){
      if(r.frozen)continue;const b=r.body;r.age+=dt;r.sleeping=b.isSleeping();const quiet=r.position.distanceToSquared(r.restPosition)<.000225&&Math.abs(r.rotation.dot(r.restRotation))>.9999;
      if(quiet)r.restTime+=dt;else{r.restTime=0;r.restPosition.copy(r.position);r.restRotation.copy(r.rotation)}
      if(r.age>1&&(r.sleeping||r.restTime>.7)&&this.supported(r)){
        // Consolidate only supported resting rubble. Its collider stays present and wakes on a blast or hard impact.
        r.mass=b.mass();b.setLinvel({x:0,y:0,z:0},false);b.setAngvel({x:0,y:0,z:0},false);b.setBodyType(RAPIER.RigidBodyType.Fixed,true);r.frozen=true;r.sleeping=true;
        for(let i=0;i<b.numColliders();i++){const c=b.collider(i);c.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);c.setContactForceEventThreshold(Math.max(1500,r.mass*9.81*15));this.dormantColliders.set(c.handle,r)}
        for(const e of r.entries)this.changedEntries.add(e);
      }
      r.lastPosition.copy(r.position);r.lastRotation.copy(r.rotation);
    }
  }
  syncTransforms(){
    for(const r of this.records.values()){
      if(r.frozen)continue;const b=r.body,t=b.translation(),q=b.rotation();const moved=Math.abs(t.x-r.position.x)+Math.abs(t.y-r.position.y)+Math.abs(t.z-r.position.z)+Math.abs(q.x-r.rotation.x)+Math.abs(q.y-r.rotation.y)+Math.abs(q.z-r.rotation.z)+Math.abs(q.w-r.rotation.w)>1e-7;
      r.position.set(t.x,t.y,t.z);r.rotation.set(q.x,q.y,q.z,q.w);if(!moved)continue;
      for(const e of r.entries){const m=e.mesh;m.position.copy(r.position);m.quaternion.copy(r.rotation);if(e.offset){m.position.add(this._offset.copy(e.offset).applyQuaternion(r.rotation));m.quaternion.multiply(e.localRotation)}this.changedEntries.add(e)}
    }
  }
  step(dt){
    this.worldMs=0;this.stepCount=0;this.accumulator=Math.min(this.accumulator+dt,.1);
    while(this.accumulator>=1/60&&this.stepCount<4){this.accumulator-=1/60;this.clock+=1/60;this.tick++;this.stepCount++;let changed=false,released=0;
      for(let i=this.collapse.length-1;i>=0&&released<16;i--){const q=this.collapse[i];if(q.time>this.clock)continue;if(q.foundation){this.fracture(q.p,q.p.position.clone().add(new THREE.Vector3(0,0,-.4)),2.8);this.onDust(q.p.position,2)}else this.activate(q.p);this.collapse.splice(i,1);released++;changed=true}
      const stepStart=performance.now();this.world.step(this.events);this.worldMs+=performance.now()-stepStart;
      const impacts=new Set(),wake=new Set();this.events.drainContactForceEvents(e=>{
        for(const h of [e.collider1(),e.collider2()]){const resting=this.dormantColliders.get(h);if(resting?.frozen){wake.add(resting);continue}if(impacts.size>=3)continue;const p=this.colliderMeshes.get(h);if(!p?.userData.active)continue;const s=p.userData.size,force=e.totalForceMagnitude(),limit=p.material===this.materials.glass?9000:Math.max(200000,Math.min(1000000,s.x*s.y*s.z*900000));p.userData.damage+=Math.max(0,force-limit)/60;if(p.userData.damage>limit*.08)impacts.add(p)}
      });
      for(const r of wake)this.wake(r);for(const p of impacts){this.fracture(p,p.position.clone().add(new THREE.Vector3(0,.1,.15)),.8);this.onDust(p.position,3);this.impactCount++;changed=true}
      if(changed){this.checkSupports();this.onChange()}this.syncTransforms();if(this.tick%6===0)this.stabilize(.1);
    }
  }
  get stats(){let frozen=0,sleeping=0;for(const r of this.records.values()){if(r.frozen)frozen++;else if(r.sleeping)sleeping++}return {engine:'Rapier 0.19.3',collisionMs:this.world.timingCollisionDetection(),solverMs:this.world.timingSolver(),worldMs:Math.round(this.worldMs??0),bodies:this.records.size,components:this.dynamic.length,sleeping:sleeping+frozen,frozen,awake:this.records.size-sleeping-frozen,colliders:this.world.colliders.len(),secondaryImpacts:this.impactCount,pendingCollapse:this.collapse.length,simulationTime:this.clock,steps:this.stepCount}}
}



