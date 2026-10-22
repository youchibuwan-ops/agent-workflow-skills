# Codex acceptance and friend A/B pack / Codex 验收与朋友测试包

The target payload is frozen at `c1434f04704938774eb359053aaafdf38ee90868`.
The runnable wrapper uses native Skills CLI installation, Codex `skills/list` and
`codex exec --json`; it does not emulate a model or use another host's trigger proxy.
Skill instructions are unchanged by this pack. No DeepSeek Harness work is included.

Guard repairs after the author pilots did not change frozen tasks, model, budgets,
rubric or target payload. No behavioral rerun is claimed for the repaired wrapper.
Read [protocol.json](protocol.json) and [the frozen rubric](RUBRIC.md) before running.
The [record template](RESULT_TEMPLATE.json) intentionally contains no friend results.
The HTML, text and three bracket reference PNGs are owned synthetic fixtures under
the root MIT license. The bracket is a controlled construction, not a new photographic
reconstruction benchmark. Its original vector source is withheld from actors.

## Study design / 实验设计

- Run A **without** the target; B with exactly one target. Do not enable the other
  target or personal discovery helpers. The same built-in system skills are allowed
  in both and their actual names/hashes must be compared.
- Test `discovery`, `svg` and the adjacent `control` separately. Use three fresh
  runs per arm/task, with the declared counterbalanced order. Do not resume/fork
  sessions, reuse homes/caches/workspaces, or show an actor earlier results/rubrics.
- Fix the same CLI, model, effort, sandbox, tools, network, image ID and budget in
  each pair. Current protocol: CLI 0.155.1, `gpt-6-astra`, medium, 300 seconds and
  40 observed tool-start events. Usage is reported; the CLI has no hard total-token
  or dollar cap. A budget stop is a recorded outcome, not a discarded run.
- If that model is unavailable to the friend, agree and preregister another **same**
  available model in both arms before any task. Do not silently fall back or pool
  different configurations into one result. Preserve the old protocol/version.
- Score blind, using raw events and actual output files. Installation, discovery,
  loading, automatic activation, external reuse and task success are separate fields.
  Explicit smokes are separate; they do not earn automatic-trigger evidence.

朋友应在全新一次性 VM／容器中逐次运行，只挂载本次输入和空结果目录；不要挂载仓库、
个人主目录、其他轮结果、评分材料或既往对话。每轮结束销毁环境；A/B 共享的只能是
事先固定的只读基础镜像。外部网站、服务缓存和模型服务端缓存不能完全控制，须记录。
评分员保留盲码映射，演员只见当前任务。不要让朋友阅读作者试跑结果后再“盲测”。

## Native local preparation / 本地预检

Requires Python 3.10+, Node >=22.20.0, Git and Codex CLI 0.155.1. Install the pinned
Codex CLI with `npm install -g @openai/codex@0.155.1` in a disposable environment.
Run from the repository; output must be a new directory outside it:

```sh
python evals/codex/run.py prepare --task discovery --arm A --out /absolute/private/A1
python evals/codex/run.py prepare --task discovery --arm B --out /absolute/private/B1
```

Replace `discovery` with `svg` or `control` for the other tasks. B is actually installed
from the frozen GitHub commit and compared with every expected payload byte. A never
downloads the target. Both obtain a fresh Codex-home/profile/cache and actual host
catalog; non-system skills other than B's exact target cause a preparation failure.

Before running, compare each pair's `input_sha256`, system-skill inventories and
environment/tool versions. Files in `.agents` and CLI lock metadata are the intended
treatment difference. `HOME`/`USERPROFILE`/`CODEX_HOME` and caches are isolated, but
**separate directories on one OS user are not a security boundary**. Native author
pilots must be labeled as such. Use the VM/container procedure for the friend study.

## Environment health prerequisite

Before any scored run, use a **separate** fresh environment to check an authenticated
Codex task can read a fixture, create an output, access required network/tools, view
an image and render/inspect its output. Inspect the real tool surface for account MCP
or plugin contamination as well as the local catalog. A successful text-only `READY`
reply does not establish shell/file access. Destroy the health environment afterward.
If blocked, retain an environment failure record; do not score it as an efficacy loss
or proceed until the declared study environment works. Never change the prompt/rubric
to accommodate the resulting failure.

