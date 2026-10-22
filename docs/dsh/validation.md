# DSH preview validation and decision

Date: 2026-10-23. Skill source: `c1434f04704938774eb359053aaafdf38ee90868`.
Adapter: `0.1.0-dsh-preview.1`. Original skill payload unchanged.

**NO-GO for general distribution as accepted/reliable Desktop skills. GO only for a
clearly labeled, supervised classmate preview.** The user confirmed no Desktop is
installed locally and asked for the classmate to test it. No third-party acceptance
or model-task success is claimed. No formal Release, merge or submission is authorized.

## Actual local results

| Layer | Discovery Skill | SVG Skill | Evidence and limit |
| --- | --- | --- | --- |
| Install, exact payload, references/license copied | PASS | PASS | Windows PowerShell 5.1 actual filesystem operations, including Unicode/spaces. |
| Repeat install, same-version update, synthetic next-version update | PASS | PASS | Next-version fixture is generated only inside the test. It is not a shipped second release. |
| Refuse unknown install, edits, extra files/directories, bad receipt paths, locks, junctions; rollback and cleanup failures | PASS | PASS | [23-case lifecycle report](evidence/windows-lifecycle.json); assertions are not host tests. |
| Uninstall, repeat uninstall, unrelated config sentinel preserved | PASS | PASS | Tests never use personal DSH home. |
| Official Provider discovers `user-dsh`; model catalog lists name | PASS | PASS | [official-components.json](evidence/official-components.json), published0.2.1-rc.2 components. No Desktop UI. |
| Registry and skill tool return entire original body | PASS | PASS | Exact body comparison and terminal content included; references read via real resource base. |
| Direct `/name` injects entire body | PASS | PASS | Official pre-step event handler executed. This is deterministic injection, not a model answering a task. |
| Automatic model invocation from task description | UNVERIFIED | UNVERIFIED | No model, account or Desktop task used. |
| Unrelated prompts do not cause inappropriate model invocation | UNVERIFIED | UNVERIFIED | Only absence of deterministic slash injection tested; cannot stand in for a negative model test. |
| Actual task execution, reference use, final artifact quality | UNVERIFIED | UNVERIFIED | Pending classmate trace and artifacts. No DSH-generated SVG or CSV result claimed. |
| Official Desktop UI, fresh Windows machine, novice completion | UNVERIFIED | UNVERIFIED | Development machine tests do not meet this acceptance criterion. |
| Long-context model behavior/recovery | UNVERIFIED | UNVERIFIED | Official pruner function characterized: SVG is over budget. No complete pressure-triggered model run. |

[Extracted ZIP test](evidence/zip-test.json) records the exact archive hash it tested;
later rebuilt archives have different hashes and must be tested again. CI attaches
the archive, its checksum and that run's external test report together. This avoids
pretending a report embedded in an archive can hash its own containing archive.
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
npm.cmd ci --prefix tests/dsh-runtime --ignore-scripts
node scripts/verify-dsh-runtime.mjs tests/dsh-runtime docs/dsh/evidence/official-components.json
```

The component probe uses a minimal fixed-cwd service and lightweight agent/session
fixture, plus the **real** official registry, provider, catalog/slash handlers, skill
tool and pruner. It is not a complete booted official host or live LLM. File watchers
are disabled. DSH_HOME, DSH_AGENTS_HOME and bundled roots are isolated/restored only
inside the test process; no personal configs, keys, profiles or service are used.
The Node→PowerShell child drops an inherited Codex PowerShell Core module path so
Windows PowerShell resolves its own built-in modules; this does not change user settings.

## Test-driven failures retained in history

The lifecycle test first failed because the manager did not exist. An extra-empty-folder
test then reproduced unsafe removal; inventory validation now refuses unlisted directories.
The real launcher/default-root path exposed PowerShell5.1 parameter-default evaluation
before `$PSScriptRoot` was available; defaults are now resolved in the script body.
Build-time ZIP creation initially missed the Compression assembly; both required
assemblies are now loaded explicitly. Component harness integration failures were
fixed against the real Cordis service lifecycle before any pass report was written.
Independent review also reproduced a hidden-prefix alias bypass and a destructive
rollback after partially failed backup cleanup. New regression cases cover both.
An NTFS ACL fixture allows preflight/rename but denies removal of one old file;
the committed new pair must remain complete after the cleanup error. This changes
ACLs only on a disposable test fixture, never a real installation.

## Outstanding acceptance and limits

- Classmate official Desktop install/find/explicit/full reference/task and uninstall trial.
- Same-prompt A/B model trials for both skills, negative cases and raw evidence.
- A real second distributed version for novice cross-version update testing.
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
