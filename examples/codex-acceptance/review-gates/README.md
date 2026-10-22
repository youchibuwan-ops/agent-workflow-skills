# Actual v2/v3 review-gate regressions — 2026-10-23

Read the [current acceptance scope](../../../docs/codex-acceptance.md).
The original [v1 evidence](../followup/README.md) is retained. No friend results
or general success-rate, reliability or performance estimate is supplied.

- [observations.json](observations.json): all 12 actual actor runs, exact payload/input
  provenance, clean catalogs/tool surfaces, usage, manual separate outcomes and
  original file digests. Built-in inventories are deduplicated without changing hashes.
- [selected-events.jsonl](selected-events.jsonl): original source line/event hashes,
  commands/exits, actual image views, web arguments and actor-visible receipt digests.
  Long generated-code commands use labeled previews; full logs remain private.
- [pdf-checks.json](pdf-checks.json): independent checks of all four actual PDFs.
  Root and a separate reviewer inspected all 12 current Poppler page images.
- [installation.json](installation.json): final exact-commit standalone CLI checks,
  including a retained clone failure and a fresh successful retry of both packages.
- Actual full-chain trial previews: [page 1](full-chain-preview/page-1.png),
  [page 2](full-chain-preview/page-2.png), [page 3](full-chain-preview/page-3.png).
  These are unchanged renders of its final PDF, with the [Noto OFL notice](full-chain-preview/Noto-LICENSE.txt).
  The original PDF is 13.7 MB and remains in the private artifact store; its SHA256
  is `e7d23d660ada258472487eb332831772ac6e174296653a22d72110a5b290237f`.
  No large embedded font, external library or third-party Skill is copied into this repo.

The actor's complete stdout is **not** necessarily the tool text returned to the
model. V2/v3 grading checks actual returned content and timing, including truncation.
Public exports omit hidden system/developer messages, account/session identifiers,
credentials, private machine paths, image bytes and complete third-party page bodies.
Hashes establish correspondence to retained originals; they are not automatic proof
of semantic inspection. [Versioned tasks/rubric](../../../evals/codex/README.md) allow new execution.

## Results kept separate

| Version / trial | Loading and task | Source/license/pre-use gate |
| --- | --- | --- |
| V2 explicit discovery / SVG | Both pass: exact edit and actual three-image preparation | Explicit tests, not automatic discovery |
| V2 implicit B1 | Automatic load; independent PDF pass | Not established: pypdf method absent, license range missing, late decision record |
| V2 implicit B2 | Automatic load; independent PDF pass | Not established: returned API section unrelated; new verification/native components not reviewed |
| V3 explicit discovery / SVG | Both pass | Same narrow explicit scope |
| V3 implicit B1 | Automatic load; independent PDF pass | Not established: adoption statement present, required API body and license ranges absent |
| V3 implicit B2 | Automatic load; original five primary conditions and independent PDF validation=2 | Pass: actual method/license bodies before visible decision and use |
| Each version's control A/B | Exact edits; no external search or discovery load in B | One author pair per version, no general over-trigger rate |

V2 candidate `dc4cace` was preregistered in `5d05432`; v3 candidate `675a2cc` in
`3052aff`, before their respective model calls. Candidate instructions changed;
the implicit tasks, rubric, model, effort, network/tool profile and caps did not.
Each version's six-case author schedule is retained; these familiar-task diagnostics
cannot establish causal improvement or replace a blinded friend's study.

Three early v3 attempts never prepared or called a model: the coordinator's driver
mistakenly substituted Node-v32 for the verified Node-v22 mount. Their original
failure digests are retained as **pre-actor setup failures**. The path was fixed,
mounts checked and fresh directories used; those later actual runs have distinct IDs.

## Exact full-chain evidence and limits

For `v3-discovery-B-runtime-02`, actual source/response records show versioned
PyMuPDF Story/Page methods, the AGPL body and Noto 2.004 OFL body before adoption
message line 325 and first task execution line 341. PyMuPDF/Noto are actually used
locally; no external Skill was adopted. The original HTML is unchanged.
Source and license use-scope decisions are bounded to that observed local workflow.

The result passes all 36 rows/108 cells, selectable Chinese/English, repeated headers,
bounds and full current-page inspection. It also contains **1,884 odd-length unused
ToUnicode tokens**, producing **5,652 pypdf warning lines** during independent review.
These compatibility defects are retained. Current used text and Poppler rendering
pass; strict PDF conformance, arbitrary characters, other viewers and printing are
not established. The actor's CMap repair is not promoted as a generally validated
recipe, and no stricter conformance rule was invented after observing the output.
V2 B2 separately emits FontBBox warnings. Correct task output does not erase any
failed source-review gate or imply all PDF viewers are supported.

The [same Bubblewrap setup](../followup/README.md#linux-boundary-reproduction) and
verified runtimes were reused with fresh per-run state and explicit credential-free
transport. Native RPC/raw events remain experimental CLI-0.155.1 diagnostics.
Docker's separate recipe remains locally unbuilt. No Release, merge or post occurred.
