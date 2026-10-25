import {createCodexProxy} from './proxy.mjs';
import {readFileSync,writeFileSync,unlinkSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {restrictCatalog} from './strict-config.mjs';
export {createCodexProxy,isolatedBackendEnv} from './proxy.mjs';
export {restrictCatalog,validateStrictCatalog,strictConfig} from './strict-config.mjs';
/** Starts a new isolated backend; it never restarts or reconfigures the desktop. */
export async function launchCodexWorkflowHost({runtimePath,workspace,stateRoot,catalogPath,endpointFile,contract,controllerFactory,toolSchemas,onCard,onAudit,onStderr,backendEnv,port=0}){
 if(!runtimePath||!catalogPath||!endpointFile)throw new Error('runtimePath, catalogPath, endpointFile required');
 if(process.env.CODEX_APP_SERVER_FORCE_CLI==='1')throw new Error('FORCE_CLI contradicts guarded desktop entry');
 if(!controllerFactory||!toolSchemas){const core=await import('../core/workflow-host.mjs');controllerFactory??=core.createWorkflowHost;toolSchemas??=core.WORKFLOW_TOOL_SCHEMAS;}
 const strictCatalog=restrictCatalog(JSON.parse(readFileSync(catalogPath,'utf8')));
 const service=await createCodexProxy({controllerFactory:args=>controllerFactory({...args,contract}),toolSchemas,backendCommand:[runtimePath],workspace,stateRoot,strictCatalog,onCard,onAudit,onStderr,backendEnv,port});
 const document={version:1,transport:'websocket',url:service.url,runtime:service.exportAudit().runtime,workspace:path.resolve(workspace),createdAt:new Date().toISOString()};
 try{writeFileSync(endpointFile,JSON.stringify(document,null,2),{mode:0o600,flag:'wx'});}catch(e){await service.close('Endpoint publication failed');throw e;}
 const close=service.close;return {...service,close:async reason=>{await close(reason);if(existsSync(endpointFile)){const now=JSON.parse(readFileSync(endpointFile,'utf8'));if(now.url===document.url)unlinkSync(endpointFile);}}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const configPath=process.argv[2];if(!configPath)throw new Error('Usage: node hosts/codex/launcher.mjs private-launch-config.json');
 const options=JSON.parse(readFileSync(configPath,'utf8'));const service=await launchCodexWorkflowHost(options);
 console.log(JSON.stringify({status:'listening',endpointFile:options.endpointFile,runtime:service.exportAudit().runtime}));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void service.close(signal).finally(()=>process.exit(0));});
}
