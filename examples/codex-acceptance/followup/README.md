# Follow-up: actual loading, automatic discovery and isolated execution

This supplements, without replacing, the [initial blocked runs](../README.md).
Read the [current acceptance decision](../../../docs/codex-acceptance.md).
These are author diagnostics using the original protocol, not friend outcomes.

- [observations.json](observations.json): separate installation/loading/activation,
  inspection, adoption and task outcomes; original log digests and artifact hashes.
  Includes an installation failure where no model task ran.
- [selected-events.jsonl](selected-events.jsonl): selected actual commands, exits,
  image-view records, search/open arguments and final visible messages, with original
  line numbers/event digests. It is **not** a complete RPC log. Private paths are
  replaced; full command outputs, hidden instructions, third-party page text,
  image bytes, account identifiers and state/cache directories are not published.
- [pdf-checks.json](pdf-checks.json): independent pypdf/pdfplumber checks of all three
  generated outputs. Root actually viewed every Poppler page; a separate reviewer
  also checked the Windows RPC and Linux PDFs with their own extraction/renders.
- [PDF](pdf-example/report.pdf), [generation/verification source](pdf-example/deliver.mjs),
  and independent [page 1](pdf-example/page-1.png), [page 2](pdf-example/page-2.png),
  [page 3](pdf-example/page-3.png): the actual Windows RPC output, not a corrected demo.

The PDF's owned source HTML is [the frozen fixture](../../../evals/codex/tasks/discovery/report.html).
Generated code and owned fixture are MIT. Embedded Noto Sans CJK is under the
[included SIL OFL](pdf-example/Noto-LICENSE.txt); no font binary is redistributed.
The third-party PDF Skill was inspected and rejected, not copied into this package.
The separate Microsoft-font CLI PDF remains private.

## What the events show

| Run | Observation | Limit |
| --- | --- | --- |
| Windows RPC discovery | Target read before method choice; actual source/license open; libraries applied; independently verified PDF; protocol primary 5/5 | Candidate Skill rejected; full source/license-fit review of adopted libraries/font not observed; no causal claim |
| Linux Bubblewrap discovery | Target read, actual WeasyPrint output and page views; independently verified PDF | Search snippets and saving a license file do not establish full inspection; primary condition 4 unmet |
| Windows RPC SVG | Actual three image views | Four-hole reference misread as three; retained failure |
| Linux Bubblewrap SVG | Actual three image views, correct four holes and continuous fold | Passes only read-only preparation, not production |
| Explicit discovery, both platforms | Actual installed instruction and reference reads | Original task omits replacement text; actor asks; no completed byte-edit task |
| Adjacent control A/B | Exact bytes in both; B does not activate target | One author pair, not a measured over-trigger rate |

The Windows CLI discovery output also passed independent PDF checks, but CLI JSONL
does not expose the full license-open arguments. Its earlier unobservable result
stays unobservable. A new RPC observation cannot fill an old run's missing evidence.
All runs stay separate; no favorable subset is turned into a success-rate claim.

## Reproduce the published PDF

This reproduces the actor's artifact, **not** an automatic-trigger experiment.
In a fresh working folder with Node 22.22.1, copy `deliver.mjs` and the frozen
`report.html`. Create `.tools/`, obtain the unmodified
[Noto CJK font](https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf)
as `.tools/NotoSansCJKsc-Regular.otf`, and retain its OFL notice. Create `.tools/tmp/`
for the actor's temporary-file setting. Then:

```sh
npm install --prefix .tools --no-audit --no-fund pdfkit@0.20.2 cheerio@1.2.0 pdfjs-dist@6.4.299 @napi-rs/canvas@1.0.13
cp deliver.mjs .tools/deliver.mjs
node .tools/deliver.mjs
```

