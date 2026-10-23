# 让 Codex 主动找方法、查证据：工作流与两轮鹈鹕实测

自荐一个我维护的 MIT 开源项目：[Agent Workflow Skills](https://github.com/youchibuwan-ops/agent-workflow-skills)，目前是 Codex 预发布版，含两份可单独安装的中文工作流。

做这个项目，是希望代理遇到陌生问题时能主动找方法、核查来源、检查作品，而不总靠用户逐处指出。重点 Skill `proactive-skill-discovery` 把能力缺口、成熟方案检索、来源/许可证审阅、实际复用、产物验证和经验沉淀连起来；另一份 SVG Skill 则将多角度参考、结构理解、局部制作与整件复审串成流程。[安装说明](https://github.com/youchibuwan-ops/agent-workflow-skills/blob/main/docs/installation.md)提供固定预发布版本的 Codex 命令及独立 ZIP。

为方便读者看实际产物，公开了两轮鹈鹕骑自行车 A/B：静态 SVG 和动画 SVG。每轮同模型 gpt-6-astra、xhigh 极高思考强度，同提示词和工具、全新隔离会话，每组上限 900 秒 / 80 次工具启动；A 不启用目标 Skill，B 只安装 SVG Skill，不显式点名调用，两轮 B 均实际读取。

静态 A 在左，B 在右：

![静态原件对照](https://raw.githubusercontent.com/youchibuwan-ops/agent-workflow-skills/7c7fc005b506cb353bbff6973351fab6112d079b/evals/pelican/v1/results/comparison.png)

动画 A 在左，B 在右，以下来自真实浏览器录像。**B 在 900 秒预算截止前保存了可播放作品，但没有正常完成主任务。**

![动画对照](https://raw.githubusercontent.com/youchibuwan-ops/agent-workflow-skills/7c7fc005b506cb353bbff6973351fab6112d079b/evals/pelican/animated-v1/results/comparison.gif)

非盲观察里，B 更明确地表达了传动、羽毛/喉囊材质和前叉制动细节，并有自主检查与纠错记录；A 也能自主修正并产出完整作品。代价同样公开：静态 A/B 约 458/568 秒，动画 A 约 519 秒，B 用满 900 秒。相同上限不等于相同 token 消耗。

这只是两轮作者案例：没有最终配对的独立盲评分，不能推导普遍质量提升；双方都没有运行中的人工纠正，不能量化“节省了多少提醒”。静态旧 B 曾被测试器误停，获授权仅补跑一次 B，旧结果和失败均保留。这两轮不是主动发现 Skill 的效果实验，后者有另行公开的干净环境流程验收记录。

[中文完整案例与原件](https://github.com/youchibuwan-ops/agent-workflow-skills/blob/main/evals/pelican/README.zh-CN.md) · [主动发现的验收与限制](https://github.com/youchibuwan-ops/agent-workflow-skills/blob/main/docs/codex-acceptance.md)

希望对更重视成品质量、愿意接受额外检查时间的开发者有用。欢迎复现和反馈失败，包括“检查更多但并没变好”的情况；项目不承诺每次自动触发或每次产物都正确。
