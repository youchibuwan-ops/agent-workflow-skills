import {mkdirSync} from 'node:fs';import path from 'node:path';
/** Built-ins only: safe to import before distribution/dependency verification. */
export function isolatedBackendEnv(root){
 const allowed=new Set(['PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','PROGRAMFILES','PROGRAMFILES(X86)']);
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>allowed.has(k.toUpperCase())));
 for(const sub of ['home','state','temp','cache','home/AppData/Roaming','home/AppData/Local'])mkdirSync(path.join(root,sub),{recursive:true});
 return {...env,HOME:path.join(root,'home'),USERPROFILE:path.join(root,'home'),CODEX_HOME:path.join(root,'state'),APPDATA:path.join(root,'home/AppData/Roaming'),LOCALAPPDATA:path.join(root,'home/AppData/Local'),XDG_CONFIG_HOME:path.join(root,'home/.config'),XDG_CACHE_HOME:path.join(root,'cache'),TEMP:path.join(root,'temp'),TMP:path.join(root,'temp'),TMPDIR:path.join(root,'temp'),GIT_CONFIG_GLOBAL:path.join(root,'home/.gitconfig'),GIT_CONFIG_NOSYSTEM:'1',DO_NOT_TRACK:'1',DISABLE_TELEMETRY:'1',NO_COLOR:'1'};
}
