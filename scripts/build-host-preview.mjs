import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,readdirSync,lstatSync} from 'node:fs';
import {resolve,join,relative,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateRawSync,crc32} from 'node:zlib';
import {safeMember,verifyManifest} from '../packaging/preview.mjs';

export const PREVIEW_VERSION='20261025-preview.1';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function verifySourceEvidence(entries){
 const map=new Map(entries.map(e=>[e.path,e.bytes])),summary=JSON.parse(map.get('evidence/host-preview-20261025/summary.json'));
 const hashes=summary.source_sha256;
 if(!hashes||typeof hashes!=='object'||Array.isArray(hashes)||!Object.keys(hashes).length)throw new Error('Missing tested source identity map');
 for(const [path,expected] of Object.entries(hashes)){
  safeMember(path);if(!/^[a-f0-9]{64}$/.test(expected)||!map.has(path)||sha(map.get(path))!==expected)throw new Error('Tested source evidence SHA mismatch: '+path);
 }
 return Object.keys(hashes).length;
}
export function collectPreviewEntries(sourceRoot){
 const root=resolve(sourceRoot),entries=[];
 const add=(path,bytes)=>entries.push({path:safeMember(path),bytes:bytes??readFileSync(join(root,path))});
 const walk=base=>{
  for(const entry of readdirSync(join(root,base),{withFileTypes:true})){
   if(['node_modules','.git','__pycache__'].includes(entry.name))continue;
   const path=base+'/'+entry.name,st=lstatSync(join(root,path));
   if(st.isSymbolicLink())throw new Error('Linked source is not a releasable payload: '+path);
   if(entry.isDirectory())walk(path);else if(entry.isFile()){
    if(/(^|\/)(auth\.json|\.env(?:\..*)?)$/i.test(path)||/\.(?:log|bin|db|sqlite|zip)$/i.test(path))throw new Error('Private/runtime file in release source: '+path);
    add(path);
   }
  }
 };
 for(const base of ['hosts/core','hosts/codex','hosts/dsh','skills/proactive-skill-discovery','skills/proactive-skill-discovery-dsh','packaging'])walk(base);
 for(const path of ['LICENSE','docs/host-preview.md','evidence/host-preview-20261025/summary.json'])add(path);
 for(const [name,action] of Object.entries({'安装.cmd':'install','Codex测试.cmd':'codex','DSH测试.cmd':'dsh','导出报告.cmd':'export','仅安装Skill.cmd':'skills'})){
  add(name,Buffer.from(`@echo off\r\nsetlocal\r\nchcp 65001 >nul\r\npowershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0packaging\\bootstrap.ps1" -Action ${action}\r\nset "workflow_exit=%ERRORLEVEL%"\r\nif not "%workflow_exit%"=="0" echo 操作未完成，请查看上方错误。\r\npause\r\nexit /b %workflow_exit%\r\n`,'utf8'));
 }
 add('先读说明.txt',readFileSync(join(root,'packaging/README.zh-CN.txt')));
 const names=new Set(entries.map(e=>e.path));
 for(const required of ['hosts/codex/task-client.mjs','hosts/codex/package-lock.json','hosts/dsh/package-lock.json','hosts/core/workflow-host.mjs','packaging/bootstrap.ps1','packaging/run.mjs'])if(!names.has(required))throw new Error('Missing required preview resource: '+required);
 verifySourceEvidence(entries);
 return entries.sort((a,b)=>a.path.localeCompare(b.path,'en'));
}

// Standard ZIP, deflate method 8, UTF-8 names. Every source file is read once;
// no expanded staging tree or dependency cache is copied into the archive.
export function writeZip(outputPath,entries){
 if(entries.length>65535)throw new Error('ZIP entry limit exceeded');
 const pieces=[],central=[];let offset=0;
 const seen=new Set();
 for(const {path,bytes:raw} of entries){
  const safe=safeMember(path);if(seen.has(safe))throw new Error('Duplicate ZIP path');seen.add(safe);
  const bytes=Buffer.from(raw),name=Buffer.from(safe,'utf8'),compressed=deflateRawSync(bytes,{level:9});
  if(bytes.length>0xffffffff||compressed.length>0xffffffff)throw new Error('ZIP64 is not supported by this small source package');
  const crc=crc32(bytes),header=Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(0x5d59,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(name.length,26);
  const record=Buffer.alloc(46);record.writeUInt32LE(0x02014b50);record.writeUInt16LE(20,4);record.writeUInt16LE(20,6);record.writeUInt16LE(0x800,8);record.writeUInt16LE(8,10);record.writeUInt16LE(0x5d59,14);record.writeUInt32LE(crc,16);record.writeUInt32LE(compressed.length,20);record.writeUInt32LE(bytes.length,24);record.writeUInt16LE(name.length,28);record.writeUInt32LE(offset,42);
  pieces.push(header,name,compressed);central.push(record,name);offset+=header.length+name.length+compressed.length;
 }
 const centralBytes=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(centralBytes.length,12);end.writeUInt32LE(offset,16);
 const zip=Buffer.concat([...pieces,centralBytes,end]);mkdirSync(dirname(resolve(outputPath)),{recursive:true});writeFileSync(outputPath,zip,{flag:'wx'});return {bytes:zip.length,sha256:sha(zip)};
}

export function buildHostPreview({sourceRoot=resolve(import.meta.dirname,'..'),outputPath,version=PREVIEW_VERSION}){
 if(!outputPath||!/^[a-zA-Z0-9._-]+$/.test(version))throw new Error('Explicit new output ZIP and safe preview version required');
 const entries=collectPreviewEntries(sourceRoot),files=entries.map(e=>({path:e.path,bytes:e.bytes.length,sha256:sha(e.bytes)}));
 const treeSha256=sha(JSON.stringify(files));
 const manifest={format:1,version,scope:'controlled-host-preview',treeSha256,files};verifyManifest(manifest);
 const folder='AgentWorkflow-'+version;
 const zipped=writeZip(outputPath,[...entries,{path:'manifest.json',bytes:Buffer.from(JSON.stringify(manifest,null,2)+'\n')}].map(e=>({...e,path:folder+'/'+e.path})));
 return {outputPath:resolve(outputPath),folder,version,files:files.length,treeSha256,...zipped};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const outputPath=process.argv[2];console.log(JSON.stringify(buildHostPreview({outputPath}),null,2));
}
