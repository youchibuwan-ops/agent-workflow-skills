# Real case: release audit, discovery and retained learning

Executed 2026-10-22 against this repository, starting at `b33ac6e`.
This is an actual task trace, not a controlled no-skill comparison.

## Task and capability gap

Make two existing skills understandable, installable and reviewable without rewriting
their core capabilities. Preserve changes, use a branch, reuse OSS tools, and stop
before a formal Release or third-party submission.

The installed discovery skill supplied orchestration and the skill creator supplied
packaging guidance. The missing capabilities were a release-readiness workflow and
repeatable schema/installation checks. Search terms included `agent skill validate`,
`skills-ref validate`, `open-source-launch-skill`, and platform-specific submission queries.

## Candidates actually inspected

| Source/version | Inspected | Decision |
| --- | --- | --- |
| [OMARVII/open-source-launch-skill](https://github.com/OMARVII/open-source-launch-skill/tree/603994586697ada31d7f51fa804fd0351fe27414), MIT | Root router, canonical skill, positioning, metadata, copy, channels and failure-mode references, LICENSE | Use canonical skill as a scoped release checklist; omit formal release/submission steps outside authorization |
| [Vercel find-skills](https://github.com/vercel-labs/skills/tree/a80e4c9d12d607631249d4d7d059f835d4b2f13a/skills/find-skills), MIT | Actual SKILL.md, repository license, CLI help, Codex paths and telemetry code | Optional discovery tool; do not use popularity as a quality verdict or bulk-install recommendation |
| [Agent Skills reference library](https://github.com/agentskills/agentskills/tree/69ef37e9424c0a7ea9dd2293b559e43ec8176379/skills-ref), Apache-2.0 | README, validator/parser and dependency manifest | Use demonstration `skills-ref` for format validation only; it does not assess behavior or safety |
| Skills CLI 1.7.4, MIT | Actual help and single-skill install/list output, package runtime requirement | Use isolated project installs with telemetry disabled |

`open-source-launch` was installed from its canonical single-skill directory into an
isolated Codex project and read from the installed copy. The canonical installation
does not carry all root plugin metadata; only its workflow/references were needed.
Upstream code is not copied into these two distributed skills.

## Actual result and retained lesson

Both original public single-skill commands exited successfully and installed exactly
the intended skill. Reference files and Codex UI metadata were present, but neither
payload contained the root MIT text. The original schema checks already passed;
there is no claimed schema-quality improvement.

The correction adds the MIT text to each standalone directory and a `license` field.
The package-specific integration check compares every installed filename and SHA256
against source, opens every referenced Markdown resource and the UI prompt, and
checks CLI listing. It does not infer task success from installer exit status.

The discovery skill's existing
[distribution guidance](../../skills/proactive-skill-discovery/references/adapting-upstream-skills.md)
now explicitly checks license/resource retention after single-directory installation.
This is a small addition to an existing reference, not another generic skill.

## Reproduce

```sh
npm ci --ignore-scripts
npm run verify:install
```

For a remote review branch/commit, pass its GitHub URL followed by a JSON report path
to `npm run verify:install -- <source> <report.json>`. The checkout must match that
source: mismatches intentionally fail. See [validation](../../docs/validation.md).

The original public commit can be inspected using
`git show b33ac6e:skills/proactive-skill-discovery/SKILL.md`. Its skill tree has no
`LICENSE`; current install reports include one. Deliberately removing a resource
from a disposable source copy is an inverse case for the payload comparison.

## Scope and limitations

Local tools were enough; no new permanent global installation was necessary.
The example demonstrates real inspection, selection, execution and a retained
packaging lesson. It does not establish automatic activation, cross-model reliability,
token savings, aesthetic quality or a causal improvement from the skill.

## Controlled execution probe

Executed 2026-10-23 after the binder was accepted. This supplemental owned CSV
fixture is synthetic; it is not a production incident. Two fresh directed actors
used frozen baseline/candidate versions of the discovery Skill on identical inputs.
Both found that the old file-exists/four-row check missed the requested aggregation,
leading-zero identifiers, exact money and preserved quoted multiline notes.
Both repaired copies and produced the required outputs; the routine title edit
needed no extra discovery. Root independently read back both outputs.

The result is a **tie**, not a measured improvement. Both actors also declined to
stuff CSV-specific rules into the generic discovery Skill. The
[evidence record](execution-probe/evidence.json) distinguishes actual execution,
source/interface inspection and hypothetical transfer decisions.

Reproduce from the repository root with Python ≥3.11, standard library only:

```sh
python examples/discovery-release-audit/execution-probe/export.py examples/discovery-release-audit/execution-probe/orders.csv examples/discovery-release-audit/execution-probe/summary.csv examples/discovery-release-audit/execution-probe/notes.csv
python examples/discovery-release-audit/execution-probe/verify.py examples/discovery-release-audit/execution-probe/orders.csv examples/discovery-release-audit/execution-probe/summary.csv examples/discovery-release-audit/execution-probe/notes.csv
```

The verifier reads saved outputs and uses rational arithmetic independently of the
exporter's Decimal implementation. [before-export.py](execution-probe/before-export.py)
retains the deliberately faulty fixture; run it with a different output path and
the verifier rejects its result. No external Skill code or private data is bundled.
