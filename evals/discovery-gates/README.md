# Native model tasks and executable gate checks

This package adds actual file-task regressions for the discovery workflow. It reuses
the existing Codex native CLI/JSONL and isolated-environment helpers in `evals/codex/run.py`;
it does not invent a model judge or treat the actor's own `passed=true` as a result.

## Reproduce local deterministic checks

```sh
npm ci --ignore-scripts
npm run test:workflow
python -m unittest discover -s evals/discovery-gates -p test_run.py
```

The Node suite checks the shipped gate and actual official DSH rc.2 ToolRuntime
dispatch. The Python suite checks the frozen-input artifact oracle, including
tampered input and non-object JSON. These tests invoke no model or credentials.

## Run one real Codex task

Requires an installed Codex CLI, an authorized existing account, and an actual
writable native sandbox. Use a new result directory outside this source repository:

```sh
python evals/discovery-gates/run.py --out /absolute/new-private-results --case selected-reuse --skill /absolute/reviewed-skill-folder --auth-file /absolute/private-auth.json
```

Omit `--skill` for a no-guidance control; use a frozen original directory for an
old-Skill comparison. Cases: `selected` (new installation required), `selected-reuse`
(identical complete bundle already installed), `research` (options only), `paused`
and `status`. The first three perform actual permitted filesystem actions; the
last two must honor the restricted user request. `--seconds` defaults to 180.

The runner creates owned input, stale cache, two local candidate mirrors and two
reference fixtures. Networking is explicitly prohibited in these tasks. This tests
current-source inspection, introduction/reuse, sequence and boundary behavior;
it does not measure live GitHub search ranking or artistic quality. The candidate
and input payloads are frozen per run, and the original bytes remain the output
oracle. A new directory is required for every trial; no failed result is overwritten.

The existing `temporary_auth` helper copies credentials only into isolated state
and deletes the copy in `finally`; neither credentials nor raw private system
messages belong in public results. Review all outputs before sharing them. The
environment is isolated for this native pilot; a folder is not an OS containment
proof. The selected CLI model is its default, with no model override.

## Manual behavior review is required

`execution.json` deliberately leaves `behavior_pass=null`. Review actual
`events.jsonl`, not only `response.md` or artifact correctness. Check full source,
method and license returns; installation/read-back or verified existing reuse;
scope before candidate actions; discovery/selection before production; independent
checks on current artifacts; all applicable visible checkpoints and maintenance.
Preserved inputs and correct output are necessary, not sufficient.

An installation refusal with no dependent production can pass the no-bypass
criterion while the task remains environment-blocked. A correct output with a
late checkpoint fails the strict sequence contract. Report those separately.
The runner does not automatically attach a host guard to every task call.

See [public versioned evidence](../../examples/discovery-gates/README.md) and
[enforcement boundaries](../../docs/discovery-gates.md). Older SVG and v1-v7
protocols/results were not edited or regraded.
