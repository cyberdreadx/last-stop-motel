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
    results.push({geometry:g,center,points:new Float32Array(coords.flatMap(v=>[v.x-center.x,v.y-center.y,v.z-center.z]))});
  }return results;
}

export class DestructionPhysics {
  constructor(scene,materials,onChange,onDust){this.scene=scene;this.materials=materials;this.onChange=onChange;this.onDust=onDust;this.world=null;this.dynamic=[];this.fragments=[];this.bodies=new Map();this.colliderMeshes=new Map();this.clock=0;this.accumulator=0;this.collapse=[];this.impactCount=0;this.reset([])}
  reset(pieces){
    if(this.world)this.world.free();if(this.events)this.events.free();
    for(const m of this.fragments){this.scene.remove(m);m.geometry.dispose()}
    this.world=new RAPIER.World({x:0,y:-9.81,z:0});this.world.timestep=1/60;this.world.numSolverIterations=4;this.world.integrationParameters.numInternalPgsIterations=1;this.world.maxCcdSubsteps=2;
    this.events=new RAPIER.EventQueue(true);this.dynamic=[];this.fragments=[];this.bodies.clear();this.colliderMeshes.clear();this.assemblies=new Map();this.assemblyMembers=new Map();this.pieces=pieces;this.accumulator=0;this.collapse=[];this.clock=0;this.impactCount=0;
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(180,.5,180).setTranslation(0,-.48,0).setFriction(.95));
    // Raised pavement and wheel stops participate in collisions.
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(17,.14,1).setTranslation(0,.14,6.1).setFriction(.85));
    for(let x=-23;x<=24;x+=6)this.world.createCollider(RAPIER.ColliderDesc.cuboid(1.5,.09,.15).setTranslation(x+2.8,.1,12.5).setFriction(.9));
    for(const p of pieces)this.addFixed(p);
    this.supportBaseline=this.supportTotals();
  }
  properties(p){const m=p.material;return {density:m===this.materials.glass?2500:m===this.materials.metal?1800:m===this.materials.teal?650:2100,friction:m===this.materials.glass?.42:.82,restitution:m===this.materials.glass?.12:.035}}
  addFixed(p){const s=p.userData.size,props=this.properties(p),key=p.userData.assembly;let b=key?this.assemblies.get(key):null;if(!b){b=this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...p.position.toArray()));if(key)this.assemblies.set(key,b);this.assemblyMembers.set(b.handle,[])}this.assemblyMembers.get(b.handle).push(p);const center=b.translation();const offset=p.position.clone().sub(new THREE.Vector3(center.x,center.y,center.z));p.userData.assemblyOffset=offset;const c=this.world.createCollider(RAPIER.ColliderDesc.cuboid(Math.max(.007,s.x/2-.004),Math.max(.007,s.y/2-.004),Math.max(.007,s.z/2-.004)).setTranslation(...offset.toArray()).setRotation(p.quaternion).setDensity(props.density).setFriction(props.friction).setRestitution(props.restitution).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(8000),b);this.bodies.set(p,b);this.colliderMeshes.set(c.handle,p);p.userData.collider=c.handle;p.userData.damage=0;}
  activate(p,point=null,strength=0){if(!p.userData.active)return;const b=this.bodies.get(p);if(!b)return;b.setBodyType(RAPIER.RigidBodyType.Dynamic,true);b.enableCcd(false);b.setLinearDamping(.2);b.setAngularDamping(.35);for(const member of this.assemblyMembers.get(b.handle)??[p]){if(!member.userData.active)continue;member.userData.active=false;this.dynamic.push({mesh:member,body:b,offset:member.userData.assemblyOffset,localRotation:member.quaternion.clone()})}if(point)this.impulse(b,p.position,point,strength);}
  impulse(body,position,point,strength){const dir=position.clone().sub(point);const dist=Math.max(.4,dir.length());dir.normalize();dir.y+=.15;const mass=body.mass();const speed=strength/(1+dist*dist*.22)/Math.pow(Math.max(.3,mass/80),.18);const impulse=dir.multiplyScalar(mass*speed);if(speed>18)body.enableCcd(true);body.applyImpulseAtPoint(impulse,{x:position.x+.004,y:position.y+.006,z:position.z+.003},true);}
  fracture(p,point,strength){
    if(!p.userData.active)return;
    const s=p.userData.size,thin=Math.min(s.x,s.y,s.z),area=s.x*s.y*s.z/thin;
    // Beams, fixtures and thin trim remain rigid; brittle surfaces split into Voronoi cells.
    if(p.userData.assembly){this.activate(p,point,strength);return}
    if((p.material!==this.materials.wall&&p.material!==this.materials.cream&&p.material!==this.materials.roof&&p.material!==this.materials.glass)||area<.45||thin>.5){this.activate(p,point,strength);return}
    const body=this.bodies.get(p);this.colliderMeshes.delete(p.userData.collider);this.world.removeRigidBody(body);this.bodies.delete(p);p.userData.active=false;p.userData.fractured=true;p.visible=false;
    const count=p.material===this.materials.glass?6:Math.min(5,Math.max(2,Math.ceil(area*.8)));
    for(const cell of fractureCells(s,count)){
      const exterior=p.material;const interior=p.material===this.materials.glass?exterior:this.materials.core;
      const mesh=new THREE.Mesh(cell.geometry,[exterior,interior]);mesh.position.copy(p.position).add(cell.center.clone().applyQuaternion(p.quaternion));mesh.quaternion.copy(p.quaternion);mesh.castShadow=mesh.receiveShadow=true;this.scene.add(mesh);this.fragments.push(mesh);
      const props=this.properties(p);const b=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...mesh.position.toArray()).setRotation(mesh.quaternion).setLinearDamping(.15).setAngularDamping(.24).setCcdEnabled(false).setAdditionalSolverIterations(0));
      const cd=RAPIER.ColliderDesc.convexHull(cell.points);if(!cd){this.world.removeRigidBody(b);continue}this.world.createCollider(cd.setDensity(props.density).setFriction(props.friction).setRestitution(props.restitution).setContactSkin(0),b);this.dynamic.push({mesh,body:b});this.impulse(b,mesh.position,point,strength);
    }
  }
  blast(point,radius=3.4,strength=13){let hits=0;for(const p of this.pieces){if(!p.userData.active)continue;const s=p.userData.size;const closest=new THREE.Vector3(Math.max(p.position.x-s.x/2,Math.min(point.x,p.position.x+s.x/2)),Math.max(p.position.y-s.y/2,Math.min(point.y,p.position.y+s.y/2)),Math.max(p.position.z-s.z/2,Math.min(point.z,p.position.z+s.z/2)));if(closest.distanceTo(point)>radius)continue;this.fracture(p,point,strength);hits++}const pushed=new Set();for(const d of this.dynamic){if(!pushed.has(d.body.handle)&&d.mesh.position.distanceTo(point)<radius*1.3){this.impulse(d.body,d.mesh.position,point,strength*.2);pushed.add(d.body.handle)}}if(hits){this.onDust(point,Math.min(25,hits));this.checkSupports();this.onChange()}return hits}
  supportTotals(){const totals=Array.from({length:8},()=>[0,0]);for(const p of this.pieces){if(!p.userData.active)continue;const s=p.userData.size;if(!(p.material===this.materials.wall||(s.x<.25&&s.z<.25&&s.y>2)))continue;const y=p.userData.origin.y;if(y>6.4)continue;const bay=Math.max(0,Math.min(7,Math.floor((p.userData.origin.x+16)/4))),floor=y>=3.3?1:0;totals[bay][floor]+=Math.min(s.x*s.z,.8)*s.y}return totals}
  checkSupports(){const remaining=this.supportTotals();for(let bay=0;bay<8;bay++)for(let floor=0;floor<2;floor++){const base=this.supportBaseline[bay][floor];if(base&&remaining[bay][floor]/base<.42){for(const p of this.pieces){const u=p.userData;if(!u.active||u.scheduled||Math.abs(u.origin.x-(-14+bay*4))>2.15||u.origin.y<floor*3.3+.1)continue;u.scheduled=true;this.collapse.push({p,time:this.clock+.12+Math.max(0,u.origin.y-floor*3.3)*.1+Math.random()*.2})}}}
    // The projecting walkway loses support locally when its columns are destroyed.
    for(const p of this.pieces){const u=p.userData;if(!u.active||u.scheduled||u.origin.z<4.3||u.origin.y<3)continue;const columns=this.pieces.filter(c=>c.userData.active&&c.userData.size.y>2&&c.userData.size.x<.25&&c.userData.size.z<.25&&Math.abs(c.userData.origin.x-u.origin.x)<2.2&&c.userData.origin.y<u.origin.y);if(!columns.length){u.scheduled=true;this.collapse.push({p,time:this.clock+.2+Math.random()*.3})}}
  }
  demolish(){for(const p of this.pieces){const u=p.userData;if(u.origin.y<3.2&&u.active&&(p.material===this.materials.wall||u.size.y>2)){u.scheduled=true;this.collapse.push({p,foundation:true,time:this.clock+(u.origin.x+16)*.035+Math.random()*.15})}}}
  step(dt){this.worldMs=0;this.accumulator=Math.min(this.accumulator+dt,.1);let steps=0;while(this.accumulator>=1/60&&steps++<4){this.accumulator-=1/60;this.clock+=1/60;let changed=false;for(let i=this.collapse.length-1;i>=0;i--){const q=this.collapse[i];if(q.time<=this.clock){if(q.foundation){this.fracture(q.p,q.p.position.clone().add(new THREE.Vector3(0,0,-.4)),2.8);this.onDust(q.p.position,2)}else this.activate(q.p);this.collapse.splice(i,1);changed=true}}if(changed){this.checkSupports();this.onChange()}
    const stepStart=performance.now();this.world.step(this.events);this.worldMs+=performance.now()-stepStart;
    const impacts=new Set();this.events.drainContactForceEvents(e=>{if(impacts.size>=3)return;for(const h of [e.collider1(),e.collider2()]){const p=this.colliderMeshes.get(h);if(!p?.userData.active)continue;const force=e.totalForceMagnitude();const s=p.userData.size;const limit=p.material===this.materials.glass?9000:Math.max(200000,Math.min(1000000,s.x*s.y*s.z*900000));p.userData.damage+=Math.max(0,force-limit)/60;if(p.userData.damage>limit*.08)impacts.add(p)}});
    for(const p of impacts){this.fracture(p,p.position.clone().add(new THREE.Vector3(0,.1,.15)),.8);this.onDust(p.position,3);this.impactCount++;changed=true}if(impacts.size){this.checkSupports();this.onChange()}
  }for(const d of this.dynamic){const q=d.body.rotation();d.mesh.quaternion.copy(q);d.mesh.position.copy(d.body.translation());if(d.offset){d.mesh.position.add(d.offset.clone().applyQuaternion(d.mesh.quaternion));d.mesh.quaternion.multiply(d.localRotation)}}}
  get stats(){const bodies=new Map();for(const d of this.dynamic)bodies.set(d.body.handle,d.body);let sleeping=0;for(const b of bodies.values())if(b.isSleeping())sleeping++;return {engine:'Rapier 0.19.3',worldMs:Math.round(this.worldMs??0),bodies:bodies.size,components:this.dynamic.length,sleeping,awake:bodies.size-sleeping,secondaryImpacts:this.impactCount,pendingCollapse:this.collapse.length}}
}

