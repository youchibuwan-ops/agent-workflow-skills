# Agent Workflow Skills

Two reusable agent skills for deliberate skill selection and reference-based SVG art.

| Skill | Purpose |
|---|---|
| [proactive-skill-discovery](skills/proactive-skill-discovery/SKILL.md) | Match installed skills, discover and inspect external candidates, adapt or combine workflows, and validate actual task results. |
| [crafting-reference-based-svg-assets](skills/crafting-reference-based-svg-assets/SKILL.md) | Refine real-object SVG props, finish difficult details independently, assemble them, and visually review the entire object against references. |

## 使用

使用兼容的 Skills CLI 选择需要的单个 Skill（以下命令面向 Codex）：

```sh
npx skills add youchibuwan-ops/agent-workflow-skills --skill proactive-skill-discovery -a codex
npx skills add youchibuwan-ops/agent-workflow-skills --skill crafting-reference-based-svg-assets -a codex
```

也可以将单个 Skill 目录复制到宿主支持的个人技能目录。保持 SKILL.md 和配套 references/agents 文件在同一目录；不需要安装整个仓库或游戏项目。

- `$proactive-skill-discovery`：主动匹配、发现、筛选、适配和使用技能。
- `$crafting-reference-based-svg-assets`：按实物精修并复审可编辑SVG素材。

自动匹配依赖宿主支持和Skill描述。使用Skill不扩大权限；已授权范围内直接执行，用户/项目的禁用项与停止要求始终有效。发现技能不意味着自动恢复暂停任务。

## 适配现成Skill

保留上游来源与许可证，优先用薄适配层处理差异；组合流程由总控Skill协调，确定性操作确有需要时才增加脚本。参见[适配方法](skills/proactive-skill-discovery/references/adapting-upstream-skills.md)。

Vercel [find-skills](https://github.com/vercel-labs/skills/tree/main/skills/find-skills) 可作为可选发现工具；其代码和CLI不包含在本包中。

本包不包含游戏素材、实物照片、私人项目规则、机器配置、审核日志或凭据。美术Skill中的项目配置仅为通用示例。

## License

[MIT](LICENSE) © 2026 youchibuwan-ops.
