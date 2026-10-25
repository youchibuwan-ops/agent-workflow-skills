import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
import {buildPrivateDesktop,parseAsarHeader,encodeAsarHeader,patchPEIntegrity} from './private-desktop.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const url='ws://127.0.0.1:14231/workflow/'+'a'.repeat(64),mainPath='.vite/build/main-BPBEjAxi.js';
function peFixture(hash,{uppercase=false}={}){
 const b=Buffer.alloc(2048),p=0x80,o=p+24,s=o+240,r=0x200;
 b.write('MZ');b.writeUInt32LE(p,0x3c);b.write('PE\0\0',p);b.writeUInt16LE(1,p+6);b.writeUInt16LE(240,p+20);b.writeUInt16LE(0x20b,o);b.writeUInt32LE(16,o+108);b.writeUInt32LE(0x1000,o+112+16);b.writeUInt32LE(0x400,o+112+20);
 b.write('.rsrc',s);b.writeUInt32LE(0x400,s+8);b.writeUInt32LE(0x1000,s+12);b.writeUInt32LE(0x400,s+16);b.writeUInt32LE(r,s+20);
 const dir=(at,named,count)=>{b.writeUInt16LE(named,r+at+12);b.writeUInt16LE(count,r+at+14);};
 const ent=(at,name,target)=>{b.writeUInt32LE(name>>>0,r+at);b.writeUInt32LE(target>>>0,r+at+4);};
 const str=(at,value)=>{b.writeUInt16LE(value.length,r+at);b.write(value,r+at+2,'utf16le');};
 dir(0,1,0);ent(16,0x80000080,0x80000020);dir(0x20,1,0);ent(0x30,0x800000a0,0x80000040);dir(0x40,0,1);ent(0x50,1033,0x60);str(0x80,uppercase?'INTEGRITY':'Integrity');str(0xa0,uppercase?'ELECTRONASAR':'ElectronAsar');
 const json=Buffer.from(JSON.stringify([{file:'resources\\app.asar',alg:'SHA256',value:hash}]));b.writeUInt32LE(0x1100,r+0x60);b.writeUInt32LE(json.length,r+0x64);json.copy(b,r+0x100);b.write(hash,0x700);return b;
}
function fixture(t,{large=false}={}){
 const root=fs.mkdtempSync(join(tmpdir(),'private-desktop-test-'));t.after(()=>{assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert(root.includes('private-desktop-test-'));fs.rmSync(root,{recursive:true,force:true});});
 const sourceRoot=join(root,'source'),targetRoot=join(root,'private');fs.mkdirSync(join(sourceRoot,'resources/assets'),{recursive:true});fs.mkdirSync(join(sourceRoot,'locales'));
 const main=Buffer.from('function _7(e){return new Original(e)};'+(large?' '.repeat(4194304):'')),other=Buffer.from('UNCHANGED_DATA');
 const header={files:{'.vite':{files:{build:{files:{'main-BPBEjAxi.js':{size:main.length,offset:'0',integrity:{algorithm:'SHA256',hash:sha(main),blockSize:4194304,blocks:[sha(main)]}}}}}},'other.txt':{size:other.length,offset:String(main.length)}}};
 const prefix=encodeAsarHeader(header),archive=Buffer.concat([prefix,main,other]),parsed=parseAsarHeader(prefix),pe=peFixture(parsed.headerSha256);
 fs.writeFileSync(join(sourceRoot,'resources/app.asar'),archive);fs.writeFileSync(join(sourceRoot,'ChatGPT.exe'),pe);fs.writeFileSync(join(sourceRoot,'chrome.dll'),'FUSES_MUST_STAY_UNCHANGED');fs.writeFileSync(join(sourceRoot,'resources/notice.txt'),'license fixture');fs.writeFileSync(join(sourceRoot,'resources/assets/shared.txt'),'asset');fs.writeFileSync(join(sourceRoot,'locales/en.pak'),'locale');
 const options={sourceRoot,targetRoot,gatewayUrl:url,mainPath,expectedPEHash:sha(pe),expectedASARHeaderHash:parsed.headerSha256,expectedMainHash:sha(main)};
 return {root,sourceRoot,targetRoot,options,main,other,archive,pe};
}
test('private builder appends main, preserves old offsets/data, updates block integrity and only its PE resource',async t=>{
 const f=fixture(t),result=await buildPrivateDesktop(f.options),bytes=fs.readFileSync(join(f.targetRoot,'resources/app.asar')),parsed=parseAsarHeader(bytes),entry=parsed.header.files['.vite'].files.build.files['main-BPBEjAxi.js'];
 assert.equal(entry.offset,String(f.main.length+f.other.length));assert.equal(parsed.header.files['other.txt'].offset,String(f.main.length));assert.deepEqual(bytes.subarray(parsed.dataOffset,parsed.dataOffset+f.main.length+f.other.length),Buffer.concat([f.main,f.other]));
 const patched=bytes.subarray(parsed.dataOffset+Number(entry.offset));assert.match(patched.toString(),/Workflow host route denied/);assert.equal(entry.integrity.hash,sha(patched));assert.deepEqual(entry.integrity.blocks,[sha(patched)]);assert.equal(entry.integrity.blockSize,4194304);
 const pe=fs.readFileSync(join(f.targetRoot,'ChatGPT.exe'));assert.equal(pe.length,f.pe.length);assert.equal(pe.subarray(0x700,0x740).toString(),f.options.expectedASARHeaderHash);assert.equal(result.vendorSignatureValid,false);assert.equal(result.stockUnchanged,true);assert.equal(result.uiLaunched,false);
 assert.deepEqual(patchPEIntegrity(pe,{expectedPEHash:sha(pe),oldHeaderHash:parsed.headerSha256,newHeaderHash:f.options.expectedASARHeaderHash}).bytes,f.pe);
 assert.deepEqual(fs.readFileSync(join(f.sourceRoot,'ChatGPT.exe')),f.pe);assert.deepEqual(fs.readFileSync(join(f.sourceRoot,'resources/app.asar')),f.archive);
 assert.equal(fs.statSync(join(f.sourceRoot,'chrome.dll')).ino,fs.statSync(join(f.targetRoot,'chrome.dll')).ino);assert(fs.lstatSync(join(f.targetRoot,'locales')).isSymbolicLink());assert(fs.lstatSync(join(f.targetRoot,'resources/assets')).isSymbolicLink());
});
test('the appended main integrity uses complete 4 MiB blocks and a separate trailing block',async t=>{
 const f=fixture(t,{large:true});await buildPrivateDesktop(f.options);const bytes=fs.readFileSync(join(f.targetRoot,'resources/app.asar')),parsed=parseAsarHeader(bytes),entry=parsed.header.files['.vite'].files.build.files['main-BPBEjAxi.js'],main=bytes.subarray(parsed.dataOffset+Number(entry.offset));
 assert.equal(entry.integrity.blocks.length,2);assert.equal(entry.integrity.hash,sha(main));assert.deepEqual(entry.integrity.blocks,[sha(main.subarray(0,4194304)),sha(main.subarray(4194304))]);
});
test('wrong pins, existing target and redirected target boundaries refuse before creating an installation',async t=>{
 for(const field of ['expectedPEHash','expectedASARHeaderHash','expectedMainHash']){const f=fixture(t);await assert.rejects(buildPrivateDesktop({...f.options,[field]:'0'.repeat(64)}),/hash|digest/i);assert.equal(fs.existsSync(f.targetRoot),false);}
 const f=fixture(t);fs.mkdirSync(f.targetRoot);await assert.rejects(buildPrivateDesktop(f.options),/fresh|exist/i);
 const g=fixture(t);await assert.rejects(buildPrivateDesktop({...g.options,targetRoot:join(g.sourceRoot,'nested')}),/disjoint|boundary/i);assert.equal(fs.existsSync(join(g.sourceRoot,'nested')),false);
});
test('resource lookup rejects malformed/missing tables rather than patching a decoy hash',()=>{
 const old='1'.repeat(64),next='2'.repeat(64),pe=peFixture(old),out=patchPEIntegrity(pe,{expectedPEHash:sha(pe),oldHeaderHash:old,newHeaderHash:next});assert.equal(out.bytes.subarray(0x700,0x740).toString(),old);assert.equal(out.bytes.indexOf(next),0x300+JSON.stringify([{file:'resources\\app.asar',alg:'SHA256',value:''}]).indexOf('"value":"')+9);
 const missing=Buffer.from(pe);missing.write('WrongType',0x282,'utf16le');assert.throws(()=>patchPEIntegrity(missing,{expectedPEHash:sha(missing),oldHeaderHash:old,newHeaderHash:next}),/resource/i);
 const invalid=Buffer.from(pe);invalid.writeUInt32LE(0x7fffffff,0x214);assert.throws(()=>patchPEIntegrity(invalid,{expectedPEHash:sha(invalid),oldHeaderHash:old,newHeaderHash:next}),/resource|range|bound/i);
});
test('resource names match the uppercase names actually stored in the current Windows PE',()=>{
 const pe=peFixture('1'.repeat(64),{uppercase:true});assert.doesNotThrow(()=>patchPEIntegrity(pe,{expectedPEHash:sha(pe),oldHeaderHash:'1'.repeat(64),newHeaderHash:'2'.repeat(64)}));
});
test('ASAR pickle bounds are validated and hardlink failures never silently copy',async t=>{
 const b=encodeAsarHeader({files:{}}),bad=Buffer.from(b);bad.writeUInt32LE(1,4);assert.throws(()=>parseAsarHeader(bad),/header|pickle/i);
 const f=fixture(t),original=fs.linkSync;try{fs.linkSync=()=>{throw Error('TEST_HARDLINK_REFUSED');};syncBuiltinESMExports();await assert.rejects(buildPrivateDesktop(f.options),/TEST_HARDLINK_REFUSED/);assert.equal(fs.existsSync(join(f.targetRoot,'chrome.dll')),false);}finally{fs.linkSync=original;syncBuiltinESMExports();}
});
test('explicit copy shares files independently with unchanged stock bytes and a declared disk budget',async t=>{
 const f=fixture(t),r=await buildPrivateDesktop({...f.options,shareStrategy:'copy'});assert.equal(r.shareStrategy,'copy');assert(r.copiedBytes>0);assert(r.copiedFileCount>=2);assert(r.physicalWriteBudgetBytes>=fs.statSync(join(f.targetRoot,'resources/app.asar')).size);assert(r.freeBeforeBytes-r.physicalWriteBudgetBytes>=r.minFreeAfterBytes);
 assert.notEqual(fs.statSync(join(f.sourceRoot,'chrome.dll')).ino,fs.statSync(join(f.targetRoot,'chrome.dll')).ino);assert.equal(fs.readFileSync(join(f.targetRoot,'chrome.dll'),'utf8'),'FUSES_MUST_STAY_UNCHANGED');assert(fs.lstatSync(join(f.targetRoot,'locales')).isSymbolicLink());assert.deepEqual(fs.readFileSync(join(f.sourceRoot,'resources/app.asar')),f.archive);assert.equal(r.stockUnchanged,true);
});
test('typed copy strategy and insufficient budgets fail before creating the target',async t=>{
 for(const extra of [{shareStrategy:'auto'},{shareStrategy:'copy',maxCopiedBytes:1},{shareStrategy:'copy',maxCopiedBytes:'2000000000'},{shareStrategy:'copy',minFreeAfterBytes:'1073741824'},{shareStrategy:'copy',minFreeAfterBytes:Number.MAX_SAFE_INTEGER}]){const f=fixture(t);await assert.rejects(buildPrivateDesktop({...f.options,...extra}),/strategy|budget|space|integer/i);assert.equal(fs.existsSync(f.targetRoot),false);}
});
