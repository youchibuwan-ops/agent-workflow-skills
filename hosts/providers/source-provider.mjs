// Source acquisition only. Returned bytes and catalog hints are untrusted
// material, not authorization, a read receipt, applicability or a test result.
// Protocol: the Skills 1.7.4 catalog API + GitHub REST Git trees/raw blobs.
import {createHash} from 'node:crypto';
import {readdirSync,readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync,realpathSync,statSync} from 'node:fs';
import {resolve,join,relative,isAbsolute,dirname,basename,posix} from 'node:path';
import {SourceError,publicUrl,requestPublicHTTPS,validateResponse} from './source-provider.http.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const text=bytes=>{try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{return null;}};
const inside=(root,path)=>{const r=relative(resolve(root),resolve(path));return r===''||(!r.startsWith('..')&&!isAbsolute(r));};
const licenseName=name=>/^(?:LICEN[CS]E|COPYING)(?:[._-].*)?$/i.test(name);
const viewerFile=path=>/\.(?:pdf|png|jpe?g|gif|webp|avif|ico|bmp|tiff?|woff2?|ttf|otf|mp[34]|wav|ogg|webm|zip|gz|xz|7z|exe|dll|so|bin)$/i.test(path);
const generated=new Set(['.git','node_modules','__pycache__','.venv']);
const fail=(code,message)=>{throw new SourceError(code,message);};
function safePath(path){if(typeof path!=='string'||!path||path.length>1024||isAbsolute(path)||/[\\:\x00-\x1f]/.test(path)||path.split('/').some(s=>!s||s==='.'||s==='..'))fail('UNSAFE_RESOURCE','Unsafe source-relative path');return path;}
function listFiles(root,{skipGenerated=true,maxFiles=100,maxBytes=4*1024*1024}={}){
 const files=[];let bytes=0;const names=new Set();
 function visit(dir){for(const e of readdirSync(dir,{withFileTypes:true})){
  if(skipGenerated&&generated.has(e.name))continue;
  const path=join(dir,e.name),st=lstatSync(path);
  if(st.isSymbolicLink()||(st.isFile()&&st.nlink>1))fail('UNSAFE_RESOURCE','Linked Skill resources and hard-linked aliases are not followed');
  if(e.isDirectory())visit(path);else if(e.isFile()){
   const name=safePath(relative(root,path).replaceAll('\\','/'));if(names.has(name.toLowerCase()))fail('UNSAFE_RESOURCE','Case-colliding source paths are unsupported');names.add(name.toLowerCase());
   bytes+=st.size;if(files.length>=maxFiles||bytes>maxBytes)fail('SOURCE_LIMIT','Skill exceeds file-count or byte limits');
   const data=readFileSync(path),after=statSync(path);if(st.size!==after.size||st.mtimeMs!==after.mtimeMs||data.length!==st.size)fail('SOURCE_CHANGED','Local source changed while acquiring it');
   files.push({path:name,originPath:name,originFile:path,bytes:data});
  }
 }}visit(root);return files.sort((a,b)=>a.path.localeCompare(b.path,'en'));
}
function missingReferences(files){
 const paths=new Set(files.map(f=>f.path)),missing=[];
 // This only checks declared local Markdown links; no claim of complete
 // semantic dependency/import analysis is made. All directory files are kept.
 for(const file of files){if(!/\.md$/i.test(file.path))continue;const body=text(file.bytes);if(body===null)continue;
  for(const m of body.matchAll(/\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)){
   const link=m[1].replace(/^<|>$/g,'').split('#')[0].split('?')[0];if(!link||/^[a-z][a-z0-9+.-]*:/i.test(link))continue;
   let decoded;try{decoded=decodeURIComponent(link);}catch{missing.push('invalid_local_reference:'+link);continue;}
   const target=posix.normalize(posix.join(posix.dirname(file.path),decoded));
   if(target.startsWith('../')||target.startsWith('/')||(!paths.has(target)&&![...paths].some(p=>p.startsWith(target.replace(/\/$/,'')+'/'))))missing.push('unresolved_local_reference:'+file.path+'->'+link);
  }
 }return [...new Set(missing)];
}

