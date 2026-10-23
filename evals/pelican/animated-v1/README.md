# Animated pelican A/B, version 1

**Execution update:** [original outputs and actual outcomes](results/README.md) are
retained. A completed; B saved playable HTML but reached the time cap.
[Combined bilingual case and offline demo](../README.md).

This is a new experiment, separate from the preserved static SVG runs. A has no target Skill; B installs only the six-file released `crafting-reference-based-svg-assets` payload from `d8a81d9f0c46c94f2c8ccb904da0514377a8573c`. Neither prompt forces Skill invocation. The task is an animation extension of the SVG exercise; transfer of the Skill's methods to animation is unverified.

Both conditions use Codex CLI 0.155.1, gpt-6-astra/xhigh, identical tools and task text, and upper caps of 900 seconds/80 registered primitive tool starts. There is no hard token or monetary cap; equal caps do not imply equal consumption. Order is fixed A then B. Run once each, retain failures, and do not select the best of retries.

The external driver creates fresh Bubblewrap mount/PID namespaces and empty workspace/home/state/cache per actor. It does not mount this experiment's protocol, rubrics, control logs, the game project, static artwork, or the other actor. B's frozen Skill is the only treatment. Apps and remote-plugin features are disabled, with authenticated native MCP/app catalogs checked before inference. Account plugin files can still download in the isolated state; this is recorded separately from enabled catalog entries and actual use. Shared network/proxy/provider caches are uncontrolled.

`native_recorder.py` is the previous native recorder with exact primary-thread AND primary-turn completion filtering, per-thread usage attribution, exception preservation, and EOF draining corrected. `test_recorder.py` runs the actual recorder against a fake executable: child/stale completion, time and tool exhaustion, parent failure, MCP contamination and process crash, without any model calls. Real-boundary browser capture and metadata-only native thread access are also tested before inference. CLI 0.155.1 full-history `thread/read` returned `list_turns is not supported yet`; no recovery capability is claimed from metadata-only access.

`capture.mjs` is a thin wrapper around Playwright 1.56.1 (Apache-2.0) and its pinned Chromium 141 headless shell. It records natural browser playback; sampled PNGs are not a replacement for watching the video. Browser binaries and locally extracted Ubuntu runtime libraries are private test dependencies, not redistributed in the repository or Skill. The original-source HTML is never repaired by the coordinator.

Public files here are the frozen task/protocol, tools, review criteria, driver, recorder and no-model tests. Machine-specific execution data, credentials, original raw RPC and reference photographs stay private. Raw RPC can include private account/system content, hidden reasoning, fetched pages and image bytes; do not publish it wholesale. Preserve a sanitized visible trace, failure evidence, output hashes and actual usage separately.

No additional paid model judges are launched in this cost-bounded round. Coordinator visual review is unblinded. A neutral review packet may be prepared for later independent review; do not claim it has already been judged or reuse static-run scores. A single pair supports descriptive observations, not statistical or general performance claims.

The private driver refuses inference unless the external `preflight-pass.json` records the same package hashes and zero-inference checks. Its absolute paths document this local execution; adapt only those paths for another machine, then rerun all preflight checks before using any inference budget.
