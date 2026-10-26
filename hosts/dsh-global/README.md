# Native DSH session broker

This package is the DSH boundary adapter for ordinary conversations. It uses
the installed official DSH 0.2.1-rc.2 Loader, AgentLoop, inbox, tool scheduler,
LLM middleware and permission services. Node >=24.9 is required. It does not
contain another DSH runtime or a model provider, and reads no API key.

Tests include controller doubles and the production conversation factory,
actual project byte I/O, separate sessions, continuations and cold restoration.
LLM providers in these regressions are explicitly scripted. Earlier frozen
generic releases have separate real-model evidence; that evidence does not
validate later source changes or this resume authorization addition. Installation
must pin and deploy the owner launcher before claiming that a user's daily
entry has changed.

## Native lifecycle

The bundle requires `workflowBrokerInstalled` before creating the native
`tools` and `llm` services, and `workflowBrokerReady` before creating AgentLoop.
Its bootstrap does not depend on these gated services. Root-owned hooks survive
managed-plugin disposal and verify the exact installed service identity.
Process-local identity helpers come from the exact native Loader module
namespace, avoiding duplicate WeakSets caused by relocated package copies.

A native `agent/inbox/claimed` message whose source is `user` queues a trusted
task request. The awaited system-prompt assembly drains that queue before the
first model request. This ordering matters: native prompt assembly precedes
`agent/pre-step`. Task factories are per actual Agent and external user turn.
The factory may return the existing controller for a continuation. A native
late `user-question-reply` is routed to that controller's `acceptUserMessage`.
Unbound plugin work and direct agentless LLM calls are denied.

Daily bound native AgentLoop requests retain the original model defaults and
explicit caller/user output settings, including live Models-setting changes.
The workflow broker does not impose the private test's 100000-token ceiling on
ordinary conversations or rewrite caller-owned Agent options. The explicitly
prepared private model probe sets and checks 100000 tokens per test response;
that is not an aggregate test-token budget or an installer-wide daily policy.
Free official Web SessionController and SDK regressions verify normal defaults
above 100000 and explicitly lower limits at the actual provider-entry boundary.
These checks use a local scripted adapter, not a paid model or browser renderer.

Model tool assembly contains only the exact supplied workflow schemas. Native
visibility remains intact for host operations, but raw shell, PTC, unknown
tools, nested calls and scoped definition replacement fail the monotonic tool
guard. Controlled tool results are compared again in the next real frozen
AgentLoop request; a pruner cannot remove source bytes before model delivery.
Already delivered historical messages may be compacted normally.

## Trusted factory interface

The broker plugin config requires an absolute `factoryModule`. That ES module
exports `toolSchemas` and `controllerFactory(input)`.

```js
export const toolSchemas = /* exact controller schema list */;
export async function controllerFactory(input) {
  // Return a trusted controller, or {controller}. No actor-supplied authority.
}
```

`input` contains `kind` (`user-task` or `resume`), native `agent`, `session`,
`sessionId`, `workspace`, `resumed`, `previousController`, and `nativeExecutor`.
A user-task also has the original cloned `message`, `messageId`, `userMessage`.
The factory owns deciding whether a new user message opens a new task or is a
continuation. It must restore authoritative durable state on process restart;
absence of a restorable controller fails closed. Same-process resume creates a
new controller and native executor bound to the new live Agent. Actual native
reads after resume and separate-process restoration are tested; current facts
are reverified rather than trusting old receipts.

For a paused/failed Session, authorize its next resume from an external terminal
in the **original workspace**, using the installed controlled entry:

```text
dsh-guarded.cmd authorize-resume <sessionId>
dsh-guarded.cmd headless --session-id <sessionId> "Continue the original task."
```

The authorization command performs full source/dependency verification, reads the
owner's fixed `controllerConfigFile`, and checks the current signed conversation
envelope. It starts no model or DSH driver and prints only status, Session ID and
expiry. No owner/config/state/profile overrides are accepted. The private grant
lasts five minutes, binds the exact current envelope bytes, task and canonical
workspace, and can be consumed once. The same grant is consumed before the next
SDK, Web, ACP or headless Agent resumes that Session. Facts and source receipts
are reverified; this does not reuse earlier read proofs or enlarge the scope.
Another interruption or changed envelope needs a fresh authorization.

