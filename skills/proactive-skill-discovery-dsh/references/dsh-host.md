# DeepSeek Harness 宿主适配

此目录是给 DeepSeek Harness（DSH）使用的独立 Skill，不是 DeepSeek 网页聊天的系统设置，
也不是改模型参数。核心流程与本仓库通用版同步：主动研究、多个相关实例、先选方案、
初稿、反馈、完整交付、经验维护。不要因换宿主省略步骤。

## 发现、加载与文件位置

- 项目安装：`<project>/.dsh/skills/proactive-skill-discovery-dsh/SKILL.md`。
- 个人安装：`<DSH_HOME>/skills/proactive-skill-discovery-dsh/SKILL.md`，默认对应用户的 `.dsh`。
- 保留完整目录、`LICENSE` 和所有 `references/`，不能只复制正文。
- 用 DSH 的 `skill` 工具按名字加载 `proactive-skill-discovery-dsh`。名字出现在目录中，
  不等于模型已读完整正文及引用。按本次任务继续读取所需资源。
- DSH 按项目根发现项目技能；项目根通常是最近的 `.git` 祖先，没有时是当前工作目录。
  确认当前 DSH 会话的工作目录，避免把 Skill 放进另一个项目。

在对话中可明确说：

```text
请用 skill 工具加载 proactive-skill-discovery-dsh。
本次任务是……；先主动找相关技能和多份可信资料，给我几个有实际参考的方案先选，
选定后完成初稿，再根据反馈调节。完整交付后总结，并在授权内实际维护或制作 Skill。
```

## 工具、权限与反馈

以本会话实际工具为准：使用可用的搜索、网页获取、文件读取、命令执行及图像/浏览器能力。
没有视觉工具时不能声称看过图或动态；没有搜索凭证时记录实际阻塞并处理能独立完成的部分。
缺少某个 Codex 专用工具并不允许假称已经调用，也不要求安装 Codex。

用户尚未选择主要方向时，给出真实候选、差异、适配限制和推荐，等待选择；继续可独立研究。
用户已选或明确委托自主取舍时按其要求执行。没有交互式选项工具时，用清楚的文字问题和
材料对照收集选择，不能把工具缺失当作替用户作决定的理由。

个人目录安装、Skill 维护及外部发布仍受当前用户授权约束。此 Skill 不授予额外权限，
不恢复暂停任务，不自动发布或上传用户文件。可复用经验优先写回实际使用的同类 Skill；
独立新能力无合适归属时再制作新 Skill，验证后保留完整包。

## 核对依据与验证范围

适配依据为官方[Skill 子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/docs/subsystems/skills.md)
及实际检查的 `@deepseek-ai/dsh-skill-filesystem`、`@deepseek-ai/dsh-skill` **0.2.1-rc.2**。
仓库测试使用官方文件系统提供器检查项目目录发现、调用元数据、正文读回和相对引用资源。
这不等于已经验证用户机器的模型、搜索凭证、图像能力或最终任务质量；不要把目录加载
测试说成真实模型任务验收。
