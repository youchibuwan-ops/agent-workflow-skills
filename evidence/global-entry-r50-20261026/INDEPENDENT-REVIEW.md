# Final host-contract review — 2026-10-26

Verdict: **With fixes**. Two P2 contract violations are independently reproduced in the current readonly reply classification. No write authorization or `complete=true` bypass was found. The remainder of the reviewed change has no additional must-fix finding within the tested boundaries.

## Identity and scope

- Checkout HEAD/base: `02e19dabd37097e323ee2ecc56dde90b064a0542`; reviewed its current diff and the new workspace-directory, workspace-root, workspace-discovery tests and external-discovery integration test.
- Frozen R48 manifest SHA-256 independently read: `164fc34e24e878b01e7fd35c340c3f2ada3d0cd580b7b21515387a4963e2d4a0`.
- Eight central current source files match the R48 manifest; see `source-identity.json`. The 15-tool schema source has no diff from HEAD.
- Read-only review. Only this evidence directory was written. Tests ran against byte-identical source copies here with TEMP/TMP redirected here, because the production factory correctly refuses project fixtures inside its own source root. No original source, index, branch, installed release, owners, UI, game, robot or unrelated packaging file was changed.

## Strengths

- Directory context and navigation use the existing schema, preserving persisted tool identity. Current root-object binding prevents silent task rebinding; directory and file calls fail closed after root removal/replacement.
- Native enumeration remains on the original permission route and validates bounded page shape, Unicode transport and identity. No direct filesystem fallback is introduced for native denial/missing enumeration. The ctime exception requires a second identical authorized page and stable subsequent metadata.
- The real current-revision Skill search precedes ordinary production file reads. Existing complete-source receipt, adoption, installation, selection, validation and external-acceptance gates remain in place.
- Daily broker settings are passed through unchanged. Private monitor enforcement remains per response and separately accounts for request/JSON-byte runaway controls.
- Readonly replies retain `complete=false`; even the two erroneous pending classifications below did not unlock `workflow_write`.

## Must-fix findings

### P2 — Cold restore resurrects readonly reply permission after a real mutation request

Location: `hosts/conversation/controller-factory.mjs:68–69` (related restoration at line 55 and correction persistence at line 83).

The envelope stores a concatenated scope string, but not the latest external readonly intent. A fresh factory recomputes `readonlyDiagnostic(message)` against that entire string. When the initial scope starts readonly, its prefix and prohibition still match after a subsequent real mutation request has revoked readonly permission.

Exact reproduction, run with `node --test readonly-boundaries.test.mjs` in this directory:

1. Start with `只读检查当前项目，不要修改文件。`.
2. Perform real local Skill search and read a current file: pending, as intended.
3. Accept actual external `现在修改项目中的实际逻辑。` and obtain fresh search/read evidence: blocked, as intended.
4. Create a fresh factory with the same private state/session and `kind:'resume'`.
5. Perform fresh local Skill search and current file read again: **pending**, while restored instructions still include the mutation request. Expected blocked.

This makes the native completion path report a normal reply after production scope has replaced the readonly task. The production workflow remains incomplete; this is a presentation/authority classification defect, not a write-stage bypass.

Suggested fix: persist the latest external readonly intent in the signed envelope and restore that explicit current intent. Missing/legacy intent must fail closed. Continue requiring new search and file evidence after restoration. Test both readonly→mutation and mutation→readonly corrections, plus legacy envelopes and progress-only queries.

### P2 — The broad Chinese prefix accepts quoted actor wording as readonly authority

Location: `hosts/conversation/controller-factory.mjs:15`.

The `这是[^。！？\n]{0,100}只读...` branch matches inside attributed/quoted text. The prohibition expression also scans quoted content without distinguishing it from the actual user's current instruction.

Exact external input:

> 这是模型建议的“只读检查当前项目，不要修改文件”，但我现在要求实际修改项目中的逻辑。

