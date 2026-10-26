# R56 source query 独立只读复审

2026-10-26。**Critical 0，Important 0。未发现本轮查询修正、来源边界或 integration 评分器存在须阻断的放宽。**

## 范围与版本

仓库 `<private-user-root>/.codex/skill-maintenance/proactive-host-integration-20261025/global-integration`，HEAD `8731f1e47fa13b3ff6a17325529ab6f8cc568583`。仅审 `hosts/providers/source-provider.mjs`、`.test.mjs`、`.integration.test.mjs` 相对 HEAD 的本轮最后 delta（18 增、4 删），没有重复审阅前六个 private capability 文件。

| 文件 | 本次实际 SHA256 |
| --- | --- |
| source-provider.mjs | `559289416486d72df472455742fab7e4c26755934cf1d360d749212cf9bd091e` |
| source-provider.test.mjs | `b5383703896f06d64ef8745a1010dcdaf34a1f71eb6d7d90a2aad70b0fa36012` |
| source-provider.integration.test.mjs | `c645ae93b7bb6a1d21c1b5fa0f95b0aea4b7d805561e661a54cd8a5571a72f5c` |

父代理称 source manifest 已冻为 `e0d759cb...`；本报告以实际三个文件的完整 hash 为版本依据，没有将该截短 manifest 标记当作独立完整性验证。

## Strengths 与具体核查

### 查询收敛与有界拓宽

`source-provider.mjs:113-137` 将清理掉 ASCII 双引号和反斜杠后的完整 phrase 放入一对双引号，保留 `example-method` / `find-skills` 连字符；先查询 `in:name`，仅在 name scope 没有得到实际 tree candidate 时再用 `in:name,description,readme`。这更换的是 repository search 查询文本和搜索次序，没有把 catalog 标题、仓库排名或搜索响应当成已取得的 Skill。

每个 scope 仍为 `per_page=3` 且再用 `.slice(0,3)` 限制仓库数；至多两个 scope、六个仓库 tree 请求。只有通过原有 regular `SKILL.md` entry、模式与 safePath 检查并经原有 query-token 匹配的候选才加入结果。匹配成功后停止拓宽；没有候选就保留诊断和 `externalUsed=false`。输入中的引号不能制造额外顶层 GitHub qualifier：本次离线探针验证了清理后仅剩包装用的一对引号。这里证明的是当前发出的字符串形态，不声称独立验证了 GitHub 所有搜索语义。

### 获取、许可与字节边界保持

新增 delta 没有修改 `remoteBundle` / `persist`：

- `source-provider.mjs:161-176` 仍从当前 commits/HEAD 取得固定 commit/tree identity，再读取该 tree；拒绝截断、不同 tree、歧义入口、不安全路径、symlink/submodule/异常模式及超额资源。
- `:179-185` 仍从固定 commit raw URL 下载，并逐份按 Git object header + 原始 bytes 核 SHA1/SHA256、文件长度。
- `:205-207` 仍将缺许可、缺/空入口、未解本地引用置为 `incomplete`；二进制/需 viewer 文件置为 `needs_viewer`；仅无 missing 且无需 viewer 才为 `ready`。新搜索候选仍带 `metadataStatus=not-parsed`，search 仍 `completeSourceInspection=false`。

17 项离线测试同时保留并通过缺许可、截断 tree、symlink、错误 blob、资源预算、cache 篡改、硬链接和 SSRF 等现有负例。没有发现通过调整 query 绕过这些获取边界的新增路径。

### Network oracle 的修正

`source-provider.integration.test.mjs:19-20` 保留 catalog 正例必须找到 `vercel-labs/skills`、取得 `ready`、当前 commit、license 与 SKILL.md，未将完整可用正例降成任意结果。

`:22-25` 的 fallback 改为当前实际 `kind=github`、`nameHint=find-skills` 候选；仍要求 acquire 返回 repo 与被选 source 一致、固定 commit、实际 SKILL.md 和每个文件 gitBlob。删除“live 排名必须包含特定 repo 且一定有 license”这一额外假设，适合其验证目标：catalog outage 下仍可发现并获取真实匹配来源。

