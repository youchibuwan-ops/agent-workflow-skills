# Pelican on a bicycle: quality, autonomy and cost

[中文](README.zh-CN.md) · [Offline demo](demo.html) · [Process evidence](process.md) · [Token counters](usage.json)

Two author-run comparisons explore a practical goal: **more carefully finished
work, with the agent doing reference research and corrective review without
step-by-step human prompting.** View both original outputs and judge the tradeoff.
These are descriptive examples, not a measured general improvement or a leaderboard.

Only B received the released `crafting-reference-based-svg-assets` Skill, pinned to
`d8a81d9f0c46c94f2c8ccb904da0514377a8573c`. A had no target Skill. Neither prompt
explicitly invoked it. **These pairs do not measure proactive-skill-discovery**;
that Skill has [separate discovery-chain evidence](../../docs/codex-acceptance.md).

## See the actual work

### Static SVG

![Original static A and replacement B](v1/results/comparison.png)

[A: original SVG](v1/results/A.svg) · [B: original SVG](v1/results/B.svg) ·
[Retained interrupted B](v1/results/B-interrupted.svg) · [Results](v1/results/summary.json)

Unblinded visual observation: B makes the chainring/chain, wing feathers and pouch
shading more explicit. A uses a simpler chain guard and still delivers a readable,
coherent illustration. Detail density alone does not prove correctness or superiority.
The user preferred the apparent quality; no applicable independent blind score
exists for this final pair.

### Animated SVG

![Actual browser recordings, A left and B right](animated-v1/results/comparison.gif)

**B saved a playable animation but reached the time cap before primary completion.**
The preview does not turn that outcome into a completed task.

[12-second comparison video](animated-v1/results/comparison.mp4) ·
[WebM alternative](animated-v1/results/comparison.webm) ·
[A: original HTML](animated-v1/results/A.html) · [B: original HTML](animated-v1/results/B.html) ·
[Results](animated-v1/results/summary.json)

Download the HTML files and open them locally, or open `demo.html` from a clone.
GitHub source pages do not execute HTML. The local demo includes playback controls,
the two original animations in sandboxed frames, and their status labels. No service,
account, model call or installation is needed to view it.

Both recordings show rotating wheels, moving pedals and articulated legs. In the
six inspected contact crops per arm, feet visually meet pedals and wings meet grips:
[A contacts](animated-v1/results/A-contacts.jpg), [B contacts](animated-v1/results/B-contacts.jpg).
B depicts more explicit chainring/chain and fork-brake detail. These are unblinded,
sampled observations, not exhaustive motion verification or a numerical winner.
The user's feedback was positive about quality and accepted extra time as an expected
tradeoff. That is user feedback, not an independent evaluation.

## Same controls, actual costs

Both rounds used Codex CLI 0.155.1, **gpt-6-astra / xhigh**, the same prompt and
tools within each pair, and per-actor upper caps of **900 seconds / 80 registered
primitive tool starts**. Static and animated tasks differ and are not pooled.

| Round / actor | Seconds | Tool starts | Web searches / image views | Observed primary outcome |
| --- | ---: | ---: | ---: | --- |
| Static A | 458.16 | 12 | 0 / 3 | Completed; quality still requires review |
| Static B, replacement | 567.76 | 34 | 2 / 14 | Completed; independent review unavailable |
| Animated A | 519.18 | 22 | 0 / 10 | Completed; quality still requires review |
| Animated B | 900.09 | 55 | 2 / 27 | Budget exhausted; no primary completion |

Static B took 109.60 seconds longer. Animated B used the entire 900-second allowance;
the recorded extra 0.09 seconds includes stopping/draining. Its hypothetical completion
time is unknown. More searches or image views indicate activity, not proof of quality.
Both B runs actually read the target Skill (raw lines 60 and 55 respectively).

[Native token counters](usage.json) disclose input, cached input and output separately.
They accumulate repeated inputs across calls; cached input is part of input, and
reasoning output is part of output. They are not dollar charges, account quota
percentages or context-window sizes. Equal time/tool caps did **not** mean equal
token use. No hard token/dollar cap was enforced. These counters cover the final
four actors, not the interrupted static B, its historical judges or all project work.

