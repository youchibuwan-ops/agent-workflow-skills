# Native DSH session broker

This package is the DSH boundary adapter for ordinary conversations. It uses
the installed official DSH 0.2.1-rc.2 Loader, AgentLoop, inbox, tool scheduler,
LLM middleware and permission services. Node >=24.9 is required. It does not
contain another DSH runtime or a model provider, and reads no API key.

Tests include controller doubles and the production conversation factory,
actual project byte I/O, separate sessions, continuations and cold restoration.
LLM providers in these regressions are explicitly scripted; the new generic
entry has not yet passed a real model run. Installation must pin and deploy the
owner launcher before claiming that a user's daily entry has changed.

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
separate Bwrap provider supplies stronger isolated method execution.

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
