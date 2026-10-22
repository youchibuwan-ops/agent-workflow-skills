# Security

Review skill instructions and dependencies before use. These packages require no
credentials and bundle no executables or data transmission code. A host following
instructions can still browse, install tools and write files within its permissions.
External discovery is not a trust endorsement.

Open a redacted issue for public documentation defects. For sensitive findings use
GitHub private vulnerability reporting **if the repository offers that option**;
otherwise open a redacted issue requesting a private contact route. Do not post
secrets publicly. No response SLA or unconfigured private-report feature is promised.

Development dependencies are locked and audited in CI. A KaTeX override updates a
transitive Markdown dependency to a version checked with this repository's documents;
reevaluate it when updating markdownlint. Development packages are not installed
inside either skill.
