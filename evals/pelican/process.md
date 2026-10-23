# Visible process evidence

These are short excerpts of messages the actors exposed during their original runs,
not hidden reasoning. Raw line numbers link to the metadata-only indexes alongside
each pair's results; event hashes identify retained private source events. Actor
statements describe their own work and do not become independent validation.
No corrective human message was sent during either displayed pair. A also self-corrected.

| Actor | Raw line | Visible excerpt | Interpretation |
| --- | ---: | --- | --- |
| Static A | 204 | “the wheel interiors need to show the shoreline through the spokes, and the far foot needs to be visible on the opposite pedal” | Baseline detected and addressed its own issues |
| Static B | 120 | “I’m using the reference-based SVG skill to check the bird’s anatomy and bicycle connections.” | Visible adoption; actual Skill read is recorded at line 60 |
| Static B | 316 | “The bicycle and pelican are drawn and rendered separately. I’m checking them together now” | Local-to-whole workflow reported |
| Static B | 484 | “the saddle was almost hidden, and the far crank crossed over the foot” | Actor reported a specific review finding and correction |
| Animated A | 309 | “I’m tightening the chain geometry and wheel contact, then checking loop closure and readability at 600 × 450.” | Baseline also performed iterative review |
| Animated B | 111 | “I’m using the reference-based SVG skill to check the bicycle’s structure and the pelican’s silhouette.” | Visible adoption; actual Skill read is recorded at line 55 |
| Animated B | 473 | “a raised knee was disappearing behind the wing, and the brake cable ended without a visible attachment” | Actor identified two concrete local defects |
| Animated B | 613 | “I’m making one last layering correction so the far foot passes behind the rear tire” | Further correction near cutoff; no subsequent primary completion |

Indexes: [static A](v1/results/A-trace-index.json), [static B](v1/results/B-trace-index.json),
[animated A](animated-v1/results/A-trace-index.json), [animated B](animated-v1/results/B-trace-index.json).
They omit command bodies, fetched pages, account identifiers and image payloads.
The event indexes are not tool-start counters: visible completions/messages and
registered primitive starts are different event sets.

The actors also reported numeric pose checks. Those were self-authored checks,
not independent proof of every pose or artistic correctness. The published
coordinator assessment is limited to original source validation, offline playback
and sampled visual contacts. No numeric quality score was assigned.

Static replacement B's retained failure notes report missing Pillow (replaced with
standard-library PNG dimension parsing), a failed independent-review launch, and
a resvg narrow-crop panic (full-canvas rendering still succeeded). Static A also
has two failed shell commands; their source hashes/exit codes remain in its summary.
Animation has no nonzero completed shell-command exits, but B's time-budget
termination is a separate failure to finish and remains visible.
