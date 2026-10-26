# Agent Workflow Skills

[中文说明](README.zh-CN.md) · [Installation](docs/installation.md)

**Research first, let the user choose, deliver, improve from feedback, and retain tested lessons.**

This repository maintains **proactive-skill-discovery** and its **DeepSeek Harness
(DSH) variant**, an MIT-licensed workflow
that starts from unproven capability, actively researches professional skills and
multiple relevant examples, presents supported options for user selection, then
builds a draft, improves it from feedback and maintains reusable lessons. It grants no permission to
publish, spend money or resume paused work.

Required task cards, capability inspection tables, ordered checkpoints and delivery
checks now make omissions visible. A host-owned executable gate rejects missing,
stale or out-of-order evidence. See [actual behavioral tests and enforcement limits](docs/discovery-gates.md);
installing the Skill alone does not install a tool-call firewall.

A [controlled Codex / DSH host preview](docs/host-preview.md) supplies separate test
entry points, source-delivery confirmation and automatic host-generated checkpoints.
It does not switch the daily desktop or cover arbitrary tasks. Its supported scope,
installation checks and retained real-model failures are stated separately.

The newer [DSH default guarded entry](docs/global-entry.md) adds a mandatory
native launcher, ordinary conversation controller, full installed-dependency
verification and an opt-in user PATH alias. Read its current acceptance record;
installing the Skill alone still does not activate this host integration.

The [R32 delivery record](evidence/global-entry-r32-20261026/README.md) preserves actual Codex desktop, DSH Web and paid SDK traces under their original source identity, plus final installation and cold-start checks. Packaging passed 34/34 and Codex policy 31/31. Of 426 global cases, one external request initially returned 403; the unchanged case passed after its observed rate-limit reset. All nine Windows/Linux CI jobs passed. Download the [preview.3 installer](https://github.com/youchibuwan-ops/agent-workflow-skills/releases/tag/v0.2.0-host-preview.3); copying a Skill alone remains `instruction_only`.

**2026-10-25: the SVG Skill has been withdrawn.**
`crafting-reference-based-svg-assets` is removed from the current installable
catalog and its standalone release download is withdrawn. It is no longer
recommended for installation. Historical examples, evaluations and Git history
remain evidence, rather than an active Skill release. Existing local copies are
not changed by this repository update.

## DeepSeek Harness / DSH

For classmates using DeepSeek Harness, follow the [Chinese quick start](docs/dsh.md).
The separate package is [proactive-skill-discovery-dsh](skills/proactive-skill-discovery-dsh/SKILL.md).
Install from this downloaded repository with `node scripts/install-dsh.mjs --project <your-project>`.
No repository development dependencies are required by consumers. Official-provider
loading checks and the limited real-model controlled-host regression are documented
separately in the [host preview](docs/host-preview.md); neither establishes general task quality.

## Install and use in Codex

Requires Git and Node ≥22.20.0 for the third-party CLI. Run in the target project:

```sh
npx skills@1.7.4 add https://github.com/youchibuwan-ops/agent-workflow-skills/tree/main --skill proactive-skill-discovery -a codex --copy -y
```

This follows the current branch. Review and pin an exact commit when reproducibility
is required. Keep the complete installed folder and its license. See
[installation](docs/installation.md) for Windows, updates and removal.

```text
Use $proactive-skill-discovery for this repository's release-quality audit.
Inspect candidate methods and licenses, reuse suitable tools, verify actual
outputs and retain tested lessons. Work on a branch; do not publish externally.
```

Automatic activation depends on the host. Installation and explicit invocation
do not establish task quality or general model performance.

## Workflow and evidence

The [Skill](skills/proactive-skill-discovery/SKILL.md) and
[discovery workflow](docs/discovery-workflow.md) cover installed capability matching,
proactive external research, source/license inspection, supported option selection,
actual output verification, feedback-driven refinement and visible skill maintenance.

- [Complete workflow example](examples/discovery-complete-loop/README.md): the
  reference/selection/draft/feedback/maintenance sequence, with its evidence limits.
- [Executable maintenance example](examples/discovery-maintenance-loop/README.md):
  a controlled stale-export failure, repaired review Skill and rerunnable checks.
- [Release audit example](examples/discovery-release-audit/README.md): source
  inspection, tool reuse, license packaging findings and installation checks.
- [Historical Codex acceptance](docs/codex-acceptance.md): known-task author
  regressions and their limits, with no general reliability or independent friend result.
- [Historical SVG comparisons](evals/pelican/README.md): original outputs, costs,
  failures and incomplete runs from the withdrawn workflow.
- [Archived binder clip](examples/svg-binder-clip/README.md),
  [bracket](examples/controlled-bracket/README.md) and
  [clothespin](examples/heldout-clothespin/README.md): retained artifacts and evidence.

Historical success records do not validate the withdrawn Skill or restore it to
the current catalog. See [validation](docs/validation.md) for check scopes.

## Development

```sh
npm ci --ignore-scripts
npm run lint
npm run test:dsh
npm run verify:install
npm run assemble:example
npm run render:example
```

Development dependencies serve checks and archived example reproducibility;
consumers do not run `npm install` in this repository. CI validates both Skill formats and checks installation/provider loading on Windows and Linux. See
[contributing](CONTRIBUTING.md), [security](SECURITY.md) and [changelog](CHANGELOG.md).

## License

Skills, scripts and documentation: [MIT](LICENSE), © 2026 youchibuwan-ops.
Example photographs and derivative SVGs retain the explicit licenses beside them.
Third-party tools retain their own licenses.