fallback 的 `incomplete` / `needs_viewer` 现在可作为获取测试的结果；它们没有被改称 `ready`。无 license 时必须同时满足 `status=incomplete` 及 `missing` 包含 `license_missing`；一旦 status=ready，仍必须 license 存在且 missing 为空。`:28` 将实际 status、missing、license 写入 nested fallback 报告，避免总报告 pass 被误读为该来源已具备 ready 能力。因此本次 oracle 改动是在隔离“发现/取得来源”和“来源具备完整可用能力”，没有降低 provider 的 ready 准入。

## Issues

### Critical

无。

### Important

无。

### 非阻断测试建议

新单测 `source-provider.test.mjs:84-89` 直接覆盖 name 查询返回空仓库列表后拓宽；建议未来也把“name 有仓库，但实际 tree 无匹配 SKILL”和“name 已有匹配，不能继续 broad”的两个路径固定进套件。此次我已用额外离线探针实际覆盖这两条路径并通过，所以没有据此提出未复现的实现缺陷。

## 独立验证与证据边界

本次执行：

```text
<private-user-root>/.agent-workflow/global/node-runtime/node-v24.22.1-win-x64/node.exe --test hosts/providers/source-provider.test.mjs
```

结果：**17 tests / 17 pass / 0 fail / 0 skipped**，约 0.387 秒；本次三文件 `git diff --check` 无错误。

补充三个本地注入响应探针，全部通过，不发网络请求、不 acquire、不写 cache 文件：

1. name scope 返回仓库，但唯一 tree entry 为不相关目录；随后 broad scope 返回匹配 `skills/example-method/SKILL.md`，正确得到 broad 候选，发出的查询次序为两个带引号的固定 scope。
2. name scope 已有实际匹配 tree，正确只发送第一条查询，不继续 broad。
3. query 含 ASCII 双引号和 `repo:evil/escape` 文本，最终 query 仍仅有包装 phrase 的两个引号，无法逃出 phrase 新增 scope/qualifier。

原 R55 全量 507 中 506 pass 与 live GitHub 的 1,200,291 结果/前三无匹配树，以及修订后的 real network 专项通过，均来自父代理本轮事实说明。遵守“不再联网耗匿名限额”，我没有复跑 network integration，也没有将这些 live 结果列为我的独立复现。没有整体付费模型调用、凭据读取、安装或源码修改。

## Declined to judge / 未覆盖

- 当前 GitHub live 排名、匿名剩余额度、远程 HTTP 可达性：本轮明确禁止联网，未独立复现。
- 泛化的语义相关性/Skill 适配质量：本轮仅修 repository query 与有界 tree fallback；query token 的“任一匹配”及候选未核读标签是既有行为，不能把当前 candidate 当成已验证专业能力。
- provider 的全部历史安全设计与前六个 private capability 文件：仅检查与本轮 delta 相邻的获取边界，没有扩成重复审计。
- 完整 507 项及付费模型回归：本轮只授权 17 项单测，不据其通过宣称全部系统重新通过。

## 交付核验与学习关闭

复用本机 `proactive-skill-discovery` 及已核 superpowers 7.0.1 `requesting-code-review` 正文、code-reviewer 模板与 MIT LICENSE，以只读差异、相邻负例、评分器目标校准和实际测试覆盖本轮需求；未新增或安装 Skill。新产物为本报告及上述版本/验证证据。

阶段记录：scope 已按本轮明确指令限定三文件、禁网、禁凭据及报告停止点；discovery/selection 复用已核审阅方法，方向已由委托锁定；draft/feedback 完成当前 diff、17 单测和三个相邻探针，并逐条核对父代理所述真实失败与新 oracle 的目标边界；delivery 交付本报告。已重新读取 learning-from-work：评分器应固定原始行为目标，而非依赖 live 排名/许可偶然性的核查方法适用；但本轮只读授权禁止改源码及共享 Skill，相关证据仅留报告，不冒称已维护。`stage=learning, missing=[], next_action=按停止点结束，不联网、不改源码或共享 Skill。`
