# Execution reliability: versioned actual regressions

Thirty-two scheduled native Codex cases are retained: eight each in v4/v5/v6/v7.
Every version was frozen/preregistered before its calls. V7 meets the unchanged
strict repair closure; v4-v6 remain failed versions. See the
[full decisions and limitations](../../../docs/codex-acceptance.md).

| File | Actual evidence |
| --- | --- |
| [observations.json](observations.json) | Per-case catalog, exact payloads, separate measures, usage, boundaries, manual scores and raw-file hashes; friend outcomes null |
| [selected-events.jsonl](selected-events.jsonl) | Selected native events/commands and model-visible receipt identities, source line/hash and truncation flags; not full page bodies or hidden instructions |
| [pdf-checks.json](pdf-checks.json) | All eight PDF content/bounds checks, independent warning/CMap counts and actual full-page review observations |
| [workbook-checks.json](workbook-checks.json) | All eight XLSX ZIP/XML/openpyxl checks, formulas/types/caches and explicit Office limitations |
| [v7 artifacts](v7-artifacts/manifest.json) | Two actual PDFs, all six root Poppler pages and byte-preserved actor verification notes (renamed .txt) |
| [errata.json](errata.json) | Withdraws the old six-line license-gap claim; retains the independent method failure and original evidence |
| [pdf-diagnosis.json](pdf-diagnosis.json) | Separate old-PDF copy repair, pixel equality, failed diagnostics and bounded claims |
| [installation-diagnosis.json](installation-diagnosis.json) | Real install reports, exact-current-pin fallback, recorded missing exit and explicitly synthetic masking experiment |

V4's SVG count and workbook search fail; v5 workbook never observably loads/searches;
v4-v6 have strict PDF warning failures. They are not removed, pooled or replaced by
v7. The workbook is new at v4 and a known regression afterward. These are author
repair diagnostics, not a friend's A/B results, independent held-out generalization
or evidence of a performance gain. Explicit smokes never earn implicit-trigger scores.

Actual v7 PDFs: [B01](v7-artifacts/B01/report.pdf), [B02](v7-artifacts/B02/report.pdf).
Complete viewed pages:
[B01 p1](v7-artifacts/B01/page-1.png), [p2](v7-artifacts/B01/page-2.png), [p3](v7-artifacts/B01/page-3.png);
[B02 p1](v7-artifacts/B02/page-1.png), [p2](v7-artifacts/B02/page-2.png), [p3](v7-artifacts/B02/page-3.png).
HTML fixture/documentation are root MIT. Embedded Noto font is SIL OFL 1.1, with
the [identical reviewed license](../review-gates/full-chain-preview/Noto-LICENSE.txt)
already retained in this repository; no tool or standalone font binary is bundled.

Full private RPC may contain credentials/account context, hidden instructions,
image data and third-party bodies. Only reviewed selections/digests are public.
Native aggregate output does not prove the actor received its entire content;
manual review checks actual raw return content and order. Byte hashes establish
identity, not compliance or comprehension. No automatic LLM judge is introduced.
