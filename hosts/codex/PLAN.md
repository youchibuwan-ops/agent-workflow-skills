# Codex host implementation plan

Scope: only this directory. No global settings, desktop restart, credentials, or GitHub writes.

1. RED: strict catalog and RPC ownership tests, malicious client overrides and server unknown tools.
2. GREEN: fixed runtime profile, loopback token WS to private stdio backend, dispatch exclusively through controller.
3. Verify lifecycle failure, startup failure, controlled ordinary refusals, final state classification.
4. Run current desktop engine and default real model through the shared core when available. Transport-only fixtures are labelled explicitly.

Limits: the parent owns desktop installation and the shared core. This proxy cannot prevent a human intentionally selecting an independent unguarded application.

## Verified implementation ledger

- RED: missing policy/proxy modules failed; then policy and transport tests passed.
- RED: async collector rejection escaped unawaited; now synchronous collectors are required and failure closes before forwarding.
- RED: a valid request queued after an unknown request executed; now both queues short-circuit once closing starts.
- GREEN: 18 policy/transport cases, actual supported-runtime boundary probe and actual default-model/shared-core seven-stage evaluation.
- Invalidated pre-input-tool evaluation is retained privately and excluded from success claims. Current authenticated evaluation reads physical input through the shipped tool; no expected bytes/hash/output are in the prompt.
- Learning: the two verified failure mechanisms are documented in this host boundary and tests. Skill changes are outside this subtask's owned directory; the parent owns any shared Skill maintenance.
- Parent retains desktop installation and actual desktop UI verification. This directory does not change global settings, install a desktop entry, or restart the app.

## Resumed task-client delivery

- Added a real independent CLI client using the existing WS proxy, external request/contract/runtime/catalog/login paths, explicit --run, private state, human selection/acceptance/revision input and final NDJSON audit.
- Model-free regression coverage expanded to 28 cases, including no-run defaults, input boundaries, waiting/cancellation cleanup, invalid choices and login-secret redaction.
- Added the final source-confirmation API without client-side auto-confirmation. The one authorized final authenticated evaluation invoked the actual CLI process with final frozen core/schema bytes: 20 real calls, 15 native tools, 5 actual source challenge confirmations, early write refusal, automatic 7 host cards and zero actor checkpoints, current physical JSON validation and complete delivery.
- Source/authentication integrity, cleanup and native result completeness were checked. The earlier pre-confirmation core evaluations are superseded for current delivery claims. No second paid retry was used.
- The desktop remains unchanged; this is an explicitly invoked preview CLI with declared core capabilities.
