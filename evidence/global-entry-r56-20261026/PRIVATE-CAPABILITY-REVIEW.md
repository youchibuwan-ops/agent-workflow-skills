# R55 private capability 独立代码复审

日期：2026-10-26。结论：**Critical 0；Important 0。此轮代码可进入实际 GUI 验证，尚不能据此宣布真实桌面功能验收通过。**

## 范围与方法

仓库：`<private-user-root>/.codex/skill-maintenance/proactive-host-integration-20261025/global-integration`。基线 HEAD：`8731f1e47fa13b3ff6a17325529ab6f8cc568583`。仅审此次六文件的新改动；renderer 两文件在当前 checkout 为未跟踪新文件，已纳入。未修改 checkout、index、HEAD、分支或共享 Skill；没有安装、发布、启动 Codex 客户端，也没有读取真实 owner-config、private-build report、gateway token、auth 或聊天正文。运行获授权的 55 项测试产生并清理其临时夹具；唯一持久写入为本报告。

使用本机 `proactive-skill-discovery` 及 superpowers 7.0.1 `requesting-code-review` 正文、`code-reviewer.md` 模板和 MIT LICENSE。方法为独立只读 diff、上下文核查、固定字节验证、真实 vendor 方法隔离探针及问题严重性分级。没有委派其他代理。初次引导读取曾把候选 Skill 与启动 Skill 放在同次读取；实质代码审查前已补出 scope 和能力核验记录，不将该顺序误称为完全遵循。

## Strengths

1. `entry-patch.mjs:4-7,21-22,35-38`：真实固定 main hash 必须启用 unmanaged executor 禁用策略；唯一 `start` 锚点先核验再修改，不能对该固定源用 false 配置重新启用。调用 `setEnabled(false, reason)` 保留原生停机清理，而不是仅伪装 enabled 状态。
2. `renderer-host-policy.mjs:7-15`：两份 renderer 分别有唯一锚点、完整原始 SHA256 和完整输出 SHA256；替换限定为归档 host 来源与 sidebar host 列表，不改其它 ChatGPT account API、原生错误或其它 renderer 字节。
3. `private-desktop.mjs:106-108,134,143,150-153,174`：固定 header/main family 任一个命中就要求两个都一致且存在 owner binding；两份 renderer 在建目标前读取、核验，追加字节进入预算、ASAR offsets 和逐块 integrity，并由既有 PE header rebind 机制覆盖。
4. `launch.mjs:55-65`：校验从真实 ASAR entry 读取字节，核完整 hash、4 MiB blocks、report 声明和固定 renderer output；新增 helper 导入在已验证的源码范围内，不把 report 声明单独当成 packed 内容证明。

## Issues

### Critical

无。

### Important

无。未找到无需修改受 owner 完整 pin 保护的配置/树即可绕过本轮策略的路径。

### Minor / 可选测试补强

`renderer-host-policy.test.mjs:10-17` 的 policy verifier 用例都在缺失/错误 report 阶段退出，没有让正常生产 family 进入 `readPacked` 成功分支，也没有覆盖“report 正确但第二份 packed renderer 字节错误”及“report 正确但 main guard 缺失”的相邻用例。`launch.test.mjs` 当前 bound fixtures 不声明生产 family，55 项通过没有自动覆盖新增 production 成功分支。建议添加这三类回归测试；这不是已经复现的实现错误，且实际 vendor 输出已在本次独立探针核实。

## 重点边界核查

### 真实 Work manager

仅按有界 ASAR header 读取 stock `.vite/build/main-BPBEjAxi.js`，没有全 archive 转字符串。实际源 hash 与 `INSTALLED_MAIN_SHA256` 一致。

实际 `setEnabled(false)` 会增加 `authorizationRevision`、设 `enabled=false` 并调用 `stop(reason)`；实际 `stop` 会停止 connection observations、清 observation/restart timer、abort 并替换 lifetime、清 startPromise/browser auth/readiness、kill 既有 child，并把 state 设为 disabled / environmentId null / ready false。真实源码中 `.startOnce(` 只有一个调用点，位于本次截断的 start 方法内；restart 也经 start。

额外隔离探针从当前变换后的真实 vendor 字节抽取原样 `setEnabled/start/stop` 方法，在只有 stub 的 VM 类中运行，未执行整个 vendor bundle、constructor、注册服务或进程启动代码。两个 start 调用后 revision=2、原先 child 仅被 kill 一次、旧 lifetime 被 abort、状态保持 disabled；随后 `setEnabled(false,'logout')` revision=3，原生 logout reason 继续传至 stop。该探针补足新单测 WorkFixture 的简化边界，不能替代真实桌面生命周期验证。

### Family 识别与信任边界

`renderer-host-policy.mjs:18` 在两个 source family 字段都未知/缺失时返回 `{productionFamily:false}`，确实不会读 renderer 或核 Work guard。独立直接调用已观测：未知字段、未修复 stock main、拒绝任何 readPacked 的 stub，会得到上述返回且 packedReads=0。

在本轮真实固定源路径中，这不是已证实的 actor 绕过：builder 对固定 header 或固定 main 任一命中都要求双方匹配；真实旧固定 family report 即使缺新字段，也会由固定 header 触发拒绝。report 自身受完整 desktop tree 及 owner config pin 保护；单独变更 family 字段会先破坏该完整性。要把上述直接函数探针变成一次正常 launch，需要 owner 另外封存并 pin 未知/改造的构建，或更换受信源/验证器。此次没有发现正常 CLI 可选该 fixture 策略、或 actor 可改写这些 owner pins 的新增路径。因此保留为可信 owner/测试边界说明，不升级为 Critical/Important。未来若暴露可提交自定义 family 的普通用户入口，应重新审查这条早退。

