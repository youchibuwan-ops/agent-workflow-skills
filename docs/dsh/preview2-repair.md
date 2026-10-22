# preview.2 installer repair

Date: 2026-10-23. Repair base: `08ba3852e43838e7ec9e5355aa2a10290e0457bd`.
Skill content baseline remains `c1434f04704938774eb359053aaafdf38ee90868` unchanged.

## Reproduced failure and repair

The user's written report identified PS7 → CMD → Windows PowerShell5.1 launch failure:
`Get-FileHash` was unavailable because PS7 module directories were inherited. The old
component probe removed that variable before launching, which masked the production
entry-point defect. An independent real-PS7 test reproduced the same preflight failure
before any installation writes; [the failing record is retained](evidence/ps7-regression-red.json).

All four CMD launchers now use `setlocal` and clear `PSModulePath` only in their local
launch environment. Windows PowerShell rebuilds its own built-in module path. No PATH,
registry, user/machine environment, execution policy, DSH settings or QQ Bridge changes.
The component probe now uses the real CMD launcher without sanitizing the variable.
The guarantee applies to CMD entry points, not direct execution of internal PS1 files.

## Regression evidence

- `tests/dsh-ps7.ps1` must run in actual PowerShell7, puts its real Utility module first,
  and starts actual CMD followed by the production launchers. Tests cover both skills,
  complete file hashes, manifest/receipt identity, six lifecycle actions and preservation
  of parent/user/machine environment values. The test does not clean the current
  launcher's child environment. Source and extracted-ZIP variants are CI requirements.
- [Current source run](evidence/ps7-regression.json) records actual local PS7 version.
- [Actual old preview.1 ZIP update](evidence/ps7-real-preview1-update.json) sets up the
  old package under a clean environment (its supported path), then runs all new launchers
  under the PS7-first environment. This is developer evidence in a temporary home,
  not the classmate's machine or proof of novice acceptance.
- Windows lifecycle suite now has25 cases, adding distribution-provenance recording and
  synthetic legacy-receipt compatibility. Existing conflict/local-edit/rollback safeguards
  are retained. Actual archive tests and official component tests remain separate layers.

An independent read-only reviewer reran the real PS7 six-action regression and all25
Windows PowerShell lifecycle cases, checked unchanged Skill content and current manifest
digests, and found no actionable issue in this repair delta. That reviewer did not
independently rerun ZIP, migration, official components or CI; the author's actual
reports cover those scopes separately. No Desktop/model acceptance was reviewed.

## Provenance

Distribution is bumped to `0.1.0-dsh-preview.2`. `sourceCommit` remains the original
Skill content baseline and is labeled as such. Receipts add the exact manifest SHA-256;
download commit and whole-ZIP checksum are separate, externally recorded identifiers.
Legacy preview.1 receipts remain supported for update/removal, with no retroactive
claim that they recorded a digest. See [bilingual provenance details](provenance.md).

## Acceptance boundaries kept

The attached trial narrative itself is not edited, copied to this public repo, or
treated as raw proof. Its referenced logs, SVGs, renders and verification scripts were
not provided here. Desktop task success, unprompted auto-selection, negative raw traces,
SVG automatic invocation, novice uninstall/residual checks, clean-account A/B and long
context recovery remain UNVERIFIED. Local developer update/uninstall results do not
replace those missing classmate results. General-rollout decision remains **NO-GO**.
