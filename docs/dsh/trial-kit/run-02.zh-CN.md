# run-02 同学复测：preview.3

[零基础安装](../install.zh-CN.md) · [English](run-02.en.md) · [CSV 验证工具](tools/README.md)

这是新一轮步骤，不是通过报告。请保留上次整个材料目录和自动 SVG 失败，
另建 run-02；没测填“未验证”，没完成填“未完成”。不需要安装 Python、Git、Node 或 Codex。
模型任务需要官方 DSH 现有可用的工具；工具不够时记录受阻，不要求临时装开发环境。

## 1. 新包和任务目录

下载维护者发来的**固定 commit ZIP**，全部解压到新目录。确认 `dsh-manifest.json`
写的是 `0.1.0-dsh-preview.3`，不要覆盖旧包。记下下载链接、commit 和 ZIP SHA-256。
以下命令在新包根目录的 PowerShell 7 中运行；路径有空格也要保留引号。

```powershell
$trial = Join-Path $env:USERPROFILE 'Desktop\DSH-run-02'
if (Test-Path -LiteralPath $trial) { throw '目录已存在，请保留旧记录并换一个新目录名' }
New-Item -ItemType Directory -Path "$trial\evidence","$trial\csv-explicit","$trial\svg-explicit" | Out-Null
Copy-Item .\docs\dsh\trial-kit\discovery-project\orders.csv,.\docs\dsh\trial-kit\discovery-project\rules.txt "$trial\csv-explicit"
Copy-Item .\examples\controlled-bracket\reference.svg,.\examples\controlled-bracket\faulty.svg "$trial\svg-explicit"
$PSVersionTable.PSVersion | Out-File "$trial\evidence\powershell-version.txt"
.\docs\dsh\trial-kit\tools\CSV-Check.cmd Snapshot "$trial\csv-explicit" "$trial\evidence\csv-before.json" 2>&1 | Tee-Object "$trial\evidence\csv-snapshot.log"
"ExitCode=$LASTEXITCODE" | Tee-Object "$trial\evidence\csv-snapshot.log" -Append
```

Snapshot 必须显示 PASS、退出码0，才开始 CSV 任务；指纹放在 evidence，不给模型当输入。
不能结束后重做 Snapshot 冒充开始前记录。不要给模型旧答案、验证脚本或整个仓库。
SVG 在开始任务前自行另存两份原始输入到 evidence，用于结束后核对。

## 2. 安装或更新：实际从 PS7 启动

先记录 Check 的输出和退出码：

```powershell
.\Check-DSH.cmd 2>&1 | Tee-Object "$trial\evidence\install-before.log"
"ExitCode=$LASTEXITCODE" | Tee-Object "$trial\evidence\install-before.log" -Append
```

- 仍有 preview.1/.2：先按安装器显示的实际目录备份两份旧收据，再用**新包**
  `Update-DSH.cmd`，输入 UPDATE。更新后备份两份新收据。不要用 Install 覆盖旧版。
- 已卸载：用新包 `Install-DSH.cmd`，输入 INSTALL。此分支不能记“旧版更新通过”。
- 如果不是本项目管理的同名 Skill，保留报错交给维护者，不手动删除或强行覆盖。

每个命令按下方形式分别保存日志，并把实际命令写入 command-index.txt：

```powershell
# 二选一，根据上面的实际状态；不要把两条都直接执行。
# .\Install-DSH.cmd 2>&1 | Tee-Object "$trial\evidence\install.log"
# .\Update-DSH.cmd 2>&1 | Tee-Object "$trial\evidence\update.log"
# 命令结束立即记录："ExitCode=$LASTEXITCODE" | Tee-Object "对应日志路径" -Append
.\Check-DSH.cmd 2>&1 | Tee-Object "$trial\evidence\install-after.log"
"ExitCode=$LASTEXITCODE" | Tee-Object "$trial\evidence\install-after.log" -Append
```

更新前/后收据分别放 evidence/receipts-before/、receipts-after/，按两个 Skill 名分目录。
每份文件名 `.agent-workflow-skills.receipt.json`；没有旧收据就记缺失，不重造。
发现类6个文件、SVG类7个文件，合计13。sourceCommit 仍是 c1434f0，属于内容基准。

## 3. 请亲自在官方 Desktop 新建对话，做两份显式任务

不要用后台子代理代替本轮 GUI 新建对话。为两个任务分别新建对话、选择各自任务目录。
先保存两份 Skill 出现在目录中的画面或原始目录输出。

