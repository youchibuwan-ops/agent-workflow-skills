// Exact lifecycle shapes were checked against this host's generated
// 0.164.0-alpha.11.1 protocol and a loopback-provider native compaction run.
// Native summaries never restore workflow authority; that remains in controller.
export function observeContextCompaction(message,thread){
 const item=message.params?.item,method=message.method;
 if(!/compact/i.test(method)&&!/compact/i.test(item?.type??''))return false;
 const params=message.params??{},legacy=method==='thread/compacted',lifecycle=['item/started','item/completed'].includes(method)&&item?.type==='contextCompaction';
 if((!legacy&&!lifecycle)||!thread||params.threadId!==thread.id||typeof params.turnId!=='string'||params.turnId!==thread.turnId||lifecycle&&(typeof item.id!=='string'||!item.id))throw Error('Unknown or unowned native compaction lifecycle');
 // Before a current tool result, the history belongs to an earlier model
 // request. Receipt confirmation is independently held by the controller.
 if(thread.controller&&(typeof thread.controller.compactionReady!=='function'||thread.controller.compactionReady()!==true))throw Error('Compaction would prune unconfirmed current workflow sources');
 const context=thread.contextCompaction??={toolDelivered:false,pending:null};
 if(thread.active&&context.toolDelivered)throw Error('Compaction after current-turn tool delivery is forbidden');
 if(method==='item/started'){
  if(context.pending)throw Error('Overlapping native compaction lifecycle');
  context.pending=item.id;
 }else if(method==='item/completed'){
  if(context.pending!==item.id)throw Error('Unmatched native compaction completion');
  context.pending=null;
 }else if(context.pending)throw Error('Legacy compaction completion cannot replace an open item lifecycle');
 return true;
}

export function assertContextToolDelivery(thread){
 const context=thread.contextCompaction??={toolDelivered:false,pending:null};
 if(context.pending)throw Error('Native tool delivery during unfinished compaction');
 context.toolDelivered=true;
}
