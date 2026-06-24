import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';

const BASE = 'C:/Users/imada/Desktop/ICCOTX-Protocols';

function crc32(buf){ let c=~0; for(let i=0;i<buf.length;i++){ c^=buf[i]; for(let k=0;k<8;k++) c=(c>>>1)^(0xEDB88320&-(c&1)); } return (~c)>>>0; }
function chunk(type,data){
  const len=Buffer.alloc(4); len.writeUInt32BE(data.length,0);
  const body=Buffer.concat([Buffer.from(type,'ascii'),data]);
  const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(body),0);
  return Buffer.concat([len,body,crc]);
}
function png(size,rgba){
  const sig=Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(size,0); ihdr.writeUInt32BE(size,4);
  ihdr[8]=8; ihdr[9]=6; // 8-bit RGBA
  const stride=size*4, raw=Buffer.alloc((stride+1)*size);
  for(let y=0;y<size;y++){ raw[y*(stride+1)]=0; rgba.copy(raw,y*(stride+1)+1,y*stride,y*stride+stride); }
  const idat=deflateSync(raw,{level:9});
  return Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))]);
}
function icon(size){
  const rgba=Buffer.alloc(size*size*4);
  const top=[13,176,212], bot=[4,136,168];        // teal gradient
  const cx=size/2, cy=size/2, t=size*0.19, l=size*0.52, r=size*0.16; // cross + corner radius
  for(let y=0;y<size;y++){
    const f=y/(size-1);
    const bg=[Math.round(top[0]+(bot[0]-top[0])*f),Math.round(top[1]+(bot[1]-top[1])*f),Math.round(top[2]+(bot[2]-top[2])*f)];
    for(let x=0;x<size;x++){
      const o=(y*size+x)*4;
      // rounded-corner alpha (so non-maskable contexts look like an app icon)
      let a=255;
      const dx=Math.max(r-x, x-(size-1-r), 0), dy=Math.max(r-y, y-(size-1-r), 0);
      if(dx>0&&dy>0 && (dx*dx+dy*dy)>r*r) a=0;
      let R=bg[0],G=bg[1],B=bg[2];
      const inV=Math.abs(x-cx)<=t/2 && Math.abs(y-cy)<=l/2;
      const inH=Math.abs(y-cy)<=t/2 && Math.abs(x-cx)<=l/2;
      if(inV||inH){ R=255;G=255;B=255; }
      rgba[o]=R; rgba[o+1]=G; rgba[o+2]=B; rgba[o+3]=a;
    }
  }
  return png(size,rgba);
}
// maskable variant: full-bleed (no rounded transparency) so Android masks it itself
function iconFull(size){
  const rgba=Buffer.alloc(size*size*4);
  const top=[13,176,212], bot=[4,136,168];
  const cx=size/2, cy=size/2, t=size*0.17, l=size*0.46;
  for(let y=0;y<size;y++){
    const f=y/(size-1);
    const bg=[Math.round(top[0]+(bot[0]-top[0])*f),Math.round(top[1]+(bot[1]-top[1])*f),Math.round(top[2]+(bot[2]-top[2])*f)];
    for(let x=0;x<size;x++){
      const o=(y*size+x)*4; let R=bg[0],G=bg[1],B=bg[2];
      const inV=Math.abs(x-cx)<=t/2 && Math.abs(y-cy)<=l/2;
      const inH=Math.abs(y-cy)<=t/2 && Math.abs(x-cx)<=l/2;
      if(inV||inH){ R=255;G=255;B=255; }
      rgba[o]=R; rgba[o+1]=G; rgba[o+2]=B; rgba[o+3]=255;
    }
  }
  return png(size,rgba);
}
writeFileSync(BASE+'/icon-192.png', icon(192));
writeFileSync(BASE+'/icon-512.png', icon(512));
writeFileSync(BASE+'/icon-maskable-512.png', iconFull(512));
writeFileSync(BASE+'/apple-touch-icon.png', icon(180));
console.log('icons written: 192, 512, maskable-512, apple-touch-icon(180)');
