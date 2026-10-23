# Pelican SVG: one frozen A/B pair

Requested 2026-10-23. This is an actual workflow comparison to execute, not an
effectiveness claim. It extends the one-line pelican prompt with equal deliverable,
tool and provenance requirements, so it is not a raw single-reply model leaderboard.
The pure [judge instruction](JUDGE.md) excludes treatment/process information.

Before model calls freeze [protocol](protocol.json), [task](prompt.txt),
[common tools](TOOLS.md) and [rubric](RUBRIC.md) in Git. Target the published SVG
Skill at `d8a81d9`, not a concurrently modified personal Skill. B has that one
target; A has none. Both receive an identical prompt with no explicit Skill call.
Do not claim loading/use from installation. This pair does not test a second
proactive-discovery treatment.

Execution uses existing `evals/codex/run.py` and `record_rpc.py`, copied into a
fresh private package with this protocol, the v7 payload manifest and just this
task's files. Thin adapters map actor paths to the external recorder, attest the
actual namespace probe, count fileChange starts, drain queued events with an EOF
completeness flag and retain observed image/SVG versions. Existing study packages
and results remain unchanged. A shared boundary digest identifies the protocol;
the distinct run directories/probes identify separately created namespaces.
Keep the recorder, protocol, preparation metadata and logs in the external control
plane. Mount only the task workspace, fresh actor home/state/cache, identical pinned
runtimes/renderer and temporary actor authentication into each clearenv Bubblewrap
namespace. Copy only the verified release Skill payload into B before execution;
no installer cache is inherited. Do not mount the source repository, control files,
personal home, sibling outputs, judge rubric or prior examples.
Record actual effective model/effort, Apps/MCP catalog, isolation and file hashes.
Temporary auth copies are removed; full raw records remain private.

Execution checklist:

- [ ] Freeze and independently inspect setup before generation.
- [ ] Run B, then A once each, sequentially, retaining every failure and draft.
- [ ] Independently parse/render original outputs; do not repair their artwork.
- [ ] Assign neutral IDs, verify blind-copy pixels, hide mapping and source/process.
- [ ] Two fresh xhigh reviewers independently score the locked rubric, reversed order.
- [ ] Hash verdicts before unblinding; retain disagreement and all results.
- [ ] Deliver both SVGs, original-size previews, comparison and an honest report.

Use existing resvg-js 2.6.2 (MPL-2.0) for local rendering; inspected constructor/
render/asPng API and license grant/distribution terms. No renderer binaries,
dependency trees, fonts, credentials or copyrighted source-page bodies are bundled
in the eventual evidence package. Reproduction needs those tools installed locally.
Private setup failures before model calls, including the initial shell PATH quoting
error, are distinct from generated-artwork failures and remain recorded.
