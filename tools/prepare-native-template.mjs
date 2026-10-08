import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
const original=fs.readFileSync('hYMCKO_новый.csd');
if(crypto.createHash('sha256').update(original).digest('hex')!=='f1044781462f5d20fa2205a0d547e628da322e0f9a2ab07d95fa16be5abe507b')throw Error('Unsupported source CSD');
const cstring=s=>{const size=Buffer.alloc(4);size.writeUInt32LE(s.length);return Buffer.concat([size,Buffer.from(s,'utf16le')])};
function replace(data,old,value){const at=data.indexOf(old);if(at<0||data.indexOf(old,at+1)>=0)throw Error('Ambiguous native slot');return Buffer.concat([data.subarray(0,at),value,data.subarray(at+old.length)])}
// Offsets are valid only for the SHA-locked source revision above. Never
// publish the source employee's text or portrait in the packaged template.
const slots=[[1532226,'SURNAME'],[1531585,'NAME'],[1530944,'PATRONYMIC'],[1530285,'POSITION'],[1613777,'EMPLOYEE_NUMBER'],[26381,'PASS_NUMBER']].map(([at,key])=>{
 const length=original.readUInt32LE(at);
 if(length>200||at+4+length*2>original.length)throw Error('Invalid source slot');
 return[original.subarray(at+4,at+4+length*2).toString('utf16le'),'RUBEZH_'+key];
});
let result=original;for(const[old,value]of slots)result=replace(result,cstring(old),cstring(value));
const crc32=b=>{let crc=0xffffffff;for(const byte of b){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return(crc^0xffffffff)>>>0};
const chunk=(name,data)=>{const body=Buffer.concat([Buffer.from(name),data]),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(body));return Buffer.concat([size,body,crc])};
const header=Buffer.alloc(13);header.writeUInt32BE(386);header.writeUInt32BE(502,4);header[8]=8;header[9]=2;
const rows=Buffer.alloc((386*3+1)*502,255);for(let y=0;y<502;y++)rows[y*(386*3+1)]=0;
const white=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
const name=cstring('csdCEA7.tmp'),at=result.indexOf(name)+name.length,oldLength=result.readUInt32LE(at),size=Buffer.alloc(4);size.writeUInt32LE(white.length);
result=Buffer.concat([result.subarray(0,at),size,white,result.subarray(at+4+oldLength)]);
for(const[old]of slots)if(result.includes(cstring(old)))throw Error('Personal template text remained');
fs.writeFileSync('bridge/employee-native.csd',result);
console.log('Sanitized master SHA256:',crypto.createHash('sha256').update(result).digest('hex'));
