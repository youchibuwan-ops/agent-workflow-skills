# Agent Workflow Skills · 中文说明

[English](README.md)

本仓库维护 **proactive-skill-discovery**。默认当前能力尚不能满足任务目标，从任务开始
主动寻找专业 Skill、多份相关资料和成熟实例，整理方案让用户先选，再制作初稿、根据
反馈调整、完整交付，最后总结并实际维护或制作可复用 Skill。
安装成功不等于任务成功；它不扩大任务授权，也不自动恢复暂停工作。

**2026-10-25：SVG Skill 已撤下。**
`crafting-reference-based-svg-assets` 已从当前可安装目录移除，单独的发布 ZIP 也撤下，
不再推荐安装。历史案例、测试和 Git 历史保留作证据，不再作为当前 Skill 的推广入口。
本次仓库变更不会修改使用者已安装的本地副本。

## 安装与调用

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
