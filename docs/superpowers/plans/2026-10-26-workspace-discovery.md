# Workspace Discovery Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline; perform one fresh whole-branch review after implementation.

**Goal:** Both controlled hosts discover and inspect the selected project without the user supplying filenames.

**Architecture:** Shared bounded metadata browser plus explicit bound-workspace context. DSH enumeration uses its original native permission route; host path policy checks protect results and boundaries.

**Tech Stack:** Existing Node 24 ESM, native Codex 0.164.0-alpha.11.1 and sealed DSH 0.2.1-rc.2; no new dependency.

**Spec:** `docs/superpowers/specs/2026-10-26-workspace-discovery-design.md`

## Global Constraints

- Preserve protected/private paths, no-follow policy, original native permissions, human controls and stop boundaries.
- No game changes, robot changes, credential disclosure or modifying immutable R39 payloads.
- The private test per-response ceiling is 100000 tokens; do not impose it on daily model/user settings or invent a small aggregate task budget.
- Existing unrelated untracked packaging files remain untouched.

## Review Focus

- A selected workspace containing private subroots must not reveal their entries.
- Junction/ancestor swaps during native listing must not permit outside reads.
- Large/Unicode names must paginate without silently truncating metadata.
- Native directory denial must not fall back to unrestricted host enumeration.
- Cold task restoration must provide current workspace context and rediscover current files.

### Task 1: Shared browser and workspace context

**Files:** `hosts/core/tool-schemas.mjs`, `hosts/core/workflow-host.mjs`, new `hosts/providers/workspace-directory.mjs`, new `hosts/core/workspace-discovery.test.mjs`.

**Interface:** existing reader with `path:'.'` or a directory path; directory `length` maps to page limit. Results `{path, entries:[{name,path,type}], offset, next_offset, total, complete}`. Status includes the current workspace root and browser availability. Keep all R39 external schemas byte-equivalent, so old histories remain usable; listing alone never advances a stage.

- [x] Add real filesystem tests: random nested names, bounded pages, engine marker readback, empty/Unicode, protected/private/linked resources and stop-boundary refusal. Run to observe missing-browser/context failures.
- [x] Implement the shared helper and bounded tool; check path identity before/after provider calls and cap response size with honest pagination. Surface workspace in instructions/status.
- [x] Run `node --test hosts/core/*.test.mjs hosts/conversation/*.test.mjs`; inspect results and correct regressions before proceeding.

### Task 2: Original native directory permission route

**Files:** `hosts/providers/native-workspace-io.mjs`, provider tests and `hosts/dsh-global/launcher-native.test.mjs` / `broker.test.mjs` as needed.

**Interface:** `workspaceIO.list(path, {offset,limit})` returns a validated native page; missing capability is explicit and never calls direct enumeration.

- [x] Add failing native enumeration and refusal tests, including actual unknown-file discovery rather than hardcoded reads.
- [x] Add the fixed literal-path directory reader through original pwsh scheduling/permission services; validate complete output and retain root policy.
- [x] Run the real DSH native suite with sealed SDK and required runtime; keep failures and skipped scope explicit.

### Task 3: Live acceptance, maintenance and delivery

**Files:** current-release public evidence under `evidence/`, private native logs outside repository, both Skill stage-check references if the concrete blind-project criterion needs maintenance.

- [x] Freeze a fresh source identity; run full global/package/policy checks and independent review. Do not borrow R39's identity or counts.
- [x] Deploy a new candidate using existing pinned runtime/dependencies; verify fresh/cold actual Codex sessions and a fresh official-provider DSH session discover unknown nested project inputs and reread exact current bytes. Do not interrupt unrelated live user work.
- [x] Record the known-path test blind spot and its behavioral counterexample. Verify any Skill maintenance with same-class and adjacent cases.
- [ ] Build/verify the final package, publish within prior authorization, check CI and anonymously download/verify it. Deliver actual coverage and limitations.
