# Historical R04 DSH native boundary verification — 2026-10-26

This retained record describes the R04 attempt and its then-current limits.
It does not set the current launcher's token limit or validate later sources.
See the [current probe method](probes/README.md) and [release-specific acceptance](../../docs/global-entry.md).

## Later R25 capability evidence (separate from historical R04)

The retained R25 paid attempt made 82 provider streams and failed its original
selected-format checks. It is not rewritten as a pass. A separate free official
SDK/production-controller probe proved that the guarded native writer preserves
physical CRLF: actual workflow/native arguments and the 34-byte file were equal,
with two CRLFs, zero bare LF and zero literal CRLF escapes. Actor arguments
containing literal backslashes instead produced the same literal bytes. This
disproves a serialization impossibility claim, without excusing the failed draft.

The proposed Python fixture was not added to any paid plan. Its native
permission route stopped at `wslpath` with `Wsl/E_ACCESSDENIED` before Python
execution. That route is **blocked**, not an available method merely because
the provider is configured. Direct Python tests and an explicitly test-only
Bwrap staging test passed their own bounded checks; neither is native-permission
acceptance or a fallback. Original input bytes and failed reports were preserved.
The R26 probe adds independent declared-newline evidence for the optional guarded
writer argument; it still requires fresh release-specific model acceptance.

## Historical R04 evidence

R04 real-model verification was attempted through the production owner launcher
and official `deepseek-official/deepseek-flash` provider. It made 22 actual paid
requests; request 23 was observed but refused before provider dispatch because
the probe's former cumulative UTF-8 JSON input guard reached 2,000,000 bytes.
This is a failed attempt, not a completed generic workflow. The model completed
full local Skill/primary-source inspection, presented four supported options,
and reached `draft` after the trusted external test driver selected one.
Actual SDK notifications show turn 2 ended with the monitor hook's abort reason
before `session/wait` returned; this run was not cut off by an old idle race.
The old probe hid that reason behind a generic missing-draft message.

The immutable evidence is under
`C:/Users/33092/AppData/Local/Temp/agent-workflow-real-model/dsh-ordinary-hN8qxi/`.
Its report, wire events and provider chunks remain unchanged. Its provider
usage totals are 42,578 cache-miss input, 422,144 cache-hit input, zero cache
writes and 9,523 output tokens; largest input context is 50,433 tokens.
JSON bytes include metadata and repeated context and are not billable tokens.
The revised complete-chain real-model acceptance is **pending**; no new paid
request was made while diagnosing or testing the corrections.

Current corrections are covered first by failing then passing local regressions:
the probe binds each durable prompt message to its actual native turn terminal,
reports exact abort/budget data, and separately sums official provider usage.
It allows 64 requests, 4096 output tokens per request, 32 MiB cumulative JSON
input, 2 MiB per request and a 20-minute prompt deadline, stopping on normal
completion. Native cancellation also now publishes the actual current turn's
pending host status and cause; a real SDK scripted cancellation and subsequent
normal turn verify recovery. Delayed old-turn notifications cannot overwrite a
newer turn. These are no-provider boundary tests, not a real-model success.

Latest command: Node 24.22.1 `--test hosts/dsh-global/*.test.mjs hosts/dsh-global/probes/*.test.mjs` with `DSH_RUNTIME_ROOT` pointing to the fresh, independently installed/sealed official 0.2.1-rc.2 SDK. **51 tests passed, zero failed/skipped, in 55.2 seconds; this regression made no paid model or provider HTTP call.** Existing upstream repeated-profile process-listener warnings remain visible. Earlier 37-test output is retained in ignored `.runtime-tests/latest-verification-fresh-sdk.txt`; earlier failed fresh-SDK evidence remains in `.runtime-tests/fresh-sdk-before-final-fixes.txt`.

The suite uses actual official CLI plugin installation, native profile Loader,
AgentLoop, tool scheduler, permission and approval services. It includes both
explicit controller doubles and the production generic conversation factory.
LLM providers are scripted, not paid models. This proves boundaries and the
tested generic flows, not arbitrary business-task completion.

Verified behaviors:

