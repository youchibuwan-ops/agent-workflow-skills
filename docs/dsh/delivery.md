# Preview handoff

- [Draft PR#2](https://github.com/youchibuwan-ops/agent-workflow-skills/pull/2).
- Branch: `codex/dsh-windows-distribution-20261023`.
- Baseline: `c1434f04704938774eb359053aaafdf38ee90868`.
- Current distribution: `0.1.0-dsh-preview.2`; use the new package's Update for preview.1 installations.
- Previous preview.1 commit: `08ba3852e43838e7ec9e5355aa2a10290e0457bd`, with a known PS7 launch defect. Do not use that old package for a new trial.
- [Current branch ZIP](https://github.com/youchibuwan-ops/agent-workflow-skills/archive/refs/heads/codex/dsh-windows-distribution-20261023.zip).
- [Windows distribution workflow/artifacts](https://github.com/youchibuwan-ops/agent-workflow-skills/actions/workflows/dsh-windows.yml).

Send a classmate the ZIP and [Chinese beginner guide](install.zh-CN.md), followed by
the [trial protocol](trial-kit/README.zh-CN.md). They do not need Codex or development
tools. These are preview files on GitHub, not a formal Release. Root CMD launchers
install, check, update and uninstall; canonical skill sources remain under `skills/`.

Local verification: 25 Windows lifecycle cases, the real PS7/CMD chain, both official component probes,
custom and actual GitHub ZIP launcher tests, original package regressions, lint and
root npm audit. Two independent-review findings were fixed and retested. Full reports
and exact boundaries are in [validation](validation.md).
Version/source/manifest/ZIP identifiers are distinguished in [provenance](provenance.md).
The [repair record](preview2-repair.md) retains the reported failure and evidence limits.

The PR is intentionally stacked on PR#1 to keep its diff limited to DSH work. It must
wait for that baseline before retargeting/rebasing; PR#1 was not modified. No main merge,
formal Release, external submission or personal DSH data changes were performed.

**GO: supervised preview for the requested classmate trial. NO-GO: accepted general
Desktop distribution.** Real Desktop UI, clean-machine novice completion, model
auto-trigger positives/negatives, final task artifacts, cross-version student update
and long-context recovery remain unverified. A written trial report was received without
its raw evidence; it does not change those verdicts. The feedback template is blank. Do not
use component tests as evidence of any of those outcomes.
