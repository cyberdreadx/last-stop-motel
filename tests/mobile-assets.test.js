import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {read} from 'three/examples/jsm/libs/ktx-parse.module.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
test('mobile GPU textures retain 4K surfaces, 8K sky and complete mip chains',()=>{
 for(const name of ['wall-Diffuse','wall-nor_gl','wall-Rough','asphalt-Diffuse','asphalt-nor_gl','asphalt-Rough','sand-Diffuse','sand-nor_gl','sand-Rough','desert-background-8k']){
  const ktx=read(fs.readFileSync(`public/assets/${name}.ktx2`));const sky=name.startsWith('desert');assert.equal(ktx.pixelWidth,sky?8192:4096);assert.equal(ktx.pixelHeight,4096);assert.equal(ktx.levels.length,sky?14:13);assert.ok(ktx.levels.every(l=>l.levelData.byteLength>0));
 }
});
test('compact mobile HDR lighting decodes with finite radiance',()=>{
 const b=fs.readFileSync('public/assets/desert-lighting-1k.hdr');const hdr=new HDRLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));assert.equal(hdr.width,1024);assert.equal(hdr.height,512);assert.equal(hdr.data.length,1024*512*4);assert.ok(hdr.data.some(v=>v>0));
});