- Original native file write succeeds within workspace-write and is denied in read-only.
- A real approval-service `ask` answered `rejected` cannot be overridden by a valid host permit.
- Permits reject changed arguments, cross-Agent use, duplicate execution tokens and replay.
- A native operation awaiting permission loses authority after its parent dispatch ends.
- A separately bound owned child cannot execute a same-name scoped workflow replacement.
- Multiple native sessions and user turns get separate controllers; same-process resume rebinds through the factory.
- Unbound plugin work, raw tools and agentless LLM calls never reach their bodies.
- Late native human-question messages continue the existing task instead of minting a task.
- Missing bootstrap refuses startup; live plugin disposal closes retained tool and model references.
- An independent final launcher overlay still operates after optional bundle removal; losing its required module refuses startup.
- Native surface pruning cannot change pending controlled source bytes before the next model request.
- A pending workflow produces an authoritative host status before native turn/end while leaving model final prose intact.
- An actual SDK scripted cancellation publishes its own turn's pending stage and native cause at idle; it never reports completion or retains the previous turn's status. A subsequent ordinary SDK turn recovers, and delayed old-turn terminal notifications cannot overwrite newer state.
- Official CLI headless runner processes its first external user message with the broker already active.
- Production SDK session API and production Web SessionController route A/B/A conversations through the same policy; SDK notifications include host status.
- The Web fixture starts a real loopback server on an OS-selected port and closes it, without opening a browser.
- Production native-workspace-io reads/writes BOM, CRLF, Unicode and multiple chunks with exact byte equality. Its read-only cmdlet path reads multiple 2048-byte chunks, then original native write permission rejects the commit. Input bytes remain unchanged and no output file is created.
- Production generic factory receives actual ordinary task text, performs real local search/open and original native workspace reads, and recovers after an early-write refusal while remaining pending.
- Same-process resume creates a new live Agent/controller/native executor and actually re-reads the same input. Cold CLI resume preserves original scope and redoes current facts.
- Actual ordinary owner CLI refuses authority overrides, uses the fixed OS user home configuration, and reports native exit zero as owner exit two when workflow remains pending.
- SDK and ACP stdio wire carry real external user turns; the Web test exercises launch-token exchange, cookie authentication and HTTP document delivery without opening a browser.
- Pinned verifier dependency tampering is rejected before its top-level marker, runtime import or state creation. Loading the launcher alone executes no policy/runtime sibling module.

Retained red-to-green mechanisms:

1. Checking tools/result alone missed later native pruner rewrites. The old test reached a second provider request with changed source; the fixed test stops before that request by comparing pending bytes at the real frozen AgentLoop request.
2. A controller that forgot to await a native write could return while its permission wait was pending. The old test wrote after parent completion; the fixed permit includes the active run lifetime and its signal is cancelled when dispatch ends.
3. Native `user-question-reply` was ignored by the controller. The fixed message-boundary test calls acceptUserMessage exactly once without starting another task.
4. Initial read-only workspace-IO attempts failed before writing because PowerShell constrained language rejected .NET helper types. The first cmdlet alternative returned extended PSObject bytes and a JSON depth warning. These failures remain in the ignored fixture results. The provider's numeric cast yields valid chunk JSON and a verified full-file digest; only then does the write-denial assertion pass.
5. A hook cancellation without the native required reason string produced invalid durable turn-end data. The adapter now supplies a real reason; an actual SDK fatal/abort run records a valid terminal and blocked host state.
6. Importing another relocated LLM package from the fresh SDK produced a different request identity WeakSet. The adapter now uses the exact native Loader namespaces; it does not weaken the guard. Logical/physical runtime paths are canonicalized.
7. Pinning only the verifier entry left static local dependencies executable before manifest verification, and launcher top-level sibling imports had the same issue. Both marker attacks first reproduced, then were rejected after builtin-only bootstrap closure verification and deferred imports.

Known limits remain explicit: the new generic entry has an incomplete real-model
attempt, with final acceptance pending. Browser rendering, WebSocket UI interaction, settings reconfiguration and
full human question UI remain unverified. A stock headless
exit code is a native turn verdict, not workflow completion. Root launchers/UI
must consume the independent workflow status. There is no official `tui`
profile in this installed version. Third-party drivers are not covered merely
by sharing a package name. The minimal SDK's persistent pwsh returns a combined
string rather than exact standard process metadata; its read path correctly
blocks and its native writer stays absent. That rejection is a tested limit,
not a passed general read/write flow.

The original Windows pwsh wrapper emits two constrained-language encoding
warnings on stderr for read-only operations. These are preserved in native
results. Valid ASCII chunk JSON plus exact byte count/digest proves the read;
this does not claim that the constrained-language environment is clean.
Repeated native profile boots in one test process also retain upstream process
listener warnings; no warning limit is raised to hide them.

No user global profile, session or setting was changed. All created disposable
profiles and process evidence are under `.runtime-tests/`; all test-owned
contexts and child processes were closed. Generic workspaces now live outside
the protected payload under the temporary dsh-global-native-boundary directory;
ignored location pointers preserve their paths. No runtime dependency tree was copied.

Reusable learning belongs in the shared host integration method: verify the
final model request after all source transformations, bind native permission
leases to the awaited dispatch lifetime, keep mandatory launch policy outside
an optional plugin bundle, and distinguish native turn completion from business
completion. This agent's write ownership is restricted to hosts/dsh-global;
shared Skill maintenance is handed to the root owner rather than modifying
another agent's files.
