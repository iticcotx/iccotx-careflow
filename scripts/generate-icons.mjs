import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';

const BASE = 'C:/Users/imada/Desktop/ICCOTX-Protocols';

function crc32(buf){ let c=~0; for(let i=0;i<buf.length;i++){ c^=buf[i]; for(let k=0;k<8;k++) c=(c>>>1)^(0xEDB88320&-(c&1)); } return (~c)>>>0; }
function ck(type,data){ const len=Buffer.alloc(4); len.writeUInt32BE(data.length,0); const body=Buffer.concat([Buffer.from(type,'ascii'),data]); const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(body),0); return Buffer.concat([len,body,crc]); }
function png(size,rgba){ const sig=Buffer.from([137,80,78,71,13,10,26,10]); const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(size,0); ihdr.writeUInt32BE(size,4); ihdr[8]=8; ihdr[9]=6;
  const stride=size*4, raw=Buffer.alloc((stride+1)*size); for(let y=0;y<size;y++){ raw[y*(stride+1)]=0; rgba.copy(raw,y*(stride+1)+1,y*stride,y*stride+stride); }
  return Buffer.concat([sig,ck('IHDR',ihdr),ck('IDAT',deflateSync(raw,{level:9})),ck('IEND',Buffer.alloc(0))]); }

// EKG / heartbeat pulse mark (matches the in-app header logo)
const PULSE=[[0.06,0.5],[0.30,0.5],[0.39,0.37],[0.47,0.5],[0.55,0.15],[0.63,0.85],[0.71,0.5],[0.94,0.5]];
function distSeg(px,py,x0,y0,x1,y1){ const dx=x1-x0,dy=y1-y0; const l2=dx*dx+dy*dy; let t=l2?((px-x0)*dx+(py-y0)*dy)/l2:0; t=Math.max(0,Math.min(1,t)); const ex=x0+t*dx-px, ey=y0+t*dy-py; return Math.sqrt(ex*ex+ey*ey); }
function icon(size,rounded){
  const rgba=Buffer.alloc(size*size*4);
  const top=[13,176,212], bot=[4,136,168];
  const half=size*0.052, r=size*0.18;
  const pts=PULSE.map(p=>[p[0]*size,p[1]*size]);
  for(let y=0;y<size;y++){
    const f=y/(size-1);
    const bg=[Math.round(top[0]+(bot[0]-top[0])*f),Math.round(top[1]+(bot[1]-top[1])*f),Math.round(top[2]+(bot[2]-top[2])*f)];
    for(let x=0;x<size;x++){
      const o=(y*size+x)*4; let R=bg[0],G=bg[1],B=bg[2],A=255;
      if(rounded){ const dx=Math.max(r-x,x-(size-1-r),0), dy=Math.max(r-y,y-(size-1-r),0); if(dx>0&&dy>0&&(dx*dx+dy*dy)>r*r) A=0; }
      let dmin=1e9; for(let i=0;i<pts.length-1;i++){ const d=distSeg(x,y,pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1]); if(d<dmin)dmin=d; }
      if(dmin<=half){ R=255;G=255;B=255; }
      rgba[o]=R;rgba[o+1]=G;rgba[o+2]=B;rgba[o+3]=A;
    }
  }
  return png(size,rgba);
}
writeFileSync(BASE+'/icon-192.png', icon(192,true));
writeFileSync(BASE+'/icon-512.png', icon(512,true));
writeFileSync(BASE+'/icon-maskable-512.png', icon(512,false));
writeFileSync(BASE+'/apple-touch-icon.png', icon(180,true));
console.log('logo icons regenerated (heartbeat pulse mark)');
