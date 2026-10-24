# Agent Workflow Skills

[中文说明](README.zh-CN.md) · [Installation](docs/installation.md)

**Find suitable skills, verify actual results, and retain tested lessons.**

This repository maintains **proactive-skill-discovery**, an MIT-licensed workflow
for matching capability gaps to inspected methods, using them on the actual task,
checking outputs and maintaining reusable lessons. It grants no permission to
publish, spend money or resume paused work.

**2026-10-25: the SVG Skill has been withdrawn.**
`crafting-reference-based-svg-assets` is removed from the current installable
catalog and its standalone release download is withdrawn. It is no longer
recommended for installation. Historical examples, evaluations and Git history
remain evidence, rather than an active Skill release. Existing local copies are
not changed by this repository update.

## Install and use

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
conditional external research, source/license inspection, scoped reuse, real output
verification and experience maintenance.

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
npm run verify:install
npm run assemble:example
npm run render:example
```

Development dependencies serve checks and archived example reproducibility;
consumers do not run `npm install` in this repository. CI validates the remaining
Skill and verifies installation on Windows and Linux. See
[contributing](CONTRIBUTING.md), [security](SECURITY.md) and [changelog](CHANGELOG.md).

## License

Skills, scripts and documentation: [MIT](LICENSE), © 2026 youchibuwan-ops.
Example photographs and derivative SVGs retain the explicit licenses beside them.
Third-party tools retain their own licenses.
