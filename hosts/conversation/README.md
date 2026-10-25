# Ordinary conversation controller (integration in progress)

The controller factory accepts the real native session identity, workspace and
external human request. It does not require a prewritten JSON-export contract,
an actor-provided expected answer or an author-supplied completed-stage claim.
The original request remains in the signed private session envelope.

`createConversationFactory({stateRoot,installedRoots,privateRoots?,external?})`
returns a host-only factory compatible with both global adapters. The module
also exports `toolSchemas` and `controllerFactory(input)` for DSH's trusted
factory-module interface. That entry requires an absolute owner-controlled
`AGENT_WORKFLOW_HOST_CONFIG` JSON file. Never expose that configuration, factory
or the original native executor as model tools.

## What is enforced

1. Scope is captured from the actual external message before model tools run.
2. Installed Skills are searched first. External discovery requires a preceding
   local search and a stated gap. Full acquired resources and a nonempty license
   need actual one-use read confirmations. Multiple reference bodies are
   acquired through the bounded public HTTPS provider and confirmed separately.
3. A plan presents 3–5 inspected-reference-backed options, each declaring its
   exact `artifacts` edit/output paths. The external `/workflow choose <id>`
   binds the write allowlist. Model-authored approvals grant no authority.
4. Draft writes use guarded paths. On DSH they traverse the original native
   writer and exact-byte native reader, preserving native permissions. Inspected
   Python methods can use the separate OS sandbox; no raw shell fallback exists.
5. `artifact-current` checks exact current readback, UTF-8 and JSON syntax when
   applicable. It certifies **only structural integrity**, never the requested
   semantics, performance, appearance or correctness of arbitrary code.
6. The original goal stays unresolved until the actual external user accepts
   the current artifact using `/workflow accept`. With native IO this acceptance
   stays pending until a subsequent controlled tool dispatch rechecks the
   current bytes within the native execution lease. Changed artifacts abort.
7. Learning remains a separately checked stage. This implementation supports a
   concrete no-increment decision; independent Skill behavior validation and
   runtime Skill maintenance are not yet provided. Required updates cannot be
   self-certified.

Ordinary chat may return a conversational answer. It does not thereby mark an
unfinished production task complete. The native broker's pending/blocked status
is authoritative. A model's final prose is not a proof of goal completion.

Corrections reopen scope and invalidate earlier source/read/validation facts.
Process restoration authenticates the original human scope but conservatively
redoes discovery and verification; it does not deserialize old source nonces or
trust actor history. This is safe restoration through rechecking, not restoration
of a completed proof ledger. A different workspace or corrupted envelope fails.

## Current limits

This conservative ordinary-task controller is not a universal semantic oracle.
It does not yet provide a cheap trusted fast path for trivial tasks, independent
arbitrary-code tests, verified image/PDF/video inspection, binary artifact writes,
or general connected-app/native-tool delegation. Unsupported capabilities stay
blocked. A private envelope HMAC protects a local broker record; it does not
make a public author's model-test report independently verified.

The global transport adapters, mandatory launchers, installation integrity,
desktop route coverage and new real-model checks must be verified together.
Unit tests of this factory alone do not establish global activation.

## Deterministic checks

```text
node --test hosts/conversation/controller-factory.test.mjs
```

These tests use actual local Skill acquisition and physical text artifacts.
Reference HTTP responses, model calls and human choice/acceptance are controlled
test fixtures. They cover the complete seven-stage ordinary-text chain,
unselected-path refusal, no actor approval, scope correction, conservative
restart and tampered-envelope rejection. They are not a new real-model run.
