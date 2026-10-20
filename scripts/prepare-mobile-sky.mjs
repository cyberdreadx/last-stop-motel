import fs from 'node:fs';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {FloatType} from 'three';
import sharp from 'sharp';
const input=fs.readFileSync('public/assets/desert-8k.hdr');
const hdr=new HDRLoader().setDataType(FloatType).parse(input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength));
const rgb=Buffer.alloc(hdr.width*hdr.height*3),small=Buffer.alloc(1024*512*4);
for(let y=0;y<hdr.height;y++)for(let x=0;x<hdr.width;x++){
 const p=y*hdr.width+x;
 for(let c=0;c<3;c++){const v=Math.min(1,Math.max(0,hdr.data[p*4+c]));rgb[p*3+c]=Math.round(255*(v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055))}
}
for(let y=0;y<512;y++)for(let x=0;x<1024;x++){
 const vals=[0,0,0];for(let dy=0;dy<8;dy++)for(let dx=0;dx<8;dx++){const p=((y*8+dy)*hdr.width+x*8+dx)*4;for(let c=0;c<3;c++)vals[c]+=hdr.data[p+c]/64}
 const m=Math.max(...vals),e=m>1e-32?Math.floor(Math.log2(m))+1:0,s=m>1e-32?256/2**e:0,p=(y*1024+x)*4;
 for(let c=0;c<3;c++)small[p+c]=Math.min(255,Math.floor(vals[c]*s));small[p+3]=m>1e-32?e+128:0;
}
fs.writeFileSync('public/assets/desert-lighting-1k.hdr',Buffer.concat([Buffer.from('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 512 +X 1024\n'),small]));
await sharp(rgb,{raw:{width:hdr.width,height:hdr.height,channels:3}}).jpeg({quality:95,chromaSubsampling:'4:4:4'}).toFile('public/assets/desert-background-8k.jpg');
console.log('Generated 8K sky and compact HDR lighting');


