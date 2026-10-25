if(process.argv.includes('--version')){console.log('codex-cli 0.164.0-alpha.11.1');process.exit(0);}
import readline from 'node:readline';
const mode=process.argv[2]??'normal',send=m=>console.log(JSON.stringify(m));let turn=0;
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);
 if(m.method==='initialize')send({id:m.id,result:{userAgent:'local fixture'}});
 if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'client-fixture'},model:'fixture-no-model'}});
 if(m.method==='turn/start'){
  ++turn;send({id:m.id,result:{turn:{id:`t-${turn}`,status:'inProgress'}}});
  if(mode==='disconnect'){process.exit(3);return;}
  send({id:900+turn,method:'item/tool/call',params:{threadId:'client-fixture',turnId:`t-${turn}`,callId:`call-${turn}`,tool:'workflow_status',arguments:{}}});
 }
 if(m.id>900&&m.result){send({method:'item/completed',params:{threadId:'client-fixture',item:{type:'dynamicToolCall',tool:'workflow_status',contentItems:m.result.contentItems}}});send({method:'turn/completed',params:{threadId:'client-fixture',turn:{id:`t-${turn}`,status:'completed',error:null}}});}
});
