# Codex desktop normal controls implementation plan

> Execute inline with test-first changes; use a fresh final reviewer. The user has already instructed continuous repair and real-project verification.

Goal: Windows initialization, project registration and real-project reads work through the guarded desktop.

Architecture: separate bounded human desktop controls from actor workflow tools. Native config transactions may alter only approved sandbox mode and canonical project trust sections, with authenticated persistence and complete byte checks. Native setup completion triggers an actual backend restart. Existing workflow and private-path boundaries remain active.

Spec: `docs/superpowers/specs/2026-10-26-codex-desktop-normal-functions-design.md`.

Global constraints: fixed existing runtime and app, no game edits, no broad config/RPC allowance, no fabricated setup or readiness. Any OS administrator prompt is handled by the user. Keep earlier failures and source identities.

Review focus: config tampering during async setup; frontend disconnect and concurrent setup; opaque native config versions; path aliases/private files; project/thread membership and restart persistence.

- [x] Capture actual startup/setup failures and pinned protocol evidence.
- [x] Add gateway regressions for setup completion/restart, narrow config writes, project creation/selection, real file reads and hostile neighbors; run RED before implementation.
- [x] Implement authenticated strict-config extensions and native backend control transactions; verify real native config-only behavior and negative changes.
- [x] Implement exact desktop routes and workspace/project/read boundaries; preserve original actor tool restrictions.
- [x] Run targeted and whole affected suites, including actual native protocol cases; resolve all failures.
- [x] Review the source independently, then stage a new immutable local release, update the fixed launcher and run actual UI setup/project access against the existing game directory. Preserve the original entry and game bytes.
- [ ] Maintain both Skill variants with demonstrated usability-verification lessons, verify installation, publish corrected scope/evidence and synchronize authorized GitHub source.

Ledger:

- Baseline c727afe: user UI setupStart rejected; normal plugin inventory repeatedly rejected; target directory exists and independent native directory/file reads succeed. Schema and config-only probes are not GUI acceptance.
- R33: actual native Windows provisioning, folder picker/trust/project creation and real model reads succeeded. A subsequent real cold continuation failed: ordinary idle close had persisted the pending envelope as `failed=Gateway stopped`. History display and ready were insufficient.
- R34: red/green actual-factory lifecycle regression plus fatal/active neighbors; independent review 3/3. Full suite retained one obsolete pending-idle-abort assertion, updated to require fresh current-file verification and early-write refusal.
- R35: 442/442 local global, 34/34 package, 31/31 policy. Actual same-session recovery exposed queue/list hydration refusal, which prevented clearing the local failed draft. This was not called desktop completion.
- R36: bounded owned queue/list only; queue writes/execution remain denied. Red/green boundary test and independent 1/1 read-only review. Exact immutable source: 443/443 global, 34/34 package, 31/31 policy, zero skips. Both installed Skill variants match current frozen bytes.
- Actual R36 acceptance: the original affected native conversation was recovered through the existing external `/workflow new` path, read both current files, exited normally without changing its signed pending state to failure, reopened through the actual desktop shortcut, then performed another genuine model/tool turn reading both files to EOF. Independent per-chunk byte/hash comparison passed; original project and private entry preserved. The nested read-only task remains discovery/complete=false, as required.
- Detailed public scope and retained failures: `evidence/global-entry-r36-20261026/README.md`. GitHub publication remains the final delivery step.
