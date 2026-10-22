# Publishing research and launch copy

Checked 2026-10-22. Drafts only: no form submitted, account connected, paid placement,
formal Release or mass outreach authorized. Recheck destination rules before submission.

## Directory requirements

| Destination | Current first-party evidence | Prepared / remaining |
| --- | --- | --- |
| [skills.sh FAQ](https://www.skills.sh/docs/faq) | Lists skills through real CLI installation telemetry; no separate submission form required for that route | Public GitHub layout and commands ready. Tests disable telemetry; do not manufacture installs or promise ranking/index timing. Optional packs require Vercel/GitHub account connection |
| [Skillboard submission](https://www.skillboard.lol/submit) | Public GitHub repository or skill directory, valid `name`/`description`, license permitting indexing/attribution; normalized, checked and deduplicated | Two skill-directory URLs and MIT supplied. Human submits after branch review; account requirements beyond the visible form not established |
| [Agent Skills Directory](https://www.skillsdirectory.com/) | Public site links to `app.skillsdirectory.com/submit`; says submissions are reviewed and listed entries have automated analysis | Linked form was inaccessible through research tooling; login, required fields, fees and approval timing are unverified. Manual account/form inspection remains necessary |
| [AGNXI](https://agnxi.com/about) | Current About page describes a small hand-kept personal list; old search snippets still describe an open submission catalog | Do not rely on the stale submit instructions. No current public submission route confirmed; any personal outreach requires separate approval |

“Agent Skills Directory” is an ambiguous name; the actual domains are listed to avoid
confusing independent services. [agentskills.io](https://agentskills.io/specification)
is the format specification, not an automatic community listing service.

Submission sources after these changes are reviewed and merged:

- `https://github.com/youchibuwan-ops/agent-workflow-skills/tree/main/skills/proactive-skill-discovery`
- `https://github.com/youchibuwan-ops/agent-workflow-skills/tree/main/skills/crafting-reference-based-svg-assets`

Do not submit the new descriptions as already live on `main` before merge.

## Project descriptions

**English:** Agent Workflow Skills helps coding agents find, inspect and adapt suitable
skills, verify real task outputs, and retain proven lessons in maintained workflows.
A companion skill covers reference-based editable SVG props and visual review.

**中文：** Agent Workflow Skills 让编码代理在能力有缺口时主动发现、筛选并使用合适的
Skill，用真实任务验证结果，再维护已证实的经验。另提供实物 SVG 逐件制作与复审流程。

## English technical community draft

**Title:** Agent Workflow Skills: discovery that continues through verification and learning

I maintain two instruction-based Agent Skills. The main one, proactive-skill-discovery,
starts with installed capabilities, inspects external candidates and licenses when needed,
then keeps going through task verification and maintaining reusable lessons.

The repo includes an actual release-audit trace: individual installation worked, but
the root MIT notice was missing from both standalone payloads. The updated check
compares installed files and opens reference resources. The SVG example also retains
failed reviews and corrections rather than presenting every iteration as success.

Try one skill with:

```sh
npx skills@1.7.4 add youchibuwan-ops/agent-workflow-skills --skill proactive-skill-discovery -a codex
```

[Source and examples](https://github.com/youchibuwan-ops/agent-workflow-skills).
Instructions currently use Chinese. I would value reproducible reports of over-triggering,
poor candidate selection or a task that still fails after installation. No benchmark
improvement is claimed; controlled DSH comparisons can be added when actually run.

## 中文技术社区草稿

**标题：** 不止“帮我找个 Skill”：把筛选、实际使用和经验维护连起来

我在维护两份开源 Skill，重点是 proactive-skill-discovery。它先匹配本地能力，
有真实缺口才查外部方案，实际读内容、依赖和许可证，然后验证原任务，最后把
已证实的可复用决策补进已有 Skill。

这次仓库准备发现了一个实际问题：单项安装成功，但根目录 MIT 正文没跟着安装。
因此补了每项的许可文件，并用隔离目录安装、内容比对和引用读取验证。SVG 案例
保留了漏查结构、用户纠正和返工过程，不把审阅者同意当作质量证明。

源码、安装命令和案例在[GitHub 仓库](https://github.com/youchibuwan-ops/agent-workflow-skills)。
欢迎反馈真实失败例，尤其是误触发、筛选不当、安装后仍不能完成任务的情况。
后续 DSH 版与对照测试将单独记录，目前没有宣称成功率或效率提升。

## Short social drafts and follow-up

EN: Find a skill, inspect it, use it, verify the task, retain the lesson. Agent Workflow
Skills includes a real release-audit trace and an editable SVG review case. Try it
and report a reproducible failure: [repository](https://github.com/youchibuwan-ops/agent-workflow-skills).

中文：找 Skill 只是开始，还要筛选、实际使用、验证与沉淀。两份开源工作流附真实安装
和 SVG 案例，欢迎带着具体失败情况来反馈：[仓库](https://github.com/youchibuwan-ops/agent-workflow-skills)。

Choose one relevant developer community first; adapt language to its rules and disclose
maintainership. Do not post identical copy everywhere or solicit votes. After any approved
post, triage reports into install, activation, reference-selection or task-quality issues;
request a redacted reproducer, fix verified defects and update the evidence. No response
deadline is promised on the maintainer's behalf.
