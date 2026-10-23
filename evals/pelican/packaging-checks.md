# Publication packaging checks — 2026-10-23

This is validation of packaging, not a new generation experiment or visual-quality score.
No new actor run, model judge or Skill-payload change was made for this update.

- Four displayed source artifacts match their retained actor SHA256 values. The
  excluded static B also matches its retained source. Static SVG XML parses; no
  raster/image elements were found in the four displayed vector source files.
- Released `skills/` files are unchanged relative to `d8a81d9`.
- Raw native streams each contain exactly one unique visible user-message item for
  each final actor. This supports the no-mid-run-human-correction statement for both
  conditions, not a relative reduction in reminders.
- Local Markdown link targets, source hashes and public-text privacy patterns passed
  118 assertions before the final packaging links were added; final links were rechecked.
  The privacy scan covered home paths, credential patterns and encrypted-payload fields.
  No raw RPC, command bodies, reference photographs or private account files are published.
- The offline viewer's real WebM video played in the Codex in-app browser over
  localhost: duration 12 seconds, 1200 × 500, observed time advancing from 0.20 to
  11.30 seconds, no media error. Both original animation frames loaded; Stop unloaded
  both. The inspected desktop page had no horizontal overflow.
- A real compatibility failure is retained: the Linux headless browser advertised no
  H.264 support and could not play the MP4. WebM was added from the same comparison
  recording without retiming. MP4 remains available for compatible players.
- A subsequent automated Linux gallery check stalled at `browserContext.newPage`
  and was terminated with a 45-second limit. This was a packaging-test environment
  failure, not a new A/B outcome. The successful in-app browser check is recorded
  separately; automated mobile-layout testing and a broad browser matrix are not claimed.

Public [capture reports](animated-v1/results/A-capture.json) and
[B capture report](animated-v1/results/B-capture.json) belong to the earlier actual
experiment, not this viewer check. They retain real-time frame jitter and original
playback observations. Original sources, summaries and experiment standards were
not changed to obtain a better result.

`SHA256SUMS` covers the public case pages, presentation media, exact outputs and
result metadata. Frozen experiment inputs remain versioned in Git. Recomputing a
checksum proves file identity, not the truth of a quality claim.
