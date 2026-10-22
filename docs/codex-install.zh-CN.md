# Codex 安装与卸载

[English](installation.md) · [DSH Windows 安装](dsh/install.zh-CN.md)

Codex 和 DSH 的安装目标不同；DSH 用户无需安装 Codex 或下面的 CLI。
两种宿主共用仓库 `skills/` 的原始内容，DSH 适配不修改原 Skill 行为。

## 不装开发工具的手动方法

下载本仓库 ZIP 并全部解压。在目标项目下创建 `.agents/skills`，复制一份完整的
`skills/proactive-skill-discovery` 或 `skills/crafting-reference-based-svg-assets` 文件夹到那里。
保留 `SKILL.md`、`LICENSE`、`references`、`agents`。如果已存在同名项，取消复制并先核对来源，
不要合并或覆盖。记录目标和下载版本。重新打开 Codex 对话并显式调用：

```text
使用 $proactive-skill-discovery 检查这项任务的能力缺口，按已有授权实际验证产物。
使用 $crafting-reference-based-svg-assets 对照实物参考检查这个可编辑 SVG。
```

更新前先在目录外备份定制，移走自己手动复制的旧文件夹，再复制新版本。
卸载只移走自己复制的文件夹，不操作其他 Skill。发现、自动触发和真实任务仍分别验证。

## 已有 Git / Node 的 CLI 方法

仅此方法需要 Git 和 Node ≥22.20.0；CLI 固定为原版验证过的 1.7.4。

```sh
npx skills@1.7.4 add youchibuwan-ops/agent-workflow-skills --skill proactive-skill-discovery -a codex
npx skills@1.7.4 add youchibuwan-ops/agent-workflow-skills --skill crafting-reference-based-svg-assets -a codex
```

以上命令取默认分支，**不是当前 DSH 预览分支**。在已解压、固定 commit 的仓库根目录可改用
`npx skills@1.7.4 add . --skill proactive-skill-discovery -a codex --copy`。
Windows 若 `npx.ps1` 被限制可用 `npx.cmd`。项目安装在 `.agents/skills`；个人安装加 `-g`，
此 CLI 版本使用 `~/.agents/skills`。完整更新/移除和遥测退出设置见[原安装文档](installation.md)。

CLI 列表成功不等于宿主调用或任务成功。此 DSH 分支未重新测 Codex 模型行为；
原版的验证证据保持其原有边界，不借用为 DSH 通过。
