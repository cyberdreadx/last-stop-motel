import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// CC0 photographic PBR maps, stored locally so viewing does not depend on a CDN.
export async function loadSurfaces(renderer, scene, onProgress) {
  const base=import.meta.env.BASE_URL;
  const mobile=matchMedia('(pointer: coarse)').matches||new URLSearchParams(location.search).has('mobile');
  const loader=new THREE.TextureLoader();
  const compressed=mobile&&['WEBGL_compressed_texture_astc','WEBGL_compressed_texture_etc','EXT_texture_compression_bptc'].some(name=>renderer.extensions.has(name));
  const ktx=compressed?new KTX2Loader().setTranscoderPath(`${base}basis/`).setWorkerLimit(1).detectSupport(renderer):null;
  let complete=0;const total=mobile?11:10;
  const anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
  const progress=name=>event=>onProgress(complete,total,name,event.loaded,event.total);
  async function map(name,color=false){
    const url=`${base}assets/${name}.${compressed?'ktx2':'jpg'}`;
    const t=await (ktx??loader).loadAsync(url,progress(name));
    t.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;
    t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=anisotropy;
    onProgress(++complete,total,name);return t;
  }
  const names=['wall-Diffuse','wall-nor_gl','wall-Rough','asphalt-Diffuse','asphalt-nor_gl','asphalt-Rough','sand-Diffuse','sand-nor_gl','sand-Rough'];
  const textures=[];
  // Mobile decodes/uploads one surface at a time to avoid parallel memory spikes.
  if(mobile){for(const name of names)textures.push(await map(name,name.includes('Diffuse')))}
  else textures.push(...await Promise.all(names.map(name=>map(name,name.includes('Diffuse')))));
  const [wall,wn,wr,road,rn,rr,sand,sn,sr]=textures;
  const hdr=await new HDRLoader().loadAsync(`${base}assets/${mobile?'desert-lighting-1k.hdr':'desert-8k.hdr'}`,progress('HDR lighting'));
  onProgress(++complete,total,'HDR lighting');hdr.mapping=THREE.EquirectangularReflectionMapping;
  let background=hdr;
  if(mobile){background=await (ktx??loader).loadAsync(`${base}assets/desert-background-8k.${compressed?'ktx2':'jpg'}`,progress('8K sky'));background.mapping=THREE.EquirectangularReflectionMapping;background.colorSpace=THREE.SRGBColorSpace;onProgress(++complete,total,'8K sky')}
  scene.background=background;scene.backgroundIntensity=.9;scene.backgroundBlurriness=0;
  scene.environment=hdr;scene.environmentIntensity=.9;
  scene.environmentRotation.y=scene.backgroundRotation.y=1.1;
  ktx?.dispose();
  const physical=(a,n,r,extra={})=>new THREE.MeshStandardMaterial({map:a,normalMap:n,roughnessMap:r,roughness:1,normalScale:new THREE.Vector2(.7,.7),...extra});
  const wallMat=physical(wall,wn,wr,{color:'#fff5dd'});
  const concrete=physical(wall,wn,wr,{color:'#e5dfce',normalScale:new THREE.Vector2(.55,.55)});
  const teal=physical(wall,wn,wr,{color:'#7cae9d',metalness:.12,roughness:.85,normalScale:new THREE.Vector2(.22,.22)});
  return {
    wall:wallMat,cream:concrete,teal,
    roof:physical(road,rn,rr,{color:'#9c9684'}),
    asphalt:physical(road,rn,rr,{color:'#b1aaa0',normalScale:new THREE.Vector2(1,1)}),
    sand:physical(sand,sn,sr,{color:'#d1b691',normalScale:new THREE.Vector2(1.2,1.2)}),
    dark:physical(wall,wn,wr,{color:'#393c33',normalScale:new THREE.Vector2(.2,.2)}),
    metal:physical(wall,wn,wr,{color:'#7e827b',metalness:.8,roughness:.55,normalScale:new THREE.Vector2(.15,.15)}),
    glass:new THREE.MeshPhysicalMaterial({color:'#acc7ca',metalness:0,roughness:.065,transmission:.65,thickness:.025,ior:1.52,transparent:true,opacity:.65,envMapIntensity:1.3,side:THREE.DoubleSide}),
    red:physical(wall,wn,wr,{color:'#8a4938',normalScale:new THREE.Vector2(.2,.2)}),
    neon:new THREE.MeshStandardMaterial({color:'#ffc6a0',emissive:'#ff6f36',emissiveIntensity:3}),
    white:physical(wall,wn,wr,{color:'#ddd4b7',normalScale:new THREE.Vector2(.2,.2)}),
    core:physical(wall,wn,wr,{color:'#8c8777',normalScale:new THREE.Vector2(1,1)})
  };
}

// UVs are measured in meters instead of stretching a complete photograph over every block.
const geometries=new Map();
export function mappedBox(w,h,d,x,y,z){
  const key=[w,h,d,Math.round(x*3)%7,Math.round(y*3)%7,Math.round(z*3)%7].join(',');
  if(geometries.has(key))return geometries.get(key);
  const g=new RoundedBoxGeometry(w,h,d,1,Math.min(.025,w*.12,h*.12,d*.12));const bp=g.attributes.position;for(let j=0;j<bp.count;j++)bp.setXYZ(j,bp.getX(j)/w,bp.getY(j)/h,bp.getZ(j)/d);g.computeVertexNormals();const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
  for(let i=0;i<p.count;i++){
    let u,v;
    if(Math.abs(n.getX(i))>.5){u=(p.getZ(i)*d+z)/3;v=(p.getY(i)*h+y)/3}
    else if(Math.abs(n.getY(i))>.5){u=(p.getX(i)*w+x)/3;v=(p.getZ(i)*d+z)/3}
    else {u=(p.getX(i)*w+x)/3;v=(p.getY(i)*h+y)/3}
    uv.setXY(i,u,v);
  }
  geometries.set(key,g);return g;
}

