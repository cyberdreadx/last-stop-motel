import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TransformStream } from '../transform-stream.js';
import { FrameMetrics } from '../frame-metrics.js';

test('worker poses interpolate smoothly and settled objects leave the animation set',()=>{const stream=new TransformStream(34),mesh=new THREE.Object3D();stream.push(1,mesh,new Float32Array([0,0,0,0,0,0,1]),0,1000);stream.push(1,mesh,new Float32Array([10,0,0,0,0,0,1]),0,1100,true);stream.step(1084);assert.ok(Math.abs(mesh.position.x-5)<.001);stream.step(1134);assert.equal(mesh.position.x,10);assert.equal(stream.animating.size,0);const version=mesh.userData.transformVersion;stream.step(1150);assert.equal(mesh.userData.transformVersion,version);stream.clear();assert.equal(stream.states.size,0)});
test('frame metrics compare simulation progress with wall time',()=>{const metrics=new FrameMetrics();metrics.start(0,0);for(let i=1;i<=1080;i++)metrics.sample(i*1000/60,1000/60,{bodies:500,simulationTime:i/60,steps:1,worldMs:3});assert.equal(metrics.result.complete,true);assert.equal(metrics.result.meanFps,60);assert.equal(metrics.result.simulationRate,1);assert.equal(metrics.result.p95PhysicsStepMs,3)});
test('benchmark rate uses command elapsed time after a previous simulation',()=>{const metrics=new FrameMetrics();metrics.start(0);metrics.sample(18000,1000/60,{bodies:1,simulationTime:118,benchmarkElapsed:18,steps:1,worldMs:2});assert.equal(metrics.result.simulationRate,1);assert.equal(metrics.result.simulationSeconds,18)});
