# Agent Workflow Skills

[中文说明](README.zh-CN.md) · [Examples](#real-examples) · [Install guide](docs/installation.md)

**Find the right skills, verify that they work, and retain what you learn.**

Two MIT-licensed Agent Skills for developers using Codex or another Agent Skills host.
Start with **proactive-skill-discovery**: connect capability gaps to inspected workflows,
actual task results, and maintained reusable lessons.

**For developers who value carefully finished work and less step-by-step supervision.**
See the [static and animated pelican A/B cases](evals/pelican/README.md): original
outputs, visible self-correction, time/tool costs and retained failures. B's animation
is playable but reached its time cap; neither final pair has independent blind scores
or a measured reduction in human reminders. These pairs test the SVG Skill only.

**New known failure and development candidate (2026-10-23):** a later task read the
SVG Skill but skipped independent local production. The [preserved incident and
candidate](evals/svg-workflow/README.md) add executable receipts and a shorter
next-action entrypoint. Twelve local mechanical tests passed before the maintainer
stopped further testing; **no new-session behavior test ran**. The frozen preview
below is unchanged. Those twelve checks cover the earlier v1 helper. The subsequent
v2 hierarchy/evidence gate and eight added mechanical regressions have **not been run**;
they do not inherit that result. This candidate is not a verified fix or a new Release.

```sh
npx skills@1.7.4 add https://github.com/youchibuwan-ops/agent-workflow-skills/tree/v0.1.0-codex-preview.1 --skill proactive-skill-discovery -a codex --copy -y
```

Run from the intended project. Requires Git and Node ≥22.20.0 for this third-party CLI;
the tagged preview skills themselves have no Node/Python runtime. The newer SVG
development candidate requires Python ≥3.10 for its full-production receipt checker.

**[Codex pre-release v0.1.0-codex-preview.1](https://github.com/youchibuwan-ops/agent-workflow-skills/releases/tag/v0.1.0-codex-preview.1) is available for independent trials.**
The registered strict author repair suite passed (2026-10-23).
V7 passes both complete explicit smokes, all three scheduled implicit discovery
chains and the adjacent A/B controls. Both current PDFs pass independent full-content,
page and zero-warning checks. All v4-v6 failures remain public; these known-task
author regressions do not establish general reliability or performance improvement.
The [evidence and limits](docs/codex-acceptance.md) and [blank friend A/B pack](evals/codex/README.md)
separate installation, loading, activation, source/license review and task quality.
Commands pin this preview tag; its payloads equal the tested v7 candidate.
The [release](https://github.com/youchibuwan-ops/agent-workflow-skills/releases/tag/v0.1.0-codex-preview.1) includes standalone Skill ZIPs, checksums,
a [blank A/B ZIP](https://github.com/youchibuwan-ops/agent-workflow-skills/releases/download/v0.1.0-codex-preview.1/codex-ab-study-v7.zip), bilingual setup and validation limits.
Tagged remote and extracted-ZIP installs were verified separately from behavior tests.
This is a testing preview; no stable Release or independent friend results are claimed.

## Why proactive discovery?

A search result is a candidate; installation is only setup. This skill keeps the actual task in view:

1. Match installed capabilities before looking elsewhere.
2. Search for a real gap; read instructions, resources and licenses.
3. Select, thinly adapt or combine suitable workflows within the user's authorization.
4. Verify the actual output, including relevant failure cases.
5. Maintain verified decisions in an existing skill; create another only when needed.

The [discovery and learning workflow](docs/discovery-workflow.md) adds actual
artifact checks at entry, first sample, handoff and completion. Diagnose evidence,
environment, method and execution gaps separately; use new-task tests and nearby
counterexamples before promoting reusable rules.

Use it for an unfamiliar stack, repeated workflow failures, overlapping skills, or a
method worth retaining. It grants no permission to publish, spend money or resume paused work.

## Choose a skill

| Skill | Best for | Expected output |
| --- | --- | --- |
| [proactive-skill-discovery](skills/proactive-skill-discovery/SKILL.md) | Selecting, inspecting, adapting and using skills, then maintaining lessons | Chosen/rejected sources, reasons, task evidence and a scoped reusable update |
| [crafting-reference-based-svg-assets](skills/crafting-reference-based-svg-assets/SKILL.md) | Real-object SVG props with unclear proportions, thickness, connections or assembly | Editable parts, assembled SVGs, reference comparisons and bounded visual judgments |

Discovery can select the SVG workflow; SVG review does not replace discovery. Neither
is an autonomous service or a guarantee of model performance. Detailed skill instructions
currently use Chinese; this README and the usage prompts are English.

The SVG skill follows an [ordered workflow with rework gates](docs/svg-workflow.md):
references → shared structure/scale → each local's geometry, material and actual
inspection → exact assembly → a fresh whole-object review.

## Try it in Codex

After installing, start a chat in that project. If the skill is absent, restart Codex.

```text
Use $proactive-skill-discovery for this repository's release-quality audit.
Reuse existing tools, inspect candidates and licenses, verify the real install path,
and retain verified lessons. Work on a branch; do not release or submit externally.
```

Install the SVG skill separately:

```sh
npx skills@1.7.4 add https://github.com/youchibuwan-ops/agent-workflow-skills/tree/v0.1.0-codex-preview.1 --skill crafting-reference-based-svg-assets -a codex --copy -y
```

```text
Use $crafting-reference-based-svg-assets to make one editable binder-clip prop.
Compare reference angles, resolve the rolled edges and wire connections, finish the
difficult parts separately, then review the whole asset at its actual size.
Do not integrate it into a game.
```

SVG work needs real image inspection and an SVG editor/renderer supplied by the host.
No renderer, image generator, API key or required review model is bundled. Automatic
activation depends on the host; explicit invocation is the reproducible starting point.

## Real examples

- [Pelican bicycle A/B: static and animated](evals/pelican/README.md): same model,
  xhigh, tools and upper caps within each pair; exact sources and an offline demo.
  Quality observations, user feedback, completion and costs are reported separately.

![Actual animated A/B browser recording](evals/pelican/animated-v1/results/comparison.gif)

A left, B right. **B exhausted its 900-second budget before primary completion.**
[Full video, originals and boundaries](evals/pelican/README.md#animated-svg).

- [Release audit and discovery](examples/discovery-release-audit/README.md): actual
  selection, OSS tool reuse, a license packaging finding, installation checks and retained learning.
- [Binder clip](examples/svg-binder-clip/README.md): licensed photographs, complementary
  angles, independent parts and native-size checks, including withdrawn approvals.
  The current r08 whole was independently reviewed and accepted by the user for public display.
- [Controlled bracket](examples/controlled-bracket/README.md): an owned vector with
  explicit planted faults, separately repaired parts and exact-group assembly checks.
- [Unseen clothespin test](examples/heldout-clothespin/README.md): actual reference
  research on a new object, with unresolved dimensional evidence kept explicit.

![Reference pose and accepted editable SVG](examples/svg-binder-clip/comparison.png)

Photo and artwork: CC BY-SA 3.0; [credits and exceptions](examples/svg-binder-clip/ATTRIBUTION.md).
The binder clip, bracket and clothespin are work examples, not no-skill/with-skill
benchmarks. The pelican pairs above have their own frozen protocols and limitations.

## Installation and compatibility

CLI 1.7.4 installs Codex project skills to `.agents/skills/<name>/`. Add `-g` for
user-wide installation. See [installation](docs/installation.md) for Windows, directory
layout, manual fallback, updates and removal. Keep the complete folder, including its license.

Codex is the install target tested here. Other Agent Skills hosts may read these
folders; cross-host behavior has not been tested. See the [validation record](docs/validation.md).

## Contribute and verify

```sh
npm ci --ignore-scripts
npm run lint
npm run verify:install
npm run render:example
```

Development dependencies serve checks/examples only. Consumers do not run `npm install`
in this repo. Schema checks reuse upstream `skills-ref`; links use lychee. CI repeats
installation on Windows and Linux. See [validation](docs/validation.md),
[contributing](CONTRIBUTING.md), [security](SECURITY.md) and [changelog](CHANGELOG.md).

## License

Skills, scripts and documentation: [MIT](LICENSE), © 2026 youchibuwan-ops.
Example photographs and derivative SVGs use the explicit licenses beside them.
Optional upstream tools are not bundled; their licenses remain their own.
