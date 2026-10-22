# DSH Windows distribution plan

Date: 2026-10-23. Source baseline: `c1434f04704938774eb359053aaafdf38ee90868`.

## Design and authorization

Deliver two existing skills to non-programmers using official Windows DSH Desktop.
The user's detailed implementation request authorizes development, isolated tests,
branch push and a Draft PR. The user subsequently confirmed Desktop is absent and
the classmate will do the Desktop trial. No personal DSH data may be changed.

Keep `skills/` byte-for-byte unchanged. Use a PowerShell 5.1 manager and double-click
CMD launchers, a checked-in SHA-256 payload manifest, per-skill ownership receipts,
staging and rollback. No symlinks, administrator access, downloads at install time,
Node, Python or Git for students. Target explicit home, then `DSH_HOME`, then the
Windows user profile's `.dsh`; display and confirm before changes.

Alternative considered: a DSH plugin/npm bundle adds an unnecessary runtime and
configuration surface. Manual copying remains a fallback, with explicitly limited
ownership guarantees. Maintaining rewritten DSH skill bodies would create drift.

## Implementation steps

- [x] Write real Windows lifecycle tests; observe the missing manager fail.
- [x] Implement preflight, exact inventories, receipts, conflict refusal, staging,
  update rollback, safe removal, target/reparse-point guards and CMD entry points.
- [x] Run success, conflict, damaged payload/receipt, local edits, extra file,
  repeated operation, custom home, lock, reparse-point and cancellation cases.
- [x] Run the official pinned Skill Provider, registry and loader in a disposable
  home; compare both complete bodies, reference bases, slash invocation and catalog.
- [x] Produce Chinese/English Codex and DSH instructions, manual fallback, troubleshooting,
  isolated A/B fixtures, prompt pairs, blank feedback form and test matrix.
- [x] Package ZIP from the same source, extract and test it, record hashes and limits.
- [ ] Run repository checks, independent review, commit, push the new branch and
  create/attach a Draft PR. No merge, Release, submission or personal-home writes.

## Review focus

Unknown installations and flat-file/name aliases must never be overwritten. Extra
files and local changes block destructive operations. Reject junctions at every
ancestor and descendant. Validate receipt paths before using them. Preflight both
skills before any mutation and roll back a partially committed operation. A stale
lock is a diagnostic failure, not permission to bypass concurrency protection.

## Evidence boundaries

Installer lifecycle tests establish filesystem behavior. Official components establish
discovery, loading and deterministic explicit invocation without a model. Neither
establishes Desktop UI behavior, model auto-selection, reference use in a real task
or task quality. Those remain unverified until the classmate supplies real records.
The SVG body exceeds the standard tool-result pruning threshold: measure real loading
and investigate pruning, without changing official DSH or silently shortening the skill.
