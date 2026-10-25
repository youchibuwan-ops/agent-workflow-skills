# Codex workflow host

This directory implements a loopback WebSocket gateway to a private Codex app-server **0.164.0-alpha.11.1** stdio process. It is an actual execution boundary: the backend has no execution environments and its model metadata exposes only the workflow dynamic tools. The gateway owns every dynamic callback and delegates only to `controller.dispatch`.

`npm ci --prefix hosts/codex --ignore-scripts` installs the pinned MIT-licensed `ws` 8.22.0. Run `node --test hosts/codex/*.test.mjs`.

## Trusted launcher API

```js
import {launchCodexWorkflowHost} from './hosts/codex/launcher.mjs';
const service = await launchCodexWorkflowHost({
  runtimePath: '/absolute/path/to/supported/codex',
  workspace: '/absolute/business/workspace',
  stateRoot: '/absolute/private/runtime-state', // disjoint from workspace
  catalogPath: '/absolute/path/to/models_cache.json',
  endpointFile: '/absolute/private/runtime-endpoint.json',
});
// A trusted desktop launcher reads endpointFile.url and starts the desktop with
// CODEX_APP_SERVER_WS_URL=<that complete URL>, with FORCE_CLI unset.
// await service.close();
```

The shared core defaults to `../core/workflow-host.mjs`. The first genuine `turn/start` creates its controller using the actual user text. The launcher never copies credentials or modifies desktop/global settings. A trusted installer may prepare an account login in `stateRoot/state/auth.json`; manage its permissions and lifetime outside the gateway. Backend environment is isolated and desktop bridge/routing variables are removed. No model is explicitly selected; Codex's default catalog model is retained.

`createCodexProxy` accepts a trusted controller factory, static tool schemas, a backend argv array, a pre-restricted catalog object/path, workspace, stateRoot, and optional onCard/onAudit/onStderr callbacks. Its return contains `url`, `tokenPath`, `port`, `close()` and `exportAudit()`. Audit/stderr collectors must be synchronous; returning a Promise is rejected before model forwarding. Card collectors are awaited. Callback failures are fatal. The full URL is a bearer capability: keep it private. Only loopback, the exact random pathname, one client, and no browser Origin are accepted. Reconnection requires a fresh trusted host process. There is no CLI fallback.

## Enforcement

- Catalog validation requires direct mode, disabled shell, null patch and multi-agent metadata, and no experimental tools. Only workflow-prefixed dynamic schemas are accepted. Startup refuses missing controller/catalog, unsupported runtime, overlapping state/workspace roots, or escaped private paths.
- Static workflow tools replace all client dynamic tools. Thread and turn execution environments are always empty. Client instructions, tool outputs, context, runtime roots, permission settings and configuration are discarded. CLI overrides keep the strict settings above trusted workspace configuration; hooks and notify commands are disabled. Only text user input is supported initially.
- Resume, fork, steer, config writes, raw command RPC, environment mutation and unknown client methods are denied. Only threads created by this connection may run/read. Unknown backend tool requests, invalid/replayed identities, controller exceptions, integrity changes, and transport/collector failures stop the backend.
- Ordinary `{ok:false}` is a tool refusal and permits correction. `{fatal:true}` or an exception closes the channel. Dispatch is serialized. The controller is authoritative; a model cannot mint receipts or permissions.
- A native completed turn is reported `failed` with `workflow.status=blocked` if the workflow remains incomplete. Selection/feedback produce `needs_input`. Trusted cards are forwarded as `workflow/card` and attached to the next actual dynamic-tool result as `hostCards`; no persisted Codex history items are fabricated. Tool results over 64 KiB fail closed. Native output budget is fixed to 262144 tokens, asynchronous/turn-end compaction is disabled, and any compaction notification stops the workflow.

## Evidence and limits

`native-probe.mjs PRIVATE_EMPTY_DIRECTORY` runs the installed desktop runtime through this actual WebSocket proxy with a deterministic local provider and a **fixture controller**, verifies the exact tool catalog and forced raw execution rejection. It is not a real-model/core evaluation. The same probe also captures the post-context model request: a 65473-byte JSON tool result remained complete, below the enforced 65536-byte maximum. Test fixtures similarly prove transport/policy behavior only.

`real-core-probe.mjs PRIVATE_EMPTY_DIRECTORY` is an explicitly invoked authenticated evaluation. It launches the actual task-client CLI with explicit file/runtime/account flags and --run; the client temporarily copies the current login into private state, then removes it in cleanup. Override source paths with `WORKFLOW_CODEX_AUTH_PATH` and `WORKFLOW_MODEL_CATALOG`; credentials are never logged. It uses the default model, first tests a refused premature write, then requires actual `workflow_read_workspace` input delivery, source-receipt round trips, and all seven host-generated stages. The task prompt contains no input contents, expected output or precomputed hash. Native rollout output equality is checked as supporting evidence; because rollout keeps originals independently of live context truncation, it is combined with the strict size bound and the directly captured native boundary probe.

