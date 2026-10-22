# Validation and comparison protocol

Evidence date: 2026-10-22. Baseline repository: `b33ac6e`.
Checks distinguish package integrity, reference research and actual task quality.

## Reproduce repository checks

Requires Git, Node ≥22.20.0 and Python ≥3.11 for the optional reference validator:

```sh
npm ci --ignore-scripts
npm audit --audit-level=low
npm run lint
npm run verify:install
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
These failures remain evidence against blanket reliability claims. Current work
covers all eight local scopes and a fresh whole review; see its
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
Manual source access must be checked again before reuse. A Commons image also
returned 429 during one run; per-host request pacing is enabled rather than treating
429 as success. Other links and local targets remain subject to the checker.
