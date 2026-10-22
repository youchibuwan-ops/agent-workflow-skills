# Agent Workflow Skills · 中文说明

[English](README.md)

让编码代理主动找到合适的 Skill，核查后实际使用，再把已验证的方法沉淀下来。
本仓库提供两份可单独安装的工作流 Skill，重点是 **proactive-skill-discovery**。

## 两份 Skill 的区别

| Skill | 解决什么问题 | 交付什么 |
| --- | --- | --- |
| [proactive-skill-discovery](skills/proactive-skill-discovery/SKILL.md) | 进入陌生领域、能力有缺口、工作反复失败、现成技能不完全合适 | 检索和筛选依据、适配方案、真实任务验证、已有 Skill 的经验维护 |
| [crafting-reference-based-svg-assets](skills/crafting-reference-based-svg-assets/SKILL.md) | 实物 SVG 的轮廓、厚度、连接、遮挡或整件装配不清楚 | 互补参考、独立关键局部、可编辑整件、原尺寸与转向的实际图审 |

发现 Skill 的目标是完成原任务，安装成功不算任务成功。SVG Skill 聚焦实物素材，
不接管抽象图标、纯 UI 或玩法测试。自动匹配依赖宿主；明确调用最便于复现。

## 安装与调用

需要 Git 和 Node ≥22.20.0。在目标项目目录执行，任选一份：

```sh
npx skills@1.7.4 add youchibuwan-ops/agent-workflow-skills --skill proactive-skill-discovery -a codex
npx skills@1.7.4 add youchibuwan-ops/agent-workflow-skills --skill crafting-reference-based-svg-assets -a codex
```

CLI 1.7.4 的 Codex 项目安装目录是 `.agents/skills/`；加 `-g` 为个人安装。
Windows PowerShell 若限制脚本执行，可使用 `npx.cmd`。无需游戏项目和仓库开发依赖。
完整目录与卸载方式见[安装说明](docs/installation.md)。

```text
使用 $proactive-skill-discovery 完成这个仓库的发布质量检查。
优先复用现成工具，实际审阅候选与许可证，验证安装及任务产物，
把已证实的可复用决策补进合适的已有 Skill。独立分支工作，不发布正式版本或外部投稿。
```

```text
使用 $crafting-reference-based-svg-assets 制作一件可编辑长尾夹素材。
同一关键部位比较多个候选，用互补角度核轮廓、厚度和连接，
先逐项做好困难局部，再回装并实际查看原尺寸浅深底与转向；不要接入游戏。
```

两份 Skill 不扩大原任务授权，不自动恢复暂停队列。发现依赖联网/安装工具；
SVG 依赖真实看图和可用渲染器，均由宿主提供。不要求生图、指定外部模型或 API 密钥。
主体与详细参考目前为中文。

## 实际证据

- [发现、筛选、验证与经验沉淀案例](examples/discovery-release-audit/README.md)。
- [长尾夹参考、局部、回装、检查图与修订](examples/svg-binder-clip/README.md)。
- [未参与规则修改的木衣夹参考测试](examples/heldout-clothespin/README.md)。
- [安装结果与验证边界](docs/validation.md)。

案例展示实际工作，不声称模型成功率提升。后续可追加 DSH 版，须独立记录版本、
相同输入、基线、原始结果和失败项，不将安装检查混称行为效果对照。

## 贡献与许可

见[贡献指南](CONTRIBUTING.md)、[版本记录](CHANGELOG.md)、[安全说明](SECURITY.md)。
Skill、文档与脚本为 [MIT](LICENSE)；示例照片和派生 SVG 的许可单独列于
[素材署名](examples/svg-binder-clip/ATTRIBUTION.md)，不随 Skill 安装。
