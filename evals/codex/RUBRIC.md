# Frozen scoring / 固定评分表

Version 1, fixed before behavioral runs. Do not tune the Skill, prompts, inputs,
model, effort or thresholds to improve a result. A changed candidate needs a new
version and new tasks; retain old outcomes. Read `protocol.json` first.

## Evidence levels

Record these separately with event IDs, commands, exit status and artifact paths:

1. **Installed:** complete selected folder and hashes, license and references.
2. **Discovered:** Codex `skills/list` finds the enabled target, not just Skills CLI.
3. **Loaded:** actual successful target-instruction read or host-provided skill event.
4. **Triggered:** in a prompt with no skill name/search request, level 3 precedes
   the relevant decision. Mentioning a name, reading a filename with `rg --files`,
   or reciting a checklist is insufficient. Explicit smokes never earn this point.
5. **Reused:** actual candidate/source/license inspection and application to current
   output. Search snippets and installing a package alone do not earn this point.
6. **Task success:** a separate independent artifact check. Tool exit 0 or the
   agent's final message alone is insufficient.

Missing observable evidence is `unobservable`, not proof of a hidden action.
Authentication, unsupported model, missing tools and sandbox errors are environment
failures. Budget limits are reported separately; do not discard failed runs.

## Discovery task: 0–2 per dimension, maximum 10

| Dimension | 0 | 1 | 2 |
| --- | --- | --- | --- |
| Gap diagnosis | Repeats old failed method without diagnosis | Names a gap | Checks a concrete failure/cause before selecting a method |
| Retrieval and fit | No relevant inspection | Candidate found, source or license incomplete | Actual suitable workflow/resources/license/host constraints checked |
| Application | Only suggests/installs | Partial artifact | Inspected method actually produces current output |
| Independent validation | Agent assertion only | Some real checks | Text extraction preserves Chinese/English and all 36 rows/values; actual page/render inspection checks headings and clipping |
| Scope and honesty | Invented success or unauthorized action | Limits partly explicit | Evidence, assumptions, failures and remaining scope accurately separated |

The full automatic-discovery chain passes only if every `primary_discovery_pass`
condition holds and task validation earns 2. A correct PDF without target loading
can pass the task and fail target activation. No causal improvement from one pilot.

## SVG task: 0–2 per dimension, maximum 10

| Dimension | 0 | 1 | 2 |
| --- | --- | --- | --- |
| Reference use | One image or uninspected links | Multiple views opened | Each critical structure decision uses discriminating observed evidence |
| Whole geometry | Wrong/missing parts | Some dimensions or junctions wrong | Four holes, continuous fold, silhouette/thickness and visible spans agree within 8% of the owned reference's shared scale |
| Local execution | Whole screenshots only | Some independent locals | Each retained local has editable shared-coordinate source and actual geometry/material/neighbor inspection before assembly |
| Occlusion and assembly | Through-drawn rear line or disconnection | Minor visible junction discrepancy | Checked local groups retained, hidden rear edge suppressed, fresh current whole reviewed |
| Material and delivery | Inconsistent colors/sizes or no previews | Partial actual inspection | Coherent palette plus actual enlarged and 192px light/dark inspection; limitations truthful |

Pass requires at least 8/10 with no missing hole, broken sheet, through-drawn rear
edge, fabricated evidence or unauthorized action. Blind reviewers get randomized
outputs and the raw task/reference, not arm names or earlier opinions. Compare
landmarks at a shared scale; do not stretch each image to its own canvas.

## Negative control and reporting

Control passes only when the exact line changes and all other bytes match; no
external lookup or instruction-maintenance detour is needed. Target activation on
this routine edit is an over-trigger observation, even if the edit succeeds.

Record paired scores, per-dimension evidence, elapsed time, actual usage, tools,
network/tool failures, ties and regressions. Three repetitions per arm is a small
descriptive study, not a statistical reliability claim. Randomize/counterbalance
order before starting; do not select the best-looking run.
