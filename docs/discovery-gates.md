# 阶段输出、执行门禁与真实行为验证

本次针对“找到候选却跳过完整核读/安装”和“事后补写通过”的失败修订。沿用历史 SVG
的最早失败阶段回退、当前版本证据和真实任务复验方法；不恢复已撤下的 SVG Skill。

## 当前交付

- 固定输出：任务卡、能力核验单、逐阶段检查、交付核验单。
- 起始顺序：先输出任务卡、执行状态和 `scope` 检查，再检索或核读专业候选。
- 完成顺序：每份当前产物分别验证，处理真实反馈，最终单独关闭 `learning`。
- 可执行门禁：[WorkflowGate](../skills/proactive-skill-discovery/scripts/workflow-gate.mjs)。
- DSH 宿主适配：[attachDshGate](../skills/proactive-skill-discovery/scripts/dsh-guard.mjs)。
- 行为测试：[原生模型任务框架](../evals/discovery-gates/README.md)、[版本化证据](../examples/discovery-gates/README.md)。

门禁由可信宿主持有任务状态、证据与密钥。模型只提交报告，不能凭自填通过字段放行。
它核对阶段顺序、当前文件摘要、完整返回、源与安装 manifest、真实用户选择、全部原始
需求、停止点和维护测试时序。源/产物改变会使旧证据失效，缺项保留在最早未满足阶段。

## 检查分层

| 检查 | 实际覆盖 | 不能推出 |
| --- | --- | --- |
| 23 项门禁单元回归 | 跳步、旧证据、截断、伪造签名、未装先用、漏需求、未验证产物、失败维护测试、暂停等拒绝 | 模型所有任务都遵守、艺术质量通过 |
| DSH 原生集成 | 本包门禁真正接到官方 ToolRuntime；scope 拒研究、未选拒写、未知工具拒绝、后加 allow 不绕过、合法前置后执行、暂停后拒绝 | DeepSeek 模型完整任务已经实测 |
| Codex 真实工具调用 | 冻结的本包模块接到局部 hook，真实模型的 research/写入调用在 scope 被拒，工具主体未运行 | 全部 Codex 工具、故障或既有 shell 会话均已拦截 |
| 新上下文真实文件任务 | 实际检索受控镜像、完整核读、安装/复用、制作、验证、逐阶段输出及停止边界 | 在线 GitHub 发现质量、统计可靠性或未来零失误 |
| 安装、schema、格式、CI | 当前包及资源可以安装/读取，确定性回归执行成功 | 模型行为通过或审美验收 |

真实任务每次保存自己的 Skill 快照与原始事件；[证据页](../examples/discovery-gates/README.md)
按版本报告，失败不被后一版覆盖。真实模型任务与宿主拒绝探针是不同实验，没有把普通
任务称为已经全程挂载工具门禁。最终结论以证据页列出的实测范围为准。

## 已发现并修正的反例

1. 必要安装被拒后把普通副本当足够能力继续制作：现在缺项明确阻断依赖制作。
2. 完成任务漏掉独立 `learning` 检查：新增明确的最终必填槽位，再用新目录复测。
3. 已有七阶段表却在候选核读后补 `scope`：失败保留，首次输出改成明确顺序，门禁在
   scope 阶段也拒绝研究工具；不能以产物正确覆盖这个失败。
4. 独立对抗审查发现“一份产物的验证覆盖另一份产物”和“失败测试仍关闭维护”：
   分别先写失败测试、修正，再跑完整回归。
5. 评测 oracle 曾读取可修改的运行后输入，且非对象 JSON 会让报告崩溃：
   改为冻结原始输入、核保护文件，并把异常输出明确判失败。

## 普通 Skill 与严格宿主模式

普通安装后为 **instruction_only**：固定输出和流程要求会加载，但安装脚本不修改全局
配置，也不自动接管工具。要得到 **host_guarded**，宿主必须真实接入门禁，持有不可由
模型伪造的证据，白名单纳管工具及子调用，并先通过实际拒绝探针。

DSH 官方原生 `ctx.tools.guard()` 可单调拒绝：后注册 allow 不能推翻，guard 异常不会
进入工具主体。接入前核实际版本，并使用参数受限的工具映射；通用 shell 不能被当作
只读研究工具。原生接口依据[固定 rc.2 源码](https://github.com/deepseek-ai/deepseek-harness/blob/d1b9c0406783051f53587719372489aa0a9d76ac/packages/core/tools/src/index.ts)。

Codex CLI 0.155.1 的正常前置 hook 已实测可拒绝，但**hook 崩溃会放行**，故障对照中
两个 marker 确实被写出。`write_stdin` 等路径也不会重复经过前置 hook，不能用一个
正常探针承诺所有工具都受控。Windows 还需核对实际执行 shell：PowerShell 的带空格
可执行路径须正确使用 `&`，否则脚本前解析失败也可能放行。依据
[固定版前置处理](https://github.com/openai/codex/blob/rust-v0.155.1/codex-rs/hooks/src/events/pre_tool_use.rs)与
[write_stdin 实现](https://github.com/openai/codex/blob/rust-v0.155.1/codex-rs/core/src/tools/handlers/unified_exec/write_stdin.rs)。

因此本次交付能够核查并拒绝**纳管流程中的阶段越过**；普通 Skill 文本或不完整的
hook 不能保证任意环境绝无跳步。缺少宿主接入、必要证据或存在未纳管路径时，严格
验收必须保留未通过状态，不能靠改文案降低这一要求。
