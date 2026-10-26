// CI diagnostics only. Not selected by the distribution collector. This never
// installs shortcuts or launches an application; all four tests use temp fixtures.
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,realpathSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const pins={
 'native-entry.mjs':'dd532a004eb639e1ae6abd7508e9565747e1c248599ad4c96ddb9542b7ba8cb8',
 'native-shortcut.cs':'f2c1140d19e087abd3f666792e4e46fa6045600dc70cd6d652d62a706eaa575a',
 'controlled-launcher.cs':'4176e50bad8f11ef36a7813e66de6ce3cb2cfc5b1c139deeeaecf7b377654600',
 'native-entry.test.mjs':'64b7b61e9fa7a0ba302998d679d6c1e2b0fc6f78aef14f031bf97d6bf641725e',
};
function once(source,anchor,replacement){if(source.split(anchor).length!==2)throw Error('Diagnostic anchor missing or duplicated');return source.replace(anchor,replacement);}
export function instrumentShortcut(source){
 source=once(source,'internal static class ControlledShortcuts {','internal static class ControlledShortcuts {\n static string phase="entry";\n static bool DiagnosticPath(string a,string b,string key){phase=key;return NativeFiles.Same(a,b);}\n static bool DiagnosticText(string a,string b,string key){phase=key;return a==b;}');
 source=once(source,'static NativePropertyStore Open(string file,uint flags){NativePropertyStore store;','static NativePropertyStore Open(string file,uint flags){phase=flags==2?"appid-open-write":"appid-open-read";NativePropertyStore store;');
 source=once(source,'Marshal.ThrowExceptionForHR(store.SetValue(ref key,ref value));Marshal.ThrowExceptionForHR(store.Commit());','phase="appid-set";Marshal.ThrowExceptionForHR(store.SetValue(ref key,ref value));phase="appid-commit";Marshal.ThrowExceptionForHR(store.Commit());');
 source=once(source,'Marshal.ThrowExceptionForHR(store.GetValue(ref key,out value));','phase="appid-get";Marshal.ThrowExceptionForHR(store.GetValue(ref key,out value));');
 source=once(source,'static Dictionary<string,object> Read(string file){','static Dictionary<string,object> Read(string file){phase="read-path";');
 source=once(source,'link=Link(shell,file);string target=','phase="read-link";link=Link(shell,file);string target=');
 source=once(source,"int comma=icon.LastIndexOf(',');","phase=\"read-icon\";int comma=icon.LastIndexOf(',');");
 source=once(source,'appId=GetAppId(file);if(!NativeFiles.Same','appId=GetAppId(file);phase="read-binding";if(!NativeFiles.Same');
 source=once(source,'!NativeFiles.Same(target,NativePlan.Executable)||arguments!=""||!NativeFiles.Same(working,NativePlan.OwnerRoot)||!NativeFiles.Same(iconPath,NativePlan.Icon)||appId!=NativePlan.AppId','!DiagnosticPath(target,NativePlan.Executable,"binding-target")||!DiagnosticText(arguments,"","binding-args")||!DiagnosticPath(working,NativePlan.OwnerRoot,"binding-workdir")||!DiagnosticPath(iconPath,NativePlan.Icon,"binding-icon")||!DiagnosticText(appId,NativePlan.AppId,"binding-appid")');
 source=once(source,'static void Create(string file){var shell=Shell();','static void Create(string file){phase="create-shell";var shell=Shell();');
 source=once(source,'link=Link(shell,file);Set(link,"TargetPath",','phase="create-link";link=Link(shell,file);phase="set-target";Set(link,"TargetPath",');
 for(const [field,label]of [['Arguments','set-args'],['WorkingDirectory','set-workdir'],['IconLocation','set-icon'],['WindowStyle','set-style'],['Description','set-description']])source=once(source,`Set(link,"${field}",`,`phase="${label}";Set(link,"${field}",`);
 source=once(source,'link.GetType().InvokeMember("Save",','phase="save-link";link.GetType().InvokeMember("Save",');
 source=once(source,'NativeFiles.Plain(Stage);','phase="stage-path";NativeFiles.Plain(Stage);');
 source=once(source,'foreach(var folder in new[]{','phase="known-folders";foreach(var folder in new[]{');
 source=once(source,'NativeFiles.Pin(NativePlan.Config,','phase="pins";NativeFiles.Pin(NativePlan.Config,');
 source=once(source,'var paths=new[]{Path.Combine(Stage,','phase="stage-preflight";var paths=new[]{Path.Combine(Stage,');
 const original='}catch{Console.Error.WriteLine("Native shortcut staging/readback refused.");return 1;}';
 const diagnostic='}catch(Exception error){for(int depth=0;error!=null&&depth<3;depth++,error=error.InnerException){string type=error.GetType().Name;if(!System.Text.RegularExpressions.Regex.IsMatch(type,@"^[A-Za-z][A-Za-z0-9]{0,63}$"))type="unknown";string message=error.Message;string code=message=="icon index"?"icon_index":message=="shortcut binding"?"shortcut_binding":message=="AppID type"?"appid_type":message=="real desktop/start menu is not a stage or fixture"?"known_folder_overlap":"other";Console.Error.WriteLine("SHORTCUT_DIAGNOSTIC phase="+phase+" depth="+depth+" type="+type+" hresult="+error.HResult.ToString("X8")+" code="+code);}return 1;}';
 return once(source,original,diagnostic);
}
export function instrumentEntry(source){return once(source,"throw Error('Native shortcut stage/readback refused; existing links were not intentionally overwritten')","throw Error('Native shortcut stage/readback refused; existing links were not intentionally overwritten; diagnostic status '+result.status+' '+result.stderr)");}
export function runDiagnostic(){
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('Diagnostic requires real Windows x64');
 const repo=path.resolve(import.meta.dirname,'..'),originals=new Map();
 for(const [name,pin]of Object.entries(pins)){const bytes=readFileSync(path.join(repo,'packaging',name));if(sha(bytes)!==pin)throw Error('Diagnostic source pin differs: '+name);originals.set(name,bytes);}
 const temp=realpathSync.native(tmpdir()),root=realpathSync.native(mkdtempSync(path.join(temp,'native-shortcut-ci-diagnostic-')));
 if(path.dirname(root)!==temp)throw Error('Diagnostic temporary boundary differs');
 for(const[name,bytes]of originals)writeFileSync(path.join(root,name),bytes,{flag:'wx'});
 writeFileSync(path.join(root,'native-shortcut.cs'),instrumentShortcut(originals.get('native-shortcut.cs').toString('utf8')));
 writeFileSync(path.join(root,'native-entry.mjs'),instrumentEntry(originals.get('native-entry.mjs').toString('utf8')));
 const pattern='actual ShellLink stage|trusted native shortcut deployment|deployment preflights|structurally intact ShellLink';
 const result=spawnSync(process.execPath,['--test','--test-name-pattern='+pattern,path.join(root,'native-entry.test.mjs')],{cwd:root,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''},encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:2*1024*1024});
 const unchanged=Object.entries(pins).every(([name,pin])=>sha(readFileSync(path.join(repo,'packaging',name)))===pin);
 const report={format:1,scope:'isolated-copy-of-four-shortcut-fixtures-only',root,source_sha256:pins,sourceUnchanged:unchanged,status:result.status,signal:result.signal,spawnError:result.error?.code??null,applicationStarted:false,realDesktopChanged:false};
 writeFileSync(path.join(root,'result.json'),JSON.stringify(report,null,2)+'\n');writeFileSync(path.join(root,'stdout.txt'),result.stdout??'');writeFileSync(path.join(root,'stderr.txt'),result.stderr??'');
 process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');console.log(JSON.stringify(report));
 if(!unchanged)throw Error('Original native source changed during diagnostic');return result.status??1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==2)throw Error('Diagnostic accepts no arguments or overrides');process.exitCode=runDiagnostic();}
