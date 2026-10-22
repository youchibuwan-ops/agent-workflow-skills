# Independent code review

Date: 2026-10-23. Read-only review of the DSH worktree against `c1434f0` by an
independent agent that received the requirements and files, not the author's history.

## Findings and verified repairs

1. **P2: reserved-prefix alias bypass.** An unrelated
   `.agent-workflow-skills-foreign/SKILL.md` with the same declared name escaped conflict
   checks. The broad exemption was removed. The author observed a new regression fail,
   then pass after the fix. Names with ordinary quotes/inline comments are also tested;
   unsupported YAML name forms conservatively require manual review.
2. **P1: rollback after destructive cleanup.** Real temporary NTFS deny rules allowed
   update/rename but blocked removal of one old file. Cleanup partially deleted rollback
   copies, then catch removed a healthy committed bundle and could not restore it.
   Commit state is now separated from cleanup. Cleanup errors preserve the new pair and
   retain remaining recovery files with a failure exit code. A real ACL regression was
   observed failing and then passing. No production fault-injection switch added.

Final independent rerun: **22/22 lifecycle cases passed**, including both findings.
The author subsequently added and passed a 23rd test: a real open file on the second
bundle forces a commit failure and verifies the first bundle is restored unchanged.
The final [machine-readable report](windows-lifecycle.json) records the full 23 cases.

The reviewer also independently exercised the earlier ZIP's six CMD actions and both
official component probes, checked payload licenses/absence of dependency and credential
paths, and confirmed the canonical skills were unchanged. Final review identified no
remaining actionable issue. This is code review, not third-party Desktop acceptance.

Temporary review ACLs were restored; the verified review-only scratch directory was
sent to the Windows Recycle Bin. No personal DSH data or checkout files were changed
by the reviewer. Desktop/model/novice acceptance remains **unverified**.
