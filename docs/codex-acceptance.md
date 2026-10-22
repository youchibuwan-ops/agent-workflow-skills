# Codex pre-release acceptance — 2026-10-23

**Both standalone instruction/resource loads now pass. Overall limited-preview
acceptance remains NO-GO under protocol v1.** This follow-up completed real model
runs after repairing the environment. No Skill, task, model, effort, rubric or budget
was changed to obtain a pass. PR #1 remains a draft; no merge, Release, submission or
DeepSeek Harness work occurred.

[Follow-up evidence, actual PDF and page previews](../examples/codex-acceptance/followup/README.md)
include failures as well as successes. [Initial records](../examples/codex-acceptance/README.md)
remain unchanged. These are author diagnostics, not friend results or performance evidence.

## Environment repair and actual isolation

- Windows CLI 0.155.1 without a selected sandbox backend produced effective read-only
  permissions despite requested workspace-write. Selecting `windows.sandbox="unelevated"`
  and placing runtime flags after `exec` produced real successful fixture reads,
  writes and byte verification. The earlier failed invocation remains recorded.
- Apps and remote plugins are separate surfaces. Both are disabled per invocation.
  Authenticated `config/read`, `mcpServerStatus/list` and `app/installed` found disabled
  features and zero MCP servers/apps before the new tasks. This is separate from
  local `skills/list`. Unexpected MCP aborts a run.
- A credential-free proxy can be declared explicitly and must match preparation.
  No personal proxy configuration is inherited. Git HTTP/1.1 is process-local.
  A GitHub installation failure and the initial no-proxy Linux health timeout remain
  failures. A terminal CP936 display issue was separately diagnosed; raw Chinese
  resources were intact, so it is not used to explain away the SVG mistake.
- New Linux runs actually used WSL Ubuntu and Bubblewrap 0.9.0: separate mount/PID
  namespaces, dropped capabilities, read-only runtime/task package, fresh writable
  result root, temporary `/tmp`, and only the current auth file mounted read-only.
  Probes found no Windows mount, host home, scoring rubric or sibling results;
  the initial PID namespace contained only PIDs 1 and 2. Inner full-access mode was
  used only inside that external boundary. This is not a Docker build or a VM.
- The Linux authenticated health task actually read/wrote/verified a Chinese canary
  after restoring the declared network route. Task runs also exercised image viewing,
  network and rendering. Transient auth copies were removed; original credentials
  and account settings were unchanged.

