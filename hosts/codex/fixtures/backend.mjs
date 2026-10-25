if(process.argv.includes('--version')){console.log('codex-cli 0.164.0-alpha.11.1');process.exit(0);}
import readline from 'node:readline';
const mode=process.argv[2],send=m=>console.log(JSON.stringify(m));
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);
 if(m.method==='initialize')send({id:m.id,result:{userAgent:'fixture'}});
 if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'owned-thread'},model:'fixture-model',observed:m.params}});
 if(m.method==='turn/start'){
  send({id:m.id,result:{turn:{id:'turn-1',status:'inProgress'}}});
  if(mode==='compaction')send({method:'item/started',params:{threadId:'owned-thread',item:{type:'contextCompaction'}}});
  send({id:900,method:'item/tool/call',params:{threadId:'owned-thread',turnId:'turn-1',callId:'call-1',tool:mode.startsWith('unknown')?'exec_command':'workflow_state',arguments:{}}});
  if(mode==='unknown-followed-valid')send({id:901,method:'item/tool/call',params:{threadId:'owned-thread',turnId:'turn-1',callId:'call-2',tool:'workflow_state',arguments:{}}});
 }
 if(m.id===900&&m.result){send({method:'fixture/result',params:m.result});send({method:'turn/completed',params:{threadId:'owned-thread',turn:{id:'turn-1',status:'completed',error:null}}});}
});
