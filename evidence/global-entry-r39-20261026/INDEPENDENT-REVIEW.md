# Independent review: Skill inventory candidate, 2026-10-26

Base HEAD: `03072d248627c4c8a3475f492adc517b19bfc051`. Reviewed the uncommitted delta in `hosts/codex-global/{skill-inventory.mjs,desktop-skills.test.mjs,desktop-controls.mjs,gateway.mjs,launch.mjs}`. No production source, installation, credentials, game files, branch or index was changed by this reviewer. Native metadata parsing used the assigned executable and catalog, without auth or a model turn.

## Identified and fixed: P1 — preserve external control text separately from Skill hints

Location: `hosts/codex-global/gateway.mjs:99` and `hosts/codex-global/skill-inventory.mjs:23` (reviewed candidate).

`prepareInput()` replaces a Skill item with synthetic text; the gateway joins all converted items and supplies that string as the external `userMessage` to `controllerFactory()` / `acceptUserMessage()`. With input `[skill, text('/workflow pause')]`, the human pause command is no longer at the start of the recognized external message. The real conversation controller reopens scope and remains ready instead of pausing. This changes actual human authorization and defeats the user's explicit stop request. Exact choose/accept/status commands also cease to be exact commands when a hint is included, regardless of order.

Reproduction: `probe.mjs` uses real native parsed metadata and the production conversation factory, without a model call. Results in `probe-result.json`: plain pause and text-before-Skill pause produce `failed='External user paused the task', ready=false`; Skill-before-text pause produces `failed=null, revision=2, ready=true`. The test's three independent controllers begin with the same original task. Fixture workspace was outside the repository because the repository is a hard-private host root; all fixtures were removed after canonical-parent checks.

Required correction: derive trusted external authorization/control input only from the original text items. Pass validated Skill hints separately to the model as untrusted metadata/context. Never append such hints to the frozen human task or to choose/accept/pause/status parsing. Recheck both item orders, newline variants, existing controller reuse and fresh/failed-session transitions. This finding was sent to the implementer before deployment.

The implementer corrected the current source during review. `prepareInput()` now returns separate `{input,hints}`; the gateway supplies only original text to the controller and passes hints separately to native `turnParams()` as `workflow_selected_skills` with kind `untrusted`.

Independent current-source verification is preserved in `fixed-probe.mjs` / `fixed-probe-result.json`: both item orders times no newline/CRLF (four real production conversation flows) passed status without a revision change, actual source discovery/full reads/confirmation, real exact choice into draft, actual selected artifact write and validation, exact acceptance into learning, and exact pause into blocked state. External controls remain byte-exact; all four flows retained revision 1. `workflow_host` remained `application`, while selected Skill hints were `untrusted`. The original `probe.mjs` is retained as the old-candidate reproducer and intentionally uses the old API; use `fixed-probe.mjs` for the current API. Current defect status: **closed**.

## Verified behavior

- Independently reran `node --test hosts/codex-global/desktop-skills.test.mjs` with the real assigned native executable/catalog: 2 passed, 0 failed/skipped.
- After the fix, independently reran the updated same suite: 3 passed, 0 failed/skipped, including all five control commands in both item orders. The four additional actual-controller full flows above passed separately.
- Actual configured roots independently returned 77 metadata entries, 0 errors; repeated list was byte-equivalent as parsed JSON. Only original-root paths were returned. Full list is in `fs-probe-result.json`.
- Concurrent list calls after changing fixture metadata returned the current renamed entry; selecting the old name was rejected.
- Hard-linked entry aliases were both reported/refused. A root junction was refused. A child directory junction was skipped with a diagnostic. Invalid YAML generated a per-item error while a valid sibling remained listed.
- Source-body injection is absent from the metadata response and selected hints in the checked implementation; strict native parsing receives snapshots and no authPath. The existing actor/tool boundary was inspected; no newly forwarded generic execution RPC was found in this delta.

## Scope and limits

No real UI picker interaction, paid/live model execution, or malicious multiprocess directory-swap race was exercised. The current fixture tests do not prove resistance to all such races. Six-level discovery and existing entry/byte caps were inspected; arbitrary filesystem sizes beyond those bounds were not stress-tested. No additional must-fix issue is supported by this review's evidence.

Declined to judge: uncommitted packaging shortcuts are outside the assigned five-file delta; visual layout of the UI picker requires the parent's planned actual desktop check; broader existing workflow policy is not re-certified by these metadata tests.

## Skill application and maintenance

Applied the current `proactive-skill-discovery` contract and `requesting-code-review` template, including the latter's read-only/no-recursive-reviewer rule. The parent explicitly delegated technical verification, so no additional architecture selection or user aesthetic acceptance was required. The reusable lesson (synthetic metadata must not become raw external control authorization) is already covered by the existing stage-check reference's rule to retain original host input and parse only a recognition copy. No Skill file was changed: this assignment restricts writes to review evidence, and the parent owns any corrective code/maintenance. Retained the concrete counterexample here for that handoff.

Assessment: **the identified P1 is corrected and independently verified on current source; no remaining must-fix issue was found in the assigned delta**. The inventory parsing/cache/link neighbor cases above passed within their stated bounds. Actual desktop picker and deployment verification remain the parent's separate required checks.
