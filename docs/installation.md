# Installation and compatibility

## Install one skill for Codex

Requires Git and Node ≥22.20.0 (CLI 1.7.4's declared minimum). Run from the project:

```sh
npx skills@1.7.4 add https://github.com/youchibuwan-ops/agent-workflow-skills/tree/675a2cc18e2e477045ad55bcb54ca5b7b3560dba --skill proactive-skill-discovery -a codex
npx skills@1.7.4 add https://github.com/youchibuwan-ops/agent-workflow-skills/tree/675a2cc18e2e477045ad55bcb54ca5b7b3560dba --skill crafting-reference-based-svg-assets -a codex
```

These commands pin the tested v3 PR payload at `675a2cc`; the PR is not merged.
The discovery instructions were revised in versioned, preregistered candidates;
the SVG payload is unchanged. Each command selects one skill. Add `--copy -y` for unattended project installs;
copy mode avoids symlink permissions on Windows. PowerShell users can use `npx.cmd`
if `npx.ps1` is blocked, without changing execution policy.

```text
.agents/skills/proactive-skill-discovery/
  SKILL.md
  LICENSE
  agents/openai.yaml
  references/adapting-upstream-skills.md
  references/learning-from-work.md
```

The SVG skill has the same layout with `visual-diagnosis.md` and
`project-profile-example.md` and `execution-record.md`. Repository examples/check tools are outside both payloads.

## Confirm installation

```sh
npx skills@1.7.4 add youchibuwan-ops/agent-workflow-skills --list
npx skills@1.7.4 list -a codex
```

Open installed `SKILL.md` and its reference links. Invoke `$proactive-skill-discovery`
or `$crafting-reference-based-svg-assets` in Codex. If absent, restart the host.
CLI listing verifies files, not host activation or task quality.

[Current OpenAI local skill locations](https://learn.chatgpt.com/docs/build-skills)
and [upstream CLI documentation](https://github.com/vercel-labs/skills) describe the
host and installer. The verified installer version here is 1.7.4.

## User-wide install

```sh
npx skills@1.7.4 add https://github.com/youchibuwan-ops/agent-workflow-skills/tree/675a2cc18e2e477045ad55bcb54ca5b7b3560dba --skill proactive-skill-discovery -a codex -g
```

CLI 1.7.4 targets `~/.agents/skills/`. This global path was checked in upstream source;
tests use isolated project directories and do not overwrite existing personal skills.

## Update or remove one skill

Back up adaptations before updating: upstream replacement can discard local edits.
Run from the project that owns the install:

```sh
npx skills@1.7.4 update proactive-skill-discovery -p -y
npx skills@1.7.4 remove proactive-skill-discovery -a codex -y
```

For global installs replace `-p` with `-g` when updating, and add `-g` when removing.
Avoid `--all` and unscoped bulk updates for a single-skill change.

## Manual fallback and reviewed versions

Clone this repository and copy one **complete** `skills/<name>/` directory into
`.agents/skills/<name>/` for Codex project use. Preserve its name, license, references
and UI metadata; copying only `SKILL.md` breaks the package.

For an immutable source, check out a reviewed Git commit. The CLI can also select a
GitHub `tree/<commit>/skills/<name>` URL; verify that exact URL before using it.
An unpinned `owner/repo` command tracks the older public default branch until PR #1
is merged; the commands here pin the actual reviewed payload.

The final remote check of `675a2cc` installed discovery successfully, then the SVG
clone failed with a missing-ref message. Both standalone commands passed on a fresh
retry, with exact bytes, license and reference reads verified. CLI 1.7.4 tries a
SHA-fetch fallback but suppresses its inner error; the first message does not prove
that this published commit is absent. The underlying transient failure is unresolved.
If it recurs, preserve the error and use a new local checkout at the exact commit
with `npx skills@1.7.4 add /absolute/checkout --skill <name> -a codex --copy -y`.
Do not silently substitute an unpinned branch. See the [install check record](../examples/codex-acceptance/review-gates/installation.json).

## Dependencies, privacy and compatibility

Both skills are instructions plus references. They bundle no executable, service,
paid API, API key, game engine or required external review model. Discovery needs
network/tool access when searching externally; SVG work needs actual image viewing
and a renderer supplied by the host. `find-skills` is optional.

The third-party installer sends telemetry by default. Its documented opt-outs are
`DISABLE_TELEMETRY=1` and `DO_NOT_TRACK=1`; tests set both. Bash can prefix the install
with `DISABLE_TELEMETRY=1`; PowerShell can set `$env:DISABLE_TELEMETRY='1'` for that process.
Verification installs are not promotional traffic.

Codex package discovery/resource integrity was tested. Other Agent Skills hosts are
format-compatible candidates. Both instruction/resource loads now pass in actual
Codex runs, including Bubblewrap-isolated Linux. Automatic inspection/adoption and
task outcomes remain separately qualified in [Codex acceptance](codex-acceptance.md);
listing alone never establishes loading or task success.
