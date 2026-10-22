# Codex pre-release acceptance — 2026-10-23

**NO-GO under the frozen limited-preview rule.** Package installation and local host
discovery work; independent resource loading, explicit execution and the complete
implicit discovery → reuse → verified-output chain have not passed in a clean runtime.
This is an environment-blocked acceptance, not a measured Skill failure rate.
PR #1 remains a draft; no main merge, Release or third-party submission was performed.

## What was fixed and checked

- Reviewed against `c1434f04704938774eb359053aaafdf38ee90868`; both Skill payloads
  retain exactly those bytes. No behavior tuning was made after observing results.
- Each target was installed alone through Skills CLI 1.7.4 into a fresh project;
  every payload file, MIT notice and linked resource matched the frozen inventory.
  Native Codex 0.155.1 `skills/list` found only the target and six built-ins. A control
  preparation found only the same six built-ins, with identical payloads and task inputs.
  [Public inventories and observations](../examples/codex-acceptance/README.md).
- Removed local authoring paths, file-browser buffers and weak-library provenance
  from the optional binder `construction.blend`. Native Blender 4.5.14 opened and
  inspected the sanitized file. An independent review found the same evaluated
  geometry/camera fingerprint before and after; four regenerated public PNGs are
  byte-identical. [Manifest](../examples/svg-binder-clip/case-manifest.json).
- Fixed actual evaluator defects: recheck target/built-in payloads and CLI version
  at execution, reject treatment changes, clean temporary credentials on copy/chmod
  and process errors, stop on unexpected MCP, and classify policy rejection separately.
  Regression tests use synthetic fixtures/fake credentials, not real account files.
- Native directories cannot enforce isolation. Friend runs require a disposable
  VM/container, a recorded boundary and destruction after **each** run. Windows
  `taskkill /T` remains best-effort; it cannot guarantee cleanup of orphan descendants.
- Gitleaks is used for credential scanning, alongside review of binary authoring
  metadata. A zero-finding scan is bounded evidence, not proof of absence. Earlier
  branch history still contains the old binary's local paths; history was not rewritten.
  Those paths are not credentials, but current-tree cleanup does not erase old commits.

## Actual authenticated author pilots

Tasks, rubric, model, effort and budgets were committed in `2dfd37c` **before** these
runs. All three used `gpt-6-astra`, medium, requested workspace-write, approval never,
300 seconds / 40 observed tool-start events. No explicit Skill instruction occurs in
the implicit prompt. The initial `gpt-6.1-sol` health preflight was unsupported by this
account; `gpt-6-astra` was selected from its actual model catalog before the protocol
freeze and returned `READY` in a separate health request.

| Run | Installation / local catalog | Actual instruction/resource load | Reuse / output | Classification |
| --- | --- | --- | --- | --- |
| Explicit discovery | Pass | Not verified: reads rejected | No reuse; no requested edit | Environment blocked |
| Explicit SVG, read-only research | Pass | Not verified: reads rejected | No image inspection/authoring | Invalid contamination: account MCP visible |
| Implicit discovery B pilot | Pass | Agent selected the workflow and attempted `Get-Content …/SKILL.md`; rejected | No inspected external source, applied method or PDF | Environment blocked; full chain not passed |

The native router recorded `exec_command … rejected: blocked by policy` despite the
requested workspace-write setting. The effective policy's underlying cause remains
unestablished. A model's statement that it was read-only is not independent proof.
Separate disposable permission probes, including the named workspace profile, also
failed to read/write the health fixture. No host restriction was bypassed.

An isolated local Skill catalog did **not** ensure an isolated authenticated tool
surface: the SVG pilot's account MCP resource list exposed unrelated plugins.
Its account resource payloads are redacted publicly; event type/order and hashes are
retained. The runtime guard now stops at the first unexpected MCP event. Guards were
revised after these observations; the pilots were **not** silently rerun or upgraded.
JSONL tool-start counts omit commands rejected before an item event; stderr rejection
counts are recorded separately. A completed model turn is not a task pass.

These are native author pilots, not friend A/B outcomes, desktop-app activation
tests or controlled evidence of improvement. The A preparation was checked but no
paired implicit A result was collected after the environment failed preflight.

## Friend experiment and remaining gates

[The bilingual test pack](../evals/codex/README.md) contains two target tasks, a nearby
negative control, separate explicit smokes, a frozen rubric and a blank raw-record
template. A has no target; B has exactly one. Use the same immutable base image,
model, effort, permissions, tools and caps, three fresh repetitions per arm/task,
counterbalanced order and blind artifact scoring. Installation, host discovery,
loading, implicit activation, external reuse and task success remain separate fields.
Token usage is recorded; there is no hard total-token/dollar cap.

Before scoring, the coordinator must validate shell read/write, network, image
viewing, output rendering and the **authenticated** tool surface in a separate fresh
health environment, then destroy it. Environment failure is recorded, never silently
discarded as a bad Skill run. Do not show actors the rubric, answers, previous runs or
this author's pilot report. The three SVG PNGs are owned synthetic geometry references;
their editable source is withheld, and this is not a broad photographic benchmark.

Local Docker was unavailable: the supplied Dockerfile/container commands have not
been built or run here. A friend/coordinator must validate that boundary before the
study; a folder-only rehearsal is ineligible. No friend outcomes are prefilled.

Release gates still open:

1. Obtain a clean authenticated Codex tool surface with working task permissions.
2. Pass both explicit resource-reading smokes in new environments.
3. Complete at least one valid implicit discovery/search/inspection/application/output
   pilot using the unchanged criteria. Preserve failures as well as passes.
4. Run the independent friend study before making any reliability/performance claim.

Static green CI cannot close these behavioral gates. Review of this draft and test
preparation can proceed; publishing it as behaviorally accepted cannot.

## 中文结论

本轮没有把“安装成功”算成“自动触发成功”。隐式试跑确实主动选用了发现流程并尝试读
Skill，但读取被策略拒绝，未完成检索、筛选、复用和产物验证；显式 SVG 试跑还暴露了
账号级 MCP 污染。按试跑前固定的规则，发布建议是 **NO-GO**。测试包已备好，朋友结果
留空；需要先解决干净环境与工具执行，再按原标准复测。没有开展 DeepSeek Harness 适配。