CSV 提示词：

```text
/proactive-skill-discovery
请加载完整 Skill，实际读取 references/adapting-upstream-skills.md。
检查当前目录的 orders.csv 和 rules.txt，生成 summary.csv 及可复算的核对记录。
不要修改输入、安装软件、修改个人技能或发布。工具不足或步骤失败时如实记录。
```

SVG 提示词：

```text
/crafting-reference-based-svg-assets
请加载完整 Skill，实际读取 references/execution-record.md。
对照 reference.svg 修订 faulty.svg，目标宽160px。先做好问题局部并实际看图，
再回装整件，检查原尺寸浅深底。另存修订源、局部源、检查图和执行记录。
不覆盖输入，不接入项目，不发布。遇到错误请保留原始报错，不把未完成记为通过。
```

展开工具调用，保留实际 `skill` 返回（含尾部）、基目录、references 的 `read` 返回，
以及渲染/看图调用。无导出功能可复制工具卡文字或逐张截屏；隐藏凭据和无关聊天。
模型口头说“已读取”“未使用工具”不能代替这些原始记录。

CSV 完成后，在包根目录由你运行：

```powershell
.\docs\dsh\trial-kit\tools\CSV-Check.cmd Verify "$trial\csv-explicit" "$trial\evidence\csv-before.json" 2>&1 | Tee-Object "$trial\evidence\csv-verify.log"
"ExitCode=$LASTEXITCODE" | Tee-Object "$trial\evidence\csv-verify.log" -Append
```

保留 CSV 原输入、summary、核对记录、baseline 和验证日志。结果需要 PASS 且退出码0；
失败不要手改 summary 来凑通过。SVG 保留原 SVG、修订 SVG、所有局部、渲染脚本、原始 PNG
和验证输出；缺少渲染/看图能力记未完成。不要用旧验证脚本的退出码作通过依据。

## 4. 自动调用、A/B 与反例单独测

使用[原试用协议](README.zh-CN.md)里的“自动触发 / A-B 相同提示词”，
**不要只删斜线名**：还要去掉“加载 Skill”和 references 文件名暗示。
每个条件用全新对话、全新输入目录；明确无 Skill 的 A 与有 Skill 的 B。
用独立测试账号能避免污染；不方便隔离时先跳过 A/B，记未验证，不删除其他个人 Skill。
已装 Skill 时不能把该次当无 Skill 基线；按原协议在安全卸载后用新对话测试 A。
每份 Skill 独立记录实际调用、任务是否结束、产物是否正确。CSV 每份副本分别先 Snapshot、
后 Verify；baseline 不能复用成另一轮的开始前证据。

反例在新对话测试“2加2只答数字”、单词大小写、抽象图标改色；保存真实工具事件，
无法看到事件就填“未验证”。自动 SVG 新失败记 run-02 未完成，原 run-01 失败继续保留。

## 5. 卸载和补交

完成后保留新收据，再从新包运行：

```powershell
.\Uninstall-DSH.cmd 2>&1 | Tee-Object "$trial\evidence\uninstall.log"
"ExitCode=$LASTEXITCODE" | Tee-Object "$trial\evidence\uninstall.log" -Append
.\Check-DSH.cmd 2>&1 | Tee-Object "$trial\evidence\check-after-uninstall.log"
"ExitCode=$LASTEXITCODE" | Tee-Object "$trial\evidence\check-after-uninstall.log" -Append
```

输入 UNINSTALL。卸载成功应退出0；之后 Check 的 Not installed/退出1属于预期。
Check 停在第一份缺失处，**还要分别检查两个 Skill 的实际目标目录都不存在**，
保存 Test-Path 两个路径的 False 输出；再次在 GUI 新建对话，保存两份均不在目录的记录。
目标目录以安装器显示为准，不假设一定是默认 .dsh。不要发送整个 DSH home。

把 run-02 的副本压缩后反馈：环境和包来源、实际命令、每条完整输出/退出码、前后收据、
GUI 新建对话记录、完整工具卡、CSV/SVG 输入输出、baseline、脚本、检查图及失败原文。
缺失、未测试、未完成分别列清。原始材料自留，发送副本中遮掉用户名、邮箱、Key、Token、
Cookie、Authorization；不要放 `.credentials.yaml`、`.env`、`.npmrc`、完整环境变量或
profiles/sessions/storages。QQ Bridge 没装就继续标未验证，不用为本轮专门安装。
