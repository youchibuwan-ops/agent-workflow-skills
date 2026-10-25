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

## Future DSH variants and comparisons

Keep the existing two skills usable. Define what DSH means and which host/runtime it
requires before adding a variant. Record separate versions and controlled results
using the [comparison protocol](docs/validation.md). Link a compact case from the
README only when real evidence exists. Planned results are not benchmarks.

## License and releases

Contributions use MIT except explicitly attributed example media. Check reuse rights
before adding pixels. Keep MIT text in each skill because single-directory installation
does not copy the root license. Update [CHANGELOG.md](CHANGELOG.md).

Maintainers review a branch/PR before separately authorizing tags, Releases and
directory submissions. Repository automation checks quality; it never publishes.