The source includes the actor's PDF.js text/geometry checks and page renders.
Library versions are the actual installed versions; this command re-resolves their
transitive dependencies. It does not promise byte-identical PDF timestamps or broad
HTML/CSS conversion fidelity. Check all current pages, not just process exit 0.
Independent checks used different tooling; their results/hashes are in `pdf-checks.json`.
The coordinator also ran these pinned dependencies/source in a new empty folder:
all generation checks passed and independent Poppler renders matched all three
published pages pixel-for-pixel. [Reproduction record](pdf-example/reproduction.json).
This is artifact reproducibility evidence, not another model or automatic-trigger test.

## Linux boundary reproduction

Actual host: WSL Ubuntu, Bubblewrap 0.9.0, Python 3.12. Native distributions:

| Read-only runtime | Actual SHA256 |
| --- | --- |
| `@openai/codex` tarball `codex-0.155.1-linux-x64.tgz` | `f110cccdd50b0be8130b84f45b3144ea775c233f1c8bd8226da6ee719d63d206` |
| Official `node-v22.22.1-linux-x64.tar.xz` | `9a6bc82f9b491279147219f6a18add1e18424dce90d41d2a5fcd69d4924ba3aa` |

The coordinator checked npm integrity/official Node SHASUMS before extraction.
The base included an isolated Python venv with verified pip 25.3; task dependencies
were installed only inside the current writable workspace. An attempted private
Poppler apt download returned 404 and was not included; independent Poppler checks
ran outside the actor after completion. No host package installation was performed.

Prepare a read-only `/opt/experiment` containing only `run.py`, `record_rpc.py`,
`protocol.json`, `payloads.json` and `tasks/`, and a new empty result root. Do not mount
this repository, rubric, expected vector source, earlier runs or host home. The actual
namespace configuration used:

```text
bwrap --unshare-all --share-net --die-with-parent --new-session --cap-drop ALL
  --ro-bind /usr /usr --symlink usr/bin /bin --symlink usr/lib /lib
  --symlink usr/lib64 /lib64 --proc /proc --dev /dev --tmpfs /tmp
  --ro-bind <SSL> /etc/ssl --ro-bind <resolver> /etc/resolv.conf
  --ro-bind <owned-hosts> /etc/hosts --ro-bind <owned-passwd> /etc/passwd
  --ro-bind <boundary-marker> /.dockerenv
  --ro-bind <verified-node> /tools/node --ro-bind <verified-codex> /tools/codex
  --ro-bind <isolated-python> /tools/python
  --ro-bind <actor-package> /opt/experiment
  --ro-bind <current-private-auth-file> /run/auth.json
  --bind <new-empty-results> /results
```

The marker declares an existing Bubblewrap container; it does not create isolation.
The coordinator actually checked mounts, hidden paths and the PID namespace before
starting the model. Network was shared, using an explicitly declared credential-free
HTTP proxy because normal WSL transport required it. Record that transport and match
it for A/B; never inherit personal proxy/account configuration or use inner full access
without the external boundary. The commands inside the tested boundary were:

```sh
python3 /opt/experiment/run.py prepare --task discovery --arm B --out /results/run --codex /tools/codex/package/vendor/x86_64-unknown-linux-musl/bin/codex --network-proxy <PROXY_ORIGIN>
python3 /opt/experiment/record_rpc.py --out /results/run --auth-file /run/auth.json --sandbox danger-full-access --isolation-boundary container --boundary-id <BASE_DIGEST> --network-proxy <PROXY_ORIGIN> --experimental-raw-events
```

For explicit smokes use fresh containers/results and `--task svg` or `--task control`,
then add `--explicit` to the recorder. Remove both proxy options where no proxy is
needed; fix transport before starting. Never copy results/state into the next actor.
Use private results, inspect the actual authenticated tool surface, remove transient
auth, terminate the namespace/processes and destroy the writable environment each time.

The published runner has later evidence-preservation guard repairs; frozen tasks,
Skill bytes and grading are unchanged. Their earlier execution hashes remain in the
records; no model rerun is claimed for those final guard-only changes. These three
Linux author diagnostics are not the blinded/counterbalanced friend study. Docker's
separate recipe is still unexecuted locally. Follow the [friend protocol](../../../evals/codex/README.md)
before collecting any independent comparison.
