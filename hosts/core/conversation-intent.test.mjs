import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isConversationQuestion,requestsNewPlan} from './conversation-intent.mjs';

test('questions containing actionable corrections or pause requests are not discarded as pure questions',()=>{
 for(const text of ['为什么这样安排？把说明改短一点。','请解释一下，然后修改标题。','Why this layout? Please change the title.','先停一下可以吗？','停止制作好吗？'])assert.equal(isConversationQuestion(text),false,text);
 for(const text of ['为什么这样安排？','这几个方案有什么区别？','这几个已有方案有什么区别？只解释它们，暂时不要制作。','Why did you change the title?','请解释一下修改的原因。'])assert.equal(isConversationQuestion(text),true,text);
});

test('explicit plan revocation or a different direction requires a fresh selection while detail refinements retain the plan',()=>{
 for(const text of ['取消方案 A，重新给我三个选择。','不要这个方案了，改用方案 B。','撤销之前的授权。','Cancel the selected plan and propose alternatives.','Why this design? Discard the current approach.'])assert.equal(requestsNewPlan(text),true,text);
 for(const text of ['保留这个方案，把说明改短一点。','不要改方案，只调整标题。','取消标题的阴影。','Keep the selected plan and change the title.'])assert.equal(requestsNewPlan(text),false,text);
});
