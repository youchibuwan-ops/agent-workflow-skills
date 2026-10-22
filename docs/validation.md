# Validation and comparison protocol

Latest behavioral acceptance is separate: [2026-10-23 versioned Codex tests and limited-preview scope](codex-acceptance.md).
The historical package/render checks below do not establish implicit activation.

Evidence dates: 2026-10-22–23. Baseline repository: `b33ac6e`.
Checks distinguish package integrity, reference research and actual task quality.

Current example: binder r08 passed a fresh finite static whole review and the user
approved public display on 2026-10-23. Historical probes below retain their original
failures and limited scopes; their earlier “not accepted / under rework” states do
not describe current r08 or restore any old approval.

## Reproduce repository checks

Requires Git, Node ≥22.20.0 and Python ≥3.11 for the optional reference validator:

```sh
npm ci --ignore-scripts
npm audit --audit-level=low
npm run lint
npm run verify:install
npm run assemble:example
npm run render:example
python -m pip install "skills-ref @ git+https://github.com/agentskills/agentskills.git@69ef37e9424c0a7ea9dd2293b559e43ec8176379#subdirectory=skills-ref"
skills-ref validate skills/proactive-skill-discovery
skills-ref validate skills/crafting-reference-based-svg-assets
```

Use a virtual environment for the Python installation. On Windows set
`$env:PYTHONUTF8="1"` before running `skills-ref`: its default text decoding otherwise
uses the system locale and fails on these UTF-8 instructions. CI sets this explicitly. `skills-ref` is upstream's
demonstration reference library, not a behavioral/safety certification.
Run [lychee](https://github.com/lycheeverse/lychee) 0.24.2 for local and external links:

```sh
lychee --no-progress --max-concurrency 4 --timeout 30 --max-retries 2 README.md README.zh-CN.md CONTRIBUTING.md SECURITY.md CHANGELOG.md "docs/**/*.md" "skills/**/*.md" "examples/**/*.md"
```

## Evidence and limits

| Check | Evidence | What it establishes |
| --- | --- | --- |
| Public baseline CLI 1.7.4 | Both individual remote installs exited 0; five files per skill; root MIT absent | Original commands discover/install, but standalone legal notice incomplete |
| Current candidate package | [Install report](../examples/discovery-release-audit/install-report.json) | Exactly one selected skill, complete file inventory/hashes, MIT, references and Codex prompt readable |
| Schema | `skills-ref validate` for each skill | Frontmatter/name validity; baseline already passed too |
| Markdown and links | `npm run lint`, lychee, CI job outputs | Formatting, local targets and external reachability within recorded run |
| Development dependencies | `npm audit --audit-level=low` | Registry's current advisory result, not general security certification |
| SVG | [Case and revisions](../examples/svg-binder-clip/README.md), source/render manifest | Actual static observations with withdrawn earlier approvals; no engineering or user-aesthetic certification |
| New object | [Held-out clothespin trace](../examples/heldout-clothespin/README.md) | Actual candidate comparison and bounded structure research; no drawing or precise geometry approval |

Local execution uses Windows, Node 22.22.1, npm 10.9.4 and Python 3.13.12.
CI defines separate Windows/Linux installation checks. A workflow definition is not
proof of a successful run: consult the repository's actual Actions run before claiming
either platform passed. No other agent host or model has been benchmarked.

`verify:install` uses a fresh temporary project for each skill, opts out of telemetry,
installs with `--copy`, compares all payload files to this checkout, reads all linked
references and UI prompt, and checks CLI listing. It does not overwrite global skills
or launch Codex. To test an exact remote branch/commit matching the checkout:

```sh
npm run verify:install -- <reviewed-github-source> <report.json>
```

The source and checkout must match. A mismatching or missing resource is a failure,
even if the installer exits zero. The script removes only its own temporary directories.
For inverse testing, remove a reference from a disposable source copy and verify that
this comparison rejects it. Do not mutate a personal installed skill for a test.

## Skill execution evidence and regressions

The binder-clip case records actual failures while the skill was already available:
partial local coverage, incorrect mouth topology, mistaken near-roll projection,
a hidden visible wire end, and an attempted interpretation of cast shadow as plate.
These failures remain evidence against blanket reliability claims. The user later
rejected the central curl despite reviewer agreement, then identified an omitted
rear-left roll and unverified opposing formation. A fresh reference audit identified
four outer rolls plus two central curled lips belonging to the same sheet, rather
than the old whole SVG's three outer rolls. Those approvals remain withdrawn.
The new r08 case completes all eleven local scopes, exact assembly and a fresh
whole review; its last false attachment seam was actually repaired and rechecked.
The user accepted current r08 for public display on 2026-10-23. The assembly/render
guards retain all six curls and exact current groups; actual inverse tests omitted
F-L and changed a reviewed wire, and both were rejected. This is static case
evidence, not a general reliability or precise engineering certification. See its
[execution record](../examples/svg-binder-clip/execution-record.md).

A separate execution test used an unseen SS-108 straight nail clipper. The agent
read candidate Skill SHA `A72813FCDD0CA659BCCC10DF0AE248C061A2DBD3554FB05EA6DA029D97F205DF`,
searched eight queries, actually viewed six images from the
[brand page](https://sekiedge.co.uk/product/satin-slim-clipper-ss-109-copy/) and
[retailer](https://www.countryknives.com/shop-by-department/personal-care/manicure-fingernail-care/pocket-nail-clippers/seki-edge-ss-108-straight-nail-clipper/),
and planned 14 visible local scopes with shared photo coordinates. It kept unseen
pin/tail internals unknown and stopped before drawing because true side projection
and task size/style were unresolved. A flat owned SVG recolor was routed outside
real-object research. This demonstrates R/L research and stop behavior only, not
new-object drawing or assembly. The later explicit auxiliary-evidence/shadow clause
was informed by the binder-clip failure; it was not present in this held-out run.

One paired read-only test used a deliberately stale render and a synthetic old pass
note with a different current source. Both control and candidate rejected stale
approval, so no improvement is claimed on that check. The candidate additionally
located the missing far wire end and uninterrupted sheet boundary; those were
actually repaired in the clip. A suggested bottom flange was rejected as a shadow
misinterpretation. One pair cannot establish rates or causality. Private original
agent outputs and render artifacts are retained outside installable packages.

An actual inverse install test removed a linked reference from a disposable source
copy: CLI installation exited successfully, but `verify:install` exited 1 on payload
mismatch. This checks the checker rather than merely assuming its failure path works.

## Discovery and learning execution

After the accepted SVG result, the generic workflow was revised using the
[primary-source research and adaptation decisions](discovery-workflow.md).
Two fresh directed actors executed the same owned CSV fixture and routine title
edit, using frozen old/candidate Skill folders. The old exporter deliberately
contains record-grain, string-identifier, binary-float and quoted-newline defects;
its failure is a fixture failure, not evidence that the baseline Skill failed.

Both actors actually reproduced that failure, repaired copies, wrote exact SKU
totals and preserved all four note rows including the embedded newline. Both
handled the routine edit directly and left their generic Skill copies unchanged:
the CSV facts did not establish a missing generic rule. Independent root readback
confirmed both outputs. **This comparison is a tie; no improvement is measured.**
See the [reproducible fixture and evidence](../examples/discovery-release-audit/README.md#controlled-execution-probe).

A separate fresh candidate-only transfer run actually inspected the three cached
Skill sources and their licensing/runtime interfaces. It rejected the claim that
installing a learning/logger Skill or running Anthropic's Claude trigger proxy
would test Codex automatic activation. Real package checks also reproduced the
runner's Windows UTF-8 parsing and subprocess-pipe incompatibilities. No automatic
activation or model API run occurred. Supplied converter-upgrade, unavailable-source
and skipped-check cases tested proposed decisions only; they are explicitly
hypothetical, not executed converter tests.

These are bounded execution/transfer observations, with raw commands and frozen
versions retained privately. They do not establish failure rates, cross-host/model
reliability, autonomous weight learning or that future agents cannot skip steps.
The published Skill remains compact and needs actual artifact checks in use.

## Future DSH or other controlled comparisons

DSH is planned; its meaning, implementation and results are not defined by this work.
Add it without replacing existing skills or pre-populating outcomes. Each comparison needs:

1. A defined question, frozen baseline/candidate commit and exact skill payload.
2. Identical task prompts, source inputs, tool permissions, host/model/version and budgets.
3. A held-out task not used to revise the instructions, plus a relevant non-trigger case.
4. Independent runs with declared repetition count and handling of retrieval failures.
5. Original outputs, criteria fixed before grading, failures and ambiguous cases retained.
6. A result table with observed outcomes and denominators; separate install/schema
   success from behavior, human judgment, time and cost. Report ties and regressions.

One task trace cannot establish a success rate or causal improvement. A changed SVG
inside one guided session is a revision history, not an ablation study. Keep large raw
logs outside skill payloads; publish only redacted evidence that others can reproduce.

## Automated link-check limits

The two exact clothespin research pages on eBay and Jumbo return 403 to lychee.
Their URLs remain in the research record, and `.lychee.toml` excludes only those
exact resources from automated checking; this is not evidence that they passed.
Manual source access must be checked again before reuse. Two Commons original-image
URLs also returned 429 across local/hosted runs. Their citation links now use the
verified Commons file descriptions, which supply provenance, licenses and access
to the originals; the original inspected URLs remain in the research record.
Per-host request pacing remains enabled, and 429 is not accepted as success.
Other links and local targets remain subject to the checker.

## Auxiliary workflow review — 2026-10-23

The SVG workflow remains the primary, task-specific process. Two installed MIT
skills were inspected as supplementary sources, including their reference and
verification documents:

- [Blender modeling workflow, frozen source](https://github.com/ifBars/blender-agent-studio/blob/6ff97fad06d09f5885c941e0bbf3a8f429da3560/plugins/blender-agent-studio/skills/blender-modeling-workflow/SKILL.md):
  question-driven complementary references, observation notes before construction,
  frozen framing/projection comparisons, negative spaces, and stage exit evidence.
  The draft adapts those decisions to SVG, without Blender/export requirements.
- [Anatomy, frozen source](https://github.com/wheresryan22/anatomy/blob/1482e8469b0a9e0d8cc18ea2740a01423d29ae80/SKILL.md):
  junction close-ups, whole-surface continuity, separation of physical contact from
  screen overlap and painter order, and visual inspection beyond geometry audits.
  Its isometric design choices, detail quotas and model-specific audit tools are
  not general validation for arbitrary hand-authored SVGs.

No upstream source code is bundled in the installable Skill payloads. Inspecting
these sources does not establish improved output quality. At this earlier stage,
the binder-clip curl had a single continuous-sheet
construction study with end/front/top/oblique views and vector projection. These
are hypotheses to compare against photographs, not additional real-object views
or proof of recovered dimensions. That study had no user acceptance; the later
accepted r08 case is documented separately above and in its execution record.

## Frozen candidate probes — 2026-10-23

An earlier baseline/candidate pair researched a previously unused concealed hinge.
Both opened real reference images and retained unresolved internal relationships;
the candidate also located ambiguous edge wording. The run stopped for workflow
review before drawing. It supplies research evidence only, with no causal outcome claim.

The [owned folded-bracket case](../examples/controlled-bracket/README.md) deliberately
injects three named faults into an exact vector reference. Root repaired and
actually inspected the upright first, then the base, then exact-group assembly.
It is a controlled regression fixture, not a photographic reconstruction benchmark.

A fresh read-only probe of frozen Skill SHA
`0245ab64a2042f25721897cd05cfbe5af841233883ffcafdaf87c4627ed725a1`
re-rendered both corrected and faulty copies, checked all four holes, complete
perimeters, local groups and 160px light/dark rotations. It accepted the corrected
copy and rejected the planted endpoint, missing-hole, broken-fold and stale-preview
defects. Skill and input hashes remained unchanged. An exploratory earlier run is
excluded from this frozen result because its candidate file briefly changed.

A separate non-trigger probe actually changed only a specified fill in an owned
32px icon, with all other bytes preserved and no real-object search. These are
bounded audit/routing observations. Neither probe establishes autonomous production
across unfamiliar real objects. Cross-section and autonomous-recovery additions
came after that freeze and need their own current-version evidence.

Later bounded probes are kept separate rather than merged into a success rate:

| Frozen Skill SHA-256 | Actual observation | Scope and limitation |
| --- | --- | --- |
| `347290876d58f66554a116a97f3c5d5167c9d7420340b627baf0d7c5ff981179` | Read-only audit rejected a smaller-hole/wrong-color fixture and accepted two exact controls | Controlled vector geometry/material audit; not production |
| `de530c3760f7e3e2277c67f37a4af0a8da263ef8fe1cbd7eca3c692f92dbac70` | Rejected old material and hidden-line defects; accepted the revised central local within that scope | Later missing-instance feedback invalidated any broader interpretation of this local agreement |
| `63132b4c7cb6d490b4b3927694314ee5d324afabeec865a5780ef127e9b4efb9` | Fresh reference/whole audit independently rejected missing rear roll/lip coverage and returned to B | Real binder-clip regression, not a held-out object; no drawing pass. An earlier count-hinted dispatch was excluded and repeated with neutral inputs |
| `d9c2345bab97341f6b8ede1c033b445f66d9a301fd0b3069a37ce227ecfa75c8` | An independent actor repaired a new exact owned-vector handle fixture and rejected the stale preview, but edited/viewed successive whole images without independent local sources | Final pixels matched, yet the local-production gate failed. The no-Skill execution also repaired the result; no causal improvement is claimed |

The last observation caused a concrete recipe change: preserve or extract each
current local as an editable SVG in shared coordinates, actually inspect it and
its neighboring crop, then assemble the checked groups. A series of edited whole
screenshots cannot stand in for independent local work. This correction requires
a new frozen execution; previous final-pixel equality is insufficient.

The actual Blender study also returned to rework twice: r01 had opposing thickened
surfaces intersecting; r02 removed that intersection but retained coincident,
unconnected sheet interfaces. That earlier BODY r03's evaluated mesh was connected
and the checked opposing regions did not intersect. Its vector export still had a
visible-face/ordering discrepancy, so this was a construction check, not SVG or
whole-object acceptance. Script intent and a plausible render did not establish
either connectivity or visibility. Blender is an optional authoring aid, not an
installation dependency.

## Actual local-production retry and sparse-evidence execution

The independent-local recipe was subsequently executed in a fresh context with
frozen Skill SHA `cb98676ad2a2f8998a9dd0f1530ba7c22759da146f18490176512df733755faa`.
The actor extracted three independent local SVGs, rendered and opened each local
and its neighboring crop, then assembled the exact checked groups and reviewed
the new whole. Source checks found the assembled groups unchanged; the final
owned-vector reference and result differed by zero pixels at the checked native
and enlarged sizes. The initial fixture differed at 8,480 native pixels. This
is an exact vector-repair observation, not a photo or independent whole-review
pass. The committed LF-normalized equivalent has Skill SHA
`8cba62b50f5df7f78465355a0f843aa7a049c71824ef77a46e25518797b2acf0`;
the saved payload check establishes the line-ending-only change. Later additions
are not covered by that execution.

Current Skill SHA `c81a1a8491cf2caed738b5dde9a3fe3ba716f84c0a53620a7138f350267e4288`
adds capability matching before new implementation, per-part reference roles,
projection ambiguity, two-axis dimensions and bounded inference with sparse
evidence. Two fresh contexts received the same previously unused owned synthetic
front raster, the frozen Skill and different delivery scopes. Neither received
the fixture's vector source or the sibling result. No additional reference was
available in these bounded tasks.

| Requested scope | Actual execution | Limit |
| --- | --- | --- |
| Front SVG illustration only | Authored, rendered and opened three independent locals, then unchanged assembly, structure view and native light/dark comparisons | Completed front-only self-review; hidden depth and physical attachment not claimed |
| Faithful front/side/three-quarter reconstruction | Authored and inspected an observed front trace and two explicit 3D hypotheses with identical front coordinates and different side/oblique consequences | Stayed at R/B: original depth/section/fastening unresolved; recorded a minimal unsent evidence request instead of claiming reconstruction |

Root opened the current comparison images and both hypotheses' views, read the
reports and source checks, and verified all six frozen payload files unchanged
and matching that snapshot. Original task-local sources, renders and checks
are retained outside the installable package. These are execution/scope-routing
observations, with no no-Skill control, success-rate or causal improvement claim.
They do not establish real-object production quality, proactive retrieval or
general autonomous learning. The current single-skill installs and schema checks
also passed for this payload, separately from behavioral evidence.

The binder-clip investigation exposed a separate reference-selection failure:
the user's selected body-dimension photo was incorrectly extended to handle
shape and depth. All N-handle r01–r09 reverse-trace shape/dimension claims are
withdrawn. Applicable complete photos, manufacturer front/side drawings and
joint reasoning now support a reversible shared-frame/hinge hypothesis. Its
current two instances share one native curve and have no checked body intersection
at the inspected pose; those facts do not prove original dimensions, all-motion
clearance, color or final SVG quality. That older whole was then under rework;
the accepted r08 replaced it without restoring its withdrawn approvals.

The additional inspected MIT [object-sculptor joint contract](https://github.com/linegel/threejs-complete-set-of-skill/blob/e3c9563a070b214aa73b84d1ea6026c9ec4db6cb/skills/threejs-object-sculptor/references/attachment-joint-correctness.md)
was thinly adapted to shared physical ownership, parent-local roots and a hinge
that preserves pivot/axis while allowing rotation. No new automatic image or
topology solver is claimed. Other candidates whose actual code only reports
image bounding boxes were rejected as depth/planarity evidence.
