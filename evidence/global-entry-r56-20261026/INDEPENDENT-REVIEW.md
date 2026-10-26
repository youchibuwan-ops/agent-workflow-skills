# R51 fresh-context final review

Review base: `8731f1e47fa13b3ff6a17325529ab6f8cc568583`.
Reviewed the complete current production diff in `gateway.mjs`, `desktop-controls.mjs`, `legacy-store.mjs`, the complete new `native-management.mjs`, all changed/new tests, and the R51 spec/plan. Production source was stable during the review. No source, index, branch, installation, UI, credentials, original user history, or packaging files were changed. All reviewer writes are in this directory.

## Strengths

- The common metadata router removes duplicated project/membership/queue handlers and forwards management to the actual pinned native implementation.
- History management is independent of workspace existence; the execution route retains workspace and tool-schema admission.
- Source history is copied rather than rewritten, deleted copies have signed visibility records, private rollout containment includes the Windows long-path syntax, and native persisted rows take precedence over live metadata in queries.
- The real pinned native lifecycle test covers actual pin/section/project/archive/restore/delete, restart, missing project folder, source preservation, and no legacy resurrection after successful deletion.

## Important: reject or support cross-project membership before a successful native mutation can close the gateway

Location: `hosts/codex-global/native-management.mjs:35` (metadata forwarding) and `hosts/codex-global/gateway.mjs:127` (project-update notification validation).

The new route removed the old pre-dispatch project/workspace check but the notification handler still treats a project whose roots do not contain the chat's existing cwd as a fatal integrity error. Moving a persisted chat from directory A into a native project rooted at B returns a successful `thread/metadata/update`, persists the membership, then closes the entire gateway with `Native project update changed workspace membership`. That disconnects unrelated chats and aborts their active controllers.

Reproduced both with the transport fixture and the **actual pinned native backend**, using one deterministic local SSE response to create a persisted disposable chat; no paid model and no user data. `real-cross-project-persisted.json` records a successful native result, `closed: true`, and the fatal error. The project change does not alter the chat's cwd.

Fix the invariant consistently: either support ordinary metadata movement across projects while preserving execution cwd admission, or reject an unsupported relationship before calling the mutating native method. A post-success notification must not turn an ordinary UI action into a global fatal shutdown.

## Important: share lifecycle reservations with actor admission

Location: `hosts/codex-global/native-management.mjs:32`, `:42`, and `hosts/codex-global/gateway.mjs:98`–`:107`.

The active/admitting check is performed once before the native lifecycle RPC. `pending` excludes only another metadata request; the turn admission route never consults it. A second frontend can start a turn while the first frontend's archive operation is pending. Both calls succeed, and the archive completes while the turn is still active, even though an already-active turn would have been refused by line 32.

Deterministic reproduction uses a disposable copy of the existing transport fixture with a 300 ms archive delay and a held controlled tool result. In `review-probes.json`, archive native dispatch is event index 5, turn admission is index 6, archive completion is index 8, and `archivedWhileTurnUnfinished` is true. Both native RPC responses succeed; the gateway reports no failure. This is a host reservation defect demonstrated independently of native timing.

Reserve conflicting thread history changes and actor admissions through one shared per-thread boundary, including the full async interval. Preserve allowed harmless metadata, such as naming during work.

## Important: recover deletion intent interrupted before native deletion

Location: `hosts/codex-global/native-management.mjs:18`–`:19`, `:32`, and `:42`–`:50`.

`markDeleted` writes a final persistent `deleted:true` record before the native deletion runs. It is undone only by an in-process catch. If the owner crashes or is killed after that write but before native deletion completes, the next owner treats the chat as permanently deleted even when its private SQLite row and rollout still exist. Read/resume are denied, the list hides it, and a retry of delete returns `{}` immediately without contacting native code. No automatic recovery path exists.

`review-probes.mjs` starts deletion in a child owner, holds the native RPC before any deletion side effect, kills that owner, then constructs a fresh manager. `review-probes.json` records `isDeleted:true`, `privateRowStillExists:true`, `privateRolloutStillExists:true`, and read failing with `Deleted native thread cannot be reopened`.

Persist a distinguishable pending intent and reconcile it against native state on recovery, or use another recoverable protocol that keeps failed/interrupted deletions accessible while retaining committed tombstones for real deletions and their legacy copies.

## Verification and limits

- Independently ran the five-file focused command against current source, including actual pinned native backend: **46/46 pass; zero skipped**, 4.78 s. Full output: `focused-tests.log`; actual native evidence: `reviewer-real-native.json`.
- Ran `git diff --check`: clean.
- The three boundary probes are in `review-probes.mjs` / `review-probes.json`; the actual native cross-project reproduction is in `real-cross-project.mjs` / `real-cross-project-persisted.json`.
- The initial no-turn native cross-project probe was inconclusive because native metadata update requires a persisted rollout; its original error is retained in `real-cross-project.json`. The persisted native probe supplies the conclusive reproduction.
- Inspected source-history preservation, signed tombstone tamper handling, cascade outside-path refusal, foreign identities, sanitized history read/resume, missing workspace behavior, authoritative query state, notifications, actor controls, and existing Windows/config controls. The regression suite passes on these covered inputs; the findings above add their missing adjacent cases.
- Did not activate or publish the frozen candidate, use the desktop UI, inspect credentials, change installed owner state, or touch the four unrelated untracked `packaging/*` files. Broader installed/UI/package acceptance belongs to the parent's authorized final verification.

## Declined to judge

None. Explicitly excluded installation/UI/publishing actions are listed as coverage limits, not silent behavioral assumptions.

## Assessment

**Ready to activate/merge: No — one fix pass should address the three Important findings.** There are no additional Critical or Minor findings.

## Skill handling

Applied installed proactive-skill-discovery, requesting-code-review, and the final-review contract in executing-plans; inspected their relevant files and MIT license. No new dependency or external capability was needed. The reproducible failure evidence is retained here. Skill/source maintenance was not performed because the task explicitly permits writes only in this review directory; the parent can incorporate validated lessons within its authorized maintenance scope after the fix pass.
