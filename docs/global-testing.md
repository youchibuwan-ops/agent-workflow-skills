# Global 与历史预览的验证边界

旧预览的真实模型证据只绑定提交 `004e3407ef40de377d650336805999953f3cfdaf`。
当前 core、schema、gate 已改变，不能重写旧 summary 的 SHA，或把旧模型通过移给新全局入口。

## CI 的三个作用域

| Job | 检出的代码 | 实际验证 |
| --- | --- | --- |
| `legacy-preview` | 固定完整提交 `004e3407ef40de377d650336805999953f3cfdaf` | 旧 ZIP、安装器与原 17 个源码绑定；旧 builder 仍严格拒绝漂移 |
| `global-hosts` | 当前 push 或 PR | 当前 core、providers、安全校验、conversation 与两宿主；另保留现有 adapter/native 回归 |
| `global-build` | 当前 push 或 PR | 六个历史文件冻结检查、当前 package/install/seal 测试、新 ZIP 和独立 manifest |

没有 `continue-on-error` 或把旧测试标为已通过的替代分支。冻结检查同时比较实际字节、工作树与暂存区差异；缺少旧提交也会失败。共享 core 和 Skill 可以发展，旧 builder、旧 installer 和原始证据则不随之改写。

`global-hosts` 复用同一 job 中安装一次的 `hosts/dsh` SDK。测试前必须找到精确 DSH 0.2.1-rc.2，否则失败；不会因未设置 `DSH_RUNTIME_ROOT` 而把原生测试静默省略。原生 headless、SDK、ACP、Web 用本地 scripted provider，不调用付费模型。SDK-minimal 的预期结果仍是精确进程能力不足时被阻断，不能表述为所有 SDK 能力可用。

CI 不运行 Codex 私有桌面、付费模型探针，或要求个人 WSL/内核配置的真实 OS 沙箱实验。`WORKFLOW_REAL_SANDBOX_TEST=0` 明示四项 OS 沙箱 opt-in 不计入通过；`SOURCE_PROVIDER_REAL_NETWORK=0` 明示依赖个人已安装 Skill 与实际公网来源的集成用例不计入通过。公共请求策略仍由确定性边界测试覆盖。旧预览原有 Windows fresh-install 用例也仍按原条件跳过，不计作本轮安装验收。实际模型、桌面 UI、WSL 与私有 owner 安装证据另行记录其版本和范围。

## 在开发检出中复测

使用 Node 24.22.1、Python 3.13 和完整 Git 历史：

```text
npm ci --ignore-scripts
npm ci --prefix hosts/codex --ignore-scripts
npm ci --prefix hosts/dsh --ignore-scripts --omit=dev
node scripts/check-frozen-preview.mjs
npm run test:global-package
```

再将当前进程的 `DSH_RUNTIME_ROOT` 设置为开发检出的 `hosts/dsh` 绝对路径，运行 `npm run test:global`。未设置时，独立本地运行会显示原生 profile 用例跳过；这不等于原生验收通过，CI 的前置检查会拒绝该情况。

`test:global` 还显式包含两侧 `probes/*.test.mjs`，验证 Unicode 分包、消息帧、预算、实际回合终止、评分器合法表达、凭据日志隔离及外部验收边界，不启动付费模型。Windows 下可单独用以下命令复测相同 glob；纯单测通过不计作 native/runtime 或真实模型通过，也不抵消其他用例的缺 runtime、跳过或失败。最终数量以当前实际输出为准。

```text
node --test hosts/codex-global/probes/*.test.mjs hosts/dsh-global/probes/*.test.mjs
```

新包使用 `npm run build:global -- <全新输出.zip>`。构建器按当前源码生成 manifest，并核 ZIP 实际成员；不读取旧预览的模型证据来批准新代码。CI 在 runner 临时目录生成 ZIP 与 `global-manifest.json`，日志给出本次 manifest SHA256。

历史复测应在另一个固定提交检出运行 `node --test scripts/host-preview.test.mjs`。不要在当前分支取消 `verifySourceEvidence`，也不要用新 SHA 替换旧 summary 来让历史包构建变绿。此处的 CI 安装命令用于可丢弃的开发检出；不要向已经验签的 immutable release 内安装依赖。

## 真实模型测试器的必要校准

首次 R04 DSH 模型尝试在实际发出 22 次请求后，被测试器累计 2,000,000 个消息 JSON UTF-8 字节的上限中止；这不是提供商 token 上限，也不是模型拒绝制作初稿。保留原报告及原生 aborted 事件。后续测试按完整来源和反馈链留足余量，并在调用前记录具体限额、当前量及拒绝原因，费用与 provider usage 分别说明。

首次 R04 Codex 模型尝试完成了 32 次受控工具调用及实际选择、初稿、自检，但独立评分器误把未约定的固定 English 标题和最少 25 个字母词作为要求。原产物实际包含独立英文活动标题及完整英文通知；原始失败不删除。新评分器先用该合法表达、不同布局及缺事实/乱码/关键词拼凑反例校准，再重新执行完整模型链。上述两次尝试均不计作七阶段整链通过，也不能将修正后的单测结果追记为原模型运行通过。

R05 Codex 随后以 35 次受控工具调用、三轮和七个实际阶段完成真实模型技术验收；范围是原生 WebSocket，不是桌面 UI。R05 DSH 在 20 次提供器流调用后到达反馈阶段，编码说明在本轮可见回复里，但评分器错误要求它必须进入文件。与此同时，新文件实际为 LF，所选方案承诺 CRLF；调用参数也为 LF，所以该真实差异必须作为反馈修订，不能归咎于写入宿主。后续测试器应保持同一会话，实际发送纠正、处理重新打开的阶段并复验，而非首次未通过即杀进程。准确冻结版本、运行结果及限制见单独的发行验收记录，不通过改写旧原始日志消除失败。

R06 DSH 实际完成了反馈、重新核读及第二次方案选择；第 44 次提供器流输出恰为旧上限 4096 token，原生以 `max-tokens` 结束，业务已到反馈阶段，旧探针仍错误杀掉整场。用户随后明确每次回复最多 100,000 token，后续配置和真实首请求须同值核验，不把它误当累计预算。双语标签字段和共享邮箱也属于合法通知布局，不能附加“必须成句/邮箱重复”的要求；真实 CRLF 与字面反斜杠转义则仍以实际字节区分。当前参数合法范围应核 [官方 API](https://api-docs.deepseek.com/api/create-chat-completion/) 和本机 SDK，而非猜测。新运行保持原失败与实际原生终止，单测及文档不能代替新真实模型结果。
