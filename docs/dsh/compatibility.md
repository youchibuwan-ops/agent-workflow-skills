# Official DSH compatibility audit

Checked 2026-10-23, against official `deepseek-ai/deepseek-harness` commit
`687f282e8625c6b8d11ff58211a90524be2e4317`, package/Desktop source version `0.2.1-rc.2`.
Published `@deepseek-ai/dsh@0.2.1-rc.2` was installed **only in a developer lab**, with
install scripts disabled, for component execution. This is not a Desktop installation
or proof that every released Desktop has the same behavior.

## Source findings

| Contract | Official source actually read | Consequence |
| --- | --- | --- |
| Desktop composes the standard Web profile | [Desktop project-manager](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/apps/desktop/src/project-manager.ts), [profile templates](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/boot/app-boot/src/profile.ts) | `dsh-base` supplies the native skill services; do not install a separate plugin. |
| Registry, filesystem provider and skill tool enabled in base | [base composition](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/bundle/base/cordis.patch.yml) | Use native file bundles. Do not rewrite Desktop's profile. |
| Home: explicit config, nonblank DSH_HOME, OS home/.dsh; tilde/relative expansion | [home-paths](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/util/home-paths/src/index.ts), [Desktop paths](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/apps/desktop/src/paths.ts) | Installer uses explicit `-DshHome`, environment, user-profile default. Custom plugin config can still differ: display and verify the actual destination. |
| Directory bundles are one level deep; required name/description; extra metadata accepted | [Provider code](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/skill/skill-filesystem/src/index.ts), [Provider reference](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/skill/skill-filesystem/README.md) | Copy complete original `skills/<name>` directly into the native user root. Both original entries parse without edits. |
| Project DSH rank100, project agents200, custom300, user DSH400, user agents500, bundled600 | Same Provider code | Same-name project/custom copies can shadow the user install. This installer checks only its target root and reports its scope. |
| Default invocation permits both model/user; catalog uses names and capped descriptions | [registry](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/skill/skill/src/index.ts), [tool](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/skill/tool-skill/src/index.ts) | `agents/openai.yaml` is retained for Codex but is not a DSH trigger mechanism. No new trigger prompt injected. |
| Explicit `/name` at first-line start in direct user input injects full body | Same tool code and its tests | DSH invocation differs from Codex `$name`. Deterministic injection can be tested without a model; model execution cannot. |
| Body is re-read on load; resource base points to bundle directory | Same Provider/registry/tool code | Original reference links resolve locally; reading their files is separately checked. |
| Catalog changes watched; body/reference edits differ from catalog invalidation | Provider reference and code | Recommend new chats after changes for reproducibility, rather than promise every older version hot-reloads. Watcher behavior not exercised by this probe. |
| Pressure-triggered tool pruning above8192 code points, keeping head4096/tail1024 | [pruner](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/compaction/compaction-tool-result-pruner/src/index.ts), [reference](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/compaction/compaction-tool-result-pruner/README.md) | Full first load passes. SVG rendered result exceeds the budget; pressured later context can lose its middle. Do not silently shorten original instructions or patch official DSH. |

## Adaptation and differences

- **Content:** no edits to original `SKILL.md`, references, LICENSE or agents metadata
  from `c1434f0`; one maintained source under `skills/`, no generated alternate body.
- **Distribution:** only CMD/PowerShell scripts, a manifest, docs and tests added. No
  npm package, provider patch, global environment changes, DSH config or credential writes.
- **Invocation:** instructions document DSH `/name` and original Codex `$name` separately.
- **Recovery:** long-task stage checks advise rereading the installed original in
  sections or starting a new explicit chat. This is operational guidance, not a tested
  Desktop guarantee or a modification of the skill's review requirements.
- **Scope:** no new mandatory runtime, external review model or image-generation step.
  Host task capabilities still matter. Desktop is not installed locally; the user
  explicitly assigned that acceptance trial to a classmate.

## Reuse decision

Applied existing `proactive-skill-discovery` adaptation/resource-integrity method;
its source and two references were read. Existing development/test skills cover the
workflow. The remaining gap was official DSH's loader contract, resolved by the primary
source above and real published components, not by installing an unrelated skill.
Both upstream project and DSH sources are MIT. DSH is not redistributed in the student
ZIP. Individual original Skill licenses and attribution remain included.
