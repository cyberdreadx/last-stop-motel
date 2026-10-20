import * as THREE from 'three';
import fs from 'node:fs';
// Reuse the live motel's construction instructions for a representative solver benchmark.
export function motelFixture(){
 const source=fs.readFileSync(new URL('../src.js',import.meta.url),'utf8');
 const start=source.indexOf('function buildMotel(){')+'function buildMotel(){'.length;
 const end=source.indexOf('originalCount=pieces.length',start);
 const body=source.slice(start,end);
 const mat={};for(const name of ['wall','cream','roof','glass','metal','teal','core','dark','red','neon','white'])mat[name]=new THREE.MeshStandardMaterial();
 const construct=new Function('THREE','mat',`let pieces=[],seed=94,assemblyKey=null;const building=new THREE.Group();const geo=new THREE.BoxGeometry();function box(w,h,d,x,y,z,m,parent=building){const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.scale.set(w,h,d);parent.add(o);o.userData={size:new THREE.Vector3(w,h,d),origin:o.position.clone(),active:true,assembly:assemblyKey};pieces.push(o);return o}function part(...args){return box(...args)}function textPlane(){return new THREE.Object3D()}${body};return pieces;`);
 return {scene:new THREE.Scene(),materials:mat,pieces:construct(THREE,mat)};
}
