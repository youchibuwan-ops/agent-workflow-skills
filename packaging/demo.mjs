import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID,randomInt} from 'node:crypto';

export function createDemoRun(base){
 const runRoot=join(base,'runs',new Date().toISOString().replaceAll(/[^0-9]/g,'').slice(0,14)+'-'+randomUUID().slice(0,8));
 const workspace=join(runRoot,'workspace'),method=join(runRoot,'sources/current-export');
 mkdirSync(workspace,{recursive:true});mkdirSync(join(method,'references'),{recursive:true});
 writeFileSync(join(workspace,'input.json'),JSON.stringify({generation:'current-'+randomUUID(),values:[randomInt(11,100),randomInt(101,200),randomInt(1,9)]})+'\n');
 writeFileSync(join(method,'SKILL.md'),'---\nname: current-export\ndescription: Use for the controlled current-input export regression fixture.\nlicense: MIT\n---\n# Current input export\nRead references/method.md and LICENSE. Read actual input.json bytes, preserve generation, sum all values, and bind the exact input SHA256. This is a controlled gate fixture, not external skill discovery.\n');
 writeFileSync(join(method,'references/method.md'),'# Method\nUse workflow_read_workspace to inspect actual input.json. Never use remembered fixture values. Produce output.json with exactly generation, total, input_sha256; the hash is of raw original bytes, not a reserialized JSON document. Preserve input.json. An independent host validator recomputes all three values. After source reads, confirm their opaque source_receipt values before reviewing.\n');
 writeFileSync(join(method,'LICENSE'),readFileSync(new URL('../LICENSE',import.meta.url)));
 const references=[];
 for(const [id,text] of [['identity','Preserve the actual current input generation; an old successful output does not validate this input.'],['verification','Success exit status and correct-looking JSON are insufficient; independently recompute every required field and raw-byte SHA256.']]){
  const path=join(runRoot,'sources',id+'.md');writeFileSync(path,'# Controlled reference '+id+'\n'+text+'\n');references.push({id,path,label:'Controlled '+id+' fixture'});
 }
 const contract={requirements:['generation','sum','input_sha256'],constraints:['Preserve input.json; only output.json is writable.'],stopAfter:'learning',protectedInputs:['input.json'],readAllowlist:['input.json'],writeAllowlist:['output.json'],selection:{mode:'fixed',instruction:'The human selected this controlled JSON regression approach.'},feedback:{mode:'delegated_verification',instruction:'The human delegated independent technical verification for this regression fixture.'},catalog:[{id:'current-export',path:method,version:'controlled-preview-fixture-v1'}],references,validators:[{id:'current-json',type:'json-export',input:'input.json'}],learning:{required:false}};
 const contractFile=join(runRoot,'contract.json'),messageFile=join(runRoot,'request.txt');
 writeFileSync(contractFile,JSON.stringify(contract,null,2));writeFileSync(messageFile,'Run the selected controlled JSON export task autonomously. Read current input.json, write output.json with exactly generation, total and raw-byte input_sha256. Keep input.json unchanged. Inspect and confirm all current method/license/reference sources, let the host validate, and finish with a concrete learning decision. A refused premature action must not be treated as completion.');
 return {runRoot,workspace,contractFile,messageFile};
}