### 构建预算及打包完整性

真实 renderer 变换后 bytes：archive 41,721；inventory 5,059,869；共 **5,101,590 字节**。`appendedBudget` 已把这两份完整输出计入，实际生成后还以 `actualBudget` 复核预留值。两项各自追加、更新原 entry 的 offset/size/完整 hash/block hashes；已有 main 和两个 owner bootstraps 的追加逻辑不受该数组扩展改变。固定 family 不一致在 target 创建前拒绝。未发现此次新增字节造成预算漏算或 PE/ASAR integrity 降级。

### 归档 host 与原生功能

实际归档旧表达式会在 local 且已登录时附加 durable；新表达式仅保留当前 selectedHostId。共享 sidebar 新表达式只列 local。实际归档 hook 默认 local，开启 remote 功能时还有 connectedRemote 选择校正。没有足够证据把手工注入任意 settings hostId 后的选项状态当成本次已复现回归；main 原有 local 硬边界仍拒绝远程连接。真实可用界面仍需要实际点击和冷恢复验证，特别是旧选择/配置恢复状态，不能从表达式 VM 测试推断完成。

## 实际验证

独立执行：

```text
<private-user-root>/.agent-workflow/global/node-runtime/node-v24.22.1-win-x64/node.exe --test hosts/codex-global/entry-patch.test.mjs hosts/codex-global/renderer-host-policy.test.mjs hosts/codex-global/private-desktop.test.mjs hosts/codex-global/launch.test.mjs
```

结果：退出码 0，**55 tests / 55 pass / 0 fail / 0 skipped**，约 2.49 秒。包括获授权套件中的原有 hidden native bridge 辅助程序测试；没有启动真实桌面客户端。`git diff --check` 对四个已跟踪变更文件退出 0。

从已安装公开 stock ASAR 有界读取并独立核实：

| 对象 | 输入 SHA256 | 当前变换输出 SHA256 |
| --- | --- | --- |
| header | `5bd1f1afeb64772e9dd2bb20c1d7aee48591e8b5ea15e626c936abcfda7cb785` | 不在此构建/写入 |
| main | `2327d031e32c8d80c0dbf9bd81144466a90f8e49d3bc64e6604c23fbab900d7f` | 使用合成 loopback URL，仅验证唯一 guard 与 disabled 策略；不冒称真实 gateway 输出 hash |
| archive renderer | `850584930101ff80929b33213280717b66a63400a572ef773702003232bfa84c` | `3fbe140a65b096fb73d95dfaa085cc6dfec61b413a1b17ac1595f0993f7ec0c4` |
| inventory renderer | `298f4c7bafe278563aa82ef8d8d4c1afe3f581d54915917849065085f7f621d2` | `eb7a6bbe8d4f81c1e7a3f982a0bb8b93941212a8a5c5650b257d0d1a53837ddd` |

复审末尾六文件 SHA256：

| 文件（均在 hosts/codex-global/） | SHA256 |
| --- | --- |
| entry-patch.mjs | `eb30cdb7b83da06cd972ef433e0806207aaf699c8adb1940fe5322c00478f739` |
| entry-patch.test.mjs | `67c71d39248f5a13a91fcb60c1d4065bdb2f79a214b38d214d62916abbc30579` |
| renderer-host-policy.mjs | `ba272d48aa7e584e8f23bad66fced06fb5a9c177f158dce5a6722256db8e849d` |
| renderer-host-policy.test.mjs | `f07c73a946e4e654bba89077b480099419469228a061a6370ecd9103d8dc6a9b` |
| private-desktop.mjs | `be73f1cbb5996168ec2ebdfd94669a621a5087b8b711b1e9f3675d3a6b75b8a2` |
| launch.mjs | `e7390d8547c0059e49b6330a14c0db9e5812f6c2f63313d9603a97bd37f56931` |

## Declined to judge / 未覆盖

- 真实 R10/R11 私有构建的完整 report、真实 gateway 和 launch：按委托不得读取真实私有 report/token，也不得启动客户端；父代理报告其另有实际 bytes 验证，本报告不把其结果列为我的独立复现。
- 真实 GUI 登录、归档/恢复/删除、sidebar/设置交互、Work UI 状态、冷启动与多窗口：禁止客户端启动；没有做 GUI 验收。
- 旧 management/gateway 变更：不在本轮六文件新增 delta 的审阅范围内，未重新审计或撤销原独立审查。
- owner 主动替换完整源码、验证器、config pins 或另行构建未知源：可信 owner 操作，不将其等同于被约束 actor 可达绕过。
- 未来 vendor 版本和未固定的源 family：当前固定版本策略拒绝/fixture 边界不证明所有版本可用。

## 交付核验与经验处理

当前产物为本报告及上述六文件哈希快照。实际独立验证为 55 项回归、固定 stock 输入/两份 renderer 输出、原生方法隔离探针；真实 GUI、真实 private build launch 与整体发布未覆盖。此次复用既有审阅方法，无新增/安装 Skill。已读取 learning-from-work；本次委托明确只读且仅允许报告持久写入，因此不修改共享 Skill。可复用核查要点已作为证据留在本报告：区别受保护 owner 重新 pin 与 actor 可达绕过、以实际原生 stop 语义核 stub 测试、区分 production 分支与 fixture 测试覆盖。

阶段关闭记录：scope 已由本轮明确委托确定；discovery 核读本机审阅模板/许可；selection 为已锁定只读技术审阅；draft 为本报告和独立验证；feedback 已核父代理补充的只读源路径与 owner pin 边界，未冒称用户验收；delivery 按指定路径交付；learning 受只读写入边界约束，仅保留本报告证据。`stage=learning, missing=[], next_action=按停止点结束，不修改共享 Skill、不启动客户端。`
