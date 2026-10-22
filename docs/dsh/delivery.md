# DSH delivery record

- [Draft PR#2](https://github.com/youchibuwan-ops/agent-workflow-skills/pull/2).
- Branch: `codex/dsh-windows-distribution-20261023`, isolated from the Codex checkout.
- Skill payload baseline: `c1434f04704938774eb359053aaafdf38ee90868`, unchanged.
- Current distribution: `0.1.0-dsh-preview.3`; use the new ZIP's Update for existing
  preview.1/.2 managed installations. If absent, Install. Do not force unknown copies.
- [Current branch ZIP](https://github.com/youchibuwan-ops/agent-workflow-skills/archive/refs/heads/codex/dsh-windows-distribution-20261023.zip).
  The maintainer's handoff/PR description supplies the fixed commit ZIP and exact
  checksum after download. A moving branch URL is not a fixed test identity.
- [Windows distribution workflow/artifacts](https://github.com/youchibuwan-ops/agent-workflow-skills/actions/workflows/dsh-windows.yml).
  Artifacts are expiring test downloads, not formal Releases.

## Current changes and evidence

Preview.3 adds an offline Windows CSV checker with separate pre-task Snapshot and
post-task Verify, nonzero failures and real positive/negative subprocess regressions.
It retains preview.2's production PS7 launch fix and the old red failure record.
The installer still manages only receipt-owned, unchanged original Skill bundles.
No official DSH executable, personal configuration or QQ Bridge was changed.

[Preview.3 repair and tests](preview3-verifier.md) ·
[run-02 Chinese instructions](trial-kit/run-02.zh-CN.md) ·
[English instructions](trial-kit/run-02.en.md) ·
[Validation boundaries](validation.md) · [Version provenance](provenance.md).

Supplementary classmate logs, receipts and CSV/SVG artifacts have now been received
and checked. [Their review](supplement-review.md) distinguishes installer log support,
independently correct artifacts, incomplete automatic SVG execution and missing raw
DSH tool traces. It does not relabel preview.1/.2 task evidence as preview.3 results.

**GO: supervised preview. NO-GO: formal/general Desktop rollout.** Ordinary classmates'
GUI completion, genuinely unprompted positives/negative traces, clean-account A/B,
long-context recovery, other environments and QQ Bridge remain unverified. No run-02
result is prefilled. Original failures remain available; no merge, Release or external
submission was performed. Only selected redacted evidence summaries are committed.
