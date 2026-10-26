# Native desktop control boundary — R51

## User correction and contract

The user found that deleting chats fails and rejects repairing one UI method at a time.
The authorized outcome is one routing boundary that preserves ordinary desktop management
while keeping model work behind the existing workflow gate. Supersede temporary management
handlers; do not stack a second workaround over them. No user chats or project files may be
deleted during verification. Work in this isolated checkout before activating the result.

## Root cause

`clientRpc` sends unhandled ordinary UI requests into an actor-oriented `readParams`
deny branch. Existing project, membership and queue helpers were individually added to
`desktop-controls.mjs`; thread archive/delete/rename/restore and section management remain
unimplemented. Native lifecycle methods exist in the pinned app and CLI. Model task tests
did not test this control plane. R50 is therefore not complete desktop acceptance.

## Chosen boundary

- One native management router owns the pinned application's project and section namespaces,
  and the thread management subdomains. Native implementations process ordinary parameters;
  the host checks ownership, bounded data, workspace-root admission where paths are introduced,
  and prevents execution parameters from entering this metadata-only route.
- Remove duplicate project, membership and queue handlers from the old desktop adapter. Keep
  Windows/config integrity transactions and admitted filesystem reads as distinct real effects.
- Starting/resuming model work, tool dispatch, stage/evidence checks and write authority remain
  on the existing controlled route. Metadata handling never constructs an actor or advances it.
- Management ownership is independent of a workspace still existing; opening model work still
  requires current workspace and tool-schema checks. Imported history stays a private copy.
- Deleting a private copy records an authenticated persistent visibility tombstone so that
  the readonly legacy index cannot resurrect it after refresh or restart. Original history is
  preserved. A failed native deletion cannot become a successful deletion report.
- Query indexes respect native persisted state instead of re-inserting stale in-memory rows.
  Native metadata events invalidate relevant caches across connected frontends.

## Alternatives rejected

Adding archive/delete to the existing whitelist repeats the defect. Unrestricted native RPC
passthrough admits execution and configuration changes outside the gate. Native hooks are not
a replacement hard boundary: official documentation explicitly excludes hosted tools and
specialized paths and describes fail-open errors. See
[official hook coverage](https://learn.chatgpt.com/docs/hooks#tool-coverage) and
[native thread lifecycle](https://learn.chatgpt.com/docs/app-server#delete-a-thread).

## Acceptance

Use disposable fixtures and the actual pinned native backend. Cover new/open/search/name,
pin/section, archive/list/restore/delete, missing workspace, legacy copy, restart persistence,
failed native operation, foreign identity, execution smuggling, concurrent target mutation and
unchanged source history/project bytes. Keep all existing execution refusal tests. Check
project/settings/Windows/Skill controls alongside the lifecycle suite. An inventory from the
actual app must map every ordinary management method to the common route; do not infer
coverage from a few passing methods. Only activate after these checks and independent review.
