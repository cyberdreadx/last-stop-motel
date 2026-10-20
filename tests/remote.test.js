import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RemotePhysics } from '../remote-physics.js';

test('cold worker startup queues reset before a blast, and discards commands for an older rebuild',()=>{
 const original=globalThis.Worker;class FakeWorker{constructor(){this.sent=[]}postMessage(data){this.sent.push(data)}}globalThis.Worker=FakeWorker;
 try{const material=new THREE.MeshStandardMaterial(),p=new THREE.Mesh(new THREE.BoxGeometry(),material);p.userData={size:new THREE.Vector3(1,1,1)};const remote=new RemotePhysics(new THREE.Scene(),{wall:material},()=>{},()=>{});remote.reset([p]);remote.demolish();assert.equal(remote.worker.sent.length,0);remote.reset([p]);remote.blast(new THREE.Vector3(),2,5);remote.worker.onmessage({data:{type:'ready'}});assert.deepEqual(remote.worker.sent.map(m=>m.type),['reset','blast']);assert.equal(remote.worker.sent[0].epoch,2);assert.equal(remote.ready,true)}finally{globalThis.Worker=original}
});
