import * as THREE from 'three';

export class DustClouds {
  constructor(scene,texture,capacity=140){
    this.capacity=capacity;this.particles=[];this.dummy=new THREE.Object3D();this.spin=new THREE.Quaternion();this.axis=new THREE.Vector3(0,0,1);
    const geometry=new THREE.PlaneGeometry(1,1);this.opacity=new THREE.InstancedBufferAttribute(new Float32Array(capacity),1);geometry.setAttribute('dustOpacity',this.opacity);
    const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide});
    material.onBeforeCompile=shader=>{shader.vertexShader='attribute float dustOpacity; varying float vDustOpacity;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvDustOpacity=dustOpacity;');shader.fragmentShader='varying float vDustOpacity;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=vDustOpacity;')};
    this.mesh=new THREE.InstancedMesh(geometry,material,capacity);this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.userData.excludeAO=true;this.mesh.renderOrder=2;scene.add(this.mesh);
  }
  emit(point,count=12){for(let i=0;i<Math.min(18,count)&&this.particles.length<this.capacity;i++){this.particles.push({position:point.clone().add(new THREE.Vector3(Math.random()*1.2-.6,Math.random()*.9-.3,Math.random()*1.2-.6)),velocity:new THREE.Vector3(Math.random()*1.2-.6,.3+Math.random()*.8,Math.random()-.5),size:.7+Math.random()*.9,rotation:Math.random()*Math.PI*2,life:0,distance:0})}}
  clear(){this.particles.length=0;this.mesh.count=0}
  update(dt,camera){
    let count=0;for(const p of this.particles){p.life+=dt;if(p.life>6)continue;p.position.addScaledVector(p.velocity,dt);p.size+=dt*.65;p.distance=p.position.distanceToSquared(camera.position);this.particles[count++]=p}this.particles.length=count;
    this.particles.sort((a,b)=>b.distance-a.distance);
    for(let i=0;i<count;i++){const p=this.particles[i];this.dummy.position.copy(p.position);this.dummy.scale.setScalar(p.size);this.dummy.quaternion.copy(camera.quaternion).multiply(this.spin.setFromAxisAngle(this.axis,p.rotation));this.dummy.updateMatrix();this.mesh.setMatrixAt(i,this.dummy.matrix);this.opacity.setX(i,Math.max(0,.22-p.life*.038))}
    if(count){this.mesh.instanceMatrix.needsUpdate=true;this.opacity.needsUpdate=true}this.mesh.count=count;
  }
}