## Real Codex execution

Authenticate separately in the disposable environment. An optional `--auth-file`
accepts the participant's **private** Codex account file, copies it temporarily into
the isolated state and removes that copy afterward. Never commit/share credentials,
the home/state/cache folders, or unreviewed raw logs. The pack contains no credential.

```sh
python evals/codex/run.py run --out /absolute/private/B1 --auth-file /private/auth.json --isolation-boundary native-pilot
```

The command above is an ineligible native rehearsal, not a friend study result.
For a disposable VM, use `--isolation-boundary disposable-vm --boundary-id <FRESH_VM_ID>`.
The declaration is a coordinator record, not automatic attestation. Destroy that VM
(including its processes/home/cache) after each run. Windows process-tree cleanup is
best-effort and cannot guarantee cleanup of orphan descendants.

The same command operates A. Every `run` needs a freshly prepared directory. Raw
`events.jsonl`, `stderr.log`, `prompt.txt`, `preparation.json`, `catalog.json`,
`execution.json` and current `workspace` artifacts are retained. The wrapper rechecks CLI and target/system payloads before execution, and target/system
payloads after it. Unexpected MCP stops the run; any such event invalidates it. It records
read candidates but **does not automatically award activation or task success**.
Review the command, actual output and ordering against the rubric.
Exit code 0 means only that a turn completed and needs review; known invalid/blocked
or budget outcomes return 2. Never use process exit code as the task/trigger score.

Separate explicit loading smokes use fresh B environments:

```sh
python evals/codex/run.py prepare --task control --arm B --out /absolute/private/explicit-discovery
python evals/codex/run.py run --out /absolute/private/explicit-discovery --explicit --auth-file /private/auth.json
python evals/codex/run.py prepare --task svg --arm B --out /absolute/private/explicit-svg
python evals/codex/run.py run --out /absolute/private/explicit-svg --explicit --auth-file /private/auth.json
```

The SVG smoke is read-only R/B research. It cannot count as authoring/assembly or
final visual acceptance. PDF success requires actual text and page-image checks;
SVG success requires actual editable sources and image inspection.

## Disposable container recipe

Build once and record the immutable resulting image ID:

```sh
docker build -f evals/codex/Dockerfile -t workflow-skill-study .
docker image inspect workflow-skill-study --format '{{.Id}}'
```

Use that ID in place of `<IMAGE_ID>`. Prepare a **new empty** host result directory,
then prepare and execute in one disposable container, mounting no host home/repo:

```sh
docker run --rm --memory=4g --cpus=2 --pids-limit=256 --cap-drop=ALL --security-opt=no-new-privileges --mount type=bind,src=/absolute/empty/B1,dst=/results --mount type=bind,src=/private/auth.json,dst=/run/secrets/codex-auth.json,readonly --entrypoint sh <IMAGE_ID> -c 'python3 /opt/experiment/run.py prepare --task discovery --arm B --out /results/run && python3 /opt/experiment/run.py run --out /results/run --auth-file /run/secrets/codex-auth.json --sandbox danger-full-access --isolation-boundary container --boundary-id <IMAGE_ID>'
```

Change only arm and fresh result path for A. The container is the external isolation
boundary, hence its inner Codex sandbox setting. Keep native pilots at workspace-write.
Do not run this full-access variant against a host repository. Container build and
execution require Docker; an unexecuted recipe must not be reported as tested.

Delete private state/cache/home directories before handing redacted evidence to the
scorer; preserve the declared task inputs, outputs and event records. Keep credential
cleanup separate from result preservation. A neutral coordinator must scan/redact
secrets and local identities without changing task outcomes or grading observations.

## Local checker tests

```sh
python -m unittest discover -s evals/codex -p test_run.py
```

They test isolation guards and conservative evidence parsing, not model behavior.
No paid/authenticated model calls run in CI. Official references:
[skills](https://learn.chatgpt.com/docs/build-skills),
[JSONL execution](https://learn.chatgpt.com/docs/non-interactive-mode),
[Codex state locations](https://learn.chatgpt.com/docs/config-file/environment-variables),
[host catalog](https://learn.chatgpt.com/docs/app-server).
