import {spawn} from 'node:child_process';
import fs from 'node:fs';
const files=fs.readdirSync('public/assets').filter(n=>n.endsWith('.jpg')&&!n.startsWith('desert'));
for(const name of files){
 if(fs.existsSync(`public/assets/${name.replace('.jpg','.ktx2')}`))continue;
 await new Promise((resolve,reject)=>{const args=['-uastc','-uastc_level','2','-ktx2','-mipmap','-file',`public/assets/${name}`,'-output_file',`public/assets/${name.replace('.jpg','.ktx2')}`];if(!name.includes('Diffuse'))args.push('-linear');if(name.includes('nor_gl'))args.push('-normal_map');const p=spawn('node_modules/@gpu-tex-enc/basis/bin/win32-x64/basisu.exe',args,{stdio:['ignore','ignore','inherit']});p.on('exit',c=>c?reject(new Error(name)):resolve())});console.log('Encoded',name);
}
