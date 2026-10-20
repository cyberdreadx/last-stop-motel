import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { loadSurfaces, mappedBox } from './surfaces.js';
import { RemotePhysics } from './remote-physics.js';
import { RenderBatches } from './batches.js';
import { DustClouds } from './dust.js';
import { FrameMetrics } from './frame-metrics.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const touchDevice=matchMedia('(pointer: coarse)').matches||new URLSearchParams(location.search).has('mobile');
const renderer=new THREE.WebGLRenderer({canvas:document.querySelector('#scene'),antialias:true,powerPreference:'high-performance'});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,touchDevice?1.5:1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;
const scene=new THREE.Scene();scene.background=new THREE.Color('#b6c0b9');scene.fog=new THREE.FogExp2('#c7b79c',.005);
const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.1,600);camera.position.set(29,8.3,32);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(-3,3.1,0);controls.enableDamping=true;controls.maxPolarAngle=Math.PI/2-.015;controls.minDistance=4;controls.maxDistance=105;controls.update();
if(innerWidth<600){camera.fov=55;camera.position.set(48,25,76);controls.target.set(-3,3.1,0);camera.updateProjectionMatrix();controls.update()}
const mat=await loadSurfaces(renderer,scene,(n,total,name,loaded=0,size=0)=>{const detail=loaded?` · ${(loaded/1048576).toFixed(1)}${size?'/'+(size/1048576).toFixed(1):''} MB`:'';document.querySelector('#loading span').textContent=`Loading ${n}/${total} · ${name??'surfaces'}${detail}`});
document.querySelector('#loading span').textContent='Preparing geometry and physics…';
await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