export function createSourceProvider(options={}){
 if(typeof options.cacheRoot!=='string'||!options.cacheRoot)throw new Error('Trusted private cacheRoot is required');
 const limits={maxFiles:options.maxFiles??100,maxBytes:options.maxBytes??4*1024*1024,maxFileBytes:options.maxFileBytes??4*1024*1024,maxReferenceBytes:options.maxReferenceBytes??4*1024*1024,maxTreeBytes:options.maxTreeBytes??8*1024*1024};
 if(Object.values(limits).some(n=>!Number.isSafeInteger(n)||n<1))throw new Error('Positive bounded resource limits required');
 mkdirSync(options.cacheRoot,{recursive:true});const cacheRoot=realpathSync(options.cacheRoot);
 const installedRoots=(options.installedRoots??[]).map(p=>{try{const root=realpathSync(p);return statSync(root).isDirectory()?root:null;}catch{return null;}}).filter(Boolean);
 if(installedRoots.some(root=>inside(root,cacheRoot)))throw new Error('Acquisition cache must not be inside a discovered Skill directory');
 const candidates=new Map(),treeCache=new Map();
 const active=()=>{if(options.signal?.aborted)fail('SOURCE_ABORTED','Source operation cancelled by the trusted host');};
 function cacheChild(...parts){
  const path=resolve(cacheRoot,...parts);if(!inside(cacheRoot,path))fail('CACHE_INTEGRITY','Acquisition cache path escaped');
  let current=cacheRoot;
  for(const part of relative(cacheRoot,path).split(/[\\/]/)){
   current=join(current,part);if(existsSync(current)&&(lstatSync(current).isSymbolicLink()||!inside(cacheRoot,realpathSync(current))))fail('CACHE_INTEGRITY','Acquisition cache is redirected through a link');
  }
  return path;
 }
 const get=options.get??requestPublicHTTPS;
 async function fetch(url,maxBytes,headers={}){
  publicUrl(url);const response=await get(url,{maxBytes,headers,timeoutMs:options.timeoutMs??20000,signal:options.signal});return validateResponse(response,maxBytes);
 }
 async function json(url,maxBytes=2*1024*1024,headers={}){
  const r=await fetch(url,maxBytes,headers);let result;try{const decoded=text(r.bytes);if(decoded===null)throw new Error('Invalid UTF-8');result=JSON.parse(decoded);}catch{fail('INVALID_REMOTE_JSON','Source API did not return complete valid UTF-8 JSON');}return result;
 }
 const githubHeaders=()=>({'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10',...(options.githubToken?{'Authorization':'Bearer '+options.githubToken}:{})});
 const gh=path=>json('https://api.github.com'+path,limits.maxTreeBytes,githubHeaders());
 const offer=candidate=>{candidates.set(candidate.id,candidate);return {id:candidate.id,kind:candidate.kind,nameHint:candidate.nameHint,metadataStatus:'not-parsed',source:candidate.source,version:null,versionStatus:'pending-current-acquisition',...(candidate.installs!==undefined?{installs:candidate.installs}:{}),...(candidate.entrySha256?{entrySha256:candidate.entrySha256}:{})};};

 function discover(query){
  const tokens=query.toLocaleLowerCase().match(/[\p{L}\p{N}_-]+/gu)??[],found=[],diagnostics=[];
  for(const root of installedRoots){
   const stack=[{path:root,depth:0}];
   while(stack.length){const {path,depth}=stack.pop();
    try{
     const entry=join(path,'SKILL.md');
     if(existsSync(entry)){
      if(lstatSync(entry).isSymbolicLink()||lstatSync(entry).nlink>1){diagnostics.push({code:'LINKED_ENTRY_SKIPPED'});continue;}
      const st=statSync(entry);if(!st.isFile()||st.size>128*1024){diagnostics.push({code:'SEARCH_ENTRY_LIMIT'});continue;}
      const bytes=readFileSync(entry),body=text(bytes);if(body===null){diagnostics.push({code:'BINARY_ENTRY_SKIPPED'});continue;}
      const nameHint=basename(path),haystack=(nameHint+'\n'+body).toLocaleLowerCase(),score=tokens.filter(t=>haystack.includes(t)).length;
      if(score)found.push({id:'local:'+sha(Buffer.from(path)).slice(0,24),kind:'local',nameHint,source:'installed:'+path,path,root,entrySha256:sha(bytes),score});continue;
     }
     if(depth>=6)continue;
     for(const e of readdirSync(path,{withFileTypes:true})){if(generated.has(e.name))continue;if(e.isSymbolicLink()){diagnostics.push({code:'LINKED_DIRECTORY_SKIPPED'});continue;}if(e.isDirectory())stack.push({path:join(path,e.name),depth:depth+1});}
    }catch(error){diagnostics.push({code:error.code??'LOCAL_DISCOVERY_UNAVAILABLE'});}
   }
  }
  return {found:found.sort((a,b)=>b.score-a.score),diagnostics};
 }
 async function search(query,{external=options.external!==false,limit=20}={}){
  active();
  if(typeof query!=='string'||query.trim().length<2||query.length>512||/[\x00-\x1f]/.test(query))fail('INVALID_QUERY','Supply 2–512 printable query characters');
  if(!Number.isSafeInteger(limit)||limit<1||limit>50)fail('SOURCE_LIMIT','Search limit must be between 1 and 50');
  const local=discover(query),results=local.found.slice(0,limit).map(offer),diagnostics=[...local.diagnostics];let externalUsed=false;
  if(external){
   try{
    const params=new URLSearchParams({q:query,limit:String(limit)}),body=await json('https://skills.sh/api/search?'+params);
    if(!body||!Array.isArray(body.skills))fail('CATALOG_SCHEMA','Skills catalog response has no candidates array');externalUsed=true;
    for(const item of body.skills.slice(0,limit)){
     if(typeof item.source!=='string'||!/^[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9_.-]{1,100}$/i.test(item.source)||typeof item.skillId!=='string'||!/^[a-z0-9][a-z0-9_.-]{0,127}$/i.test(item.skillId)){diagnostics.push({code:'UNSUPPORTED_CATALOG_SOURCE'});continue;}
     const candidate={id:'github:'+item.source+'/'+item.skillId,kind:'github',repo:item.source,skillId:item.skillId,nameHint:String(item.name??item.skillId).replaceAll(/[\x00-\x1f\x7f]/g,'').slice(0,200),source:'https://github.com/'+item.source,installs:Number.isSafeInteger(item.installs)&&item.installs>=0?item.installs:undefined};results.push(offer(candidate));
    }
   }catch(error){
    diagnostics.push({code:error.code??'EXTERNAL_SEARCH_UNAVAILABLE',message:error.message});
    // The catalog is a search aid, not the only public source. A bounded
    // GitHub search offers only actual regular SKILL.md tree entries; these
    // remain uninspected candidates until acquire pins and checks all blobs.
    try{
     const tokens=query.toLocaleLowerCase().match(/[\p{L}\p{N}_-]+/gu)??[];
     const phrase=query.replace(/["\\]/g,' ').trim();if(!phrase)fail('INVALID_QUERY','GitHub fallback needs a literal search phrase');
     for(const scope of ['name','name,description,readme']){
     const params=new URLSearchParams({q:'"'+phrase+'" in:'+scope,per_page:'3'}),repos=await gh('/search/repositories?'+params);
     if(!Array.isArray(repos.items))fail('GITHUB_SEARCH_SCHEMA','GitHub repository search has no items array');
     for(const item of repos.items.slice(0,3)){
      active();const repo=item.full_name;
      if(typeof repo!=='string'||!/^[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9_.-]{1,100}$/i.test(repo)){diagnostics.push({code:'UNSUPPORTED_GITHUB_REPOSITORY',source:'github-fallback'});continue;}
      try{
       const tree=await gh('/repos/'+repo+'/git/trees/HEAD?recursive=1');
       if(tree.truncated===true)fail('TRUNCATED_TREE','GitHub fallback tree cannot prove complete search coverage');
       if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(tree.sha??'')||!Array.isArray(tree.tree))fail('INVALID_GIT_TREE','GitHub fallback tree is invalid');
       for(const entry of tree.tree){
        if(entry.type!=='blob'||!['100644','100755'].includes(entry.mode)||typeof entry.path!=='string'||!(entry.path==='SKILL.md'||entry.path.endsWith('/SKILL.md')))continue;
        const path=safePath(entry.path),skillId=path==='SKILL.md'?repo.split('/')[1]:posix.basename(posix.dirname(path));
        if(!/^[a-z0-9][a-z0-9_.-]{0,127}$/i.test(skillId)||!tokens.some(t=>(repo+'/'+path).toLocaleLowerCase().includes(t)))continue;
        const candidate={id:'github:'+repo+'/'+skillId,kind:'github',repo,skillId,nameHint:skillId,source:'https://github.com/'+repo};
        if(!results.some(r=>r.id===candidate.id))results.push(offer(candidate));
        if(results.filter(r=>r.kind==='github').length>=limit)break;
       }
      }catch(cause){diagnostics.push({code:cause.code??'GITHUB_TREE_UNAVAILABLE',source:'github-fallback',message:cause.message});}
      if(results.filter(r=>r.kind==='github').length>=limit)break;
     }
     if(results.some(r=>r.kind==='github'))break;
     }
     externalUsed=results.some(r=>r.kind==='github');
    }catch(cause){diagnostics.push({code:cause.code??'GITHUB_SEARCH_UNAVAILABLE',source:'github-fallback',message:cause.message});}
   }
  }
  return {query,candidates:results,diagnostics,externalAttempted:external,externalUsed,completeSourceInspection:false};
 }
 function localBundle(candidate){
  const root=realpathSync(candidate.path);if(!inside(candidate.root,root))fail('UNSAFE_RESOURCE','Installed Skill moved outside its approved root');
  const files=listFiles(root,limits);let license=files.find(f=>!f.path.includes('/')&&licenseName(f.path));
  if(!license){
   let parent=dirname(root);
   while(inside(candidate.root,parent)){
    const name=readdirSync(parent).find(licenseName);
    if(name){const path=join(parent,name);if(lstatSync(path).isSymbolicLink()||lstatSync(path).nlink>1||!statSync(path).isFile())fail('UNSAFE_RESOURCE','Applicable ancestor license is not an unlinked regular file');license={path:licenseName(name)?name:'LICENSE',originPath:relative(candidate.root,path).replaceAll('\\','/'),originFile:path,bytes:readFileSync(path)};files.push(license);break;}
    if(parent===candidate.root)break;parent=dirname(parent);
   }
  }
  // Re-read each origin so a changed earlier file cannot yield a mixed snapshot.
  for(const file of files)if(!readFileSync(file.originFile).equals(file.bytes))fail('SOURCE_CHANGED','Source changed before acquisition completed');
  const version='content-'+sha(Buffer.from(JSON.stringify(files.map(f=>[f.path,sha(f.bytes)]).sort())));
  return {files,license,version,source:{kind:'local',url:candidate.source,originRoot:root,checkedAt:new Date().toISOString()}};
 }
 async function remoteBundle(candidate){
  const commit=await gh('/repos/'+candidate.repo+'/commits/HEAD'),commitId=commit.sha,treeId=commit.commit?.tree?.sha;
  const objectId=v=>typeof v==='string'&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(v);
  if(!objectId(commitId)||!objectId(treeId))fail('INVALID_GIT_IDENTITY','Current repository commit/tree identity is missing');
  const key=candidate.repo+'@'+treeId;
  let tree=treeCache.get(key);if(!tree){tree=await gh('/repos/'+candidate.repo+'/git/trees/'+treeId+'?recursive=1');if(tree.truncated===true)fail('TRUNCATED_TREE','GitHub tree is truncated; it cannot prove complete resource coverage');if(tree.sha!==treeId||!Array.isArray(tree.tree))fail('INVALID_GIT_TREE','GitHub returned a different or invalid tree');treeCache.set(key,tree);}
  const entries=tree.tree.map(e=>({...e,path:safePath(e.path)}));
  const allSkills=entries.filter(e=>e.type==='blob'&&(e.path==='SKILL.md'||e.path.endsWith('/SKILL.md')));
  const matches=allSkills.filter(e=>posix.basename(posix.dirname(e.path))===candidate.skillId);
  const preferred=['skills/'+candidate.skillId+'/SKILL.md','.agents/skills/'+candidate.skillId+'/SKILL.md',candidate.skillId+'/SKILL.md'];
  const entry=preferred.map(p=>matches.find(e=>e.path===p)).find(Boolean)??(matches.length===1?matches[0]:allSkills.length===1&&allSkills[0].path==='SKILL.md'?allSkills[0]:null);
  if(!entry)fail('AMBIGUOUS_SKILL_PATH','Catalog candidate does not resolve to one current Skill directory');
  const prefix=entry.path==='SKILL.md'?'':posix.dirname(entry.path)+'/',selected=entries.filter(e=>e.path.startsWith(prefix)&&e.type!=='tree');
  let license=selected.find(e=>licenseName(e.path.slice(prefix.length))&&!e.path.slice(prefix.length).includes('/'));
  if(!license){let parent=prefix?posix.dirname(prefix.slice(0,-1)):'.';for(;;){license=entries.find(e=>e.type==='blob'&&posix.dirname(e.path)===parent&&licenseName(posix.basename(e.path)));if(license||parent==='.')break;parent=posix.dirname(parent);}if(license)selected.push(license);}
  if(selected.length>limits.maxFiles||selected.reduce((n,e)=>n+(e.size??limits.maxBytes+1),0)>limits.maxBytes)fail('SOURCE_LIMIT','Current Skill resource manifest exceeds limits');
  if(selected.some(e=>e.type!=='blob'||!['100644','100755'].includes(e.mode)||!objectId(e.sha)||!Number.isSafeInteger(e.size)||e.size<0||e.size>limits.maxFileBytes))fail('UNSAFE_RESOURCE','Symlink, submodule or invalid blob cannot become a complete Skill bundle');
  const files=[];
  for(const file of selected){
   const url='https://raw.githubusercontent.com/'+candidate.repo+'/'+commitId+'/'+file.path.split('/').map(encodeURIComponent).join('/'),body=await fetch(url,limits.maxFileBytes);
   const actual=createHash(file.sha.length===40?'sha1':'sha256').update(Buffer.concat([Buffer.from('blob '+body.bytes.length+'\0'),body.bytes])).digest('hex');
   if(body.bytes.length!==file.size||actual!==file.sha)fail('GIT_BLOB_INTEGRITY','Raw source does not match the fixed current Git object');
   files.push({path:file.path.startsWith(prefix)?file.path.slice(prefix.length):posix.basename(file.path),originPath:file.path,originBlob:file.sha,bytes:body.bytes});
  }
  const licenseFile=license?files.find(f=>f.originPath===license.path):undefined;
  return {files,license:licenseFile,version:commitId,source:{kind:'github',repo:candidate.repo,commit:commitId,tree:treeId,url:'https://github.com/'+candidate.repo+'/tree/'+commitId+'/'+prefix,checkedAt:new Date().toISOString()}};
 }
 function persist(bundle){
  active();
  const {files}=bundle;files.sort((a,b)=>a.path.localeCompare(b.path,'en'));let bytes=0;const names=new Set();
  const manifest=files.map(file=>{safePath(file.path);if(names.has(file.path.toLowerCase()))fail('UNSAFE_RESOURCE','Colliding acquired resource paths');names.add(file.path.toLowerCase());bytes+=file.bytes.length;if(file.bytes.length>limits.maxFileBytes)fail('SOURCE_LIMIT','One resource exceeds its byte limit');return {path:file.path,originPath:file.originPath,bytes:file.bytes.length,sha256:sha(file.bytes),encoding:text(file.bytes)===null||file.bytes.includes(0)?'binary':'utf8',requiresViewer:viewerFile(file.path),...(file.originBlob?{gitBlob:file.originBlob}:{})};});
  if(manifest.length>limits.maxFiles||bytes>limits.maxBytes)fail('SOURCE_LIMIT','Complete source exceeds resource limits');
  const key=sha(Buffer.from(JSON.stringify({version:bundle.version,source:bundle.source.url,manifest}))),container=cacheChild('bundles',key),path=cacheChild('bundles',key,'bundle');
  if(existsSync(path)){
   try{
    const current=listFiles(path,{...limits,skipGenerated:false});
    if(current.length!==files.length||current.some(f=>!manifest.some(m=>m.path===f.path&&m.sha256===sha(f.bytes))))fail('CACHE_INTEGRITY','Cached source payload differs from its current verified manifest');
   }catch(cause){
    const error=new SourceError('CACHE_INTEGRITY','Existing cached source payload could not be verified against its current manifest');
    Object.defineProperty(error,'cause',{value:cause});throw error;
   }
  }else{
   mkdirSync(path,{recursive:true});for(const file of files){const target=join(path,file.path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,file.bytes,{flag:'wx',mode:0o600});}
   writeFileSync(join(container,'source.json'),JSON.stringify({version:bundle.version,source:bundle.source,manifest},null,2),{flag:'wx',mode:0o600});
  }
  const missing=missingReferences(files);if(!bundle.license||!bundle.license.bytes.length||text(bundle.license.bytes)?.trim()==='')missing.push('license_missing');if(!files.some(f=>f.path==='SKILL.md'&&text(f.bytes)?.trim()))missing.push('entry_missing_or_empty');
  const binary=manifest.some(f=>f.encoding==='binary'||f.requiresViewer);
  return {status:missing.length?'incomplete':binary?'needs_viewer':'ready',path,version:bundle.version,source:bundle.source,manifest,requiredFiles:manifest.map(f=>f.path),license:bundle.license?{path:bundle.license.path,originPath:bundle.license.originPath,sha256:sha(bundle.license.bytes),encoding:manifest.find(f=>f.path===bundle.license.path).encoding}:null,missing,bytes,readConfirmed:false,semanticDependenciesVerified:false,excludedGeneratedDirs:[...generated]};
 }
 async function acquire(candidateId){active();const candidate=candidates.get(candidateId);if(!candidate)fail('UNKNOWN_CANDIDATE','Search and select an actual offered candidate first');const bundle=candidate.kind==='local'?localBundle(candidate):await remoteBundle(candidate);return persist(bundle);}
 async function fetchReference(input){
  active();
  const url=publicUrl(input).href,response=await fetch(url,limits.maxReferenceBytes,{'Accept':'text/plain,text/markdown,text/html,application/pdf;q=0.5,*/*;q=0.1'}),bytes=response.bytes;
  if(!bytes.length)fail('EMPTY_SOURCE','A zero-byte response provides no reference material');
  active();
  const digest=sha(bytes),folder=cacheChild('references',digest);mkdirSync(folder,{recursive:true});const path=cacheChild('references',digest,'source.bin');
  if(existsSync(path)){if(!readFileSync(path).equals(bytes))fail('CACHE_INTEGRITY','Cached reference changed');}else writeFileSync(path,bytes,{flag:'wx',mode:0o600});
  const mime=String(response.headers['content-type']??'application/octet-stream').split(';')[0].trim().toLowerCase(),decoded=text(bytes),encoding=decoded===null||bytes.includes(0)?'binary':'utf8',requiresViewer=/^(?:image\/|audio\/|video\/|font\/|application\/(?:pdf|zip|gzip|x-7z|x-executable))/.test(mime),isText=!requiresViewer&&encoding==='utf8';
  return {status:isText?'text':'binary_requires_viewer',path,url,bytes:bytes.length,sha256:digest,version:'sha256:'+digest,mime,encoding,checkedAt:new Date().toISOString(),truncated:false,readConfirmed:false};
 }
 return Object.freeze({search,acquire,fetchReference,limits:Object.freeze({...limits})});
}
