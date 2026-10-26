// Authority comes only from the installed backend's correlated activity events.
// Model messages and tool arguments never create a delegated thread binding.
const id=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
export function bindNativeDelegate(message,{threads,models}){
 const item=message.params?.item;
 if(!['item/started','item/completed'].includes(message.method)||item?.type!=='subAgentActivity'||item.kind!=='started')return false;
 const parent=threads.get(message.params.threadId),root=parent?.delegation?threads.get(parent.delegation.rootThreadId):parent;
 if(parent?.delegation)assertNativeDelegate(parent,threads);
 if(!parent?.active||message.params.turnId!==parent.turnId||!root?.active||!root.controller?.ready||!id(item.agentThreadId)||!id(item.id)||item.agentThreadId===parent.id||item.agentThreadId===root.id)throw Error('Unowned native delegation activity');
 const prefix=(parent.delegation?.agentPath??'/root')+'/',suffix=item.agentPath?.slice(prefix.length);
 if(typeof item.agentPath!=='string'||!item.agentPath.startsWith(prefix)||!suffix||!/^[A-Za-z0-9_-]{1,64}$/.test(suffix)||!models.has(item.model))throw Error('Native delegate path or model is not owned');
 const existing=threads.get(item.agentThreadId);
 if(existing){if(existing.delegation?.parentThreadId!==parent.id||existing.delegation.agentPath!==item.agentPath||existing.delegation.rootThreadId!==root.id)throw Error('Native delegate thread identity collision');return true;}
 threads.set(item.agentThreadId,{id:item.agentThreadId,cwd:parent.cwd,worktreeLease:parent.worktreeLease,loaded:true,active:false,controller:root.controller,cards:[],task:root.task,provisional:parent.provisional,delegation:{rootThreadId:root.id,parentThreadId:parent.id,agentPath:item.agentPath,rootTurnId:root.turnId}});
 return true;
}
export function startNativeDelegate(message,thread,threads){
 const root=threads.get(thread.delegation.rootThreadId),turn=message.params?.turn;
 if(!root?.active||!root.controller?.ready||!id(turn?.id)||turn.rootTurnId!==root.turnId||thread.active)throw Error('Unowned native delegate turn');
 thread.controller=root.controller;thread.delegation.rootTurnId=root.turnId;thread.active=true;thread.turnId=turn.id;thread.contextCompaction={toolDelivered:false,pending:null};
}
export function assertNativeDelegate(thread,threads){
 if(!thread.delegation)return;
 const root=threads.get(thread.delegation.rootThreadId);
 if(!root?.active||!root.controller?.ready||thread.controller!==root.controller||thread.delegation.rootTurnId!==root.turnId)throw Error('Native delegate outlived its owning turn or controller');
}
