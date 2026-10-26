import {createHash} from 'node:crypto';
import {INSTALLED_MAIN_SHA256} from './entry-patch.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
export const VENDOR_HEADER_SHA256='5bd1f1afeb64772e9dd2bb20c1d7aee48591e8b5ea15e626c936abcfda7cb785';
// The private transport registers only local. Account identity is not a host
// capability. Keep genuine local failures and separate ChatGPT account APIs.
export const RENDERER_HOST_POLICIES=Object.freeze([
 Object.freeze({id:'archive',path:'webview/assets/data-controls-68ea7b93e49d.js',inputSha256:'850584930101ff80929b33213280717b66a63400a572ef773702003232bfa84c',outputSha256:'3fbe140a65b096fb73d95dfaa085cc6dfec61b413a1b17ac1595f0993f7ec0c4',anchor:'b=[a,...a===`local`&&o!=null?[s]:[]]',replacement:'b=[a]'}),
 Object.freeze({id:'inventory',path:'webview/assets/app-primary-844e405f2b90.js',inputSha256:'298f4c7bafe278563aa82ef8d8d4c1afe3f581d54915917849065085f7f621d2',outputSha256:'eb7a6bbe8d4f81c1e7a3f982a0bb8b93941212a8a5c5650b257d0d1a53837ddd',anchor:'l2n=Qe(q,({get:e})=>[{available:!0,hostId:Ei},...e(ow)==null?[]:[{available:e(Yg,It)===`connected`,hostId:It}],...Array.from(e(wrt)).map(t=>({available:e(Yg,t)===`connected`,hostId:t}))])',replacement:'l2n=Qe(q,({get:e})=>[{available:!0,hostId:Ei}])'})
]);
export function patchRendererHostInventory(source,{asset,expectedHash}={}){
 const policy=RENDERER_HOST_POLICIES.find(p=>p.id===asset);if(!policy)throw Error('Unknown pinned renderer asset');
 const actual=sha(source);if(actual!==(expectedHash??policy.inputSha256))throw Error('Renderer asset hash mismatch');
 if(source.split(policy.anchor).length!==2)throw Error('Renderer inventory anchor is not unique');
 const patched=source.replace(policy.anchor,policy.replacement),output=sha(patched);if(actual===policy.inputSha256&&output!==policy.outputSha256)throw Error('Renderer transformed hash mismatch');return{source:patched,path:policy.path,inputSha256:actual,outputSha256:output,policy:'registered-local-only'};
}
export function assertPrivateHostPolicy({report,main,readPacked}){
 if(report.sourceHeaderSha256!==VENDOR_HEADER_SHA256&&report.sourceMainSha256!==INSTALLED_MAIN_SHA256)return{productionFamily:false};
 if(report.sourceHeaderSha256!==VENDOR_HEADER_SHA256||report.sourceMainSha256!==INSTALLED_MAIN_SHA256||report.uncontrolledExecutor!=='disabled-native-manager-path'||!Array.isArray(report.rendererHostInventory)||report.rendererHostInventory.length!==RENDERER_HOST_POLICIES.length)throw Error('Private host capability policy report is incomplete');
 const guard='start(){return this.setEnabled(!1,"workflow_host_unavailable");';if(main.toString('utf8').split(guard).length!==2)throw Error('Private host unmanaged executor boundary is missing');
 for(const policy of RENDERER_HOST_POLICIES){const proof=report.rendererHostInventory.find(p=>p.path===policy.path);if(!proof||proof.inputSha256!==policy.inputSha256||proof.outputSha256!==policy.outputSha256||proof.policy!=='registered-local-only')throw Error('Private host renderer policy report differs');if(sha(readPacked(policy.path,policy.outputSha256))!==policy.outputSha256)throw Error('Private host renderer capability bytes differ');}
 return{productionFamily:true,rendererEntries:RENDERER_HOST_POLICIES.length,uncontrolledExecutor:'disabled-native-manager-path'};
}
