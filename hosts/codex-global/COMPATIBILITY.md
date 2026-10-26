# Installed desktop / native compatibility

Target: installed desktop 26.1021.3705.0, native `codex-cli 0.164.0-alpha.11.1`. The owner may install a separate controlled local entry and private profile. This inventory records compatibility, not current-release model or UI acceptance. The stock entry and original history remain separate.

| Entry | Exact observed behavior | Gateway treatment |
| --- | --- | --- |
| Ordinary local | `CODEX_APP_SERVER_WS_URL` precedes configured websocket URL; failed WS has no local CLI retry | Opaque loopback WS endpoint, one private native backend |
| Durable / cloud | Main transport factory uses durable host's `websocket_url`; some reads bypass WS via HTTP | Must block before transport factory; local environment override does not cover it |
| SSH websocket | Factory chooses SSH branch before local WS | Must block before branch |
| WSL | Factory selects distro-backed CLI before local WS | Must block before branch |
| Remote control | Factory selects separate transport before local WS | Must block before branch |
| initialize | Current native accepts desktop initialization without initialized notification | Initialize native once; multiplex clients |
| getAuthStatus / configRequirements/read | Actual native probe succeeds | Exact read argument whitelist; tokens never audited |
| account/read, collaborationMode/list, experimentalFeature/list, permissionProfile/list | Actual native probe succeeds | Sanitize parameters and private runtime config |
| turn/addUserMessage / thread/startAeon | Exact native reports unknown variant | Explicit unsupported error; do not pretend cloud semantics exist |
| thread/resume | Extra dynamicTools silently ineffective | Lazy private metadata migration before first load |
| thread/fork / history injection / queue / realtime / raw FS / shell | No safe complete admission implementation yet | Denied |
| Multiple workspaces / concurrent threads | Previous preview fixed one workspace | Per-thread workspace and controller in new gateway; private root disjoint |
| Background Electron startup | Actual main includes showInactive branches even with background env | Not considered hidden; do not launch current desktop automatically |

## Exact native evidence

Private `.evidence/native-resume-r08-no-ack/result.json` and raw request/RPC logs establish native behavior, not desktop UI acceptance. No paid provider or credentials were used. Baseline sees `legacy_write`; migrated model catalog sees only `workflow_status`. Seven forced raw/legacy calls are unsupported. Old paginated turn and historical call are retained, original controlled seed bytes unchanged, markers absent. Failed r01-r04 are retained.

Private migration must replace selected `thread_dynamic_tools`, `session_meta.dynamic_tools`, and obsolete historical `additional_tools.tools`; it must update byte offsets in selected thread history projection. Never point a private native thread at the original rollout. Never clone the full user history. No model request is made by native resume alone in this probe.

Official exact source: [Codex 0.164.0-alpha.11.1](https://github.com/openai/codex/tree/rust-v0.164.0-alpha.11.1/codex-rs), Apache-2.0. Local first-party app bundle was inspected without redistributing its source. Main bundle SHA256 `2327d031e32c8d80c0dbf9bd81144466a90f8e49d3bc64e6604c23fbab900d7f`, client bundle `a42052ee3309565865f2d20fc45dee297935cbb50d1fc1a404b90c18d824b93c`.

## Read-only route inventory (2026-10-25)

Original `.codex-global-state.json`: 73 cached thread-project memberships point to local; a separate durable sidebar cache contains 13 threads; cloud access is `enabled_needs_setup`. Both environment catalogs are empty. No websocket/SSH/distro transport descriptors were found recursively in this state file; this is not proof that remote routes cannot later be configured. A connection-before guard must classify every host descriptor at the main transport factory, allow only the authenticated local gateway, and throw for durable/SSH/WSL/remote-control/unknown before process, socket, or HTTP creation. Startup must reject an unrecognized app bundle hash. Environment override alone cannot fulfill all-route control.

## Installation acceptance boundary

The native gateway and selected-thread migration have actual native deterministic-provider tests, including multi-client concurrency, selected legacy import, restart and the production conversation controller's early-write rejection. A separate native launcher pins owner configuration, source, Node and the complete private desktop tree. The true `package.main` bootstrap binds the private profile and process AppID before vendor JavaScript; actual shortcut metadata carries the matching relaunch identity. This installed Owl build has no `BrowserWindow.setAppDetails` or window-message hook API, so production does not depend on those methods or the historical window bridge. Direct native startup paths that precede JavaScript remain a separate boundary.

Cold start, warm activation, normal quit, actual messages and completed feedback must be recorded for the current release. A started window, fixture bridge test or protocol test cannot substitute for those observations. The current stock desktop must not be restarted or hot-switched by this work. See README.md for the owner API and explicit unsupported RPC/input scope; current acceptance belongs to the separate release record.