After a real local Skill search and current file read, `finalState` returns **pending**, expected blocked. This is distinct from the existing quote regression test, which starts with `请解释` and therefore never exercises the broad `这是...` branch. The new report reproduction exercises the actual production factory and final-state function.

Suggested fix: recognize only affirmative external readonly directives, excluding quoted/attributed content and conflicting mutation instructions. Keep an explicit positive Chinese `这是本轮只读验收...` case if required; do not treat arbitrary text between `这是` and a later readonly phrase as authority.

## Minor documentation issue

`skills/proactive-skill-discovery/references/stage-checks.md:145–146` still asks whether the daily entry applies the same ceiling as the probe. In context this invites the removed installer-wide policy and conflicts with the corrected test-only contract. Narrow it to verifying each explicitly budgeted test request, while daily defaults/user settings stay native. The current broker code itself passes that boundary check. The parent independently flagged these same lines during review.

## Verification and evidence

- `focused-tests-final.log`: **172 selected checks pass**, zero failures or skips in that selected run. Covers core workflow, directory discovery, native IO adapter, production factory and Codex policy. Three tests were deliberately excluded by name: live local HTTP availability/timeout test, actual Windows SDK ACL test, actual OS-isolated Python method test. They are not claimed as independently reproduced.
- The first source-copy test attempt produced one module-load failure because the copied core test's `runtime.mjs` import had not been copied. Retained as `focused-tests.log`; copied that unchanged import-only support module and reran. No production fix was made.
- `token-boundaries.test.mjs` / `token-boundaries.log`: **2 checks pass**. Actual broker code preserves absent, 16000, 100000 and 256000 settings without rewriting the request; actual private monitor accepts two 60000-output-token responses (120000 aggregate) and refuses a 100001 single-response request before the test next/provider stub. These are hook-level fixture checks, not actual SDK/provider calls.
- `readonly-boundaries.test.mjs` / `readonly-boundaries-red.log`: **2 expected regression assertions fail on the current source**, both `pending` instead of `blocked`.
- `repro-readonly.mjs` / `repro-readonly.log`: detailed independent state observations, including successful real search/file delivery, retained mutation scope and denied writes.
- `git diff --check`: passes. Central source/manifest hashes recorded in `source-identity.json`.

## Declined to judge / bounded limitations

- Actual DSH SDK, native permission-service/UI end-to-end behavior and paid/native model acceptance were not run, as explicitly prohibited for this review. Existing author counts are not treated as independent evidence.
- Actual GitHub/catalog network availability and live acquisition were not invoked. Reviewed the new integration test and the current installed-search→external-search→current commit/tree/blob/license/readback path statically; no claim of fresh network acceptance.
- The four unrelated untracked packaging files were left outside review and untouched as requested.
- Broad semantic understanding of arbitrary natural-language user text is not proven by these regex-based classifiers. The exact positive/negative contract cases above are within scope and are must-fix, rather than being set aside as that general limitation.

## Method and learning record

Applied installed proactive-skill-discovery scope/evidence requirements, requesting-code-review/code-reviewer.md read-only/fresh-review template, and executing-plans final-review criteria. No new dependency or external Skill was needed for the bounded source/fixture review. Selection was already fixed by the explicit review brief; draft/feedback consisted of current-source checks and independent adversarial reproductions. Delivery is this report and the runnable fixtures.

Learning: the verified failure mechanisms are re-deriving authority from accumulated history instead of persisting current external intent, and matching quoted attributed wording as authority. Kept reproducible evidence for the implementer's one fix pass. No Skill or production-file maintenance was performed because this review explicitly permits writes only in its evidence directory. The existing workflow skill already requires actual external control and cold-restoration verification; the report exposes missing implementation/test coverage rather than inventing a new general skill.

Final learning checkpoint: evidence saved, no missing review deliverable, stop at handoff to parent. This report does not approve release before the two P2 cases are corrected and the affected checks pass.
