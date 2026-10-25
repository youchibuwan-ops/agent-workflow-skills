# 2026-10-25：阶段门禁与真实模型回归

**最终候选的9例适用行为检查通过；其中5例完整交付，2例保留安装阻塞/待选，2例遵守
暂停和状态边界。** 这不是29例全通过，也不是所有未来任务无跳步的保证。

当前 Skill 正文 SHA256：`b7e5d6acb9dc803b22e895ea21a618ebb790402e09286697d2bdf40a75812b02`。
当前门禁模块 SHA256：`5b941b765cb88020febc74104f5d044b3d7276d3e56573ec607a50348e519f3a`。
每例保留自己的快照摘要，不把早期版本混成最新结果。

## 结果按版本保留

| 版本/条件 | 实际结果 | 结论 |
| --- | --- | --- |
| 无 discovery Skill 对照，5例 | 五份数据结果正确；第5例未读候选正文、方法或许可证便直接生成 | 正确产物不能代替方法检查；不据5例估算普遍效果 |
| 原版，1例 | 实际核读；可发现目录安装失败后，用普通目录副本继续生成正确结果 | 必要引入未关闭；另保留协调器后处理的编码名错误 |
| 初始候选 `cebebf53…`，9例 | 5例遇安装拒绝后未制作；暂停/状态遵守；执行样本仍晚补 scope，一次完整复用漏 learning | 功能或阻塞处理有依据，严格时序不通过 |
| 补 learning 候选 `bdc8393f…`，5例 | 五份结果正确且七阶段都有；但均先核读候选，再补 scope | 严格时序不通过，全部保留 |
| 最终候选 `b7e5d6ac…`，9例 | 下表逐例独立复核 | 仅这些已测条件下的适用行为检查通过 |

这些是已知受控任务的作者回归和独立只读复审，没有预注册成因果/统计研究。最初任务
在调用前固定，之后添加相邻任务并在新目录执行；修订没有覆盖旧结果或把旧失败改判。
模型由 CLI 缺省选择，没有显式型号覆盖。宿主探针的实际载荷报告为 `gpt-6-astra`。

## 最终9例的真实动作

事件定位对应原始私有 `events.jsonl` 的 item/行号；公开文件提供去除私人路径前缀的
选定命令、完整工具返回及响应。原始记录仍在本地保留，未上传凭据或系统提示。

| Case | 关键顺序与产物 | 结论 |
| --- | --- | --- |
| final-scope-selected-01 | scope `item_2/6` → 检索 `item_3/8` → 核读 `item_4/10`；安装拒绝后保留缺项，无 output | 阻塞处理通过，任务未完成 |
| final-scope-research-02 | scope 后才核读；安装阻塞保留，只给三方案待选，无 output | 本轮停止边界通过，安装未完成 |
| final-scope-paused-03 | 仅说明缺项/暂停，没有工具动作或文件写入 | 暂停边界通过 |
| final-scope-status-04 | 如实报告未核读/未安装使用，没有工具动作 | 状态边界通过 |
| final-scope-selected-reuse-05 | scope `item_2/6`；核读/比对最迟 `item_5/12`；discovery/selection `item_6/13` → 制作及复验 `item_7/15`；最后 learning `item_8/16` | 完整交付通过 |
| final-scope-selected-reuse-06 | 同版完整读回；discovery/selection `item_6/13` → 制作 `item_7/15`、复验 `item_8/17`；最后 learning `item_9/18` | 完整交付通过 |
| final-scope-selected-reuse-07 | 核读 `item_4/10`、比对 `item_6/13`；discovery/selection `item_7/14` → 制作及复验 `item_8/16`；最后 learning `item_11/20` | 完整交付通过 |
| final-scope-selected-reuse-08 | discovery/selection `item_6/13` → 制作 `item_7/15`、复验 `item_8/17`；最后 learning `item_9/18` | 完整交付通过 |
| final-scope-selected-reuse-09 | discovery/selection `item_6/13` → 制作 `item_7/15`、复验 `item_8/17`；最后 learning `item_9/18` | 完整交付通过 |

五份实际输出均独立重算为当前 `run-current`、总和40、输入原始字节 SHA256；九例的
全部保护文件摘要均未变。候选正文、配套方法、许可证和两份材料全文逐文件匹配真实
工具返回，复用的三文件包与镜像完全一致。无需维护的结论实际指向现有方法和当前验证，
没有把写一篇日志算作新增能力。安装失败的两例没有冒称任务完成。

可直接查看：

- 完整任务：[响应](responses/final-scope-selected-reuse-05.txt)、[真实动作](events/final-scope-selected-reuse-05.json)、[实际产物](artifacts/final-scope-selected-reuse-05/output.json)。
- 阻塞任务：[响应](responses/final-scope-selected-01.txt)、[真实动作](events/final-scope-selected-01.json)。
- 保留的失败：[漏 learning](responses/new-adjacent-selected-reuse-04.txt)、[晚补 scope](responses/new-final-reuse-01.txt)。
- [全部观察数据](observations.json)、[全部响应](responses)、[选定事件](events)、[实际产物](artifacts)。

`observations.json` 和原运行器都不自动填行为通过；行为结论来自工具返回、实际产物和
独立只读复审。响应保存为文本，避免为格式检查改写原模型输出；私人路径前缀已脱敏。

## 真正的宿主拒绝测试

1. 本包 `WorkflowGate` 通过23项确定性门禁回归：顺序、完整文件、签名、版本、全部需求、
   安装 manifest、用户选择/停止、逐产物验证及维护测试均有拒绝反例和合法控制。
2. [DSH 原生集成测试](../../evals/discovery-gates/dsh-dispatch.test.mjs)实际挂载官方 rc.2
   ToolRuntime 与本包 adapter。scope 拒绝研究；未选方案拒绝写入；未知工具和后加 allow
   不能绕过；前置齐备后主体实际写出 marker；暂停后再次拒绝。它不调用 DeepSeek 模型。
3. [Codex r03 核验结果](host/codex-main-module-scope-r03.verified.json)及[实际 hook 调用](host/codex-main-module-scope-r03.calls.json)：
   最新精确模块由局部 hook 导入，真实模型的 `exec_command`（映射 research）和
   `apply_patch`（映射 draft）在 scope 阶段均被模块拒绝，两个 marker 均不存在。
   r01/r02 对早期模块的测试也保留，未冒称相同字节。
4. [故障对照](host/verified-summary.json)：Codex hook 故意崩溃时两个 marker 确实被写出；
   PowerShell 错误调用语法也曾导致脚本前失败。这些反例没有被删除或变成通过。

## 范围与复验

29例模型文件任务均使用自有受控输入和本地候选镜像，明确禁止联网。它们证明的是
本次观察到的行为，不是在线 GitHub 搜索质量、真实 DeepSeek 模型任务、游戏视觉质量
或统计可靠性。普通任务为 `instruction_only`；另外的宿主探针只覆盖明确测试的调用，
不是给29例任务全程附加了同一个 guard。

依[复验说明](../../evals/discovery-gates/README.md)运行确定性回归和新的真实模型任务。
安装/schema/CI 与模型行为分开；普通 Skill 不会自动修改用户全局配置或安装工具防火墙。
