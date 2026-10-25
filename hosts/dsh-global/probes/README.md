# Real-model probe (prepare only until explicitly run)

This is a genuine official DeepSeek provider test through the production owner
launcher and conversation factory. It contains no scripted LLM or computed JSON
oracle. Preparation creates a private, new profile and fixture workspace; it
does not request a model or fetch the references. It requires a valid installed
owner configuration with release manifest and authenticated dependency seal.

```text
node24 real-model.mjs --owner-config <trusted-base-owner-config>
node24 real-model.mjs --dry-run <dry-candidate/probe-plan.json>
node24 real-model.mjs --owner-config <trusted-base-owner-config> --verified-dry-run <dry-candidate/dry-run-report.json>
node24 real-model.mjs --run <new-paid-candidate/probe-plan.json>
```

Only the final command is a paid-run action. It is not run by installation or
preflight. The free dry-run captures the first actual native AgentLoop request,
checks its process-local identity, exact 15 tool names, official provider/model
and actual positive `maxTokens == 100000` for the default authorized plan, then cancels before calling next() or
the provider stream. The raw SDK initialize maxTokens option is supported by the
verified SDK and is forwarded into native AgentOptions; the dry-run still must
prove the final request. Missing/oversized tokens refuse generation instead of
relaxing the budget or modifying the original request/body.

Cancellation deliberately fails that dry session's trusted envelope. The third
command therefore prepares a completely new home/state/plan, bound to a matching
dry-run-pass and unchanged source/budget/tool facts. A dry candidate cannot be
used for paid execution. Each plan is single-use; failed runs are retained and
not silently resumed. Authentication stays in the existing `DEEPSEEK_API_KEY`
environment; the test never prints or writes its value.

The private profile derives from official headless defaults, disables its
one-shot runner and adds the official SDK application. A one-shot headless
process exits when it asks for the selection; cold resume deliberately loses
old inspection facts. The native SDK's continuing process provides the actual
external user-turn channel for selecting and reviewing without weakening
restoration. Normal headless startup is tested separately.

The model must inspect a real BOM/CRLF announcement input, read/adopt/install a
clearly identified local test Skill and its full MIT license, acquire/read/
confirm/observe two actual primary RFC text sources, present 3–5 source-backed
plans with exact artifact paths, write and structurally validate a new bilingual
draft, then finish all seven host stages after external feedback. It first
attempts a deliberately premature write which must be rejected.

The stdio decoder preserves Chinese and emoji split across Buffer chunks using
StringDecoder. The trusted test driver chooses only after receiving a genuine host options
card. It accepts only after independently checking current artifact bytes,
UTF-8 validity, factual fields independently in Chinese and English, a coherent
independent English notice (brief, natural imperative or structured table),
encoding explanation in the artifact or actual visible assistant text in the
current real revision through the draft turn's terminal, and unchanged
original bytes. These inputs are explicitly recorded as **test external driver
feedback, not real human editorial or design approval**. The model cannot call
the controller's accept method or manufacture this native user source.

Neither the observation log nor model trace serializes provider configuration,
authorization headers or environment. The observer records each actual native model request, exact model-visible
messages, tool-name list, returned stream chunks, stage cards/status, and
host-only controller audits into private files. The complete RFC-inspection task
defaults to 128 requests, 100000 output tokens per response, 96 MiB cumulative input
JSON bytes, 2 MiB JSON bytes per request and a 20-minute prompt deadline. These
are explicit runaway guards, not a target to consume; the evidence log has a
512 MiB guard to accommodate the complete trace. A completed chain stops
immediately. JSON size includes message metadata and repeated context and is
not a provider token count or charge. Actual provider usage separately records
cache-miss input, cache-hit input, cache writes, output and maximum input context.
Source hashes before/after must match. There is no automatic
retry after a failed run. A no_increment learning decision is explicitly not an
automatically modified runtime Skill.

