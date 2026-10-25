# Contributing

Use issues for reproducible problems and focused pull requests for corrections.
Include host/version, source commit, exact prompt, expected outcome and observed
output. Remove credentials, private project data and machine-specific paths.

Preserve existing capabilities. Prefer a small correction or reference update before
a new skill, dependency or template. Keep project policy outside generic workflows.
Respect the actual task authorization and stopping point.

## Checks

```sh
npm ci --ignore-scripts
npm run lint
npm run test:dsh
npm run verify:install
npm run assemble:example
npm run render:example
```

Validate the installable skills with upstream `skills-ref`; check links with lychee 0.24.2.
Commands and scope are in [validation](docs/validation.md). Development dependencies
are locked; consumers install skill folders without this repository's toolchain.

For workflow changes, exercise an actual target case and an adjacent non-applicable
case. Reference-research changes need a new object that did not shape the edit and
actual candidate observations. Schema checks cannot substitute for behavior tests.

Example edits require renewed inspection of affected parts and the current whole.
Update the case/group manifest deliberately after review, then regenerate images;
do not drop a missing-part guard or update hashes to conceal a visual failure.

## DSH variant and comparisons

Keep the canonical Codex workflow and the separately named DSH variant usable.
Run `npm run build:dsh` after canonical changes, then `npm run test:dsh`.
The tests use official DSH 0.2.1-rc.2 packages in isolated project/user roots;
no model credentials or real personal installation is used. Record behavioral
model comparisons separately; provider loading is not task-quality acceptance.
See the [DSH guide](docs/dsh.md) and [comparison protocol](docs/validation.md).

## License and releases

Contributions use MIT except explicitly attributed example media. Check reuse rights
before adding pixels. Keep MIT text in each skill because single-directory installation
does not copy the root license. Update [CHANGELOG.md](CHANGELOG.md).

Maintainers review a branch/PR before separately authorizing tags, Releases and
directory submissions. Repository automation checks quality; it never publishes.
