# R57 — Windows PowerShell 兼容修复

R56 在 Codex 开发环境中选中了 PowerShell 7，普通终端实际回退到 Windows PowerShell 5.1；目录读取使用后者不支持的 `ConvertTo-Json -EscapeHandling`，进程退出 1 后门禁中止任务。

R57 用核心字符串操作输出 ASCII JSON，保留中文、单引号、反引号、美元符号及 UTF-16 代理对。受限模式按实际版本选择 `Get-Content -Encoding Byte` 或 `-AsByteStream`。继续通过原生权限服务读取，不增加直接文件内容回退，不改变隔离、拒绝或写入准入。

当前源码 manifest SHA256 为 `68451f84a15a1b2ba84ed0edc4fc34e62ee301fc2d9f8a9e5670c439971efee1`。作者完整检查 **579/579，0 失败、0 跳过**（global 514、package 34、Codex policy 31）。独立复审另跑 **18+2** 项，没有 Critical/Important，保留一项有效沙箱状态证据的 Minor 建议。原始 R56 模块用同一当前 shell 夹具仍是 PS5 两项失败、PS7 两项通过；没有删除旧失败。R56 的其余模型/UI/CI 记录仍只证明其当时版本，不移称 R57 通过。

安装后的实际 `dsh.cmd web` 从普通 machine/user PATH 冷启动，未注入 Codex 的 PowerShell 路径。通过真实网页选择原有项目，新会话实际搜索 Skill、枚举目录并读取当前配置、主场景、说明与约束；20 次工具调用、12 个模型步骤、2 分 2 秒后原生回合 completed。CIM 进程父子链另外观察到真实 Windows PowerShell 5.1。三个预先快照文件字节/哈希未变；当前事实及报告哈希匹配。保留缺许可证候选拒绝和 discovery 阶段过早 validate 拒绝，不把这两次可恢复拒绝算成通过动作。只读答复按要求停止，宿主业务仍为 discovery/pending，并未冒称制作交付完成。截图及原始会话只留本机，不发布项目正文、账号或认证网址。

本机只更新 DSH 的来源绑定/包装和两份 Skill 的阶段检查引用，复用既有封存 Node/SDK；Codex 配置、快捷方式及用户资料保持原样。旧 DSH 服务已重启以加载新代码。原来中断的美术/背景任务没有自动恢复。

公开附件为 [R57 安装包](https://github.com/youchibuwan-ops/agent-workflow-skills/releases/tag/v0.2.0-host-preview.3-r57)。ZIP 的字节摘要在 `release.json`。可运行 `node evidence/global-entry-r57-20261026/verify-evidence.mjs --package <ZIP路径>` 核对当前源码、公开记录和实际 payload；这只能证明字节一致性，不能重演或独立认证作者的历史模型调用。当前 GitHub CI 状态与匿名下载复核在发布附件单独记录，不倒填作者回归。

支持的 Windows PowerShell 5.1 与 PowerShell 7 使用真实进程检查分页、空目录、特殊字符及 BOM/CRLF/跨块字节。手动语言模式探针中，PS5 的签名脚本函数 Get-FileHash 在切换前加载；该探针不能冒充 OS 沙箱。实际 DSH SDK 另核原生执行器选中的 PS5.1，使用精简 PATH，在 workspace-write 和 read-only 两种 OS 权限模式下枚举与读回，并确认过早写入仍被拒绝。

本次不修改游戏、QQ 机器人或登录配置；不宣称修复全部 Codex 警告或验证全部产品功能。

审查过程曾拒绝递归清理临时副本。作者随后核对两个明确属于本轮审查的临时根及每个普通后代，逐文件/空目录清理完成；原审查报告保留当时事件，不把后续处理倒签到独立结论。