Restoration starts discovery again for the original task. It does not restore
the previous selection stage, options or nonces unchanged. Use a live Web,
SDK or ACP session for the full choice/draft/feedback conversation. The official
headless driver sends one prompt, waits for native idle and exits; it does not
wait interactively for a later plan choice. A headless continuation is another
one-shot run, so an old `/workflow choose` is not a shortcut past rediscovery
and newly presented options. This command provides reachable resume authority,
not complete cold restoration of an in-flight multi-turn workflow.

Typing `/workflow resume` after a native resume has already failed is too late;
the external command supplies authority before Agent publication. Model tools,
actor fields and Session history cannot create it. New Sessions do not require a
grant. This command resumes the original task; it does not add `/workflow new`
rebinding for an old native Session identity. Completed tasks retain their
completed durable state when their Agent is retired normally.
Opening completed Session history does not reopen its task. The trusted factory
returns `{awaitingUserTask:true}` only for that resume boundary; the broker
retires the old binding without aborting it and grants no model/tool authority.
The next actual external user message creates a new task with its own original
goal. History, replayed receipts and other producer messages cannot supply it.

Controllers expose identical `toolSchemas`, `instructions`, `stage`, `complete`,
`assertReady()`, `dispatch(name,args,metadata)`, `acceptUserMessage(text)`,
`abort(reason)`, and `exportAudit()`. Dispatch metadata has real `callId`,
`agentId`, `sessionId` and broker `taskId`. Ordinary `{ok:false}` is recoverable;
exceptions, malformed results, `fatal:true` or delivery faults abort the task.

The host-only `onCard` callback appends native `plugin:workflow/card` records and
emits root `workflow/card`; this delivers actual plans and artifact paths to the
external driver. `ctx.workflowBrokerReady.status(agent)` reports binding/stage/
completion/failure; `exportAudit(agent)` is for trusted host observers only.
An idle Agent is not necessarily a completed task. A production driver must
present blocked/pending state instead of interpreting quiescence as success.

## Host-only native executor

Only the trusted factory receives `nativeExecutor`; it is never a model schema.
Its `catalog` is a detached schema list of actual builtins visible to that exact
Agent. `execute(name,args)` is callable only from the same Agent's active
guarded controller dispatch. It preserves native permissions, approvals,
filesystem sandbox, cancellation and scope. No unconditional allow is issued.

Each native operation gets a random one-use permit bound to the workflow
execution token, native scheduler token, Agent identity, current task record,
original definition, active dispatch lifetime and canonical argument hash. A
pending operation loses its permit and receives cancellation when its parent
controller dispatch ends. Modified parameters, another
Agent, another scheduler token and replay are denied. The catalog currently
supports `read`, `write`, `edit`, `bash`, `pwsh` when that builtin exists in the
Agent's original scope. On Windows the verified schemas are:

| Tool | Required arguments | Optional arguments |
|---|---|---|
| read | `file_path` | `offset` (one-based line), `limit` (lines) |
| write | `file_path`, `content` | `sandbox_permissions`, `justification` |
| edit | `file_path`, `old_string`, `new_string` | `replace_all`, `sandbox_permissions`, `justification` |
| pwsh | `description`, `command` | `timeoutMs`, `workdir`, `run_in_background`, `sandbox_permissions`, `justification` |

The returned official `ToolResult` is unmodified. For a foreground pwsh result,
process data is in `value`: `exitCode`, `signal`, `timedOut`, `aborted`, and
`stdout`/`stderr`, each `{text,truncated}`. `content` is rendered UI text, not a
stdout protocol. Process bridges must reject errors, background results,
nonzero exit, timeout, cancellation and any truncation. Native Windows sandbox
reports `enforcement: partial`; this is not an OS isolation guarantee. The
separate Bwrap provider supplies isolated method execution only when its actual
native permission chain can execute WSL. In the R25 current-owner capability
probe, that chain returned nonzero `Wsl/E_ACCESSDENIED` at `wslpath`, before
Python ran. It correctly failed closed. Configuring a Python method is not
evidence that it is available in that daily environment; no permission downgrade
or direct Windows Python fallback is enabled. A separate explicit test-only
Bwrap invocation verified staging, without covering native permission or
establishing daily availability.

