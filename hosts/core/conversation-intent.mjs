// Recognition consumes only an actual external message, never quoted fragments
// or actor tool arguments. Unknown/mixed controls confer no approval.
export function requestsNewPlan(text){
 if(typeof text!=='string')return false;
 return /(?:重新(?:选择|给出|提供|设计).*方案|换个方案|换一种方案|原方案不要|推翻.*方案|改换.*方向)|(?:取消|撤销|放弃|作废)(?:(?:这个|当前|原来|之前|所选|原有|我的)的?)?(?:方案|方向|授权|选择)|(?:不要|不用|不再采用|不再使用)(?:(?:这个|当前|原来|之前|所选|原有)的?)?(?:方案|方向)|(?:改用|改选|换成|换用)(?:方案|另一个|另一种)|换(?:一?个|一种)(?:方案|方向)|\b(?:cancel|revoke|withdraw|abandon|discard)\s+(?:(?:the|this|current|previous|selected|my)\s+)*(?:plan|approach|direction|selection|authorization)\b|\b(?:switch|change)\s+to\s+(?:(?:a|the|another|different|new)\s+)*(?:plan|approach|direction)\b/i.test(text);
}
export function isConversationQuestion(text){
 if(typeof text!=='string'||/\/workflow\b/.test(text))return false;
 const value=text.trim();
 if(requestsNewPlan(value))return false;
 // A leading explanation question must not swallow a later real correction or
 // a softly phrased stop request. Pure questions about an earlier edit remain
 // questions; action clauses require an imperative position or an explicit cue.
 if(/(?:^|[。！？!?；;，,\n]|然后|接着|同时|并且|现在|请|帮我)\s*(?:请|先|帮我)?\s*(?:修改|改成|改为|改短|改长|调整|添加|删除|重做|制作|实现|保存|生成|修复|优化|继续做|暂停|先停|停止)|把[^。！？!?；;\n]{0,120}(?:改|调整|删除|保存)|(?:^|[.!?;\n]|\b(?:please|then|also|and)\b)\s*(?:please\s+)?(?:change|edit|write|delete|create|implement|fix|stop|pause)\b/i.test(value))return false;
 if(/^(?:为什么|为何|怎么回事|什么意思|这是什么|请?(?:解释|说明)(?:一下)?|what\b|why\b|explain\b)/i.test(value))return true;
 if(/(?:区别|差别|是什么意思|怎么用|如何使用|能否访问|能不能访问|读得到|读不到|是否已经|有没有查|有没有找)/.test(value)&&/[?？吗呢]/.test(value))return true;
 return /[?？吗呢]$/.test(value)&&!/(?:修改|改成|调整|添加|删除|重做|制作|实现|保存|生成|修复|优化|继续做|\b(?:change|edit|write|delete|create|implement|fix)\b)/i.test(value);
}
export function actualPlanChoice(text,options){
 const value=text.trim();if(/[\r\n]/.test(value))return null;
 const command=value.match(/^\/workflow choose ([a-z0-9_-]+)$/i);if(command)return command[1];
 const direct=value.match(/^(?:选(?:择)?|就选|采用|就按)\s*([a-z0-9_-]+)(?:\s*(?:方案|做|执行))?[。！!]?$|^([a-z0-9_-]+)$/i);
 if(direct){const id=direct[1]??direct[2];return options.find(o=>o.id.toLowerCase()===id.toLowerCase())?.id??null;}
 const indexed=value.match(/^(?:我选|选择?|就选|采用)\s*第?([一二三四五1-5])(?:个|种|项)?(?:方案)?[。！!]?$/);
 if(!indexed)return null;const digit='一二三四五'.indexOf(indexed[1]);return options[digit<0?Number(indexed[1])-1:digit]?.id??null;
}
