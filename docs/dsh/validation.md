# DSH preview validation and decision

Date: 2026-10-23. Skill source: `c1434f04704938774eb359053aaafdf38ee90868`.
Adapter: `0.1.0-dsh-preview.3`. Original skill payload unchanged.

**NO-GO for general distribution as accepted/reliable Desktop skills. GO only for a
clearly labeled, supervised classmate preview.** The user confirmed no Desktop is
installed locally and asked for the classmate to test it. A written trial report was
subsequently supplemented with logs, receipts, scripts, source SVGs and renders.
[Supplementary evidence review](supplement-review.md) distinguishes log-supported
installer results, independently checked artifacts and missing raw model traces.
This is not complete novice Desktop acceptance. No formal Release, merge or submission is authorized.

## Actual local results

| Layer | Discovery Skill | SVG Skill | Evidence and limit |
| --- | --- | --- | --- |
| Install, exact payload, references/license copied | PASS | PASS | Windows PowerShell 5.1 actual filesystem operations, including Unicode/spaces. |
| Repeat install, same-version update, synthetic next-version update | PASS | PASS | Next-version fixture is generated only inside the test. It is not a shipped second release. |
| Refuse unknown install, edits, extra files/directories, bad receipt paths, locks, junctions; rollback and cleanup failures; provenance and legacy receipts | PASS | PASS | [25-case lifecycle report](evidence/preview3-windows-lifecycle.json); assertions are not host tests. |
| Actual PS7 parent → CMD → Windows PowerShell launch | PASS | PASS | [Old failure](evidence/ps7-regression-red.json), [repaired six-action run](evidence/preview3-ps7-regression.json); no module-path sanitization by test for new launchers. |
| PS7 chain after actual preview.3 ZIP extraction | PASS | PASS | [ZIP regression](evidence/preview3-ps7-zip-regression.json), real launchers in a path with Unicode/spaces. |
| Actual preview.1/.2 ZIP → preview.3 Update under PS7 | PASS | PASS | Developer-only [from preview.1](evidence/preview3-from-preview1.json) / [from preview.2](evidence/preview3-from-preview2.json); disposable home, no Desktop. |
| Historical preview.1 → preview.2 real archive Update under PS7 | PASS | PASS | [Developer test](evidence/ps7-real-preview1-update.json); old package setup uses its supported clean environment, then new launchers receive the PS7-first path. Not a novice acceptance result. |
| Uninstall, repeat uninstall, unrelated config sentinel preserved | PASS | PASS | Tests never use personal DSH home. |
| Official Provider discovers `user-dsh`; model catalog lists name | PASS | PASS | [official-components.json](evidence/preview3-official-components.json), published0.2.1-rc.2 components. No Desktop UI. |
| Registry and skill tool return entire original body | PASS | PASS | Exact body comparison and terminal content included; references read via real resource base. |
| Direct `/name` injects entire body | PASS | PASS | Official pre-step event handler executed. This is deterministic injection, not a model answering a task. |
| Automatic model invocation from task description | UNVERIFIED | UNVERIFIED | No model, account or Desktop task used. |
| Unrelated prompts do not cause inappropriate model invocation | UNVERIFIED | UNVERIFIED | Only absence of deterministic slash injection tested; cannot stand in for a negative model test. |
| Full model execution/reference trace | UNVERIFIED | UNVERIFIED | Submitted preview.1 CSV/SVG artifacts independently check correctly; full tool traces are missing. This is not preview.3 execution. |
| Official Desktop UI, fresh Windows machine, novice completion | UNVERIFIED | UNVERIFIED | Development machine tests do not meet this acceptance criterion. |
| Long-context model behavior/recovery | UNVERIFIED | UNVERIFIED | Official pruner function characterized: SVG is over budget. No complete pressure-triggered model run. |

[Extracted ZIP test](evidence/preview3-zip-test.json) records the exact archive hash it tested;
later rebuilt archives have different hashes and must be tested again. CI attaches
the archive, its checksum and that run's external test report together. This avoids
pretending a report embedded in an archive can hash its own containing archive.
The historical preview.1 [GitHub commit Download ZIP test](evidence/github-source-zip-test.json) also
passed all six launcher actions after entering GitHub's extra top-level folder, using
the published code commit `eae58ea187af0c7f1965b5f2bf569232014983fa`. This was downloaded
from GitHub, not reconstructed locally. Neither ZIP exercise launches Desktop.
[Independent review](evidence/review.md) found two issues, both repaired and retested.
The original Codex package-install regression, unchanged source assembly/rendering,
Markdown lint and root npm audit also passed; these are package regressions, not
renewed Codex or DSH model acceptance.

