# 给 DeepSeek Harness 同学的安装与使用说明

这是 **DeepSeek Harness（DSH）工具环境**使用的 Skill，名称为
`proactive-skill-discovery-dsh`。仅使用 DeepSeek 网页聊天时，不能直接安装本目录。
先使用你已经配置好的 DSH；本包不包含模型账户或凭证，也不要求安装 Codex。

## 1. 下载

下载或克隆[本仓库](https://github.com/youchibuwan-ops/agent-workflow-skills)，保留完整文件夹。
也可以在 GitHub 点击 **Code → Download ZIP** 后解压。

```sh
git clone https://github.com/youchibuwan-ops/agent-workflow-skills.git
cd agent-workflow-skills
```

## 2. 装进要工作的项目

在下载的仓库目录运行，替换为自己的项目路径：

```sh
node scripts/install-dsh.mjs --project /path/to/my-project
```

Windows PowerShell 示例：

```powershell
node scripts/install-dsh.mjs --project "D:\my-project"
```

安装位置为 `<项目>/.dsh/skills/proactive-skill-discovery-dsh/`。
脚本只复制这个 Skill 的完整正文、许可证和引用文件；目标已存在时会拒绝覆盖。
不需要在下载的仓库运行 `npm install`，也不需要更改 DSH 配置或添加插件。

如果希望个人所有项目可用，可改为：

```sh
node scripts/install-dsh.mjs --user
```

个人安装使用 `DSH_HOME/skills/`，未设置 `DSH_HOME` 时使用用户的 `.dsh/skills/`。
修改过旧版时先在技能目录之外备份，核对变化后再替换，避免丢失自己的经验。

## 3. 在 DSH 中调用

让 DSH 会话在安装所对应的项目中工作，明确发送：

```text
请用 skill 工具加载 proactive-skill-discovery-dsh。
本次任务是：【填写要做的东西和验收条件】。
主动查找相关专业 Skill、多份可信资料和成熟实例，给我几个有依据的方案先选。
按我选定的方向完成初稿，根据反馈调整，满足要求后完整交付。
最后总结已验证经验，实际维护合适的已有 Skill；能独立复用且无合适归属时制作新 Skill。
本次允许必要的资料检索、项目内技能安装和经验维护；外部发布或付费另行确认。
```

最先应看到的是实际研究和有真实材料的方案对照。主要方向未选定前不擅自制作；
用户已经选定或明确委托自主取舍时不反复问。初稿、反馈修订和最终完成分开表述。

自动使用取决于 DSH 会话和模型，目录可见不等于已执行。找不到时先确认工作目录、
目录层级、完整 `SKILL.md`，必要时新建会话后明确要求加载，不能把未加载说成已经使用。

## 4. 从两个示例开始

- [完整制作流程](../examples/discovery-complete-loop/README.md)：以低频音波说明先研究、
  多个参考、先选方案、初稿、反馈和经验维护；这是使用说明，不是假装完成的作品。
- [可运行的经验维护](../examples/discovery-maintenance-loop/README.md)：真实执行过的合成导出夹具，
  展示如何发现旧方法问题、修订领域 Skill 并复验，而不只写日志。

## 5. 已验证和未验证的范围

本仓库使用官方 `@deepseek-ai/dsh-skill-filesystem`、`@deepseek-ai/dsh-skill`
**0.2.1-rc.2**，实际检查项目发现、模型/用户调用元数据、正文与相对引用加载，
以及项目安装、个人安装和拒绝覆盖。具体内容见[宿主适配](../skills/proactive-skill-discovery-dsh/references/dsh-host.md)。

这些不是 DeepSeek 模型任务质量或你机器环境的验收。搜索凭证、联网、视觉与终端能力
依实际 DSH 配置而定；本次未通过真实 DeepSeek 模型对话测试完整任务闭环。
参考[官方 Skill 文档](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/docs/subsystems/skills.md)。

## 维护者复验

同学安装无需执行以下命令。维护者修改通用版后运行：

```sh
npm ci --ignore-scripts
node scripts/build-dsh-variant.mjs
npm run test:dsh
npm run lint
```

生成器同步核心流程与通用引用；DSH 专属宿主说明单独保留，避免两个版本悄悄分叉。