The original guarded native writer can submit physical CRLF: a free official
SDK/production-controller probe wrote 34 bytes with two CRLFs and zero bare LFs,
identical to both the workflow arguments and native write arguments. Literal
backslash-r/backslash-n submitted by an actor remains literal. The optional
`workflow_write.newline` (`preserve`, `LF`, `CRLF`) declares conversion of actual
ASCII newlines through that same guarded writer; it does not unescape literal
backslashes or change BOM. The default remains byte preservation.

## Installation boundary

This is a normal DSH bundle. The official command is:

```text
dsh plugin --profile <existing-profile> add <stable-path-to-hosts/dsh-global>
```

Configure `workflow-session-broker.config.factoryModule` through the trusted
installation policy. Do not run `--from-default-profile` on a user's existing
profile: it replaces profile configuration. The tests use that flag only to
create disposable isolated profiles from official templates.

Installing this optional bundle alone does **not** implement mandatory global
activation. Removing the whole bundle also removes its injected dependency
patches. A production root-owned home/launcher policy must independently keep
the broker row and Installed/Ready dependencies mandatory for every profile,
including future profiles. It must verify policy before starting any driver
and fail on package removal. Native source/config owners can always run another
uncontrolled installation; the plugin does not provide an OS owner boundary.
Do not use a process-wide `NODE_OPTIONS` injection.

`requiredSessionPolicy({entries,factoryModule,brokerModule?})` from `policy.mjs`
generates that launcher-owned final patch list. Supply the official fully
composed entries, including prior profile/home/CLI layers. It retains existing
dependency injections, disables the optional broker row, and independently
inserts `required-workflow-session-broker` from the stable absolute module path.
Serialize the result as JSON (also valid YAML) outside the removable bundle and
append its file to `runProfile.patchFiles` **last**. Replaced required rows,
duplicate or missing native service rows fail closed. Real Loader tests remove
the optional bundle before booting this policy; it still works. A missing
required module then refuses startup before model or tool execution.

At native `agent/turn-stopping`, before `turn/end`, the broker appends the
ignorable log-only `plugin:workflow/status` record and emits `workflow/status`
on the root context. Status is `complete`, `pending` or `blocked`, derived from
the controller, with `complete`, `stage`, `failed` and `blockedReason`. It never
reclassifies a task from model prose. SDK session events and Web follow events
carry this record. A root CLI launcher must print/return the final broker status
alongside the stock driver's output: the official headless summary prints the
last assistant text and uses its native turn reason, which is not a workflow
delivery verdict. Browser status rendering still needs UI integration.

Official installed templates are `web`, `headless`, `sdk`, `sdk-minimal`, `acp`.
There is no shipped `tui` template in the verified runtime. Third-party TUIs
must connect to a verified standard SDK/ACP driver before being covered.
The minimal SDK uses a persistent pwsh PTY returning a combined string, without
the standard foreground exit/truncation envelope. Its exact byte-read path is
explicitly blocked; the default native writer also stays absent. The adapter
does not parse terminal text into invented process evidence or enable tools.

## Owner entry

The normal command runs the verified Node 24 executable and `launcher.mjs`:

```text
launcher.mjs headless "Inspect this project"
launcher.mjs web --port 0
launcher.mjs sdk
launcher.mjs acp
launcher.mjs --profile existing-custom-profile <app arguments>
```

It obtains the fixed owner file from `os.userInfo().homedir` plus
`.agent-workflow/global/owner-config.dsh.json`. HOME, USERPROFILE,
DSH_HOME, CLI `--config`, `--patch` and factory overrides cannot replace that
authority. `runOwnerCli({ownerConfigPath,argv})` is a separate trusted program
interface for isolated tests/installers. No global NODE_OPTIONS is used.
This home-relative root avoids MSIX AppData virtualization; existing SDK paths
in owner config are canonical physical paths and are not moved or copied.

