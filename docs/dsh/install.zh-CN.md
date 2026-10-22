# Windows 同学试用：安装、使用、更新与卸载

[English](install.en.md) · [回到中文首页](../../README.zh-CN.md)

这是 **DSH 预览试用包**，尚无同学实测或第三方验收。你只需官方 DSH Desktop 和
Windows 自带的 Windows PowerShell 5.1，不需要 Codex、Git、Node.js、Python 或管理员权限。
Skill 本身是文字说明和参考文件，不是 DSH 插件，也不会安装后台服务。

## 1. 准备官方 Desktop

从 [DeepSeek 官方 Harness 网站](https://deepseek.com/harness/) 进入官方 Desktop 下载入口，
按照官方提示安装并登录；不要用名字相近的社区桌面版替代本次测试。
[官方 Desktop 文档](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/apps/desktop/README.md)
可核对产品来源。记下“关于”里的版本。先用一个新对话确认普通问答可用。
登录、联网和模型用量遵循官方产品要求；本仓库不提供账号，也不收集登录信息。

## 2. 下载 ZIP 并完整解压

当前试用：打开本仓库，切换到 `codex/dsh-windows-distribution-20261023` 分支，点击绿色
**Code → Download ZIP**。不要下载 main 或 Codex PR #1 分支来测试 DSH 安装器。

也可使用 [当前 DSH 分支 ZIP](https://github.com/youchibuwan-ops/agent-workflow-skills/archive/refs/heads/codex/dsh-windows-distribution-20261023.zip)。
分支会更新；正式记录测试时，应使用发给你的固定 commit ZIP 或测试包并记录版本。
仓库的 Actions“DSH Windows distribution”也会生成 ZIP 测试工件，需要 GitHub 登录下载，
不是正式 Release。[打包与验证说明](maintainers.md)面向维护者。

在文件资源管理器中右键 ZIP → **全部解压**。进入解压后的文件夹，应同时看到
`Install-DSH.cmd`、`Uninstall-DSH.cmd`、`dsh-manifest.json`、`windows` 和 `skills`。
不要在压缩包预览窗口里运行脚本，不要只拷贝一个 CMD。

## 3. 安装

先退出正在进行的 DSH 任务，保留这个解压目录以便检查和卸载。
双击 **Install-DSH.cmd**。窗口会显示两份 Skill、版本、完整目标目录，并等待输入。
默认目录是你的用户文件夹下 `.dsh\skills`，例如 `%USERPROFILE%\.dsh\skills`。

如果设置过 `DSH_HOME`，安装器使用当前进程继承的该值；空白环境变量按未设置处理。
显式指定目录优先级最高，支持 `~`，相对路径按启动进程的工作目录解析。
为了避免装错，同学自定义目录时请使用完整绝对路径。
请确认显示的目录与自己 DSH 的实际数据目录一致，再输入大写 **INSTALL** 并回车。
其他输入会取消，不写文件。成功应出现 `Install completed`；已有完全相同版本则显示
`No changes needed`，不会重复覆盖。运行 [Check-DSH.cmd](../../Check-DSH.cmd) 核查安装文件。

安装器只管理：

```text
<DSH_HOME 或默认 .dsh>\skills\
  proactive-skill-discovery\
    SKILL.md / LICENSE / agents / references
    .agent-workflow-skills.receipt.json
  crafting-reference-based-svg-assets\
    SKILL.md / LICENSE / agents / references
    .agent-workflow-skills.receipt.json
```

不会修改配置、QQ Bridge、其他插件、官方程序或全局执行策略。执行策略 Bypass
只作用于这次启动的 PowerShell 进程；脚本不联网下载代码。若学校设备策略阻止运行，
不要更改系统安全策略，可用下面的手动方法或请设备管理员协助。
本包未做代码签名；如 Windows 拦截，请先核对来源并阅读脚本，不要盲目放行。
SHA-256 清单检测损坏和串版，不能认证一个被恶意整体替换的下载包。

### 自定义目录或只安装一份

在解压文件夹空白处 Shift+右键 → “在此处打开 PowerShell 窗口”或“在终端中打开”，
按需复制下面一条，将路径换成你自己 DSH 正在使用的目录：

```powershell
.\Install-DSH.cmd -DshHome "D:\My DSH Data"
.\Install-DSH.cmd -Skill proactive-skill-discovery
.\Install-DSH.cmd -Skill crafting-reference-based-svg-assets
```

显式目录参数仅影响安装器，不会给 DSH 设置该目录。原本使用默认位置的同学不需要这些命令。
默认同时安装两份；只装一份后，检查、更新、卸载也应带相同 `-Skill` 参数。

## 4. 在 DSH 中找到并调用

重新打开 DSH，选择一个测试文件夹并**新建对话**。先发：

```text
请列出当前可用技能目录中这两个技能的名字和说明：
proactive-skill-discovery、crafting-reference-based-svg-assets。
只依据当前目录；找不到请直说，不要安装或改配置。
```

文字回答可能猜测，因此保留技能目录/工具记录作为发现证据。在新对话第一行用斜线显式调用：

```text
/proactive-skill-discovery
请先加载完整说明和 references/adapting-upstream-skills.md，
再帮助我核对 trial-kit/discovery-project 的订单数据。先说明可用工具和验证方法，
把当前文件与规则对照；不要修改个人 Skill、安装新工具或发布文件。
```

```text
/crafting-reference-based-svg-assets
对照 reference.svg 检查 faulty.svg 的整件折板素材，目标宽160px。
先读完整 Skill 和 references/execution-record.md，实际渲染并查看当前源；
给出具体问题、受影响局部与返工阶段。把修订写到新文件，不覆盖输入，不接入游戏。
```

第二例的输入取自 `examples/controlled-bracket`；请复制到独立测试文件夹。
第一例完整提示词和输入在 [同学测试包](trial-kit/README.zh-CN.md)。
DSH 使用 `/技能名`，不是 Codex 的 `$技能名`。
references 按加载结果中的 Skill 基目录解析，不是按任务文件夹解析。

这两份 Skill 的正文目前为中文。发现类任务需要宿主的联网搜索和文件工具；
SVG 任务需要能实际渲染并查看图像的工具。安装 Skill 不会替 DSH 补齐任务能力，
不要为了测试临时安装编程运行时；若 Desktop 提供的能力不足，记录“任务未验证/受阻”。

**长任务注意：** 官方默认在上下文压力触发压缩时可能裁剪长工具结果。SVG Skill 的
完整加载结果已超过其 8192 字符阈值，初次加载通过不保证压缩后全文仍在上下文中。
开始新阶段或发现漏规则时，要求 DSH 从安装位置分段重读完整 `SKILL.md` 和本阶段引用，
记录实际读取范围；必要时开新对话并重新 `/技能名`。不要关闭官方压缩器或改配置。
此恢复方法的 Desktop 行为也需要同学实测。

## 5. 更新

先把本地定制和笔记备份到 Skill 目录之外，下载新 ZIP 并解压到另一个文件夹。
双击新目录中的 **Update-DSH.cmd**，核对目录和版本后输入 **UPDATE**。
只有带本项目有效收据、且当前文件与收据完全一致的安装才会被更新。
同版本同内容是无操作；“安装”命令不会覆盖不同版本。
更新成功后开新对话。用旧包的 Update 也可能回退版本，所以一定核对版本来源。

## 6. 卸载

双击 **Uninstall-DSH.cmd**，核对目标，输入 **UNINSTALL**。只删除本项目收据所对应的
两份完整、未修改的目录。再次卸载是无操作。官方 DSH、其他 Skill、QQ Bridge 和配置保留。
如默认只安装了一份，使用 `-Skill` 选择它。手工改过、增加过文件或空目录会阻止删除，
请先在目录外保留备份再处理；不要删除收据来强行操作。
卸载后开新对话，确认两个名字不再来自用户 DSH 目录；若仍出现，可能是项目级或共享目录的另一份。

## 手动安装和卸载

不运行脚本时，在文件资源管理器地址栏输入 `%USERPROFILE%\.dsh\skills`。
自定义 `DSH_HOME` 的同学应打开自己的实际目录。没有 `skills` 就手动新建。
复制解压包中 `skills` 内你想要的**完整单个 Skill 文件夹**，保留 `LICENSE`、`references`、
`agents`。最终必须是 `skills\技能名\SKILL.md`，不能多套一层仓库文件夹。

如有同名目录、同名 Markdown 或同名 Skill，请取消，先确认来源。不要合并文件夹或选择替换。
记录复制日期、来源版本和目标路径。手动复制不会生成安装收据，脚本会拒绝接管、更新或删除。
更新时先备份并核清自己复制的文件，再移走该完整文件夹，复制新版本。卸载时只移走自己明确
复制的这份文件夹；若无法确认归属就停止操作。移到回收站方便恢复。

## 出错时

见 [诊断与恢复](troubleshooting.zh-CN.md)。`Check-DSH.cmd` 仅核文件，不测试 DSH 加载、
自动调用或任务成功。请分开填写 [测试记录](trial-kit/feedback-template.md)，不要上传密钥或私人日志。
