# Controlled local desktop gateway

This module is the ordinary local transport implementation. Installing a private desktop entry and accepting its UI remain separate owner actions. The stock desktop, global environment and original history are unchanged by this module.

## Fixed owner launcher

`node hosts/codex-global/launch.mjs prepare` checks the fixed OS-user owner configuration, source/dependency integrity, private PE, ASAR header/main URL, and the complete owner-pinned desktop tree without creating native state or launching a backend/window. `start` performs those checks, then owns one gateway and one private desktop lifecycle. Its only CLI commands are prepare/start; it accepts no config, home, transport or native-capability override. The owner file is OS `userInfo().homedir` plus `.agent-workflow/global/owner-config.codex.json`, outside MSIX-virtualized AppData. Existing SDK/app files may stay in their original location when owner config pins canonical physical paths and protects both private roots. See owner-config.example.json for fields; placeholders must be filled by the trusted installer, reading the private route without printing its token. The private tree pin is tied to the observed owner build, not arbitrary first trust in an existing directory.

The protected bootstrap must clear NODE_OPTIONS/NODE_PATH before invoking the fixed portable Node executable. JS cannot undo a preload that ran before it. Launcher child environments do not inherit those variables or the existing desktop bridge/WS settings. The normal launcher neither sets nor inherits CODEX_ELECTRON_START_IN_BACKGROUND; the user needs an accessible desktop window. Its GUI spawn uses `windowsHide:false` and a private `gateway.stateRoot/desktop-work` cwd, created only after complete source/dependency/private-desktop verification succeeds. The whole state root remains protected from model tools. Backend startup is unchanged. A live process or an emitted metadata request is not a successful response or desktop-message acceptance; those require separate current observations.

Earlier diagnostic launches exposed startup failures and additional runtime directories; their failed reports and original pins remain historical evidence. Production never silently reseals additions after a run. The fixed native GUI entry in `packaging/native-entry.mjs` clears preload/routing overrides and obtains standard OS paths independently of the parent environment. Process AppID and matching shortcut metadata replace unsupported per-window APIs. Original vendor files remain separate from the sealed private build. The current release must independently verify the actual desktop launch, message and feedback flow.

## Owner API

```js
// Owner bootstrap verifies distribution and dependency seals before this import.
const {createDesktopGateway} = await import('./gateway.mjs');
const gateway = await createDesktopGateway({
  controllerFactory,  // createConversationFactory(trustedOwnerConfiguration)
  toolSchemas,       // current conversation/core export
  backendCommand: [absoluteVerifiedNativeExecutable],
  strictCatalog,     // restrictCatalog of the installed model catalog
  dependencyRoot,    // sealed external install root containing package.json/node_modules
  stateRoot,         // private native state; disjoint from workspaces and legacy home
  legacyCodexHome,   // optional original history, opened read-only
  authPath,          // optional existing auth outside stateRoot; temporary copy only
  workspaceResolver: async ({cwd, threadId}) => approvedAbsoluteWorkspace,
  port, tokenPath,   // owner-stable opaque loopback URL for a private desktop build
  onCard, onAudit, onStderr
});
// gateway.url contains a private route token; do not print it in public logs.
// await gateway.close() shuts native down and removes its temporary auth copy.
```

Factory input is `{workspace,userMessage,sessionId,threadId,taskId,stateRoot,previousController,kind:'auto',onCard}`. Only actual `turn/start` text creates or continues a task. Listing/reading/resuming native history never invents a user message. If the factory returns the previous controller, the gateway calls `acceptUserMessage` exactly once. The factory owns signed-envelope restoration and starts fresh source facts. Every model turn requires successful `assertReady`; every tool call is dispatched only by the returned controller.

The gateway module imports built-ins only. `ws` loads inside the factory from `dependencyRoot` after owner verification. The old sibling dependency path remains a development-test fallback; production must provide `dependencyRoot`. Native startup is fixed to `codex-cli 0.164.0-alpha.11.1`, strict model metadata, empty environments and disabled native execution/Apps/MCP/hooks. Client tool/config/instruction/environment overrides are stripped; unsupported RPCs are denied. Unknown native requests, collector errors, native exit and compaction close the backend without fallback. Model tool results above 64KiB are refused rather than silently truncated; native stdout uses streaming UTF-8 decoding.

