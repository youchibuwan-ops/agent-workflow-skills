# Same-conversation project directories

User requirement: keep working in the original conversation with normal access to the original game and its already authorized B worktree. Do not require a second conversation or move/copy the game. Do not change assets or unrelated app functions.

Approach: retain the original session identity and root. Attach exact owner-authorized sibling worktrees from the existing verified Git authorization. Canonical scoped paths distinguish equal relative filenames; absolute paths are accepted only when they map to one of those roots. Each root retains its existing identity, private-path policy and original native permission executor. The same selection, write, validation and stale-read checks apply across roots.

Rejected: moving the B checkout, broadening the workspace to the user home, disabling private-path protection, or requiring another project/conversation. These either break existing references, expose unrelated data or contradict the user's requirement.

Implementation and necessary verification:
- [ ] Reproduce same-session absolute and scoped cross-root reads; retain unrelated/private/link and early-write refusals.
- [ ] Add shared root routing, connect core IO and automatic authorized-worktree discovery in the conversation factory.
- [ ] Exercise current writes, same relative filenames, external changes and restoration through the original native SDK permission channel.
- [ ] Freeze and install the tested source, resume the original browser conversation and verify both roots there. Preserve game inputs and existing histories.
- [ ] Record actual limits; do not reuse read-only evidence as full production completion.