Current accepted preview: 28 model-free policy/client tests; six forced raw-tool bypasses rejected despite a hostile trusted project config; one final real default-model task through the shipped task-client CLI, with the final 15-schema core. Its 20 calls included an actually refused early write, actual input reading, five returned source challenges confirmed by the model after delivery, and independent physical artifact validation. All seven host cards were automatic, with zero model checkpoint calls. All 20 native results matched the actual completed tool JSON (largest 2318 bytes); input, source authentication and control-source hashes remained unchanged, no compaction occurred, and temporary authentication was removed. Earlier 14-schema/33-call results are historical baselines and are superseded by this final challenge-confirmed evaluation. This verifies the independent CLI entry through the real WS gateway. It does not verify a switched desktop.

The desktop's currently installed native entry accepts `CODEX_APP_SERVER_WS_URL`, including its pathname, and chooses that transport before CLI creation. This is a version-specific installed-app integration, not a public stable plugin API. The parent installer must back up settings and deliberately switch the real desktop entry; merely running this service does not guard an already-running desktop or another independently launched CLI. Disallowed legacy desktop features will receive RPC errors; no authorization is silently added for compatibility.

Primary sources: [Codex supported runtime source](https://github.com/openai/codex/tree/rust-v0.164.0-alpha.11.1), [app-server protocol](https://github.com/openai/codex/tree/rust-v0.164.0-alpha.11.1/codex-rs/app-server-protocol), [native tool configuration](https://github.com/openai/codex/blob/rust-v0.164.0-alpha.11.1/codex-rs/core/src/tools/spec_plan.rs), [context history/truncation boundary](https://github.com/openai/codex/blob/rust-v0.164.0-alpha.11.1/codex-rs/core/src/context_manager/history.rs), [output truncation implementation](https://github.com/openai/codex/blob/rust-v0.164.0-alpha.11.1/codex-rs/utils/output-truncation/src/lib.rs), [ws API](https://github.com/websockets/ws/blob/8.22.0/doc/ws.md), [ws MIT license](https://github.com/websockets/ws/blob/8.22.0/LICENSE).

## Independent task client (preview entry)

Use `task-client.mjs` for an actual guarded task without changing the desktop. Every business call still travels through the real loopback WS proxy and its private app-server. The native desktop entry remains unaccepted and is not switched by this client.

```text
node hosts/codex/task-client.mjs --workspace PROJECT --user-message-file REQUEST.txt --contract-file CONTRACT.json --runtime-path CODEX.exe --catalog-path models_cache.json --auth-path auth.json --state-root NEW_PRIVATE_DIRECTORY
```

This default command only checks local files, boundaries and catalog parsing. It does not copy authentication, start an app-server, contact a model or verify a live account. Add `--run` explicitly to execute; startup then enforces the exact supported runtime and strict catalog before any model turn. No model override is selected.

All five external files (request, contract, runtime, catalog, existing login) must be outside the actor workspace. The private state directory must be new or empty and disjoint from the workspace. Relative catalog/reference `path` fields resolve from the external contract's directory; artifact/input paths remain workspace-relative. The request and contract are read once for that run. This preview supports the core's declared capabilities and independent validators; it does not turn arbitrary tasks or unsupported method execution into validated success.

Without `--non-interactive`, a waiting task accepts actual human text in the terminal: `choose ID`, `accept`, substantive revision feedback, or `quit`. Choice IDs must come from the displayed options; acceptance is valid only at feedback. Empty/invalid choices do not start a model turn. With `--non-interactive`, waiting or blocked state exits with code 2, so automation cannot mistake it for completion. This preview does not resume a closed controller; use the same interactive process to continue a pending task.

Stdout is NDJSON (`card`, `assistant_delta`, `waiting`, `input_error`, `final_audit`). State contains `audit.json`, `proxy-audit.jsonl`, `cards.jsonl`, `rpc.jsonl`, optional human-input/waiting logs, and backend stderr. The temporary login is copied with exclusive creation into private backend state and removed on normal completion, handled failure or caught cancellation. The source login is never modified. Known login token/key values are redacted from returned, saved and terminal audit output. As with any finally-based cleanup, forced termination or power loss requires checking the private directory.

The final audit captures the task's authoritative audit before transport shutdown, then records authentication cleanup, original-login integrity and before/after hashes of the client, proxy, policy, strict configuration, core, schemas and gate. It never exposes the WS bearer URL or delegates source-receipt confirmation to the client. The model must receive and correctly echo the unpredictable receipts itself; stages advance only when the host's observed facts satisfy the gate.