Owner fields are absolute `runtimeRoot`, `nodeExecutable`, `home`, `stateRoot`,
`factoryModule`, `controllerConfigFile`, `integrityVerifierModule` and its pinned
`integrityVerifierSha256`; optional `overlays` are owner-controlled absolute
patch files. The `integrity` policy is consumed by
`hosts/security/installation-verifier.mjs`, with its pinned release manifest,
private dependency key/seal store and observed installation records. The
controller JSON contains `stateRoot`, `installedRoots`, `external` and
`privateRoots`, including the global root, runtime, home and owner configuration.

The launcher initially imports builtins only. It verifies the pinned manifest
and the verifier's complete local static import closure before importing it,
rejecting third-party bootstrap imports. Full source and dependency verification
then precedes importing policy/runtime helpers or spawning official DSH. A
missing verifier or failed seal refuses startup. It composes existing profile,
home and owner overlays and appends the independent mandatory overlay last.
Existing profile/home/manifest bytes are preserved in native tests. Web always
gets `--no-open`; stdout stays untouched for SDK/ACP protocol frames, while
actual host cards/status use a private JSONL sink and a separate stderr stream.

Headless native exit zero with an incomplete controller becomes owner exit two
and a pending/blocked workflow_outcome. Long-lived SDK/ACP server shutdown is
reported separately from the business state of each session. A no_increment
learning decision does not claim an automatically updated runtime Skill.

## Verification

Run with an existing external official runtime; no dependency copying or
network/model call is needed:

```powershell
$env:DSH_RUNTIME_ROOT = '<existing-runtime-directory>'
& '<node-24-path>/node.exe' --test hosts/dsh-global/broker.test.mjs
```

The suite uses actual CLI plugin installation and profile Loader in disposable
directories. Generic workspaces are outside the protected source payload under
the temporary `dsh-global-native-boundary` directory; `.runtime-tests/` retains
location pointers and reports. It proves native workspace writes, read-only
denial, pre-execute denial, real approval-service rejection, native process
result shape, one-use permit attacks, multiple Agents/tasks/resume, unbound and
agentless denial, plugin disposal, missing bootstrap startup refusal, pruning
fail-closed, the official CLI headless driver, production SDK session API and
production Web SessionController over an actual isolated Web profile.

The native launcher tests additionally exercise SDK JSON-RPC and ACP stdio
wire, ordinary CLI separate tasks/cold resume, and Web launch-token exchange,
cookie authentication and HTTP document delivery. They use the production
generic factory and exact native I/O. Browser rendering, WebSocket interaction,
settings UI/reconfiguration and full human question UI remain unverified.
A late-question test covers native message admission only. A prepared real-model
probe is separate and must be explicitly run; scripted tests do not count as
real model validation.

Repeated `runProfile` within one test process triggers upstream process-listener
warnings after ten roots. All disposable contexts and child processes are
closed; this warning is retained in the evidence rather than hidden by raising
the listener limit.

### 中文项目目录与外部技能

DSH 与 Codex 共用项目发现能力：实际绑定目录通过 `workflow_read_workspace` 的根目录/子目录分页发现，再读取真实文件。DSH 的枚举和内容读取都经过原生权限服务；缺失、拒绝或截断时不降级到直接文件读取。目录结果使用 ASCII JSON 转义，避免受限 PowerShell/旧代码页把中文路径变成乱码。

生产对话必须先实际检索当前任务的技能，才可读取普通项目文件。先核本地，存在能力缺口则继续外部公开目录/GitHub；正文、配套文件、许可证及安装读回仍分别核验。搜过本地、拿到下载文件或读过旧快照都不能代替这条路径。这个独立 DSH 入口不会自动改造 QQ 机器人或其他既有 Harness 的入口。

仅 ctime 变化时，经同一原生权限服务完整重读同一页，并要求名称、总数、对象身份、mtime 及第二次状态稳定；名称变化、对象替换、mtime 变化或重复不稳定仍拒绝。此分支不放宽作用域，也不使用直接文件读取降级。
