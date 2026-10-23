# Agent Workflow Skills：Codex 工作流自荐

## 项目地址

<https://github.com/youchibuwan-ops/agent-workflow-skills>

## 类别

人工智能

## 项目标题

让 Codex 主动找方法、查证据的工作流

## 项目描述

我是项目维护者。这是两份 MIT 开源的 Codex Skills：主动发现工作流帮助代理在遇到能力缺口时检索成熟方案、审阅来源与许可证、实际复用并验证；SVG 工作流强调多角度参考、空间结构、局部细节与整件复审。适合愿意花更多时间换取细致检查的开发者，目前提供 Codex 预发布版、中文说明、可复制安装命令和真实失败记录。

## 亮点

- 重点是 `proactive-skill-discovery`：把“搜到一个方案”继续推进到适用性审阅、使用、产物验证和经验沉淀，而不把安装成功当作任务成功。[干净环境验收与旧失败](https://github.com/youchibuwan-ops/agent-workflow-skills/blob/main/docs/codex-acceptance.md)公开可查。
- 配套 SVG Skill 公开长尾夹案例及两轮“鹈鹕骑自行车”静态/动画 A/B。每轮同模型与极高思考强度、相同工具和提示词、全新隔离会话、每组 900 秒 / 80 次工具启动上限；只有 B 安装 SVG Skill，没有点名调用，两轮 B 都读取了它。
- 两组作品都保留。非盲观察中，B 的传动和材质细节更明确；A 也产出了完整作品并自主纠错。静态 A/B 约 458/568 秒，动画 A 约 519 秒，B 用满 900 秒，保存了可播放作品但未正常完成主任务。相同预算上限不等于相同实际 token 消耗。
- **边界公开：**仅两轮作者案例，最终配对无独立盲评分；静态旧 B 被测试器误停后仅补跑 B，旧结果保留。双方都没有收到运行中的人工纠正，不能据此量化“减少提醒”，也不能证明普遍质量提升。这两轮测的是 SVG Skill，不是主动发现 Skill 的效果。

## 示例代码

需要 Git 和 Node ≥22.20.0。在项目目录单独安装主动发现 Skill：

```sh
npx skills@1.7.4 add https://github.com/youchibuwan-ops/agent-workflow-skills/tree/v0.1.0-codex-preview.1 --skill proactive-skill-discovery -a codex --copy -y
```

PowerShell 如阻止 `npx.ps1`，可用 `npx.cmd`，无需放宽执行策略。[完整安装说明及独立 ZIP](https://github.com/youchibuwan-ops/agent-workflow-skills/blob/main/docs/installation.md)。

## 截图或演示视频

静态 A 在左、B 在右：

![静态 A/B 原始作品](https://raw.githubusercontent.com/youchibuwan-ops/agent-workflow-skills/7c7fc005b506cb353bbff6973351fab6112d079b/evals/pelican/v1/results/comparison.png)

动画 A 在左、B 在右。**B 达到预算上限，不能记作完整验收通过。**

![两组真实动画录像](https://raw.githubusercontent.com/youchibuwan-ops/agent-workflow-skills/7c7fc005b506cb353bbff6973351fab6112d079b/evals/pelican/animated-v1/results/comparison.gif)

[中文案例、原件、录像及成本](https://github.com/youchibuwan-ops/agent-workflow-skills/blob/main/evals/pelican/README.zh-CN.md)。欢迎用自己的任务复现，也欢迎报告不划算或没有改善的情况。
