# Repair normal project discovery in both controlled hosts

The user expects a selected project to be directly usable without reporting its directory, engine or filenames again. The R39 screenshot conversation had a correct native working directory and real Skill discovery, but no project reads: the shared model schema has only an exact-path reader and omits directory navigation. Previous native tests supplied filenames. Treat those checks as bounded evidence, not normal-project acceptance.

## Approach and authority

Use the existing shared controller and path authority to expose a bounded, nonrecursive, read-only directory listing and explicit workspace context. Raw terminal access would bypass existing tool policy; asking the user for filenames again does not satisfy the requirement. This is an implementation choice within the user's standing instruction to repair normal Windows/project functions and continue until working; it does not authorize work on the screenshot's game, art queue or QQ robot.

## Contract

- Preserve the existing external tool schema: `workflow_read_workspace({path:'.', offset?, length?})` enumerates the root; a directory path enumerates that directory. For directory pages, `length` is the entry limit (default 40, maximum 100); file byte-range behavior is unchanged. No new write or stage authority is granted.
- Listing remains inside the current bound workspace, excludes protected/private paths, does not follow links or reveal linked/hard-linked resources, and checks directory identity across asynchronous work. Existing read/write/stop guards remain in force.
- When native workspace I/O exists (DSH), enumeration must traverse the original permission-aware native executor; denial or missing capability has no direct-filesystem fallback. Codex's trusted host reader keeps its existing scoped path policy.
- Status and task instructions identify the actual bound workspace and the relative-path browser/reader. Project instructions, engine settings and scene paths are to be actually read before project-specific claims. Directory names remain untrusted data, never commands.
- Do not force a file write or invent a guide artifact when the user asks a question. An explanatory turn is not a completed production workflow.

## Acceptance and exclusions

Run failing-then-passing direct/controller tests, real native DSH scripted tests, and live Codex/DSH tasks that receive no filenames or engine hint. They must discover nested current files, read their bytes and identify the project without asking for its path. Check traversal/private/link refusal, pagination, empty/Unicode directories, missing native capability and directory changes; replay after cold restart. Preserve the screenshot evidence and original failure. Do not replace this with previously known-path reads. Preserve game bytes and robot environment. Publish source/package only after current verification. No blanket all-feature or semantic-quality claim.

Compatibility ruling: the pinned Codex runtime cannot accept dynamic tool replacement in `thread/resume`; persisted histories require exact schema identity. Extending the existing reader with directory metadata avoids invalidating every R39 conversation or performing an unrelated history migration. The native filesystem adapter still exposes a private `list` method, never a raw model tool.
