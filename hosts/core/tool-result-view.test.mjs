import test from 'node:test';
import assert from 'node:assert/strict';

import {compactToolResult} from './tool-result-view.mjs';

test('removes repeated catalog state while preserving exact data and actionable state', () => {
  const data = {content:'\ufeff原始\r\nbytes\u0000',source_receipt:'unconfirmed-secret-challenge',complete:false};
  const state = {task:'task-1',revision:3,stage:'discovery',complete:false,blockedReason:null,needs_input:false,evidence:['receipt-17'],candidates:[{id:'large-catalog'}],workspace:{root:'C:/project'},options:[{description:'long old choices'}]};
  const result = Object.freeze({ok:true,state:Object.freeze(state),data:Object.freeze(data)});
  const actual = compactToolResult(result,{toolName:'workflow_read_source'});
  assert.deepEqual(actual.state,{task:'task-1',revision:3,stage:'discovery',complete:false,blockedReason:null,needs_input:false,evidence:['receipt-17']});
  assert.equal(actual.data,data);
  assert.equal(result.state,state);
  assert.ok(result.state.candidates);
});

test('keeps error, fatal, recovery and unknown result fields intact', () => {
  const recovery={mode:'continue',next_tools:['workflow_confirm_sources'],next_action:'Confirm current receipts.'};
  const result={ok:false,error:'source not confirmed',fatal:true,missing:['receipt'],recovery,nativeTermination:{reason:'aborted'},state:{task:'t',stage:'discovery',blockedReason:'failed',error:'state-level error',recovery,candidates:['large']}};
  const actual=compactToolResult(result,{toolName:'workflow_review_skill'});
  assert.equal(actual.error,result.error);
  assert.equal(actual.fatal,true);
  assert.equal(actual.recovery,recovery);
  assert.equal(actual.missing,result.missing);
  assert.equal(actual.nativeTermination,result.nativeTermination);
  assert.equal(actual.state.error,'state-level error');
  assert.equal(actual.state.recovery,recovery);
  assert.equal(actual.state.candidates,undefined);
});

test('status keeps its full data snapshot, and non-workflow or malformed values pass through', () => {
  const state={task:'t',stage:'selection',evidence:['e'],options:[{id:'a'}],candidates:['x']};
  const result={ok:true,state,data:state};
  assert.equal(compactToolResult(result,{toolName:'workflow_status'}).data,state);
  assert.equal(compactToolResult(result,{toolName:'native_read'}),result);
  for(const value of [null,undefined,'raw output',{ok:true,data:'x'},{ok:true,state:[]}])assert.equal(compactToolResult(value,{toolName:'workflow_status'}),value);
});
