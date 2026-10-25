# Discovery and learning / 主动发现与学习流程

Use [proactive-skill-discovery](../skills/proactive-skill-discovery/SKILL.md).
Default capability is unproven for every new authorized execution task. Research
professional Skills and multiple relevant sources before production; familiarity,
old scripts and reviewer agreement do not establish fitness for this task.

## Current workflow — 2026-10-25

Each transition now requires a visible checkpoint before the dependent action,
with task/revision, completed actions, actual evidence, missing items and next action.
The last checkpoint of a complete task is `learning`, including a concrete justified
no-increment decision when no Skill change is warranted. See the
[executable gates and real-model regressions](discovery-gates.md).

1. Understand the task, retained requirements, boundaries and stopping point.
2. Actively inspect professional Skills, licenses, methods and multiple relevant
   materials or mature examples. Install and use suitable missing capabilities.
3. Present normally 3–5 supported, comparable options with real materials,
   differences, limitations and a recommendation. Let the user choose the main
   direction before building it. Respect an already chosen or explicitly delegated decision.
4. Build an actual reviewable draft using the chosen direction and verify it.
5. Translate feedback into concrete differences, research any missing mechanism,
   revise and recheck the affected whole.
6. Finish the complete contract and confirmed feedback; distinguish draft,
   technical verification and user acceptance.
7. Extract supported lessons, update the appropriate existing Skill or create and
   verify a new reusable capability, and show the changed location and evidence.

**需求 → 主动找 Skill 与多份资料/实例 → 先选方案 → 初稿 → 反馈调整 → 完整交付 → 总结并维护或制作 Skill。**

The [execution record](../skills/proactive-skill-discovery/references/execution-record.md)
connects each requirement to a method, installation/reuse decision, actual artifact,
verification and unresolved scope. The final handoff includes capability changes,
result checks and concrete lesson-maintenance results. A log alone is not maintenance.

Discussion and criticism do not authorize a new task. Paused work stays paused.
Later summaries do not cancel earlier explicit requirements. New examples are a
[workflow walkthrough](../examples/discovery-complete-loop/README.md) and an
[actual controlled maintenance fixture](../examples/discovery-maintenance-loop/README.md).
These do not establish universal reliability or completed game-art quality.

## Historical research and reuse decisions — 2026-10-23

These sources informed our adaptation. Their results do not establish this
repository's efficacy, and the papers' benchmarks were not rerun here.

| Primary source actually inspected | Adopted idea / boundary |
| --- | --- |
| [Reflexion v4](https://arxiv.org/abs/2303.11366v4) | Feedback and episodic textual guidance can support later attempts without weight updates. Our adaptation uses concrete task evidence rather than treating reflection itself as verification |
| [Intrinsic self-correction study v2](https://arxiv.org/abs/2310.01798v2) | Its reasoning experiments caution against correction without external feedback; this is not a claim that every present model or task behaves identically |
| [Voyager v2](https://arxiv.org/abs/2305.16291v2) | Executable skill reuse with environment/execution feedback; Minecraft results do not prove generic workflow reliability |
| [SkillsBench v4](https://arxiv.org/html/2602.12670v4) | Paired task verification and applicability/fallback boundaries; its trajectory audit identifies heavyweight or mismatched recipes as failure modes. Keep the workflow focused |
| [SkillForgeBench](https://arxiv.org/abs/2610.14918) | Assess procedural requirements separately from an apparently correct final answer; our small tests are not that benchmark |
| [Anthropic skill-creator](https://github.com/anthropics/skills/tree/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/skill-creator), Apache-2.0 | Inspect task outputs and baselines in fresh contexts. Its `run_eval.py` measures a Claude description-trigger proxy, not Codex task quality; no unchanged runner or automatic activation result is claimed |
| [kulaxyz self-learning](https://github.com/kulaxyz/self-learning-skills/tree/1304fce375b5d4c4508cab9eea05bbb8b95c38f6), MIT | Preserve verified procedures and useful rejected paths; prefer the existing appropriate Skill. Its task-stopping default is not adopted into this continuous task |
| [pskoett self-improving-agent](https://github.com/pskoett/self-improving-agent/tree/e958afb5bf697c7d22898f9bba53406e2e3261bd) | Read as a candidate: OpenClaw logging/maintenance, not a Codex activation runner. No license file was identified in that checked tree; it was not copied or installed |

Actual CLI queries included `skill discovery` and `self improving`, using Skills CLI
1.7.4 with telemetry disabled. Search titles/popularity were leads, not acceptance
criteria. Existing installed workflows and standard-library tools were sufficient
for the execution fixture. No additional learning service, hook, account or runtime
was introduced. The [execution evidence](validation.md#discovery-and-learning-execution)
separates actual artifacts, source/interface checks and hypothetical decisions.
