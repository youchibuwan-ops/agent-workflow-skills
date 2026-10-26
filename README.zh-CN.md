# Agent Workflow Skills · 中文说明

[English](README.md)

[R66 模型目录与原生 Ultra 修复记录](evidence/global-entry-r66-20261027/README.md)：受控 Codex 启动时刷新账号实际可用型号，保留原生 Ultra 委派，并兼容既有对话的工具声明。原版 Codex 的过期目录覆盖移除后仍需退出重开；DSH 安装包不包含私有 Codex 桌面。

本仓库维护 **proactive-skill-discovery** 及 **DeepSeek Harness（DSH）版**。默认当前能力尚不能满足任务目标，从任务开始
主动寻找专业 Skill、多份相关资料和成熟实例，整理方案让用户先选，再制作初稿、根据
反馈调整、完整交付，最后总结并实际维护或制作可复用 Skill。
安装成功不等于任务成功；它不扩大任务授权，也不自动恢复暂停工作。

新增固定的任务卡、能力核验单、逐阶段检查与交付核验单，以及可运行的宿主阶段门禁。
缺证据不能进入下一阶段；普通 Skill 指令与实际工具阻断明确区分。
见[阶段检查、真实行为测试及失败边界](docs/discovery-gates.md)。

新增[Codex / DSH 受控入口测试包](docs/host-preview.md)：真实工具拒绝、正文回执确认、
宿主自动阶段记录及独立产物验证。它是独立测试入口，不替换日常 Codex 桌面，
支持范围、未接入能力与保留的真实模型失败均单独说明。

新的 [DSH 默认受控入口](docs/global-entry.md) 提供强制原生启动器、普通会话控制器、
安装后完整依赖核验及用户 PATH 启用脚本。具体安装包以当前验证记录为准；
只安装 Skill 不会自动启用这套宿主接入。

历史 [R36 桌面修复记录](evidence/global-entry-r36-20261026/README.md) 已实际验证 Windows 设置、原生目录信任与项目添加、真实文件完整读取，以及完全退出重开后在原失败会话里再次调用工具读取。作者本机全量 443/443、打包 34/34、Codex 策略 31/31，均零跳过；两份 Skill 已更新。旧 DSH 付费实测仍保留 [R32 来源身份](evidence/global-entry-r32-20261026/README.md)，本轮执行代码未变，没有冒称重新跑过付费模型。更新包见 [GitHub Releases](https://github.com/youchibuwan-ops/agent-workflow-skills/releases)；DSH 安装按钮不分发私有 Codex 桌面，仅复制 Skill 仍是 `instruction_only`。

历史 [R39 技能清单修复](evidence/global-entry-r39-20261026/README.md) 已实际验证受控桌面的技能卡片、正文详情和选用：按 Ctrl+K → 输入“技能” → “前往技能”，聊天中输入 `$find` 可搜索。作者本机显示74个不同名称；两轮真实模型含同会话冷启动及当前项目重读，字节与哈希相符。回归516/516、零跳过。DSH包同步源码；DSH生产代码及两份Skill正文未变，没有新增付费DSH模型验收。

历史未发行的 [R50 项目访问候选](evidence/global-entry-r50-20261026/README.md) 支持自行发现已选项目目录，
正常结束有真实证据的只读回复，同时保持制作阶段和写入门禁。544/544 本机回归零跳过；
Codex 新会话与冷恢复、DSH 官方提供器均有当前源码的真实模型验证，并重新读取了实际游戏项目。
本地不适配时继续公开目录/GitHub；目录错误有 GitHub 备用搜索，完整源码与安装读回要求不变。
10 万 token 仅为测试每次回复上限，日常 DSH 保留原生和用户设置。两份 Skill 参考已实际更新。
R50 未完成正常桌面聊天管理验收，不能作为最终可用结论；保留其原测试记录。

当前 [R56 原生管理修复](evidence/global-entry-r56-20261026/README.md) 用统一管理通道替代零散处理，将正常项目、聊天管理与模型执行分开；保留原生行为，处理删除中断恢复及跨客户端执行互斥。完整回归、两种真实模型、本机项目读取、桌面操作和发行检查分别留证，未覆盖项不冒称通过。更新安装包见 [GitHub Releases](https://github.com/youchibuwan-ops/agent-workflow-skills/releases)。

**2026-10-25：SVG Skill 已撤下。**
`crafting-reference-based-svg-assets` 已从当前可安装目录移除，单独的发布 ZIP 也撤下，
不再推荐安装。历史案例、测试和 Git 历史保留作证据，不再作为当前 Skill 的推广入口。
本次仓库变更不会修改使用者已安装的本地副本。

## 给使用 DeepSeek / DSH 的同学

直接看[中文安装与使用说明](docs/dsh.md)。独立版本为
[proactive-skill-discovery-dsh](skills/proactive-skill-discovery-dsh/SKILL.md)，
下载仓库后可用安装脚本复制到项目的 `.dsh/skills/`，无需安装 Codex 或本仓库开发依赖。
官方提供器的发现/加载已实际检查，受控模型回归单列于预览文档；通用任务质量仍未验收。

## Codex 安装与调用

需要 Git 和 Node ≥22.20.0。在目标项目目录执行：

```sh
npx skills@1.7.4 add https://github.com/youchibuwan-ops/agent-workflow-skills/tree/main --skill proactive-skill-discovery -a codex --copy -y
```

此命令跟随当前分支；需要严格复现时应核查并固定具体提交。
安装目录为 `.agents/skills/proactive-skill-discovery/`；加 `-g` 为个人安装。
PowerShell 若限制脚本执行，可使用 `npx.cmd`。保留完整目录和许可证，
更新与卸载见[安装说明](docs/installation.md)。

```text
使用 $proactive-skill-discovery 完成这个仓库的发布质量检查。
实际审阅候选方法与许可证，复用合适工具，验证安装和任务产物，
保留已验证的经验。独立分支工作，不发布正式版本或外部投稿。
```

自动匹配依赖宿主，明确调用便于复现。当前流程和资源见
[Skill 正文](skills/proactive-skill-discovery/SKILL.md)与[流程说明](docs/discovery-workflow.md)。

## 使用示例与保留证据

- [完整流程示例](examples/discovery-complete-loop/README.md)：先研究、先选方案，再初稿与反馈。
- [可运行的经验维护示例](examples/discovery-maintenance-loop/README.md)：实际识别旧导出、修订审核 Skill 并复验。

- [发现与发布检查案例](examples/discovery-release-audit/README.md)。
- [历史 Codex 验收及边界](docs/codex-acceptance.md)：已知任务的作者回归，不能推广成普遍效果。
- [历史 SVG 静态与动画 A/B](evals/pelican/README.zh-CN.md)：原件、成本、失败和未完成项保留。
- [长尾夹](examples/svg-binder-clip/README.md)、[折板](examples/controlled-bracket/README.md)、
  [木衣夹](examples/heldout-clothespin/README.md)：历史案例，不再推广对应的 SVG Skill。

历史通过记录不代表撤下的 Skill 仍受推荐。当前包检查与历史行为证据分别见
[验证说明](docs/validation.md)。

## 贡献与许可

见[贡献指南](CONTRIBUTING.md)、[版本记录](CHANGELOG.md)、[安全说明](SECURITY.md)。
Skill、文档与脚本为 [MIT](LICENSE)；示例照片和派生 SVG 的许可见各自署名文件。