The 100000 cap is the user's explicit per-response limit, not an aggregate
task-token budget. The [official Chat Completions contract](https://api-docs.deepseek.com/api/create-chat-completion/)
permits 1–393216 max_tokens and documents a 64K thinking default; the sealed
SDK's maxTokens schema has a positive-integer minimum and no 8K maximum. The
probe uses the user's 100000 value and binds the actual first free request,
fresh paid plan and dry witness to the same value. It does not silently lower
the cap to 4096, 8192 or 64K.

The bounded bilingual fixture validator has no word-count minimum and requires
no language heading. It accepts a concise parallel brief, complete imperative
or fact table, while requiring event, date, time, venue, deadline and contact in
each language. Scattered English words inside Chinese cannot borrow the Chinese
facts, and visible replacement/known mojibake text is rejected. This fixture
check is regression-calibrated against valid concise examples and missing-field
counterexamples; it is not general editorial or linguistic human approval.

Each prompt is bound to its native durable `messageId`, the matching external
`user/message`, its actual `turn/start` and that turn's `turn/end`. The driver
also awaits native descendant quiescence, then consumes only the same turn's
host status. It uses no fixed flush delay or previous turn's status. Native
aborted/error terminals retain their exact reason in the report; budget refusal
records the failing counter, current measurements and limits before calling the
provider. A slow scripted transport regression deliberately emits an old idle
terminal and delays the next user admission beyond the old 150 ms heuristic.

The immutable R04 attempt made 22 real provider requests and reached draft after
external selection. Request 23 was refused by its former 2,000,000 cumulative
JSON-byte guard, so it did not call the provider and did not complete the chain.
Its `session/wait` correctly followed that aborted second turn. The original
generic “no reviewable draft” report and all raw evidence remain preserved;
the next complete real-model verification is pending.

The immutable R05 attempt made 20 real provider streams and normally reached
feedback. Its explanation was present in the current assistant text, which the
old artifact-only note check wrongly rejected. It also had a genuine difference:
the chosen option promised CRLF, but both original native workflow_write content
and the actual file had LF (318 bytes, zero CRLF, three LF). There is no evidence
of host normalization. That attempt remains failed and is never rewritten as a
pass.

The revised independent grader counts actual UTF-8 bytes, BOM and line endings,
checks the original selected format commitment, and collects only actual emitted
native assistant/message text after the latest trusted scope checkpoint through
the current draft turn's terminal. Current-revision explanations may precede the
write or come in an earlier actual turn. Reasoning, stream fragments, previous
revisions, future turns and replayed history cannot supply the note.
It does not require the explanation to be inserted into the announcement.
CRLF/LF commitments are recognized independently of UTF-8 order or sentence
placement; contradictory/ambiguous alternatives fail instead of becoming an
unrestricted null format. Clauses about unchanged original input do not impose
its line endings on the new output.
Correctable draft differences send precise external test-driver feedback through
the same live native session. Production corrections reopen scope and invalidate
old source/installation/validation facts; the model must redo those actions,
present new actual options for the same artifact and receive another actual
driver choice. At most two complete revisions are allowed. Each draft retains
raw bytes, hashes, measurements, native write-argument evidence, visible text,
checks and exact feedback before acceptance. Changed original input is fatal and
never accepted. Completion requires the final revision's ordered seven host
stage cards and unchanged reviewed bytes after actual /workflow accept.

The local scripted correction regression uses one real core controller, actual
source reads and one-use confirmation receipts, production scope reopening and
structural validation. It proves the grader/feedback business path; it does not
claim a new native-scheduler or paid-model test. Full real-model rerun is pending.

The preserved R06 attempt made 44 provider streams. The last adapter usage
reported exactly 4096 output tokens and native turn 4 ended with max-tokens at
the real feedback stage. No budget guard refused it. Its 281-byte first draft
was a valid bilingual labeled-field notice with fullwidth colons, RSVP and a
shared email; sentence-only/duplicated-email assumptions were erroneous. That
layout, the actual 3–5-option styles, unlabelled keyword counterexamples and
missing-field cases now calibrate the fixture. Its actual LF still fails a
selected CRLF promise. Its later file had literal backslash-r/backslash-n text,
which is distinguished from physical 0D/0A bytes and remains rejected.

Native max-tokens is recorded as truncation, not fatal abortion or completion.
Actual selection/feedback cards and current independently checked artifacts
remain usable. Discovery/draft/unfinished acceptance can continue with a real
same-session /workflow status turn, which preserves the existing scope. The
task explicitly requests continued current work on that progress turn. At most
four such continuations are allowed; genuine aborted/error turns still stop.
The real-controller regression starts with discovery truncation, verifies a
scope-preserving progress turn, then handles a truncated feedback draft through
real correction/reinspection/reselection and acceptance. No truncated prose
can substitute for actual stage cards, current artifact checks or acceptance.
