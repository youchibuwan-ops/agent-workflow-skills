# R60 — related project directories in the same conversation

This repair removes the adapter's single-root barrier for an original checkout and its already owner-authorized Git worktrees. It retains the original conversation root and history. It does not move/copy a project, grant arbitrary filesystem access, or require another conversation.

Source manifest SHA256: `00c80d486b3c7c3fb0434f6a2cc06c5f52854d5df9b8088935bf88ec29f960e4` (151 source members, locally installed release `20261027-r60`).

## Actual checks

- Full current global test command: **506 pass, 0 fail, 16 conditional skips**. Skips remain skips; this is not a claim that unavailable fixed Codex/runtime probes ran.
- Six added core/conversation cases exercise same-session absolute/scoped reads, equal relative filenames, private/unrelated/link refusal, early-write refusal, root replacement, restoration, unrelated archived authorizations, and selected-root writes with external-change rejection.
- Two real DSH SDK cases exercise production same-session reads of the original and authorized worktree, plus the original native writer's `danger-full-access` success and `read-only` refusal. The trusted native-writer probe is a component check; stage/write-allowlist checks run separately through the core.
- The actual Web service was restarted through the installed entry with the same home/state and port. In an existing conversation, the real model read two different files with the same relative filename from the original and related worktree. Both SHA256 values matched independent reads. The original root and histories were retained, and the game files were unchanged. Raw session evidence and screenshots remain local.
- A read-only independent reviewer found an availability regression involving archived unrelated authorizations. It was fixed and independently rechecked: one regression test passes both missing-worktree and missing-common-directory cases. No unresolved Important/Critical finding was reported. Native, browser and installation checks are author results, not independent reproductions.

## Limits and maintenance

This certifies the project-directory repair. It does not certify game production, third-party Skill licensing, every future task, prior unrelated CI issues, or a separate real WSL method execution with related-root inputs. The full suite's ordinary sandbox cases ran only where their runtime was available.

The paired Skill stage-check references now require normal same-conversation project/worktree use rather than transferring adapter limitations into split conversations or copied projects. Real native permission modes, same-filename separation, selected writes and restore are the behavior checks for that rule.

An initial broader run had one error-message compatibility assertion failure; after preserving the diagnostic meaning, the final full run above passed. An initial new SDK test wrapper omitted the required `toolSchemas` export and failed before exercising the adapter; the corrected wrapper and final production cases passed. Neither failure was treated as a product success.
