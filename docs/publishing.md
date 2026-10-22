# Publishing research and launch copy

Checked 2026-10-23. Drafts only: no form submitted, account connected, paid placement,
formal Release or mass outreach authorized. Recheck destination rules before submission.

**Current decision: GO for a limited Codex testing preview under the registered rule.**
The following copy remains an unpublished testing invitation draft.
[Actual versioned retests](codex-acceptance.md) pass both complete explicit smokes
and one full implicit discovery chain; the latest sibling misses source-review
evidence. PDF compatibility warnings and absent friend results remain explicit.
Do not present this as proven reliability, performance improvement or production readiness.

## Directory requirements

| Destination | Current first-party evidence | Prepared / remaining |
| --- | --- | --- |
| [skills.sh FAQ](https://www.skills.sh/docs/faq) | Lists skills through real CLI installation telemetry; no separate submission form required for that route | Public GitHub layout and commands ready. Tests disable telemetry; do not manufacture installs or promise ranking/index timing. Optional packs require Vercel/GitHub account connection |
| [Skillboard submission](https://www.skillboard.lol/submit) | Public GitHub repository or skill directory, valid `name`/`description`, license permitting indexing/attribution; normalized, checked and deduplicated | Two skill-directory URLs and MIT supplied. Human submits after branch review; account requirements beyond the visible form not established |
| [Agent Skills Directory](https://www.skillsdirectory.com/) | Following its live Submit link reaches [sign-in](https://app.skillsdirectory.com/sign-in?returnTo=/submit), offering GitHub, Google or an emailed sign-in link; the same flow creates an account | Sign-in is required before the submission form. Authenticated fields, OAuth scopes, fees and approval timing remain unverified; no account action performed |
| [AGNXI](https://agnxi.com/about) | Current About page describes a small hand-kept personal list; old search snippets still describe an open submission catalog | Do not rely on the stale submit instructions. No current public submission route confirmed; any personal outreach requires separate approval |

“Agent Skills Directory” is an ambiguous name; the actual domains are listed to avoid
confusing independent services. In particular, `skillboard.dev` is a separate shared
execution-trace service, not the `skillboard.lol` GitHub submission catalog above.
The three catalog/FAQ/sign-in sources above were opened again on 2026-10-23. The
skills.sh URL guessed for this repository was inaccessible to the research tool;
no actual listing, rank or index status is confirmed. The FAQ describes a discovery
mechanism, not evidence that this repository is already indexed. [agentskills.io](https://agentskills.io/specification)
is the format specification, not an automatic community listing service.

The optional [skills.sh packs flow](https://www.skills.sh/docs/packs) requires Vercel
sign-in and a team; importing GitHub sources uses a connected account. It omits
binary files and individual files over 2 MB. Packs are optional and unlisted;
creating one does not establish leaderboard placement. This repository's installable
payloads contain text resources; its image examples live outside those payloads.

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
The current binder example was accepted by its user after a new whole review.
A separate paired CSV execution probe tied; no performance improvement is inferred.

Versioned clean Linux retests now pass both complete explicit smokes, including an
exact edit and three-image SVG preparation. In the latest two implicit author trials,
one actually inspects the adopted method and license bodies, records its decision
before use, reuses the library/font and independently verifies the PDF. The other
still lacks returned method evidence. No external Skill was adopted in those trials.
Earlier failures remain visible; a corrected explicit fixture has a separate version.
All four new PDFs pass the original content/page checks, but font compatibility
warnings remain, including malformed unused character-map entries in the full-chain
result. The registered limited testing-preview minimum is met; these diagnostics
do not estimate reliability. The isolated friend pack has blank outcome fields.

Try the reviewed PR payload for testing (not yet merged) with:

```sh
npx skills@1.7.4 add https://github.com/youchibuwan-ops/agent-workflow-skills/tree/675a2cc18e2e477045ad55bcb54ca5b7b3560dba --skill proactive-skill-discovery -a codex
```

[Source and examples](https://github.com/youchibuwan-ops/agent-workflow-skills).
Instructions currently use Chinese. I would value reproducible reports of over-triggering,
poor candidate selection or a task that still fails after installation. No benchmark
improvement or proven automatic-trigger reliability is claimed. The independent
Codex experiment is prepared, with its outcome fields empty.

## 中文技术社区草稿

**标题：** 不止“帮我找个 Skill”：把筛选、实际使用和经验维护连起来

我在维护两份开源 Skill，重点是 proactive-skill-discovery。它先匹配本地能力，
有真实缺口才查外部方案，实际读内容、依赖和许可证，然后验证原任务，最后把
已证实的可复用决策补进已有 Skill。

这次仓库准备发现了一个实际问题：单项安装成功，但根目录 MIT 正文没跟着安装。
因此补了每项的许可文件，并用隔离目录安装、内容比对和引用读取验证。SVG 案例
保留了漏查结构、用户纠正和返工过程，不把审阅者同意当作质量证明。当前长尾夹版本
已获用户同意公开展示；另有两版均通过的 CSV 执行测试，如实记为平局。

源码、安装命令和案例在[GitHub 仓库](https://github.com/youchibuwan-ops/agent-workflow-skills)。
欢迎反馈真实失败例，尤其是误触发、筛选不当、安装后仍不能完成任务的情况。
新版干净 Linux 测试已完成两份显式冒烟：精确编辑和三视角 SVG 研究均通过。最新两次
隐式试跑中，一次实际读完采用方法和许可正文、先记录采用判断再执行，并完成库／字体
复用与 PDF 独立核验；另一次仍缺方法正文证据，保留失败。没有采用外部 Skill，不能把库
复用宣传成外部 Skill 复用。旧失败和欠指定的旧测试保留，新编辑测试单独版本化。
四份新 PDF 通过原定内容和逐页检查，但字体兼容性警告仍在，包括完整链成品的未使用
字符映射异常。已达到原定有限测试预览门槛，不能宣称稳定可靠。隔离 A/B 包的朋友结果
仍为空，不宣称成功率或效率提升。当前只是未投稿的测试邀请草稿。

## Short social drafts and follow-up

EN: Find a skill, inspect it, use it, verify the task, retain the lesson. Agent Workflow
Skills includes a real audit trace, editable SVG case and a frozen Codex study pack.
Both explicit smokes and one complete implicit chain pass the limited-preview gate;
a failed sibling, PDF compatibility warnings and pending independent tests remain
visible: [repository](https://github.com/youchibuwan-ops/agent-workflow-skills).

中文：找 Skill 只是开始，还要筛选、实际使用、验证与沉淀。两份开源工作流附真实安装
和 SVG 案例及隔离 A/B 测试包。两份显式测试和一例隐式完整链通过有限预览门槛，失败例、
PDF 兼容性警告和待完成的朋友实验均保留，欢迎独立复现：[仓库](https://github.com/youchibuwan-ops/agent-workflow-skills)。

Choose one relevant developer community first; adapt language to its rules and disclose
maintainership. Do not post identical copy everywhere or solicit votes. After any approved
post, triage reports into install, activation, reference-selection or task-quality issues;
request a redacted reproducer, fix verified defects and update the evidence. No response
deadline is promised on the maintainer's behalf.
