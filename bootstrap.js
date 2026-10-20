function showFailure(message){
 let overlay=document.querySelector('#loading');if(!overlay){overlay=document.createElement('div');overlay.id='loading';document.body.append(overlay)}
 overlay.style.opacity='1';overlay.style.pointerEvents='auto';overlay.replaceChildren();
 const title=document.createElement('div');title.textContent='COULD NOT START THE SCENE';
 const detail=document.createElement('span');detail.textContent=message;detail.style.cssText='max-width:85vw;text-align:center;line-height:1.7';
 const retry=document.createElement('button');retry.textContent='RETRY';retry.style.cssText='margin-top:24px;background:#dec293;color:#242a26;min-height:44px';retry.onclick=()=>location.reload();overlay.append(title,detail,retry);
}
window.addEventListener('unhandledrejection',e=>showFailure(e.reason?.message??'An asset could not load. Check your connection and retry.'));
window.addEventListener('error',e=>{if(e.message)showFailure(e.message)});
document.querySelector('#scene').addEventListener('webglcontextlost',e=>{e.preventDefault();showFailure('The phone ran out of graphics resources. Close other tabs and retry.')});
try{await import('./src.js')}catch(error){console.error(error);showFailure(error.message??'An asset could not load. Please retry.')}
