# Controlled DeepSeek Harness workflow host

This is an installable native DSH bundle and a controlled launcher for the shared `hosts/core/workflow-host.mjs`. It pins `@deepseek-ai/dsh@0.2.1-rc.2` and requires Node 24.9 or later. DSH currently calls this a developer preview; the exact version is intentional.

The bundle alone does not make an ordinary DSH chat safe. Start tasks through `workflow-dsh`. It binds a trusted controller, loads the actual CLI profile through official `runProfile`, verifies the active root guard and startup refusal probes, and only then creates an official Agent. Direct `dsh --profile ...` startup has no bound controller and is refused. The bundle disables automatic headless runners, HMR and model-facing plugin/config management.

The model receives only the exact shared-core schemas. Native shell, PTC, unknown tools and nested native dispatch are rejected. A scoped tool with a matching name but a different definition is also rejected. Root-owned guard effects remain after managed-plugin disposal; service removal or replacement closes the process until a trusted restart. Ordinary missing-prerequisite results can be corrected; dispatcher exceptions, explicit fatal results and host-health failures abort without falling back to raw tools.

Automatic tool-output spilling, result pruning and context compaction are disabled in this controlled profile. A byte-delivery receipt from shared core must correspond to the full tool content actually passed to the model; a downstream transform must not replace inspected sources with a summary or inaccessible spill file.

Source reads return unpredictable one-use challenges. The model must receive those results and submit their tokens through `workflow_confirm_sources` before source review or reference observation can pass. A single response that prearranges a final read followed immediately by review therefore fails; independent read tokens may be confirmed together in a later request. Stage reports are emitted by the host from physical prerequisites; ordinary automatic mode does not require the model to compose seven checkpoint JSON records.

## Install a verified distribution

Keep the full verified distribution layout, including sibling `hosts/core` and its referenced `skills` payloads. Installing this folder as an isolated npm package does not supply that shared business controller. Choose a dedicated DSH home and custom profile; the installer does not modify global profiles.

From the distribution root, install the pinned local runtime dependencies and create the profile:

```powershell
npm ci --prefix ./hosts/dsh --ignore-scripts --omit=dev
node ./hosts/dsh/install.mjs --home 'C:/absolute/workflow-dsh-home' --profile proactive-workflow
```

`workflow-dsh-install` uses the official CLI to create a custom profile from the shipped headless template and run `dsh plugin ... add` against the stable installed package path. The package pins MIT-licensed `pnpm@11.25.0`; the installer uses its own local binary and current Node before the inherited PATH, so installation does not depend on a Codex-private package-manager shim. It verifies that the bundle was activated. Repeat installation preserves an existing profile rather than using `--from-default-profile` again. A production installer should pin and verify the complete distribution and dependency lockfile before activating this directory.

The resulting profile contains the ordered bundles `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-headless`, and `dsh-proactive-workflow`. The launcher rejects additional bundles and nonempty home/profile patch layers before loading them. It supplies its own final launch policy, so user configuration cannot silently restore an automatic model driver. Configure normal task behavior through the shared controller's validated contract, not arbitrary Cordis patches.

## Run a task

Supply authentication using the existing environment variable `DEEPSEEK_API_KEY`; do not write it into configuration or command arguments. Save the actual human request in a UTF-8 file outside the actor-controlled workspace, then run:

```powershell
node ./hosts/dsh/launcher.mjs --workspace 'C:/absolute/task-workspace' --home 'C:/absolute/workflow-dsh-home' --profile proactive-workflow --user-message-file 'C:/absolute/human-request.txt' --state-root 'C:/absolute/private-task-state' --audit-file 'C:/absolute/private-task-audit.json'
```

`--contract` can identify a host-owned JSON contract accepted by shared core. `--core-module` can identify a different verified core module; the default is the sibling `../core/workflow-host.mjs`. A runtime already installed elsewhere can be selected with `--runtime-root` pointing to the directory whose `node_modules` contains the pinned DSH CLI.

Add `--check` to preflight the same isolated profile without creating an Agent or making a model call. Preflight requires a supplied contract with a nonempty catalog and references. It uses an OS-only environment snapshot, does not load project/home `.env` files, disables model providers, runs the six real native refusal probes and closes the Loader. Its final JSON line is `type: workflow_check`, `status: ready`, `complete: false`, `modelStarted: false`, `nativeDenials: 6`, `forbiddenBodies: 0`; success exits 0. The real scope cards precede that line. A failed preflight exits 1 and is not task completion.

Defaults are provider `deepseek-official`, model `deepseek-flash`, 4096 maximum output tokens per request, 48 admitted steps and a 120-second run timeout. `--max-tokens` accepts 128–8192, `--max-requests` accepts 1–64, and `--timeout-ms` accepts 1000–600000. Native LLM retry is disabled so failures do not silently turn into unbounded retry traffic.

The launcher emits JSON lines for real shared-core `workflow_card` values and authoritative model/tool events. A final `workflow_result` is `complete` only if shared core is complete and the durable model turn completed. An unfinished workflow returns `waiting` and exit 2; blocked/error returns exit 1. A polite model final answer or idle Agent is insufficient evidence of completion. A waiting result requires the indicated human choice or missing prerequisites; it is not a completed task.

Only the trusted embedding API calls `controller.acceptUserMessage(...)`; no model-facing tool supplies authorization, a human choice, signatures or arbitrary trusted facts. The initial external user request is passed directly to `createWorkflowHost` by the launcher.

## Verification

From the distribution root:

```powershell
node --test hosts/dsh/native.test.mjs hosts/dsh/launcher.test.mjs hosts/dsh/cli.test.mjs
```

The native tests use the real DSH ToolRuntime with a clearly marked controller double while exercising host-boundary behavior. The profile-loader test uses the official installer and Loader and creates real parent/child Agent scopes without calling a model. Set `DSH_RUNTIME_ROOT` to an installed runtime directory and optionally `DSH_TEST_ROOT` to a private evidence directory, then run:

```powershell
node --test hosts/dsh/profile-loader.test.mjs hosts/dsh/source-confirmation.test.mjs
```

`model-smoke.test.mjs` requires explicit `DSH_REAL_MODEL_TEST=1` and existing authentication. It makes real model requests and writes evidence only to the private test directory. Its controller is doubled, so its result is adapter smoke evidence and is not a complete shared-core workflow test.

`source-confirmation.test.mjs` uses an actual native Agent/scheduler with a scripted provider and no network request. It deliberately emits final-read plus review in one response, verifies refusal, and then confirms the real returned token in the next response before successful review.

`fullchain-model.test.mjs` instead uses the actual shared controller, current input bytes, a method requiring multiple delivered and challenge-confirmed ranges, installed readback, two confirmed references, independent JSON validation, all seven automatic checkpoint cards and a concrete learning decision. Set `DSH_FULLCHAIN_MODEL_TEST=1` explicitly to run its normal and deliberate early-write-rejection/recovery cases. Use Node's `--test-name-pattern` to run only one case when the model-call budget is limited. These are paid real model runs; keep the raw events, exact input/output bytes, code hashes and host audit in the private evidence directory.

This is a registry and trusted-host control boundary, not an OS sandbox for malicious privileged plugins or a machine owner. Do not expose arbitrary execution or external unprovisioned agent providers. Keep the controller, credentials, profile, runtime payload and evidence signer outside the actor's permitted writes.
