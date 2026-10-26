import {readFileSync,realpathSync,statSync} from 'node:fs';import path from 'node:path';
function desktopWorkspace(value){if(value===undefined)return undefined;if(typeof value!=='string'||!path.isAbsolute(value)||/[\x00-\x1f]/.test(value))throw Error('Absolute trusted default workspace required');const actual=realpathSync.native(value);if(!statSync(actual).isDirectory())throw Error('Trusted default workspace directory required');return actual.replaceAll('\\','/');}
export function restrictCatalog(input){
 const catalog=structuredClone(typeof input==='string'?JSON.parse(readFileSync(input,'utf8')):input);
 if(!Array.isArray(catalog?.models)||!catalog.models.length)throw new Error('Nonempty model catalog required');
 for(const model of catalog.models){const delegated=model.multi_agent_version==='v2'&&model.supported_reasoning_levels?.some(x=>x.effort==='ultra');Object.assign(model,{tool_mode:'direct',multi_agent_version:delegated?'v2':null,multi_agent_reasoning_effort:delegated?(model.multi_agent_reasoning_effort??null):null,experimental_supported_tools:[],shell_type:'disabled',apply_patch_tool_type:null});if(!delegated&&Array.isArray(model.supported_reasoning_levels))model.supported_reasoning_levels=model.supported_reasoning_levels.filter(x=>x.effort!=='ultra');if(model.default_reasoning_level==='ultra'&&!delegated)model.default_reasoning_level=model.supported_reasoning_levels?.at(-1)?.effort??'low';}
 return validateStrictCatalog(catalog);
}
export function validateStrictCatalog(input){
 const catalog=typeof input==='string'?JSON.parse(readFileSync(input,'utf8')):input;
 if(!Array.isArray(catalog?.models)||!catalog.models.length)throw new Error('Nonempty strict catalog required');
 const slugs=new Set();
 for(const m of catalog.models){
  if(typeof m.slug!=='string'||!m.slug||slugs.has(m.slug))throw new Error('Unique model slug required');slugs.add(m.slug);
  const delegated=m.multi_agent_version==='v2'&&m.supported_reasoning_levels?.some(x=>x.effort==='ultra')&&(m.multi_agent_reasoning_effort===null||m.supported_reasoning_levels.some(x=>x.effort===m.multi_agent_reasoning_effort&&x.effort!=='ultra'));
  if(m.tool_mode!=='direct'||(!delegated&&(m.multi_agent_version!==null||m.multi_agent_reasoning_effort!==null))||m.shell_type!=='disabled'||m.apply_patch_tool_type!==null||!Array.isArray(m.experimental_supported_tools)||m.experimental_supported_tools.length)throw new Error(`Unsafe model catalog entry: ${m.slug}`);
 }
 return catalog;
}
// Native/user compaction preferences remain unset here. The gateway protects
// unread source delivery and current-turn tool results at the protocol boundary.
export function strictConfig(catalogPath,{defaultWorkspace}={}){const workspace=desktopWorkspace(defaultWorkspace);return `model_catalog_json = ${JSON.stringify(catalogPath.replaceAll('\\','/'))}\ndefault_permissions = ":read-only"\nmodel_reasoning_effort = "low"\nweb_search = "disabled"\ntool_output_token_limit = 262144\nnotify = []\n[cloud.skills]\nenabled = false\n[orchestrator.mcp]\nenabled = false\n[features]\n${['apps','plugins','remote_plugin','multi_agent','code_mode','code_mode_only','browser_use','computer_use','image_generation','tool_suggest','sleep_tool','shell_tool','view_image','goals','hooks','codex_hooks','plugin_hooks'].map(x=>`${x} = false`).join('\n')}\n[tools.update_plan]\nenabled = false\n[tools.experimental_request_user_input]\nenabled = false\n${workspace===undefined?'':'[desktop]\nprojectlessWorkspaceRoot = '+JSON.stringify(workspace)+'\n'}`;}

// CLI overrides have higher precedence than workspace/user config layers.
export function strictArguments(catalogPath,{defaultWorkspace}={}){
 const workspace=desktopWorkspace(defaultWorkspace);
 const settings={model_catalog_json:catalogPath.replaceAll('\\','/'),default_permissions:':read-only',web_search:'disabled',notify:[],tool_output_token_limit:262144,
  'cloud.skills.enabled':false,'orchestrator.mcp.enabled':false,'tools.update_plan.enabled':false,'tools.experimental_request_user_input.enabled':false};
 for(const name of ['apps','plugins','remote_plugin','multi_agent','code_mode','code_mode_only','browser_use','computer_use','image_generation','tool_suggest','sleep_tool','shell_tool','view_image','goals','hooks','codex_hooks','plugin_hooks'])settings['features.'+name]=false;
 if(workspace!==undefined)settings['desktop.projectlessWorkspaceRoot']=workspace;
 return Object.entries(settings).flatMap(([name,value])=>['-c',`${name}=${JSON.stringify(value)}`]);
}