Verified Linux Codex 0.155.1 and Node 22.22.1 distribution digests and namespace setup
are in the [reproduction notes](../examples/codex-acceptance/followup/README.md#linux-boundary-reproduction).
Network/proxy and remote services were shared. This is a tested filesystem/process
boundary, not complete infrastructure isolation. Native Windows folders remain
ineligible as a friend-study security boundary. Docker remains unbuilt locally.

## Frozen runs and separate outcomes

Target bytes remain `c1434f04704938774eb359053aaafdf38ee90868`; protocol/tasks/rubric
were frozen in `2dfd37c` before execution. Every task uses CLI 0.155.1, `gpt-6-astra`,
medium, approval never, 300 seconds / 40 observed tool starts. There is no hard total-token
or dollar cap. CLI JSONL and app-server event visibility/counts differ; do not pool them.

| Case | Actual loading / actions | Task and chain outcome |
| --- | --- | --- |
| Windows explicit discovery, repaired invocation | Target and adaptation reference successfully read | Load passes. Frozen prompt omits replacement text; actor correctly asks, no exact edit completed |
| Windows explicit SVG, CLI | Target and relevant references read; final explanation says four holes | Load passes. Actual image viewing unobservable in CLI JSONL |
| Windows explicit SVG, RPC | All three images actually opened | Preparation fails: final explanation wrongly says three holes. Real structural error retained |
| Linux explicit discovery, Bubblewrap/RPC | Target and both discovery references actually read | Load passes. Same missing replacement text; no invented edit |
| Linux explicit SVG, Bubblewrap/RPC | Target/references and three image views; correct four holes, continuous fold and specific evidence limits | Read-only preparation passes; no authoring/assembly claim |
| Windows implicit discovery, CLI | Spontaneous target read, search, actual PyMuPDF use | PDF independently passes. Full source/license inspection unobservable in this transport |
| Windows implicit discovery, RPC | Spontaneous target read before decisions; candidate source/license opened; actual PDFKit/Cheerio use | Frozen primary conditions 5/5; validation 2; rubric 9/10. External candidate Skill rejected, not adopted |
| Linux implicit discovery, Bubblewrap/RPC | Spontaneous target read; actual WeasyPrint use, font downloads and page inspections | PDF independently passes. Primary condition 4 fails: search/download do not establish actual workflow/source/license review |
| Windows adjacent control A/B | Same inputs/built-ins; both exact byte edits pass | No lookup; B does not load/trigger discovery. One author pair only |

The five protocol primary conditions do **not** require accepting the candidate.
The Windows RPC case meets them, while `external_skill_adopted=false`. Actual library/font
use is true; complete observed source/license-fit review of the adopted stack is not
established. Do not rename this result “external Skill reuse proven” or add a new
acceptance requirement after seeing it. The Linux task's correct PDF cannot fill its
missing inspection evidence, and a different run cannot fill that gap either.

The explicit discovery prompt says “make the exact requested edit” but supplies no
replacement, and the actor workspace excludes the control prompt. This is an
underspecified fixture, not evidence that the Skill cannot edit text. It is retained
as an uncompleted smoke rather than quietly repaired/regraded. A revised fixture
requires a new preregistered version; original outcomes remain.

## Independent artifact checks and observability

Three PDFs were checked against the original HTML with independent pypdf/pdfplumber
checks and Poppler renders. All 36 rows, 108 cells, selectable Chinese/English, repeated
headings and page bounds pass; every current page was actually opened. Windows RPC
and Linux PDFs also received independent read-only review. Linux rows split 18/18;
Windows RPC rows split 14/16/6. The CLI PDF has unused non-BMP font-CMap warnings;
its used text/pages passed. Other characters, viewers and physical printing are untested.

The [published PDF](../examples/codex-acceptance/followup/pdf-example/report.pdf) embeds
Noto CJK and includes its OFL notice. Generation/verification source and three
independently rendered pages are supplied. The Microsoft-font CLI PDF remains private;
no font binary or third-party Skill code is bundled.

CLI JSONL hides image-view events and some multi-URL web parameters. The optional
`record_rpc.py` uses the native app-server, not a trigger simulator or custom agent
loop. Raw events are opt-in experimental diagnostics pinned to 0.155.1. Full logs stay
private because they contain internal instructions, images and third-party pages.
Public selected records retain source line numbers/hashes, commands, exits and relevant
call arguments; they are not complete logs and do not upgrade earlier unobservable cases.

Post-run payload mutation now records invalid contamination even when its check raises;
failure states exit 2 and cleanup errors remain failures. Regression tests cover guards,
not model quality. No target instructions were changed after these observations.

## Remaining gates and release recommendation

1. **Closed:** standalone install, host discovery, both instruction/reference loads,
   authenticated empty MCP/Apps checks, working permissions, and an actually exercised
   disposable filesystem/process boundary.
2. **Observed with limits:** one native Windows RPC pilot meets five discovery conditions
   and independently passes the task. No external candidate Skill adopted; the strongly
   isolated Linux case misses inspection condition 4.
3. **Open:** the frozen explicit discovery task cannot complete without a specified
   replacement. Do not change it in place or claim both complete smokes passed.
4. **Open for broader claims:** independent blinded friend A/B runs; their records remain
   blank. One correct Linux SVG preparation does not erase the Windows structural failure
   or establish full SVG production reliability.

**NO-GO for declaring protocol-v1 limited-preview acceptance complete.** Review and
independent experimental use can proceed with these limits. Static green CI cannot
turn remaining outcomes into passes. The [friend pack](../evals/codex/README.md) retains
identical tasks/scoring, per-run disposable environments and counterbalanced repetitions.

## 中文结论

本轮已实际解决并复测工具执行、账号工具表和隔离边界，两份 Skill 都成功读取主体与配套
资源。Linux SVG 只读准备通过；Windows 同任务曾误读孔数，失败保留。Windows RPC 隐式
发现满足原定五条条件且 PDF 独立通过；候选 Skill 被拒用，不能说已采用外部 Skill。
Linux 也交付了合格 PDF，但缺完整来源/许可审阅证据，完整链不能判通过。显式发现原测试
遗漏替换内容，仍如实列为未完成。整体 NO-GO 对应这些具体未关闭项，而非继续停留在
“环境不可用”；朋友结果、可靠性和性能提升均尚未验证。
