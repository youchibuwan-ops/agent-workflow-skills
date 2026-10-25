// Owner-only private application builder. Never launches the executable, changes
// stock fuses, disables ASAR integrity, or treats the private PE as vendor-signed.
// Formats: https://www.electronjs.org/docs/latest/tutorial/asar-integrity
// https://learn.microsoft.com/en-us/windows/win32/debug/pe-format
import {createHash} from 'node:crypto';
import {openSync,readSync,closeSync,fstatSync,statSync,lstatSync,realpathSync,readFileSync,writeFileSync,mkdirSync,readdirSync,linkSync,symlinkSync,existsSync,createReadStream,createWriteStream,appendFileSync,copyFileSync,statfsSync,constants} from 'node:fs';
import {resolve,relative,isAbsolute,dirname,join} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {patchMainTransport} from './entry-patch.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const inside=(root,p)=>{const r=relative(root,p);return r===''||(r!=='..'&&!r.startsWith('../')&&!r.startsWith('..\\')&&!isAbsolute(r));};
const same=(a,b)=>relative(a,b)==='';
const fail=message=>{throw Error(message);};
function range(bytes,offset,size,label='PE resource'){
 if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(size)||offset<0||size<0||offset+size>bytes.length)fail(label+' range exceeds its bounds');
 return bytes.subarray(offset,offset+size);
}
function exactRead(fd,size,offset){const b=Buffer.alloc(size);let n=0;while(n<size){const count=readSync(fd,b,n,size-n,offset+n);if(!count)fail('Unexpected end of source archive');n+=count;}return b;}
export function encodeAsarHeader(header){
 const json=Buffer.from(JSON.stringify(header)),payloadSize=Math.ceil((4+json.length)/4)*4,bytes=Buffer.alloc(12+payloadSize);
 bytes.writeUInt32LE(4,0);bytes.writeUInt32LE(4+payloadSize,4);bytes.writeUInt32LE(payloadSize,8);bytes.writeUInt32LE(json.length,12);json.copy(bytes,16);return bytes;
}
export function parseAsarHeader(bytes){
 range(bytes,0,16,'ASAR header');const [first,headerSize,payloadSize,jsonSize]=[0,4,8,12].map(n=>bytes.readUInt32LE(n));
 if(first!==4||headerSize!==payloadSize+4||payloadSize%4!==0||payloadSize!==Math.ceil((jsonSize+4)/4)*4||jsonSize>32*1024*1024||jsonSize<2)fail('Invalid ASAR header pickle');
 const raw=range(bytes,16,jsonSize,'ASAR header'),dataOffset=8+headerSize;range(bytes,0,dataOffset,'ASAR header');
 let header;try{header=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));}catch{fail('Invalid ASAR header JSON');}
 if(!header?.files||typeof header.files!=='object'||Array.isArray(header.files))fail('Invalid ASAR files header');
 return {header,headerSha256:sha(raw),headerSize,dataOffset,rawHeader:Buffer.from(raw)};
}
function resourceLocation(bytes){
 if(range(bytes,0,2).toString()!=='MZ')fail('Missing PE DOS signature');const pe=range(bytes,0x3c,4).readUInt32LE();
 if(range(bytes,pe,4).toString()!=='PE\0\0')fail('Missing PE signature');
 range(bytes,pe+4,20);const sections=bytes.readUInt16LE(pe+6),optionalSize=bytes.readUInt16LE(pe+20),optional=pe+24;
 range(bytes,optional,optionalSize);const magic=bytes.readUInt16LE(optional),directory=magic===0x20b?112:magic===0x10b?96:fail('Unknown PE optional header');
 if(optionalSize<directory+24||sections<1||sections>96)fail('Invalid PE resource table header');
 const numberAt=magic===0x20b?108:92;if(bytes.readUInt32LE(optional+numberAt)<3)fail('Missing PE resource directory');
 const resourceRva=bytes.readUInt32LE(optional+directory+16),resourceSize=bytes.readUInt32LE(optional+directory+20),sectionTable=optional+optionalSize;
 range(bytes,sectionTable,sections*40);const map=(rva,size)=>{
  const matches=[];for(let n=0;n<sections;n++){const at=sectionTable+n*40,virtual=bytes.readUInt32LE(at+12),rawSize=bytes.readUInt32LE(at+16),raw=bytes.readUInt32LE(at+20);if(rva>=virtual&&rva+size<=virtual+rawSize)matches.push(raw+rva-virtual);}
  if(matches.length!==1)fail('PE resource RVA is outside an unambiguous raw section');range(bytes,matches[0],size);return matches[0];
 };
 if(!resourceRva||resourceSize<16)fail('Missing PE integrity resource');const root=map(resourceRva,resourceSize);
 const rr=(offset,size)=>{if(offset<0||offset+size>resourceSize)fail('PE resource directory offset exceeds bounds');return range(bytes,root+offset,size);};
 const name=value=>{if(!(value&0x80000000))return value;const at=value&0x7fffffff,n=rr(at,2).readUInt16LE();if(n>256)fail('Oversized PE resource name');return rr(at+2,n*2).toString('utf16le');};
 const entries=at=>{const d=rr(at,16),count=d.readUInt16LE(12)+d.readUInt16LE(14);if(count>4096)fail('Oversized PE resource directory');const all=rr(at+16,count*8);return Array.from({length:count},(_,i)=>({name:name(all.readUInt32LE(i*8)),target:all.readUInt32LE(i*8+4)}));};
 const types=entries(0).filter(x=>typeof x.name==='string'&&x.name.toUpperCase()==='INTEGRITY');if(types.length!==1||!(types[0].target&0x80000000))fail('Unique Integrity PE resource type required');
 const names=entries(types[0].target&0x7fffffff).filter(x=>typeof x.name==='string'&&x.name.toUpperCase()==='ELECTRONASAR');if(names.length!==1||!(names[0].target&0x80000000))fail('Unique ElectronAsar PE resource name required');
 const languages=entries(names[0].target&0x7fffffff);if(languages.length!==1||languages[0].target&0x80000000)fail('Unique ElectronAsar PE resource data leaf required');
 const leaf=rr(languages[0].target,16),size=leaf.readUInt32LE(4);if(size<2||size>65536)fail('Invalid PE integrity resource size');return {offset:map(leaf.readUInt32LE(0),size),size};
}
export function patchPEIntegrity(source,{expectedPEHash,oldHeaderHash,newHeaderHash}={}){
 if(!Buffer.isBuffer(source)||!digest(expectedPEHash)||sha(source)!==expectedPEHash)fail('PE hash mismatch');
 if(!digest(oldHeaderHash)||!digest(newHeaderHash))fail('Explicit ASAR header hash digests required');
 const location=resourceLocation(source),body=range(source,location.offset,location.size);let records;
 try{records=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(body).replace(/\0+$/,''));}catch{fail('Malformed ElectronAsar integrity resource JSON');}
 if(!Array.isArray(records))fail('ElectronAsar integrity resource must be an array');
 const matched=records.filter(x=>typeof x.file==='string'&&x.file.replace(/[\\/]+/g,'/').toLowerCase()==='resources/app.asar');
 if(matched.length!==1||String(matched[0].alg).toUpperCase()!=='SHA256'||matched[0].value!==oldHeaderHash)fail('ElectronAsar resource does not bind the expected ASAR header hash');
 const index=body.indexOf(oldHeaderHash);if(index<0||body.indexOf(oldHeaderHash,index+1)!==-1)fail('Ambiguous integrity digest in located PE resource');
 const bytes=Buffer.from(source);bytes.write(newHeaderHash,location.offset+index,'ascii');
 return {bytes,resourceOffset:location.offset,resourceSize:location.size,changedOffset:location.offset+index,inputSha256:expectedPEHash,outputSha256:sha(bytes),vendorSignatureValid:false};
}
function regular(path){if(lstatSync(path).isSymbolicLink()||!statSync(path).isFile())fail('Only original regular source files may be rebuilt');return realpathSync(path);}
function sourceMember(root,path){const actual=realpathSync(path);if(!inside(root,actual)||lstatSync(path).isSymbolicLink())fail('Source file or directory escaped the original application boundary');return actual;}
async function fileSha(path){const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex');}
function openArchive(path){
 const fd=openSync(path,'r');try{const pre=exactRead(fd,16,0),length=pre.readUInt32LE(4);if(length>32*1024*1024||length<8)fail('ASAR header size out of bounds');const parsed=parseAsarHeader(exactRead(fd,length+8,0)),size=fstatSync(fd).size;if(parsed.dataOffset>size)fail('ASAR data offset exceeds source');return {...parsed,fd,size};}catch(error){closeSync(fd);throw error;}
}
function mainEntry(header,path){
 if(typeof path!=='string'||path.split('/').some(x=>!x||x==='.'||x==='..'||x.includes('\\')||x.includes(':')))fail('Scoped main ASAR path required');let at=header;
 for(const name of path.split('/')){at=at.files?.[name];if(!at)fail('Pinned main entry is missing from ASAR header');}
 if(at.unpacked||at.link||!Number.isSafeInteger(at.size)||at.size<1||at.size>16*1024*1024||typeof at.offset!=='string'||!/^\d+$/.test(at.offset)||!Number.isSafeInteger(Number(at.offset)))fail('Pinned main entry is not an ordinary bounded packed file');return at;
}
/** Fixed-version owner install operation. Sharing preserves stock ACLs, not an
 * OS sandbox: the owner must keep all shares outside actor write capabilities.
 * The stable opaque owner loopback URL is embedded once, not rebuilt per turn.
 * Failed builds remain partial/untrusted; no fallback copies or execution. */
export async function buildPrivateDesktop({sourceRoot,targetRoot,expectedPEHash,expectedASARHeaderHash,expectedMainHash,mainPath='.vite/build/main-BPBEjAxi.js',gatewayUrl,shareStrategy='hardlink',maxCopiedBytes=2*1024*1024*1024,minFreeAfterBytes=1024*1024*1024}={}){
 if(!['hardlink','copy'].includes(shareStrategy))fail('Explicit share strategy must be hardlink or copy');
 if(!Number.isSafeInteger(maxCopiedBytes)||maxCopiedBytes<1||maxCopiedBytes>2*1024*1024*1024||!Number.isSafeInteger(minFreeAfterBytes)||minFreeAfterBytes<1024*1024*1024)fail('Typed disk budget integers required, with at least 1 GiB reserved and at most 2 GiB copied');
 if(!isAbsolute(sourceRoot??'')||!isAbsolute(targetRoot??''))fail('Absolute source and fresh target roots required');
 if(lstatSync(sourceRoot).isSymbolicLink()||!statSync(sourceRoot).isDirectory())fail('Original application root cannot be redirected');
 const source=realpathSync(sourceRoot),target=join(realpathSync(dirname(targetRoot)),relative(dirname(targetRoot),resolve(targetRoot)));
 if(inside(source,target)||inside(target,source))fail('Original and private application root boundaries must be disjoint');
 if(existsSync(targetRoot))fail('Private application target must be fresh and not exist');
 if(!same(resolve(targetRoot),target))fail('Private target parent is redirected');
 if(!digest(expectedPEHash)||!digest(expectedASARHeaderHash)||!digest(expectedMainHash))fail('All independently pinned source hashes are required');
 const asar=sourceMember(source,join(source,'resources/app.asar')),pePath=sourceMember(source,join(source,'ChatGPT.exe')),chrome=sourceMember(source,join(source,'chrome.dll'));regular(asar);regular(pePath);regular(chrome);
 const archive=openArchive(asar);let prepared;
 try{
  if(archive.headerSha256!==expectedASARHeaderHash)fail('ASAR header hash mismatch');
  const entry=mainEntry(archive.header,mainPath),offset=Number(entry.offset);if(archive.dataOffset+offset+entry.size>archive.size)fail('ASAR main range exceeds archive data bounds');
  const main=exactRead(archive.fd,entry.size,archive.dataOffset+offset);if(sha(main)!==expectedMainHash)fail('Main bundle hash mismatch');
  const transformed=patchMainTransport(new TextDecoder('utf8',{fatal:true,ignoreBOM:true}).decode(main),{gatewayUrl,expectedHash:expectedMainHash}),bytes=Buffer.from(transformed.source),dataLength=archive.size-archive.dataOffset;
  entry.offset=String(dataLength);entry.size=bytes.length;const blockSize=4194304,blocks=[];for(let i=0;i<bytes.length;i+=blockSize)blocks.push(sha(bytes.subarray(i,i+blockSize)));
  entry.integrity={algorithm:'SHA256',hash:sha(bytes),blockSize,blocks};
  const prefix=encodeAsarHeader(archive.header),header=parseAsarHeader(prefix),pe=patchPEIntegrity(readFileSync(pePath),{expectedPEHash,oldHeaderHash:expectedASARHeaderHash,newHeaderHash:header.headerSha256});
  prepared={bytes,prefix,header,pe,dataOffset:archive.dataOffset,dataLength,size:archive.size};
 }finally{closeSync(archive.fd);}
 // Inspect every source directory before sharing it; source redirects and
 // special nodes are refused even if hidden below an unchanged junction share.
 const inspect=directory=>{sourceMember(source,directory);for(const e of readdirSync(directory,{withFileTypes:true})){const p=join(directory,e.name);sourceMember(source,p);if(e.isDirectory())inspect(p);else if(!e.isFile())fail('Unsupported source node in private application layout');}};inspect(source);
 const ordinary=[...readdirSync(source,{withFileTypes:true}).filter(e=>e.isFile()&&e.name!=='ChatGPT.exe').map(e=>join(source,e.name)),...readdirSync(join(source,'resources'),{withFileTypes:true}).filter(e=>e.isFile()&&e.name!=='app.asar').map(e=>join(source,'resources',e.name))];
 const plannedCopies=shareStrategy==='copy'?ordinary.reduce((n,p)=>n+statSync(p).size,0):0,rebuiltAsarBytes=prepared.prefix.length+prepared.dataLength+prepared.bytes.length,physicalWriteBudgetBytes=plannedCopies+prepared.pe.bytes.length+rebuiltAsarBytes+1024*1024;
 const disk=statfsSync(dirname(target),{bigint:true}),freeBeforeBytes=Number(disk.bavail*disk.bsize);
 if(!Number.isSafeInteger(physicalWriteBudgetBytes)||physicalWriteBudgetBytes>maxCopiedBytes)fail('Planned private application exceeds the explicit copy budget');
 if(!Number.isSafeInteger(freeBeforeBytes)||freeBeforeBytes-physicalWriteBudgetBytes<minFreeAfterBytes)fail('Insufficient free space after the complete private application budget');
 const stockBefore={pe:await fileSha(pePath),asar:await fileSha(asar),chrome:await fileSha(chrome)};
 if(stockBefore.pe!==expectedPEHash)fail('PE hash changed before private build');
 const shared=[];let copiedBytes=0,copiedFileCount=0;mkdirSync(target);mkdirSync(join(target,'resources'));
 const share=async(from,to)=>{
  sourceMember(source,from);const name=relative(target,to).replaceAll('\\','/');
  if(statSync(from).isDirectory()){symlinkSync(from,to,process.platform==='win32'?'junction':'dir');shared.push({path:name,type:'directory-share'});}
  else if(shareStrategy==='copy'){
   const size=statSync(from).size,before=await fileSha(from);if(copiedBytes+size>plannedCopies)fail('Source copy size changed after budgeting');copyFileSync(from,to,constants.COPYFILE_EXCL);
   if(await fileSha(from)!==before||await fileSha(to)!==before||statSync(to).size!==size)fail('Exclusive private file copy differs or original source changed');copiedBytes+=size;copiedFileCount++;shared.push({path:name,type:'exclusive-copy',bytes:size,sha256:before,sourceUnchanged:true});
  }else{linkSync(from,to);if(statSync(from).ino!==statSync(to).ino||statSync(from).dev!==statSync(to).dev)fail('Hardlink identity verification failed; no copy fallback permitted');shared.push({path:name,type:'hardlink'});}
 };
 for(const e of readdirSync(source,{withFileTypes:true})){if(['resources','ChatGPT.exe'].includes(e.name))continue;await share(join(source,e.name),join(target,e.name));}
 for(const e of readdirSync(join(source,'resources'),{withFileTypes:true})){if(e.name==='app.asar')continue;await share(join(source,'resources',e.name),join(target,'resources',e.name));}
 writeFileSync(join(target,'ChatGPT.exe'),prepared.pe.bytes,{flag:'wx'});const output=join(target,'resources/app.asar');writeFileSync(output,prepared.prefix,{flag:'wx'});
 if(prepared.dataLength)await pipeline(createReadStream(asar,{start:prepared.dataOffset,end:prepared.size-1}),createWriteStream(output,{flags:'a'}));
 appendFileSync(output,prepared.bytes);
 const stockAfter={pe:await fileSha(pePath),asar:await fileSha(asar),chrome:await fileSha(chrome)};
 if(JSON.stringify(stockBefore)!==JSON.stringify(stockAfter))fail('Original stock file hash changed during private build; target remains untrusted');
 const report={format:1,kind:'private-desktop-build-not-launch-acceptance',sourceRoot:source,targetRoot:target,mainPath,gatewayUrl,stockBefore,stockAfter,stockUnchanged:true,sourceHeaderSha256:expectedASARHeaderHash,privateHeaderSha256:prepared.header.headerSha256,privatePESha256:prepared.pe.outputSha256,privateASARSha256:await fileSha(output),mainSha256:sha(prepared.bytes),shared,shareStrategy,copiedBytes,copiedFileCount,physicalWriteBudgetBytes,freeBeforeBytes,minFreeAfterBytes,maxCopiedBytes,vendorSignatureValid:false,embeddedIntegrity:'preserved-and-rebound',fuses:'chrome.dll-bytes-unchanged',sharedPermissions:'directory-shares-preserve-stock-ACLs-owner-must-protect-entire-private-root-from-actor-writes',uiLaunched:false};
 writeFileSync(join(target,'private-build.json'),JSON.stringify(report,null,2),{flag:'wx'});return report;
}
