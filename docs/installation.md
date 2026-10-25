# Installation and compatibility

The current catalog contains **proactive-skill-discovery** for Codex and the separate
**proactive-skill-discovery-dsh** variant. For DSH use the [dedicated guide](dsh.md).
The SVG Skill was withdrawn on 2026-10-25. Historical tags and evaluation records
remain available as evidence; do not treat them as current installation advice.
Existing local installations are not modified by repository changes.

## Install for Codex

Requires Git and Node ≥22.20.0 for third-party CLI 1.7.4. Run in the target project:

```sh
npx skills@1.7.4 add https://github.com/youchibuwan-ops/agent-workflow-skills/tree/main --skill proactive-skill-discovery -a codex --copy -y
```

This follows `main`; review and pin an exact commit for immutable installations.
PowerShell users can use `npx.cmd` if `npx.ps1` is blocked, without changing execution
policy. `--copy` avoids symlink permissions. Keep this complete directory:

```text
.agents/skills/proactive-skill-discovery/
  SKILL.md
  LICENSE
  agents/openai.yaml
  references/adapting-upstream-skills.md
  references/learning-from-work.md
  references/execution-record.md
  references/reference-selection.md
```

## Confirm installation

```sh
npx skills@1.7.4 add https://github.com/youchibuwan-ops/agent-workflow-skills/tree/main --list
npx skills@1.7.4 list -a codex
```

Read installed `SKILL.md` and its linked resources. Invoke
`$proactive-skill-discovery` in Codex; restart the host if absent. Listing establishes
package discovery, not activation or task quality. See the
[upstream CLI documentation](https://github.com/vercel-labs/skills) and
[validation scopes](validation.md).

## User-wide installation

Add `-g` to the installation command. CLI 1.7.4 uses `~/.agents/skills/` for global
Codex installs. Back up local adaptations before replacement. Tests use isolated
project directories and do not overwrite personal installations.

## Update or remove

Run from the project owning the install:

```sh
npx skills@1.7.4 update proactive-skill-discovery -p -y
npx skills@1.7.4 remove proactive-skill-discovery -a codex -y
```

For global installs use `-g` instead of `-p` when updating, and add `-g` when removing.
Avoid `--all` for a single-skill change. Back up local changes first.

## Manual fallback and historical release

Clone a reviewed commit and copy the complete `skills/proactive-skill-discovery/`
folder to `.agents/skills/proactive-skill-discovery/`. Do not copy only `SKILL.md`.
Preserve its license, references and UI metadata.

The [historical preview](https://github.com/youchibuwan-ops/agent-workflow-skills/releases/tag/v0.1.0-codex-preview.1)
retains the proactive discovery ZIP and a historical blank study pack. Only the
proactive ZIP is an installable download currently supported there. Verify its
SHA-256 against the release's `SHA256SUMS.txt`, then extract its top-level
`proactive-skill-discovery/` directory into `.agents/skills/`. The historical payload
is dated 2026-10-23; it is distinct from the current branch.

If transport fails, retain the error and use an exact reviewed checkout; do not
silently substitute a different revision or change global Git configuration.

## Dependencies, privacy and limits

The Skill contains instructions and references, with no bundled executable, paid
API, renderer or required external review model. External discovery requires host
search/tool access for the active discovery workflow. Explicit user network restrictions take precedence.

The third-party installer sends telemetry by default. Its opt-outs are
`DISABLE_TELEMETRY=1` and `DO_NOT_TRACK=1`; verification uses both. Checks do not
launch Codex or establish behavioral effectiveness. The DSH variant has separate official filesystem-provider loading checks; no DSH model task-quality result is claimed.
