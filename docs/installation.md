# Installation and compatibility

## Install one skill for Codex

Requires Git and Node ≥22.20.0 (CLI 1.7.4's declared minimum). Run from the project:

```sh
npx skills@1.7.4 add https://github.com/youchibuwan-ops/agent-workflow-skills/tree/v0.1.0-codex-preview.1 --skill proactive-skill-discovery -a codex --copy -y
npx skills@1.7.4 add https://github.com/youchibuwan-ops/agent-workflow-skills/tree/v0.1.0-codex-preview.1 --skill crafting-reference-based-svg-assets -a codex --copy -y
```

These commands pin [Codex preview v0.1.0-codex-preview.1](https://github.com/youchibuwan-ops/agent-workflow-skills/releases/tag/v0.1.0-codex-preview.1) at `d8a81d9`;
both payloads are byte-identical to tested candidate v7 (`6aaedb3`). Both tagged
standalone remote installs and both extracted-ZIP local CLI installs were actually
verified on 2026-10-23 with fresh isolated home/cache directories and telemetry off.
Every installed file, MIT text, reference read, UI prompt and CLI listing matched.
Installation does not establish task success. Each command selects one Skill.
`--copy -y` enables unattended project installation and avoids symlink permissions
on Windows. PowerShell users can use `npx.cmd`
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
npx skills@1.7.4 add https://github.com/youchibuwan-ops/agent-workflow-skills/tree/v0.1.0-codex-preview.1 --list
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
npx skills@1.7.4 add https://github.com/youchibuwan-ops/agent-workflow-skills/tree/v0.1.0-codex-preview.1 --skill proactive-skill-discovery -a codex -g
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

## Install a standalone release ZIP

The [pre-release assets](https://github.com/youchibuwan-ops/agent-workflow-skills/releases/tag/v0.1.0-codex-preview.1) contain one complete directory per Skill, plus
`SHA256SUMS.txt`. Download the desired ZIP and compare its checksum before extracting:

```sh
sha256sum -c SHA256SUMS.txt --ignore-missing
mkdir -p .agents/skills
unzip proactive-skill-discovery-v0.1.0-codex-preview.1.zip -d .agents/skills
```

PowerShell:

```powershell
Get-FileHash ./proactive-skill-discovery-v0.1.0-codex-preview.1.zip -Algorithm SHA256
New-Item -ItemType Directory -Force .agents/skills
Expand-Archive ./proactive-skill-discovery-v0.1.0-codex-preview.1.zip -DestinationPath .agents/skills
```

Compare the PowerShell hash with the matching line in `SHA256SUMS.txt`. Back up
existing adaptations first. The ZIP already contains `<name>/`; the final file must
be `.agents/skills/<name>/SKILL.md`, with `LICENSE`, `agents/` and `references/`
beside it. Select the SVG ZIP for the other Skill. This manual path needs no Node.

All four release attachments were downloaded and byte-checked against staging;
the three ZIP checksums match. Both extracted Skill payloads also pass `skills-ref`.
The downloadable [blank A/B study](https://github.com/youchibuwan-ops/agent-workflow-skills/releases/download/v0.1.0-codex-preview.1/codex-ab-study-v7.zip) is for a coordinator,
not a Skill install: start at `evals/codex/README.md`. It uses source `20a0808`,
protocol v7 and frozen payload `6aaedb3`, whose Skill bytes equal this release. The
runner fetches its target at execution time; no friend outcomes are filled in.
The Docker recipe remains unbuilt locally. See [behavior evidence and limits](codex-acceptance.md).

## Manual fallback and reviewed versions

Clone this repository and copy one **complete** `skills/<name>/` directory into
`.agents/skills/<name>/` for Codex project use. Preserve its name, license, references
and UI metadata; copying only `SKILL.md` breaks the package.

For an immutable source, check out a reviewed Git commit. The CLI can also select a
GitHub `tree/<commit>/skills/<name>` URL; verify that exact URL before using it.
An unpinned `owner/repo` command follows the public default branch. The commands
here preserve the actual tested payload regardless of later default-branch changes.

A prior immutable remote install intermittently failed with a misleading missing-ref
message. The original transport failure has not been reproduced or diagnosed.
The pinned 1.7.4 installer source and a **synthetic** Git-failure experiment show
that its SHA-fetch fallback can hide the inner error; that experiment does not
identify the earlier network cause. All four subsequent real reports have complete
payloads; three exits are recorded as zero, one exit was lost in trace decoding.
The current candidate's two remote single-skill installs also pass.
See [separate installation diagnostics](../examples/codex-acceptance/execution-reliability/installation-diagnosis.json).

If immutable remote installation fails, retain the error and use a fresh exact
checkout. This path was actually tested for frozen candidate v7 (`6aaedb3`),
whose Skill bytes equal this pre-release. The historical pin below is intentional. Bash:

```sh
commit=6aaedb39545b3f60892b824862396951c8147b81
skill_source=$(mktemp -d)
git -C "$skill_source" init
git -C "$skill_source" remote add origin https://github.com/youchibuwan-ops/agent-workflow-skills.git
git -c http.version=HTTP/1.1 -C "$skill_source" fetch --depth 1 origin "$commit"
git -C "$skill_source" checkout --detach FETCH_HEAD
test "$(git -C "$skill_source" rev-parse HEAD)" = "$commit" || exit 1
npx skills@1.7.4 add "$skill_source" --skill proactive-skill-discovery -a codex --copy -y
```

PowerShell (run in the destination project):

```powershell
$commit = '6aaedb39545b3f60892b824862396951c8147b81'
$skillSource = Join-Path ([IO.Path]::GetTempPath()) ('workflow-skills-' + [guid]::NewGuid())
git init $skillSource
if ($LASTEXITCODE) { throw 'git init failed' }
git -C $skillSource remote add origin https://github.com/youchibuwan-ops/agent-workflow-skills.git
if ($LASTEXITCODE) { throw 'remote setup failed' }
git -c http.version=HTTP/1.1 -C $skillSource fetch --depth 1 origin $commit
if ($LASTEXITCODE) { throw 'pinned fetch failed' }
git -C $skillSource checkout --detach FETCH_HEAD
if ($LASTEXITCODE) { throw 'checkout failed' }
$actualCommit = git -C $skillSource rev-parse HEAD
if ($LASTEXITCODE -or $actualCommit -ne $commit) { throw 'unexpected commit' }
npx.cmd skills@1.7.4 add $skillSource --skill proactive-skill-discovery -a codex --copy -y
```

Select `crafting-reference-based-svg-assets` instead for the other standalone skill.
These commands preserve the pin, avoid changing PowerShell execution policy, and
scope HTTP/1.1 to one Git command. They do not prove HTTP/1.1 universally fixes
transport errors. Never silently substitute an unpinned branch or alter global Git
configuration. An optional proxy must be supplied for the current environment;
the commands contain no account credentials.

## Dependencies, privacy and compatibility

Both skills in the **tagged preview** are instructions plus references. They bundle
no executable, service, paid API, API key, game engine or required external review model. Discovery needs
network/tool access when searching externally; SVG work needs actual image viewing
and a renderer supplied by the host. `find-skills` is optional.

The **unreleased SVG workflow candidate** adds `scripts/workflow.py` and
`references/construction-and-review.md`. Its full-production mode needs Python ≥3.10
(standard library only); exact edits and read-only review do not start that tracker.
The helper reads selected evidence files and writes only the selected journal and
snapshots. It makes no network/model calls and does not install a global host hook.
Its receipt checks do not prove visual quality or actual viewing. Candidate remote
installation and new-session adherence have not been verified; the commands above
still install the frozen preview, not the candidate. See the
[candidate status](../evals/svg-workflow/README.md).

The third-party installer sends telemetry by default. Its documented opt-outs are
`DISABLE_TELEMETRY=1` and `DO_NOT_TRACK=1`; tests set both. Bash can prefix the install
with `DISABLE_TELEMETRY=1`; PowerShell can set `$env:DISABLE_TELEMETRY='1'` for that process.
Verification installs are not promotional traffic.

Codex package discovery/resource integrity was tested. Other Agent Skills hosts are
format-compatible candidates. Both instruction/resource loads now pass in actual
Codex runs, including Bubblewrap-isolated Linux. Automatic inspection/adoption and
task outcomes remain separately qualified in [Codex acceptance](codex-acceptance.md);
listing alone never establishes loading or task success.
