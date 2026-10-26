import {randomUUID,createHash} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';

// All authority enters from native inbox/lifecycle facts and this host-owned
// factory. This module is never a model tool and accepts no actor receipts.
export function installSessionBroker(host,{controllerFactory,toolSchemas,isInstalled,isAgentLoopRequest,appendStatusRecord,appendCardRecord}) {
  if(typeof controllerFactory!=='function'||typeof isInstalled!=='function'||typeof isAgentLoopRequest!=='function'
    ||typeof appendStatusRecord!=='function'||typeof appendCardRecord!=='function'||!Array.isArray(toolSchemas)||!toolSchemas.length)throw new Error('Trusted factory, schemas, status/card writers and native request identity are required');
  const schemas=structuredClone(toolSchemas),names=new Set(schemas.map(s=>s.name));
  if(names.size!==schemas.length||schemas.some(s=>!/^workflow_[a-z0-9_]+$/.test(s.name)||!s.inputSchema))throw new Error('Invalid controlled schemas');
  const schemaIdentity=JSON.stringify(schemas);
  const states=new WeakMap(),liveSessions=new WeakMap(),sessions=new Map(),definitions=new Map(),deliveries=new Map();
  const nativeRuns=new AsyncLocalStorage(),permits=new Map();
  const nativeNames=['read','write','edit','bash','pwsh'];
  const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
  const argsHash=value=>createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
  let attached=false;
  const installed=()=>{if(!isInstalled())throw new Error('Workflow broker is absent or replaced');};
  const textOf=message=>(message.content??[]).filter(b=>b.type==='text').map(b=>b.text).join('\n');
  const stateOf=agent=>{
    const state=states.get(agent);
    if(!state)throw new Error('Agent has not joined the workflow broker');
    return state;
  };
  const fail=(state,reason)=>{
    state.failed=reason;
    if(state.record){state.record.retired=true;try{state.record.controller.abort(reason)}catch{};}
    try{state.agent.cancel({kind:'hook',reason:String(reason)})}catch{}
    const status={...statusOf(state.agent),phase:'failure'};
    appendStatusRecord(state.agent.session,status);host.emit('workflow/status',{agent:state.agent,status});
  };
  const assertAgent=agent=>{
    installed();if(!attached||host.get('workflowBrokerReady')!==api)throw new Error('Workflow broker is not ready');
    if(!agent)throw new Error('Agent identity is required for model and tool execution');
    const state=stateOf(agent),record=state.record;
    if(state.failed||!record||record.retired)throw new Error(state.failed??'No trusted external user task is bound to this session');
    record.controller.assertReady();return state;
  };
  const validateController=controller=>{
    if(!controller||!['assertReady','dispatch','acceptUserMessage','abort','exportAudit'].every(k=>typeof controller[k]==='function')
      ||JSON.stringify(controller.toolSchemas)!==schemaIdentity)throw new Error('Controller does not match the trusted broker contract');
    controller.assertReady();return controller;
  };
  const statusOf=agent=>{
    const state=stateOf(agent),controller=state.record?.controller;
    const audit=state.failed?undefined:controller?.exportAudit();
    const blockedReason=controller?.blockedReason??audit?.state?.blockedReason??audit?.blockedReason??null;
    const guardInstalled=isInstalled(),bound=guardInstalled&&!!state.record&&!state.record.retired;
    const failure=guardInstalled?(state.failed??null):'Workflow broker is absent or replaced';
    const complete=bound&&!failure&&!blockedReason&&!state.nativeTermination&&controller?.complete===true;
    return {sessionId:String(agent.id),taskId:state.record?.taskId??null,bound,failed:failure,blockedReason,stage:controller?.stage??null,complete,turn:state.currentTurn,nativeTermination:state.nativeTermination??null,
      status:failure||blockedReason||!bound?'blocked':complete?'complete':'pending'};
  };
  function nativeExecutorFor(state){
    const agent=state.agent;
    const catalog=nativeNames.map(name=>({name,definition:host.tools.get(name,agent)})).filter(item=>item.definition);
    const executor=Object.freeze({
      catalog:Object.freeze(catalog.map(({name,definition})=>Object.freeze({name,description:definition.description,inputSchema:structuredClone(definition.parameters)}))),
      async execute(name,args){
        const run=nativeRuns.getStore();assertAgent(agent);
        if(!run?.live||run.exec.agent!==agent||run.state!==state||run.record!==state.record)throw new Error('Native execution requires the exact active guarded controller dispatch');
        const entry=catalog.find(item=>item.name===name);
        if(!entry||host.tools.get(name,agent)!==entry.definition)throw new Error('Native capability is unavailable or changed in this Agent scope');
        const callId=`workflow-native-${randomUUID()}`;
        permits.set(callId,{ownerToken:run.exec.token,agent,definition:entry.definition,name,argsHash:argsHash(args),record:state.record,run,used:false});
        const signal=AbortSignal.any([run.exec.signal,run.lifetime.signal].filter(Boolean));
        try{return await host.tools.execute({name,arguments:structuredClone(args),callId,rootCallId:run.exec.rootCallId??run.exec.callId,parent:run.exec.token,agent,signal});}
        finally{permits.delete(callId);}
      },
    });
    return executor;
  }
  async function replaceFromFactory(state,input){
    installed();const prior=state.record?.controller;
    const produced=await controllerFactory({...input,agent:state.agent,sessionId:String(state.agent.id),workspace:state.agent.session.header.cwd,
      previousController:prior,resumed:state.source==='resume',session:state.agent.session,nativeExecutor:nativeExecutorFor(state),onCard:async card=>{
        installed();const data={...structuredClone(card),sessionId:String(state.agent.id)};
        appendCardRecord(state.agent.session,data);host.emit('workflow/card',{agent:state.agent,card:data});
      }});
    if(input.kind==='resume'&&produced?.awaitingUserTask===true){
      if(state.record)state.record.retired=true;
      state.record=undefined;state.failed=null;state.pendingDeliveries.clear();
      sessions.set(String(state.agent.id),{record:undefined,seen:state.seen,pendingDeliveries:state.pendingDeliveries});
      return;
    }
    const controller=validateController(produced?.controller??produced);
    if(controller===prior){
      if(input.kind==='user-task')await controller.acceptUserMessage(input.userMessage);
      state.failed=null;return;
    }
    if(state.record)state.record.retired=true;
    state.record={taskId:randomUUID(),controller,retired:false};state.failed=null;
    sessions.set(String(state.agent.id),{record:state.record,seen:state.seen,pendingDeliveries:state.pendingDeliveries});
  }
  async function drain(state){
    state.chain=state.chain.catch(()=>{}).then(async()=>{
      installed();
      while(state.pending.length){
        const message=state.pending.shift();if(state.seen.has(message.id))continue;
        try{
          if(message.source.kind==='user-question-reply'){
            assertAgent(state.agent);await state.record.controller.acceptUserMessage(textOf(message));
          }else await replaceFromFactory(state,{kind:'user-task',message:structuredClone(message),messageId:String(message.id),userMessage:textOf(message)});
          state.seen.add(message.id);
        }
        catch(error){fail(state,error.message);throw error;}
      }
    });
    return state.chain;
  }
  host.on('agent/created',async({agent,source})=>{
    installed();const previous=sessions.get(String(agent.id));
    const state={agent,source,record:source==='resume'?previous?.record:undefined,seen:source==='resume'?(previous?.seen??new Set()):new Set(),pending:[],pendingDeliveries:source==='resume'?(previous?.pendingDeliveries??new Map()):new Map(),chain:Promise.resolve(),failed:null,currentTurn:0,nativeTermination:null,publishedTerminalSeq:0};
    states.set(agent,state);liveSessions.set(agent.session,state);
    // Do not mask registry visibility: the trusted native executor must retain
    // the Agent's ORIGINAL native capability/permission view. Filter only the
    // model assembly below; the monotonic guard still rejects raw model calls.
    agent.ctx.tools.presentAs('native');
    if(source==='resume'){
      try{await replaceFromFactory(state,{kind:'resume',userMessage:undefined});}
      catch(error){fail(state,`Session restore is not authorized: ${error.message}`);throw error;}
    }
  });
  host.on('agent/disposed',({agent})=>{
    const state=states.get(agent),record=state?.record;if(!state)return;
    if(record&&!record.retired){record.retired=true;if(!record.controller.complete)record.controller.abort('Native Agent disposed');}
    if(liveSessions.get(agent.session)===state)liveSessions.delete(agent.session);
  });
  host.on('agent/inbox/claimed',({agent,message})=>{
    if(message.source?.kind==='user'||message.source?.kind==='user-question-reply')stateOf(agent).pending.push(message);
  });
  host.on('system-prompt/assemble',async(assembly,context,next)=>{
    const agent=context.scope;
    if(!agent?.id)return next();
    const state=stateOf(agent);await drain(state);assertAgent(agent);
    const result=await next();
    return {...result,sections:[...result.sections.filter(s=>s.name!=='workflow-session-policy'),{name:'workflow-session-policy',text:state.record.controller.instructions,interpolate:false}],
      tools:result.tools.filter(schema=>names.has(schema.name)&&host.tools.get(schema.name,agent)===definitions.get(schema.name))};
  });
  host.on('agent/pre-step',async({agent},next)=>{await drain(stateOf(agent));assertAgent(agent);return next();});
  host.on('agent/request',async({agent},next)=>{
    assertAgent(agent);const request=await next();assertAgent(agent);
    // Output controls belong to the original model/user settings. Test budgets
    // are applied only by the explicitly configured private probe monitor.
    return request;
  });
  host.on('agent/error',({agent,error})=>{
    const state=states.get(agent);if(state&&!state.failed)fail(state,`Native Agent error: ${error instanceof Error?error.message:String(error)}`);
  });
  // Native cancellation skips turn-stopping. Capture only the live Session's
  // current terminal, then append after commit has unwound at native idle.
  // Session observers must not re-enter append() during a Session commit.
  host.on('session/event',(session,event)=>{
    const state=liveSessions.get(session);if(!state||host.get('agents')?.get(state.agent.id)!==state.agent)return;
    const turn=event.data?.turn;
    if(event.type==='turn/start'&&Number.isSafeInteger(turn)&&turn>state.currentTurn){state.currentTurn=turn;state.nativeTermination=null;}
    if(event.type==='turn/end'&&turn===state.currentTurn&&event.data?.reason?.kind==='aborted'&&event.seq>state.publishedTerminalSeq){state.nativeTermination={turn,seq:event.seq,reason:structuredClone(event.data.reason)};}
  });
  host.on('agent/status',({agent,status})=>{
    const state=states.get(agent),terminal=state?.nativeTermination;
    if(status!=='idle'||!terminal||terminal.turn!==state.currentTurn||terminal.seq<=state.publishedTerminalSeq)return;
    state.publishedTerminalSeq=terminal.seq;const data={...statusOf(agent),phase:'native-aborted'};
    appendStatusRecord(agent.session,data);host.emit('workflow/status',{agent,status:data});
  });
  // Runs after the last assistant step, before the native turn/end record.
  // This is host business state, not a semantic judgment of model prose.
  host.on('agent/turn-stopping',({agent,turn})=>{
    const status={...statusOf(agent),turn};
    appendStatusRecord(agent.session,status);
    host.emit('workflow/status',{agent,status});
  });
  host.on('llm/stream',(options,next)=>(async function*(){
    installed();const agent=host.get('agents')?.currentInitiator();const state=assertAgent(agent);
    if(!isAgentLoopRequest(options))throw new Error('Direct LLM APIs require a native bound AgentLoop request');
    if(options.maxTokens!==undefined&&(!Number.isSafeInteger(options.maxTokens)||options.maxTokens<=0)){
      fail(state,'Native model output limit must be a positive safe integer when specified');throw new Error(state.failed);
    }
    // AgentLoop freezes this real request. Check the exact pending tool bytes
    // after session projection/compaction, immediately before provider dispatch.
    // A tools/result observer alone cannot detect later surface pruning.
    for(const [callId,expected]of state.pendingDeliveries){
      const delivered=options.messages.filter(message=>message.role==='tool'&&String(message.source?.callId)===callId);
      if(delivered.length!==1||JSON.stringify(delivered[0].content)!==expected){
        fail(state,'Controlled source delivery bytes were removed or changed before model dispatch');
        throw new Error(state.failed);
      }
    }
    state.pendingDeliveries.clear();
    yield*next();
  })());
  host.on('tools/result',(exec,result)=>{
    const expected=deliveries.get(exec.token);if(expected===undefined)return;deliveries.delete(exec.token);
    if(result.isError||JSON.stringify(result.content)!==JSON.stringify([{type:'text',text:expected}])){
      try{fail(stateOf(exec.agent),'Tool delivery integrity failure')}catch{}
    }
  });
  // Bind the private permit to the registry-minted native execution before
  // delegating through the original permission waterfall. No allow is forced.
  host.on('tools/pre-execute',(exec,next)=>{
    const permit=permits.get(String(exec.callId));
    if(permit&&permit.nativeToken===undefined&&permit.agent===exec.agent&&permit.ownerToken===exec.parent&&permit.name===exec.name)
      permit.nativeToken=exec.token;
    return next();
  },{prepend:true});
  const api=Object.freeze({
    ownership:'root-context-multi-session',
    attachServices(){
      installed();if(attached)return;
      for(const schema of schemas){
        if(host.tools.get(schema.name))throw new Error(`Conflicting workflow tool: ${schema.name}`);
        host.tools.register({name:schema.name,description:schema.description,parameters:schema.inputSchema,
          output:{schema:{type:'object'},render:(_a,value)=>[{type:'text',text:JSON.stringify(value)}]},
          execute:async(args,exec)=>{
            const state=assertAgent(exec.agent);
            try{
              const run={state,exec,record:state.record,live:true,lifetime:new AbortController()};
              let result;
              try{result=await nativeRuns.run(run,()=>state.record.controller.dispatch(schema.name,args,{callId:String(exec.callId),agentId:String(exec.agent.id),sessionId:String(exec.agent.session.id),taskId:state.record.taskId}));}
              finally{run.live=false;run.lifetime.abort(new Error('Guarded controller dispatch ended'));}
              if(!result||typeof result.ok!=='boolean')throw new Error('Workflow dispatcher integrity failure');
              if(result.fatal===true)throw new Error(`Workflow dispatcher fatal: ${typeof result.error==='string'?result.error:'Unspecified controller integrity failure'}`);
              const serialized=JSON.stringify(result);
              deliveries.set(exec.token,serialized);
              state.pendingDeliveries.set(String(exec.callId),JSON.stringify([{type:'text',text:serialized}]));
              return result;
            }catch(error){fail(state,error.message);throw error;}
          }});
        definitions.set(schema.name,host.tools.get(schema.name));
      }
      host.tools.guard(exec=>{
        try{
          assertAgent(exec.agent);
          const permit=permits.get(String(exec.callId));
          if(permit){
            const state=stateOf(exec.agent);
            if(!permit.run.live||permit.used||permit.nativeToken!==exec.token||permit.agent!==exec.agent||permit.record!==state.record||permit.ownerToken!==exec.parent
              ||permit.name!==exec.name||permit.argsHash!==argsHash(exec.arguments)||host.tools.get(exec.name,exec.agent)!==permit.definition)
              return 'Native workflow permit identity, scope, definition or arguments mismatch';
            permit.used=true;return undefined;
          }
          if(exec.parent!==undefined)return 'Nested native execution is not authorized by the workflow broker';
          if(!definitions.has(exec.name))return `Uncontrolled tool ${exec.name} is disabled`;
          if(host.tools.get(exec.name,exec.agent)!==definitions.get(exec.name))return 'Workflow tool definition has been replaced';
          return undefined;
        }catch(error){return `Workflow denied: ${error.message}`;}
      });
      attached=true;
    },
    status:statusOf,
    exportAudit(agent){const state=stateOf(agent);return state.record?.controller.exportAudit()??null;},
  });
  return api;
}
