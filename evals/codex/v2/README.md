# Preregistered v2 candidate and corrected explicit task

This version is recorded before its model runs. V1 files, criteria and all old
observations remain untouched. `protocol.json` pins candidate Skill commit
`dc4cace4fe488af813ec21853950202f06118900`; per-file bytes are in `payloads.json`.

Changes from v1:

- The discovery Skill requires real source/method and applicable license-body reads
  for the **adopted** workflow/tool/resource, before use. A rejected candidate's
  review, search snippet, SPDX label or saved file cannot stand in for this.
  Changes of method reopen the corresponding gate. The artifact and actual review
  evidence are checked separately. No new executable dependency is bundled.
- The new explicit discovery prompt supplies the exact replacement bytes. V1's
  underspecified prompt and its uncompleted outcomes remain unchanged.
- The implicit discovery task, SVG task, negative control, their inputs and original
  rubric are unchanged. Original five primary conditions and validation=2 still
  apply; the additional adopted-item gate is stricter, not a replacement.

Run with `run.py prepare --study-version 2 ...`; execution resumes the recorded
version automatically. Default preparation remains v1 for old reproduction.
The CLI, model, effort, network/tools, 300-second/40-tool budget, separate outcome
fields and friend repetitions remain identical. A changed candidate or criterion
needs another preregistered version; do not patch this version after seeing results.

The author diagnostic schedule is fixed: one corrected explicit discovery, one
explicit SVG preparation, two implicit discovery B runs, and one adjacent control
per arm. Each has a fresh Bubblewrap namespace/home/cache/workspace and native
RPC/raw-event transport. Preserve all planned outcomes, including installer,
environment, review, output and budget failures. Do not select a favorable run or
present two author trials as a reliability estimate or friend's comparison.

Review actual read outputs and their order against use; an evidence table alone
does not prove an action. Independently verify PDFs with the same 36-row/108-cell,
selectable bilingual text, repeated-header and actual complete-page criteria.
Review the SVG's actual three image views and correct four-hole/continuous-fold
explanation, not full authoring. Exact edit passes only on expected final bytes
and successful installed reference loading. B control must not load discovery or
search externally; both arms must preserve all non-target bytes.

Friend records remain blank. Mount only actor runtime files/tasks, not this README,
the rubric, earlier evidence, source repository, expected SVG or other results.
Official guidance distinguishes [explicit, implicit and negative-control tests](https://developers.openai.com/blog/eval-skills);
these native diagnostics preserve that distinction.
