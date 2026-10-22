# Supplementary classmate evidence / 补交材料核查

Date: 2026-10-23. Tested distribution in the supplied materials: preview.2,
GitHub source commit `9b9d2ea0d85bbea863b498654d5aa26b229eea35`.
This is not a preview.3 or run-02 result.

The user supplied a ZIP containing114 files: installer output logs, four before/after
receipts, CSV inputs/outputs/checker, SVG inputs/revisions/locals/renders, and records
and partial artifacts from the failed automatic SVG run. The originals are retained
locally; private reports and raw attachments are not republished in this repository.
Evidence ZIP SHA-256:
`45e773975a323eb4a586d9a47368e73ddc47e2113482b36b0967bc59a108d997`.

## What is supported

| Layer | Supported scope | Remaining limit |
| --- | --- | --- |
| PS7 launch, preview.1 → preview.2 update | Submitted version log says7.6.6; before/after Check, Update and four receipts agree; recorded exit0. Manifest digest matches the previously downloaded source ZIP. | Log-based external run, not a maintainer rerun on that machine or a novice GUI acceptance test. |
| Uninstall | Submitted Uninstall logs exit0; next Check returns Not installed/exit1. | Check stops at the first absent Skill; both absent is additionally described in a fresh-subagent summary, without raw filesystem listing or catalog trace. |
| CSV artifact | Independently recomputed `3,185,1,1,1,1,1`; original verifier was rerun and its output read. | Original execution was preview.1; full DSH Skill/reference tool returns are missing. |
| SVG artifact | Both explicit and failed-run revisions are byte-identical to the exact reference; supplied inputs match repository originals; local groups match the explicit assembly. Supplied PNG pixel pairs match; actual images were opened. | No new Desktop/model run or new rendering performed during this audit. Correct files do not prove the authoring sequence or successful automatic completion. |
| Discovery selection | Automatic-run CSV values are correct. | Prompt still says to load a Skill and names a unique reference. This is hinted selection, not unprompted triggering. Its own input copies are absent; same hashes appear in the supplied explicit task. |
| Automatic SVG | Failure description, exact prompt and partial source/check images supplied. | Still **INCOMPLETE**. Full child conversation, error stack and event trace missing; no root cause is assigned. |
| Negative cases | Arithmetic answer and no-tool self-report supplied. | No raw tool events; inappropriate invocation remains unverified. |

71 independent local artifact/hash/XML/receipt assertions passed. These are not71
Desktop tests. The original CSV checker also has a real failure-signalling defect:
changing total to999 prints FAIL but still returns0. A fresh subprocess regression
retains that red result in [csv-checker-red.json](evidence/csv-checker-red.json).
The newly shipped checker and its independent positive/negative controls are described
in [preview.3 repair](preview3-verifier.md).

## Corrections without rewriting history

- Normal installed file counts are discovery6 (5 payload + receipt), SVG7 (6 + receipt),
  total13. The submitted table's uniform7 is inaccurate; actual receipt hashes agree.
- Original CSV before/after hashes bracket its later verification script, not the
  entire earlier model task. A future pre-task snapshot is required for that interval.
- New-conversation Markdown and tool tables are summaries, not raw DSH events.
- The supplied Windows label/build is manually recorded without raw system-version
  output; OS identity is not independently confirmed.
- Preview.2 post-update minimal load explicitly did not read references. Earlier
  preview.1 task artifacts are not relabeled as preview.2 model execution.

中文结论：本次已补交的文件不再标“缺失”；安装器成功有日志支持，产物正确性已有独立复核。
GUI 普通同学独立操作、真实完整加载/引用轨迹、无提示自动触发、负例工具轨迹、干净 A/B、
QQ Bridge、长上下文恢复等仍未验证；自动 SVG 保持未完成。新 run-02 单独留档，
不覆盖旧失败，不补造历史退出码或原始轨迹。受控预览 GO；正式推广 NO-GO。

Limited local privacy checks found no credential/config files, private account folders,
or common key/Bearer/private-key/email patterns in the evidence. This is not a guarantee
of exhaustive redaction. Future submissions should contain only selected task evidence.
