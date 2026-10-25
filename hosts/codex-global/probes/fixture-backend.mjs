import readline from 'node:readline';
if(process.argv.includes('--version')){console.log('codex-cli 0.164.0-alpha.11.1');process.exit(0);}
let n=0;const send=async m=>{const bytes=Buffer.from(JSON.stringify(m)+'\n');for(let i=0;i<bytes.length;i++){process.stdout.write(bytes.subarray(i,i+1));await new Promise(r=>setImmediate(r));}};
for await(const line of readline.createInterface({input:process.stdin})){
 const m=JSON.parse(line);if(m.id===undefined)continue;
 if(m.method==='initialize'&&process.argv.includes('--fail-initialize'))process.exit(7);
 if(!m.method)continue;
 const result=m.method==='initialize'?{serverVersion:'fixture'}:m.method==='getAuthStatus'?{authToken:'fixture-credential'}:m.method==='thread/start'?{thread:{id:`fixture-thread-${++n}`,cwd:m.params.cwd}}:m.method==='turn/start'?{turn:{id:`turn-${++n}`}}:m.params;
 await send({id:m.id,result});
 if(m.method==='turn/start'){const threadId=m.params.threadId,turnId=result.turn.id;await send({method:'turn/started',params:{threadId,turn:{id:turnId}}});await send({id:`request-${n}`,method:'item/tool/call',params:{threadId,turnId,callId:`call-${n}`,tool:m.params.input[0].text==='attack'?'exec_command':'workflow_status',arguments:{}}});await send({method:'turn/completed',params:{threadId,turn:{id:turnId,status:'completed'}}});}
}
