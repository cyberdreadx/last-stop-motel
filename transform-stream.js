import * as THREE from 'three';

// One-snapshot interpolation buffer; only objects that received motion enter the render loop.
export class TransformStream {
  constructor(delayMs=34){this.delayMs=delayMs;this.states=new Map();this.animating=new Set();this.position=new THREE.Vector3();this.rotation=new THREE.Quaternion()}
  clear(){this.states.clear();this.animating.clear()}
  push(id,mesh,array,offset,time,settled=false){
    let s=this.states.get(id);if(!s){s={mesh,fromP:new THREE.Vector3(),toP:new THREE.Vector3(),fromQ:new THREE.Quaternion(),toQ:new THREE.Quaternion(),fromTime:time,toTime:time,settled};s.toP.fromArray(array,offset);s.toQ.fromArray(array,offset+3);s.fromP.copy(s.toP);s.fromQ.copy(s.toQ);mesh.position.copy(s.toP);mesh.quaternion.copy(s.toQ);mesh.userData.transformVersion=(mesh.userData.transformVersion??0)+1;this.states.set(id,s)}
    else{s.fromP.copy(s.toP);s.fromQ.copy(s.toQ);s.fromTime=s.toTime;s.toP.fromArray(array,offset);s.toQ.fromArray(array,offset+3);s.toTime=time;s.settled=settled}
    this.animating.add(s);return s;
  }
  step(time){let changed=0;const renderTime=time-this.delayMs;for(const s of this.animating){const span=s.toTime-s.fromTime;const alpha=span>0?THREE.MathUtils.clamp((renderTime-s.fromTime)/span,0,1):1;this.position.lerpVectors(s.fromP,s.toP,alpha);this.rotation.slerpQuaternions(s.fromQ,s.toQ,alpha);const m=s.mesh;if(m.position.distanceToSquared(this.position)>1e-12||Math.abs(m.quaternion.dot(this.rotation))<1-1e-12){m.position.copy(this.position);m.quaternion.copy(this.rotation);m.userData.transformVersion=(m.userData.transformVersion??0)+1;changed++}if(alpha>=1)this.animating.delete(s)}return changed}
}