scene.fog=new THREE.FogExp2('#c5b69c',.003);
const sunPos=new THREE.Vector3(-.45,.55,.65).normalize();
scene.add(new THREE.HemisphereLight('#dce9ed','#5c513e',.3));
const sun=new THREE.DirectionalLight('#fff0d5',4.6);sun.position.copy(sunPos).multiplyScalar(70);sun.castShadow=true;sun.shadow.mapSize.set(touchDevice?2048:4096,touchDevice?2048:4096);Object.assign(sun.shadow.camera,{left:-55,right:55,top:45,bottom:-45,near:.5,far:180});sun.shadow.normalBias=.035;sun.shadow.bias=-.0001;scene.add(sun);
const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
class DustSafeGTAO extends GTAOPass {_overrideVisibility(){super._overrideVisibility();this.scene.traverse(o=>{if((o.isSprite||o.userData.excludeAO)&&o.visible){o.visible=false;this._visibilityCache.push(o)}})}}
const ao=new DustSafeGTAO(scene,camera,innerWidth,innerHeight);ao.blendIntensity=.9;const setAoSize=ao.setSize.bind(ao);ao.setSize=(w,h)=>setAoSize(Math.ceil(w*.5),Math.ceil(h*.5));ao.updateGtaoMaterial({radius:1.8,distanceExponent:1.5,thickness:1.4,scale:1,samples:16});composer.addPass(ao);composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.08,.5,2.5));composer.addPass(new OutputPass());
let seed=94;function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}const range=(a,b)=>a+(b-a)*rand();
const boxGeo=new THREE.BoxGeometry();let building=new THREE.Group();scene.add(building);let pieces=[],originalCount=0,mode='orbit',demoTimer=null,blastCount=0;let physics;let batchRenderer;let assemblyKey=null;
function box(w,h,d,x,y,z,m,parent=scene){const o=new THREE.Mesh(mappedBox(w,h,d,x,y,z),m);o.scale.set(w,h,d);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);if(parent===building){o.userData={size:new THREE.Vector3(w,h,d),origin:o.position.clone(),active:true,assembly:assemblyKey};pieces.push(o)}return o}
function part(w,h,d,x,y,z,m){return box(w,h,d,x,y,z,m,building)}
function textPlane(text,w,h,color,bg,font='bold 110px sans-serif'){const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d');if(bg){ctx.fillStyle=bg;ctx.fillRect(0,0,1024,256)}ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=font;ctx.fillText(text,512,128,960);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:t,transparent:true,roughness:.7,side:THREE.DoubleSide}))}
box(350,.15,350,0,-.2,0,mat.sand);box(62,.12,43,0,-.05,8,mat.asphalt);
// Road, faded markings, parking bays and wheel stops.
box(350,.04,10,0,-.08,40,mat.asphalt);for(let x=-160;x<160;x+=10)box(4,.015,.1,x,-.05,40,mat.cream);
for(let x=-23;x<=24;x+=6){box(.09,.018,9,x,.03,16,mat.cream);box(4.5,.018,.09,x+2.3,.03,20.5,mat.cream);box(3,.18,.3,x+2.8,.1,12.5,mat.cream)}
box(34,.28,2,0,.14,6.1,mat.cream);box(34,.15,.25,0,.12,7.12,mat.white);
function buildMotel(){pieces=[];seed=94;building.clear();
for(let floor=0;floor<2;floor++){const y=floor*3.3;
for(let room=0;room<8;room++){const x=-14+room*4;
// Individual masonry blocks are detachable, revealing furnished rooms.
for(let row=0;row<4;row++)for(let col=0;col<4;col++){let xx=x-1.5+col,yy=y+.42+row*.78;const door=(col===0||col===1)&&row<3;const window=col>=2&&row>=1&&row<=2;if(!door&&!window)part(.99,.77,.24,xx,yy,3.8,mat.wall);}
for(let row=0;row<4;row++)for(let col=0;col<4;col++)part(.99,.78,.2,x-1.5+col,y+.42+row*.78,-3.8,mat.wall);
part(3.98,.22,7.8,x,y+.02,0,mat.cream);
assemblyKey=`door-${floor}-${room}`;const door=part(1.55,2.45,.13,x-1,y+1.27,3.83,mat.teal);
part(1.32,.025,.02,x-1,y+.3,3.906,mat.dark);part(.025,1.95,.02,x-1.65,y+1.3,3.906,mat.dark);part(.025,1.95,.02,x-.35,y+1.3,3.906,mat.dark);part(1.6,.045,.32,x-1,y+.06,3.9,mat.metal);part(.08,2.6,.28,x-1.83,y+1.3,3.87,mat.cream);part(.08,2.6,.28,x-.17,y+1.3,3.87,mat.cream);part(1.75,.08,.28,x-1,y+2.58,3.87,mat.cream);part(.06,.13,.08,x-.49,y+1.24,3.95,mat.metal);
const n=textPlane(String(101+floor*100+room),.48,.18,'#f2e4c3',null);n.position.set(x-1,y+2.12,3.91);building.add(n);n.userData.roomDoor=door;
assemblyKey=null;part(1.7,1.45,.06,x+1,y+1.62,3.85,mat.glass);assemblyKey=`window-${floor}-${room}`;for(let off of [-.91,.91])part(.065,1.6,.12,x+1+off,y+1.62,3.91,mat.white);for(let off of [-.78,.78,0])part(1.85,.055,.12,x+1,y+1.62+off,3.91,mat.white);
for(let j=0;j<8;j++)part(1.6,.025,.04,x+1,y+.96+j*.17,3.79,mat.cream);
assemblyKey=`ac-${floor}-${room}`;part(1.4,.44,.5,x+1,y+.4,4.02,mat.metal);for(let j=0;j<5;j++)part(1.2,.024,.03,x+1,y+.25+j*.065,4.29,mat.dark);
assemblyKey=`bed-${floor}-${room}`;
// Interior beds, pillows and headboards.
box(1.8,.42,2.3,x+.6,y+.4,-1.3,mat.dark,building);box(1.85,.22,2.3,x+.6,y+.72,-1.3,mat.white,building);box(1.85,.08,1.3,x+.6,y+.87,-.8,mat.teal,building);box(1.6,.65,.12,x+.6,y+1,-2.5,mat.red,building);box(.65,.13,.42,x+.6,y+.89,-2.1,mat.cream,building);
assemblyKey=null;if(room===0||room===7)for(let row=0;row<4;row++)for(let col=0;col<7;col++)part(.22,.78,1.08,room===0?-16:16,y+.42+row*.78,-3.25+col*1.08,mat.wall);
if(room<7)part(.14,3.15,7.4,x+2,y+1.65,0,mat.wall);
}
for(let x=-16;x<16;x+=2){part(1.99,.24,2.3,x+1,y+3.27,4.8,mat.cream);part(1.99,.38,.2,x+1,y+3.08,5.92,mat.teal)}
for(let x=-16;x<=16;x+=4){part(.18,3.1,.18,x,y+1.65,5.65,mat.teal);if(floor===1){assemblyKey=`rail-${x}`;part(3.85,.08,.08,x+2,y+1,5.7,mat.white);for(let j=0;j<8&&x<16;j++)part(.035,.85,.035,x+j*.5,y+.56,5.7,mat.white);assemblyKey=null}}
}
// Low roof and deep fascia.
for(let x=-16;x<16;x+=2){part(1.99,.25,8.4,x+1,6.65,-.2,mat.roof);part(1.99,.55,.22,x+1,6.53,4.05,mat.teal);part(1.99,.32,.15,x+1,6.9,4.1,mat.cream)}
for(let x of [-10,-1,9]){assemblyKey=`roof-ac-${x}`;part(2.3,.7,1.7,x,7.1,-1,mat.metal);for(let j=0;j<6;j++)part(2.1,.035,.06,x,6.9+j*.09,-.12,mat.dark)}
assemblyKey=null;
// Side stair.
for(let i=0;i<15;i++){box(2.4,.2,.44,18, .18+i*.22,6-i*.43,mat.cream,building)}
for(let s of [-1,1]){let rail=box(.07,3.6,.07,18+s*1.1,2.4,2.8,mat.teal,building);rail.rotation.x=-1.1;for(let i=0;i<5;i++)box(.06,1,.06,18+s*1.1,.8+i*.7,5.8-i*1.4,mat.teal,building)}
originalCount=pieces.length;if(physics)physics.reset(pieces);if(batchRenderer)batchRenderer.reset(pieces);renderer.shadowMap.needsUpdate=true;updateUI();}
// Mid-century roadside pylon, dimensional fins and luminous lettering.
const sign=new THREE.Group();sign.position.set(-23,0,10);sign.rotation.y=.14;scene.add(sign);box(.45,11,.45,0,5.5,0,mat.metal,sign);box(5.3,5.7,.4,0,10.7,0,mat.cream,sign);box(4.95,5.35,.45,0,10.7,0,mat.teal,sign);
for(let j=0;j<5;j++){let t=textPlane('MOTEL'[j],1.6,.85,'#ffcf9d',null,'bold 150px sans-serif');t.position.set(0,12.55-j*.93,.24);t.material.emissive=new THREE.Color('#ff985e');t.material.emissiveMap=t.material.map;t.material.emissiveIntensity=1.2;sign.add(t)}
let label=textPlane('LAST STOP',5.3,1.1,'#efe1bd','#963e2d');label.position.set(0,14,.01);sign.add(label);let vacancy=textPlane('VACANCY',4,.65,'#f2ba7b','#293c36');vacancy.position.set(0,7.05,.28);sign.add(vacancy);box(5.6,.12,.7,0,13.6,0,mat.cream,sign);box(5.6,.12,.7,0,7.8,0,mat.cream,sign);
// A quiet pool, fencing and worn patio furniture.
box(10,.22,12,-26,.04,-7,mat.cream);box(7.6,.15,9.5,-26,.17,-7,mat.teal);const water=new THREE.Mesh(new THREE.PlaneGeometry(7.3,9.2,40,40),new THREE.MeshPhysicalMaterial({color:'#3b918e',roughness:.16,metalness:.35,transparent:true,opacity:.84,clearcoat:1}));water.rotation.x=-Math.PI/2;water.position.set(-26,.27,-7);scene.add(water);
for(let x=-31;x<=-21;x+=1){box(.035,1.2,.035,x,.65,-13,mat.white);box(.035,1.2,.035,x,.65,-1,mat.white)}for(let z=-13;z<=-1;z++){box(.035,1.2,.035,-31,.65,z,mat.white);box(.035,1.2,.035,-21,.65,z,mat.white)}for(let z of [-13,-1])box(10,.055,.055,-26,1.25,z,mat.white);for(let x of [-31,-21])box(.055,.055,12,x,1.25,-7,mat.white);
for(let z of [-9,-5]){box(1,.3,2,-33,.35,z,mat.white);const back=box(1,.1,1,-33,.75,z-.7,mat.teal);back.rotation.x=.6;box(1,.08,1.3,-33,.53,z+.3,mat.teal)}
// Desert vegetation and eroded silhouettes.
const grassMat=new THREE.MeshStandardMaterial({color:'#6f674e',roughness:1});
const shrubGeo=new THREE.CylinderGeometry(.009,.022,1,4);const shrubs=new THREE.InstancedMesh(shrubGeo,grassMat,1800);const dummy=new THREE.Object3D();let shrubIndex=0;
for(let i=0;i<300;i++){let x=range(-85,85),z=range(-65,65);if((Math.abs(x)<35&&z>-17&&z<31)||(z>34&&z<46))continue;const h=range(.25,.7);for(let j=0;j<8;j++){if(shrubIndex>=1800)break;dummy.position.set(x+range(-.22,.22),h*.4,z+range(-.22,.22));dummy.rotation.set(range(-.8,.8),rand()*6,range(-.8,.8));dummy.scale.set(1,h,1);dummy.updateMatrix();shrubs.setMatrixAt(shrubIndex++,dummy.matrix)}}shrubs.count=shrubIndex;shrubs.castShadow=true;scene.add(shrubs);
function cactus(x,z,h){const m=new THREE.MeshStandardMaterial({color:'#536549',roughness:1});const trunk=new THREE.Mesh(new THREE.CapsuleGeometry(.22,h,4,8),m);trunk.position.set(x,h/2,z);trunk.castShadow=true;scene.add(trunk);for(let s of [-1,1]){const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.15,h*.3,3,6),m);arm.position.set(x+s*.6,h*.65,z);scene.add(arm);box(.7,.24,.24,x+s*.3,h*.49,z,m)}}for(let p of [[-38,6,3.2],[32,-10,4],[38,18,2.4],[-40,-25,3],[29,-29,3.3]])cactus(...p);
// Utility poles and suspended lines.
for(let x of [-48,25,95]){box(.22,12,.22,x,6,-20,mat.dark);box(4,.18,.18,x,11.5,-20,mat.dark);for(let off of [-1.5,1.5]){const pts=[];for(let i=0;i<=30;i++)pts.push(new THREE.Vector3(x+i*73/30,11.5-Math.sin(i/30*Math.PI)*1.8,-20+off));scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:'#4b4b3e'})))}}
// Dust particles catch the late sun.
const dustCount=500;const dustPositions=new Float32Array(dustCount*3);for(let i=0;i<dustCount;i++){dustPositions[i*3]=range(-55,55);dustPositions[i*3+1]=range(.3,16);dustPositions[i*3+2]=range(-20,35)}const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));scene.add(new THREE.Points(dustGeo,new THREE.PointsMaterial({color:'#f2d3a2',size:.045,transparent:true,opacity:.35,depthWrite:false})));
// Density-shaped dust clouds, with real colliding rigid bodies handled by Rapier.
const metrics=new FrameMetrics();const puffCanvas=document.createElement('canvas');puffCanvas.width=puffCanvas.height=256;const pc=puffCanvas.getContext('2d');
const im=pc.createImageData(256,256);for(let y=0;y<256;y++)for(let x=0;x<256;x++){const dx=(x-128)/128,dy=(y-128)/128;const radial=Math.max(0,1-Math.sqrt(dx*dx+dy*dy));const noise=.55+.2*Math.sin(x*.11+Math.sin(y*.05)*4)+.15*Math.sin(y*.17+x*.05)+rand()*.1;const i=(y*256+x)*4;im.data[i]=166;im.data[i+1]=147;im.data[i+2]=119;im.data[i+3]=Math.min(255,Math.pow(radial,1.5)*noise*190)}pc.putImageData(im,0,0);const puffTex=new THREE.CanvasTexture(puffCanvas);
const impactDust=new DustClouds(scene,puffTex);
function emitDust(point,count=12){impactDust.emit(point,count)}
function updateUI(){const n=pieces.filter(p=>p.userData.active).length;const percent=originalCount?Math.round(n/originalCount*100):100;document.querySelector('#percent').textContent=percent;document.querySelector('#bar').style.width=percent+'%';document.querySelector('#debris').textContent=String(physics?.dynamic.length??0).padStart(3,'0')}
physics=new RemotePhysics(scene,mat,updateUI,emitDust);batchRenderer=new RenderBatches(scene);buildMotel();
function blast(point,radius=3.1){blastCount++;if(!metrics.active)metrics.start(performance.now());const strength=Number(document.querySelector('#power')?.value??13);if(physics.blast(point,radius,strength))playImpact()}
let audio;function playImpact(){try{audio??=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const buffer=audio.createBuffer(1,audio.sampleRate*.5,audio.sampleRate),a=buffer.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1)*Math.exp(-i/(audio.sampleRate*.08));const src=audio.createBufferSource();src.buffer=buffer;const filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=500;const gain=audio.createGain();gain.gain.value=.2;src.connect(filter).connect(gain).connect(audio.destination);src.start()}catch{}}
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
const touchPointers=new Set();let down=null;
renderer.domElement.addEventListener('pointerdown',e=>{touchPointers.add(e.pointerId);down=touchPointers.size===1?{id:e.pointerId,x:e.clientX,y:e.clientY,moved:false}:null});
renderer.domElement.addEventListener('pointermove',e=>{if(down?.id===e.pointerId&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>8)down.moved=true});
renderer.domElement.addEventListener('pointercancel',e=>{touchPointers.delete(e.pointerId);down=null});
renderer.domElement.addEventListener('pointerup',e=>{const tap=down;touchPointers.delete(e.pointerId);down=null;if(mode!=='blast'||!tap||tap.id!==e.pointerId||tap.moved||touchPointers.size||Math.hypot(e.clientX-tap.x,e.clientY-tap.y)>8)return;pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);ray.setFromCamera(pointer,camera);const hits=ray.intersectObjects([...pieces.filter(p=>p.userData.active),...physics.dynamic.map(d=>d.mesh)]);if(hits.length)blast(hits[0].point)});
function setMode(m){mode=m;document.querySelector('#orbit').classList.toggle('active',m==='orbit');document.querySelector('#blast').classList.toggle('active',m==='blast');renderer.domElement.style.cursor=m==='blast'?'crosshair':'grab';document.querySelector('#hint').textContent=m==='blast'?(touchDevice?'TAP THE MOTEL TO BLAST':'CLICK THE MOTEL TO BLAST'):'DRAG TO EXPLORE';document.querySelector('#subhint').textContent=touchDevice?'Pinch to zoom · Two fingers to pan':(m==='blast'?'Drag to orbit · Scroll to zoom':'Scroll to zoom · Right-drag to pan')}
setMode('orbit');
document.querySelector('#orbit').onclick=()=>setMode('orbit');document.querySelector('#blast').onclick=()=>setMode('blast');
document.querySelector('#demo').onclick=()=>{if(demoTimer)return;metrics.start(performance.now(),physics.stats.simulationTime??0);setMode('orbit');document.querySelector('#demo').classList.add('active');physics.demolish();playImpact();demoTimer=setTimeout(()=>{demoTimer=null;document.querySelector('#demo').classList.remove('active')},4000)};
function reset(){metrics.active=false;clearTimeout(demoTimer);demoTimer=null;document.querySelector('#demo').classList.remove('active');for(const child of building.children){if(child.userData.roomDoor){child.geometry.dispose();child.material.map.dispose();child.material.dispose()}}impactDust.clear();buildMotel();setMode('orbit')};document.querySelector('#reset').onclick=reset;
document.querySelector('#view-toggle').onclick=()=>document.body.classList.toggle('immersive');
addEventListener('keydown',e=>{if(e.key.toLowerCase()==='h')document.body.classList.toggle('immersive');if(e.target.tagName==='INPUT')return;if(e.key.toLowerCase()==='r')reset();if(e.key==='1')setMode('orbit');if(e.key==='2')setMode('blast')});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight)});
let lastRenderMs=0;let last=performance.now();function animate(now){const frameMs=now-last;const dt=Math.min(frameMs/1000,.1);last=now;metrics.sample(now,frameMs,physics.stats);controls.update();const physicsStart=performance.now();physics.step(dt);const physicsMs=performance.now()-physicsStart;const changedMatrices=batchRenderer.sync(pieces,physics.dynamic);if(changedMatrices)renderer.shadowMap.needsUpdate=true;impactDust.update(dt,camera);for(const child of building.children){if(child.userData.roomDoor)child.visible=child.userData.roomDoor.userData.active}water.material.color.setHSL(.48,.32,.34+Math.sin(now*.0005)*.015);if(now-(window.__lastTelemetry??0)>500){window.__lastTelemetry=now;const stats=physics.stats;document.querySelector('#physics-status').textContent=stats.bodies?`${stats.awake} MOVING · ${stats.sleeping} SETTLED`:(touchDevice?'4K PBR · 8K SKY':'4K PBR · 8K HDR');renderer.domElement.dataset.workerReady=String(physics.ready);renderer.domElement.dataset.physics=JSON.stringify(stats);if(metrics.result)renderer.domElement.dataset.benchmark=JSON.stringify(metrics.result);renderer.domElement.dataset.performance=JSON.stringify({physicsMs:physics.stats.stepMs??Math.round(physicsMs),frameMs:Math.round(frameMs),renderCpuMs:+lastRenderMs.toFixed(2),matrixUpdates:changedMatrices});renderer.domElement.dataset.textures=JSON.stringify({wall:mat.wall.map.image.width,asphalt:mat.asphalt.map.image.width,sand:mat.sand.map.image.width,hdr:scene.background.image.width})}const renderStarted=performance.now();composer.render();lastRenderMs=performance.now()-renderStarted;requestAnimationFrame(animate)}requestAnimationFrame(animate);
// Reveal only after a successful render, so GPU startup errors stay visible.
composer.render();document.querySelector('#loading').style.opacity=0;setTimeout(()=>document.querySelector('#loading')?.remove(),700);
window.__motel={scene,camera,renderer,blast,reset,get integrity(){return pieces.filter(p=>p.userData.active).length/originalCount},get debris(){return physics.dynamic.length},get physics(){return physics.stats},get textures(){return {wall:mat.wall.map.image.width,asphalt:mat.asphalt.map.image.width,sand:mat.sand.map.image.width,hdr:scene.background.image.width}},get pieces(){return pieces}};