Developer-only pinned DSH test dependencies reported **12 moderately vulnerable
packages** in npm audit, no high/critical findings on this run. They are upstream
transitive dependencies of the official0.2.1-rc.2 fixture, not included executables in
the student ZIP or student installation requirements. No official packages were patched.
See [audit summary](evidence/developer-runtime-audit.json). The root project audit found0.

## Reproduction

Developer commands (not student requirements):

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run lint
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/dsh-lifecycle.ps1 -ReportPath docs/dsh/evidence/windows-lifecycle.json
pwsh.exe -NoProfile -File tests/dsh-ps7.ps1 -ReportPath docs/dsh/evidence/ps7-regression.json
npm.cmd ci --prefix tests/dsh-runtime --ignore-scripts
node scripts/verify-dsh-runtime.mjs tests/dsh-runtime docs/dsh/evidence/official-components.json
```

The component probe uses a minimal fixed-cwd service and lightweight agent/session
fixture, plus the **real** official registry, provider, catalog/slash handlers, skill
tool and pruner. It is not a complete booted official host or live LLM. File watchers
are disabled. DSH_HOME, DSH_AGENTS_HOME and bundled roots are isolated/restored only
inside the test process; no personal configs, keys, profiles or service are used.
The component probe now uses the real CMD installer with its inherited module path
unchanged by the test harness. Preview.1 sanitized the child environment in the probe,
which masked the actual CMD launch defect; preview.2 repairs all four production CMD
entry points and adds an independent real-PS7 regression before and after ZIP extraction.

## Test-driven failures retained in history

The lifecycle test first failed because the manager did not exist. An extra-empty-folder
test then reproduced unsafe removal; inventory validation now refuses unlisted directories.
The real launcher/default-root path exposed PowerShell5.1 parameter-default evaluation
before `$PSScriptRoot` was available; defaults are now resolved in the script body.
Build-time ZIP creation initially missed the Compression assembly; both required
assemblies are now loaded explicitly. Component harness integration failures were
fixed against the real Cordis service lifecycle before any pass report was written.
The first Windows CI completed all23 assertions but failed its wrapper because a
deliberately failed subprocess left `LASTEXITCODE=1`. The test runners now exit0
explicitly only after successful assertions and cleanup; real failures still throw.
Independent review also reproduced a hidden-prefix alias bypass and a destructive
rollback after partially failed backup cleanup. New regression cases cover both.
An NTFS ACL fixture allows preflight/rename but denies removal of one old file;
the committed new pair must remain complete after the cleanup error. This changes
ACLs only on a disposable test fixture, never a real installation.

## Outstanding acceptance and limits

- Classmate official Desktop install/find/explicit/full reference/task and uninstall trial.
- Same-prompt A/B model trials for both skills, negative cases and raw evidence.
- Novice cross-version update testing of the current distribution (developer migrations are separate).
- Desktop versions other than the reviewed source and published0.2.1-rc.2 components.
- Complete long-context compaction and reread recovery with an actual model.
- Forced process kill/power failure, disk full, hostile concurrent filesystem mutation,
  antivirus file locks, arbitrary ACL failures beyond the targeted cleanup fixture,
  Windows Sandbox/clean VM and enterprise restrictions.
  Catchable failures have rollback code; untested failure paths are not certified.
- Hand-copied bundles are deliberately unmanaged; unknown ownership blocks automation.
  Provider configuration/higher-priority duplicates outside the target are diagnostic
  possibilities, not roots the installer deletes or rewrites.

Trial inputs, exact prompts, isolation instructions, scoring boundaries and a blank
record are in the [classmate kit](trial-kit/README.zh-CN.md). Pending fields remain blank.

## Supplementary evidence and preview.3

The original missing-artifact status is historical:114 supplemental files were
received and locally inspected. See [the bounded review](supplement-review.md).
No fresh Desktop/model execution was performed by the maintainer. Auto SVG remains
incomplete, and full body/reference tool traces, unprompted positives/negatives,
clean-account A/B, GUI novice usage and long-context recovery remain unverified.

Preview.3 ships an offline CSV checker with pre-task snapshots and nonzero failure
exits. [Repair and real subprocess controls](preview3-verifier.md) preserve the old
FAIL-with-exit0 record. These checker results cannot upgrade a Desktop/model row.
