# Preview.3: CSV verification and run-02

Distribution: `0.1.0-dsh-preview.3`. Original Skill payload baseline remains `c1434f0`;
no Skill body/reference or official DSH change. Installer behavior retains preview.2's
PS7 module-path fix. The distribution increment identifies new trial tools/docs and
the resulting new receipt/manifest identity; it does not claim a new model test pass.

## Root cause and repair

The submitted CSV verifier only printed a FAIL string. Its normal process termination
returned0 even on mismatches, and input hash equality did not affect its final verdict.
It also took its first input hashes after the model task, so they cannot establish
whole-task input preservation. The supplied script remains historical evidence locally.

New [CSV-Check.cmd](trial-kit/tools/CSV-Check.cmd) runs a built-in Windows PowerShell
checker with locally isolated module paths, including when started from real PS7.
It has two explicit actions:

- Snapshot: create a non-overwriting baseline of the two task inputs **before** the task.
- Verify: independently recompute the seven CSV values, validate schema/row/field
  counts, accept equivalent decimal formatting, compare pre-task/current/final input
  hashes, and return nonzero on errors. It does not modify task files.

The contract is scoped to the included rules.txt; unknown rules are refused. Snapshot
is a local checkpoint, not authenticated or continuous observation. It cannot prove
that a file was never temporarily changed and restored. Missing historical baselines
remain missing; this tool is for new tests, not retrospective evidence generation.

## Real process regressions

- [Historical red probe](evidence/csv-checker-red.json): wrong total999, FAIL output,
  process exit0; the regression correctly fails. It is retained as a failure record.
- [Windows PowerShell results](evidence/csv-checker-windows.json) and
  [PowerShell7 parent results](evidence/csv-checker-ps7.json): real CMD/child processes,
  valid integer/decimal totals, decimal currency/quoted ID, wrong total/counter,
  extra row, bad header/field count, missing result/baseline, changed orders/rules,
  malformed baseline, unknown rules and repeat Snapshot refusing overwrite.
- These are developer checker tests. Existing lifecycle/component tests remain
  distinct from Desktop/model tests. CI also runs these controls before packaging.

Independent review additionally found that joining header cells with commas could
accept a quoted merged header. [The new red regression](evidence/csv-checker-header-red.json)
retains that observed false PASS. Parsed header length and each cell are now checked.
The reviewer independently confirmed valid PASS/exit0, malformed-header FAIL/exit1,
and16/16 cases under both Windows PowerShell5.1 and PS7 parent. No remaining actionable
finding was reported in that targeted review; Desktop/model acceptance was not tested.

The [supplement review](supplement-review.md) replaces the earlier blanket statement
that all raw artifacts were absent. It retains the exact narrower evidence limits.
Follow the [run-02 Chinese protocol](trial-kit/run-02.zh-CN.md) or
[English protocol](trial-kit/run-02.en.md). No run-02 result is prefilled.

正式验收仍 NO-GO；受控预览 GO。自动 SVG 的失败、未导出的完整轨迹、无提示触发与干净 A/B、
普通同学 GUI 操作、长上下文恢复、其他系统/版本和 QQ Bridge 均未因此变成通过。
