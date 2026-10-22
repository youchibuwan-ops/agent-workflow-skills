# DSH preview packaging and review

Students use the [ZIP instructions](install.zh-CN.md); these commands are for maintainers.
Never run tests against personal DSH homes. Keep the two canonical `skills/` directories
and per-skill licenses unchanged unless a separately documented behavior change is approved.

## Manifest and ZIP

`dsh-manifest.json` names the adapter version, baseline source commit, two skill names
and SHA-256 for every original file. It is an integrity inventory, not a signed trust root.
Receipts stored in each managed installed bundle bind that inventory to project ownership.
Update only replaces an unchanged owned directory; uninstall refuses extra files and dirs.
Preview.2 receipts also record the exact manifest digest and explicitly label the content
baseline. See [provenance](provenance.md); download commit/ZIP hash are separate identifiers.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-dsh-package.ps1 -OutputDirectory dist/preview-1
```

Use a fresh output directory; the builder refuses an existing ZIP. It includes source,
licenses, student docs, trial inputs and evidence; no official DSH binary, credential,
node_modules or personal data. GitHub's branch/commit Download ZIP is also supported.
The generated `agent-workflow-skills-dsh-preview.zip.sha256` identifies that exact archive.
Its hash cannot authenticate another download; share a trusted GitHub commit as provenance.

Only intentional payload updates should use `-RefreshManifest`; review the resulting diff,
update version/source provenance as appropriate, and rerun all relevant checks. Do not
regenerate hashes to suppress an unexplained integrity error.

## Verification and CI

1. Run the original repository npm/schema/install/example checks. Installation checks
   use isolated directories and optional developer tooling, never student dependencies.
2. Run Windows lifecycle tests and official component probe as in [validation](validation.md).
   Also run `pwsh.exe -NoProfile -File tests/dsh-ps7.ps1`; it must use real PS7 modules first,
   the real CMD entry points, and no test-harness sanitization for current launchers.
3. Build, extract into a Unicode path with spaces, run the CMD launcher with isolated
   DSH_HOME, then Check/Update/Uninstall; compare installed bytes and unrelated sentinels.
4. Confirm `git diff c1434f0 -- skills` is empty. Review manifest, paths, ownership,
   rollback and links with a fresh reviewer. Keep trial results distinct from component tests.
5. Push only the independent branch, create a Draft PR, attach it to the chat. Since the
   baseline is PR#1's head, use that branch as the Draft PR base to show only DSH changes.
   This stacked PR must wait for PR#1; retarget/rebase after it lands without modifying PR#1.

The dedicated Windows workflow produces artifacts without publishing a Release. Source
and CI downloads remain previews. No main merge, formal Release or external submission.

## Recovery contract

Preflight all selected bundles before writes. Confirmation precedes directory creation.
Acquire the per-target exclusive lock, revalidate, stage complete payloads, then rename
old bundles to backups and new bundles into place. Catchable commit failures attempt
reverse rollback. A crash may leave the named lock/stage directory: preserve it and follow
the [recovery guide](troubleshooting.zh-CN.md). Do not auto-delete an unverified old backup.
Uninstall needs the installed receipt, not an intact source manifest. Receipts must never
be synthesized for an unknown manually installed bundle.

Once both changes commit, cleanup failure must preserve the healthy committed state,
return an error and retain any remaining backups. Never roll back from backups whose
deletion has begun; they may be incomplete. A targeted NTFS ACL regression exercises this.