## History and limits

The thread list uses a bounded read-only metadata index of legacy plus private state, with private rows taking precedence and owner-signed pagination cursors. It does not scan/copy 12GB of rollouts. Only a selected legacy thread is copied: default 64MiB rollout, 100,000 selected history rows, disk reserve, canonical private destination, no original-path native resume. Original JSONL records are retained while obsolete tool declarations are replaced and page offsets recomputed. Native-created SessionMeta's `type:function` wrapper is normalized; any nonempty auxiliary SQLite tool declaration must agree. The exact native history schema is pinned when an empty private projection DB must be bootstrapped.

Currently denied: fork, queue/realtime, raw shell/FS/MCP execution, config writes, cloud `startAeon`/`addUserMessage`, unsupported transports, and nontext user inputs. Projects/attachments/history operations beyond the documented read whitelist are not a completed desktop compatibility layer. Large selected threads stop with an explicit budget error. Existing legacy files are never passed to the native backend as writable resume paths. Original metadata/index reads use SQLite readOnly connections.

## Verification

```powershell
node --test hosts/codex-global/entry-patch.test.mjs hosts/codex-global/gateway.test.mjs hosts/codex-global/legacy-store.test.mjs hosts/codex-global/native-backend.test.mjs hosts/codex-global/rpc-policy.test.mjs hosts/codex-global/import-boundary.test.mjs
```

The suite covers policy stripping, unknown-tool fail-close, multiple clients/workspaces, selected-row migration, source preservation, native serialization, split UTF-8, pre-verification import boundary and temporary-auth cleanup after success and post-copy failure. Counts and current-source bindings belong to the corresponding run output.

Private `.evidence/gateway-native-r10-final` proves actual installed native deterministic-provider dispatch with three clients/workspaces, selected legacy resume and preserved original history. `.evidence/native-restart-r02` proves actual native process restart of the same thread. `.evidence/conversation-native-r02-final` connects the production conversation factory and all 15 tools: real scope captured, early write rejected, six raw tools unsupported, host scope card, final incomplete discovery reported blocked. These use a local deterministic provider with no credentials or paid model. They do not prove desktop UI acceptance or a completed ordinary task. Raw requests/RPCs, failures and before/after source hashes are retained privately, excluded by `.gitignore`.

See COMPATIBILITY.md and entry-research.md for route and entry constraints. The parent owns private ASAR/PE installation and final desktop acceptance.

### 当前项目发现与技能检索

受控对话会收到实际绑定的项目目录。既有 `workflow_read_workspace` 用 `path: "."` 枚举根目录，普通目录路径枚举下一层；目录的 `offset`/`length` 是条目分页，文件仍按原来的字节范围读取。返回 `next_offset` 时继续翻页。没有增加或修改 15 个外部工具 schema，因此既有受控历史不需要迁移工具声明。根目录对象变更或重定向会关闭该任务，不会自动把权限移交到新目标。

生产对话在读取普通项目文件前，必须先真实搜索当前任务的技能；目录元数据可用于前期判断。已安装技能只是检索起点：本地缺少合适方法时，继续公开目录/GitHub 的外部检索，核读完整正文、引用资源和许可证，审查适配后引入并读回。仅有搜索结果不满足发现阶段，也不能授权写项目。暂停、选择、反馈及验证门禁继续有效。

明确要求只读且禁止修改的诊断，在本轮真实检索技能并实际读取当前项目文件后，允许本轮答复正常结束；制作工作流仍为 `discovery / complete=false`。这不签发阶段通过或写入权限。未读到文件、只是引用只读措辞、任务转为修改、实际失败或处于制作阶段时，不适用这条答复状态规则。真实进度查询保留原只读范围，不能借状态问句改变任务。
