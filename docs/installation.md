# Installation and compatibility

## Install one skill for Codex

Requires Git and Node ≥22.20.0 (CLI 1.7.4's declared minimum). Run from the project:

```sh
npx skills@1.7.4 add https://github.com/youchibuwan-ops/agent-workflow-skills/tree/c1434f04704938774eb359053aaafdf38ee90868 --skill proactive-skill-discovery -a codex
npx skills@1.7.4 add https://github.com/youchibuwan-ops/agent-workflow-skills/tree/c1434f04704938774eb359053aaafdf38ee90868 --skill crafting-reference-based-svg-assets -a codex
```

These commands pin the reviewed PR payload at `c1434f0`; the PR is not merged.
The Skill files are unchanged in this acceptance round. Each command selects one skill. Add `--copy -y` for unattended project installs;
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
npx skills@1.7.4 add https://github.com/youchibuwan-ops/agent-workflow-skills/tree/c1434f04704938774eb359053aaafdf38ee90868 --skill proactive-skill-discovery -a codex -g
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
format-compatible candidates. Actual native automatic/explicit pilots were blocked;
resource loading and the full automatic chain have not passed. See
[Codex acceptance](codex-acceptance.md); do not treat listing as successful loading.