## What autonomy means here

There were no mid-run human artwork corrections in either displayed condition, and
the coordinator did not edit the artwork. B read the Skill, researched references,
inspected parts and the whole, and recorded its own overlap corrections. A also
inspected and corrected its work. [Visible process excerpts](process.md) show both.

The value to explore is bringing careful checks into the agent's routine, reducing
the need to personally supervise every detail. **This experiment does not quantify
reminders saved: both conditions received zero corrective reminders.** A future
human-in-the-loop study would need a fixed intervention policy and equal quality
target. No new standard was substituted for these frozen trials.

## Failures, isolation and review boundaries

- Static order was interrupted B → A → one authorized fresh replacement B. The old
  recorder mistook a child completion for the primary completion at 711.26 seconds
  / 33 starts. Its `completed_needs_review` label was wrong. Its SVG and failure
  are retained; it is excluded from the displayed pair, not hidden as a quality retry.
  Two historical blind reviews apply only to that interrupted pair and cannot be
  reused for replacement B or animation. Replacement B's internal review launch
  also failed. See the [pre-call amendment](v1/results/precall-amendment.json).
- Static A and replacement B each retain two nonzero command exits. B's failures
  include missing Pillow and a renderer crash on a narrow crop; its full render
  succeeded. Rendering original static SVGs independently pixel-matched saved PNGs.
- Animation ran A then B, once each. Recorder fake-RPC tests, real isolated browser
  capture and zero-inference native setup preceded generation. Both streams drained
  completely, with zero tool overrun and zero nonzero completed shell commands.
  B's expected budget exit remains a non-completion. No retry or extension followed.
- Actors used fresh Bubblewrap mount/PID namespaces and empty home/state/workspace/
  caches. Only B had the frozen six-file target payload; enabled catalogs and hashes
  were checked before/after. Apps and remote-plugin features were disabled and
  authenticated MCP/app catalogs empty. Account plugin cache downloads can still
  occur; shared provider/network caches are uncontrolled. This is not hardware isolation.
- Each animation was captured offline for about 12.5 seconds with 13 sampled PNGs.
  Both had zero observed page/console errors or blocked network requests in Chromium
  141.0.7390.37. The [A capture](animated-v1/results/A-capture.json) and
  [B capture](animated-v1/results/B-capture.json) retain real-time sampling jitter.
  Video removes the same initial 0.3 seconds from each recording; GIF is a scaled
  six-second preview. Motion was not retimed. No exact-frame seam, continuous-contact
  proof, cross-browser guarantee or full kinematic pass follows from playback checks.
- One final pair per task, fixed order, stochastic generation and an unblinded
  coordinator cannot establish causality, success rates or general Skill effectiveness.
  No independent blind review of either final pair has been completed.

## Reproduce and reuse

Frozen [static prompt/protocol/rubric](v1/README.md) and
[animation prompt/protocol/recorder](animated-v1/README.md) remain unchanged. Preserve
the static amendment when describing this run. On a new machine adapt private driver
paths, verify isolated tool/catalog/payload boundaries, run the no-model preflight,
then freeze a new run ID before generation. Do not inherit either output or notes.
The driver is a record of this environment, not a portable one-command benchmark.

Public evidence contains exact source outputs, presentation media, status/cost
summaries and hash-linked visible-event indexes. Full raw RPC, drafts, original
recordings and historical judge files remain privately retained: they may contain
account/system content, hidden reasoning or third-party fetched material. The indexes
are an audit aid, not a substitute for a full independently reproducible transcript.
No reference photographs, browser binaries or account data are redistributed.

These newly generated SVG/HTML artifacts, recordings of those artifacts and the
documentation are distributed under the repository [MIT license](../../LICENSE).
They are not the differently licensed binder-clip photographs. Text and line art
are editable; there are no embedded reference photos in the delivered sources.

See [packaging verification](packaging-checks.md) and [SHA256SUMS](SHA256SUMS).
From this directory, `sha256sum -c SHA256SUMS` verifies the public case files.
