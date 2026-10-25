---
name: export-review
description: Use when checking exported data against its current source.
---

# Export review

Read the current source and the export contract before selecting a deliverable. Filenames, modification times, and a matching amount do not establish that an export belongs to the current source.

For each candidate, check both source identity (such as `generation`) and the required payload fields (such as `amount`). A matching generation does not establish payload correctness. Apply the supplied verifier to each candidate by its explicit path; inspect its reported mismatches and exit status. If the verifier covers only part of the contract, check the remaining requirements separately.

Select a candidate only when every required comparison passes against the current source. If none passes, report that no current export is deliverable. If several pass, identify all passing candidates and resolve any meaningful differences using the contract rather than filename ordering.

Report the selected path, the current source identity, checks actually performed, rejected candidates with their mismatches, and any unchecked requirements. Verification is read-only unless the user separately authorizes repairing source or export data.
