# Current source provider

This module acquires source bytes. It does not authorize a task, install a Skill,
confirm that a model read it, judge applicability, execute downloaded code, or
declare dependency usability. Every result retains `readConfirmed: false`.

## API

```js
import {createSourceProvider} from './source-provider.mjs';

const sources = createSourceProvider({
  installedRoots: ['/trusted/current/personal/skills'],
  cacheRoot: '/trusted/private/shared-source-cache',
  maxFiles: 100,
  maxBytes: 4 * 1024 * 1024,
});
const local = await sources.search('relevant task keywords', {external: false});
// When the inspected local methods leave an actual gap:
const expanded = await sources.search('specific gap keywords', {external: true});
const bundle = await sources.acquire(expanded.candidates[0].id);
const reference = await sources.fetchReference('https://official.example/source');
```

Factory options belong to the trusted host. They must not be populated by a
candidate document or exposed as model arguments. `githubToken`, if explicitly
provided by that host, is sent only to the fixed GitHub API acquisition calls;
general references never receive it. No environment-provided proxy/catalog URL
or token is read automatically. `get` is a trusted transport test/embedding seam,
not an actor-selectable network function.

`search` returns `candidates`, `diagnostics`, `externalAttempted`, and `externalUsed`.
Candidate IDs must come from this process's actual search before acquisition.
Names are `nameHint` values; `metadataStatus: not-parsed` explicitly avoids claiming
that directory names or a handwritten YAML approximation are formal metadata.
`version` is unresolved until acquisition. Search text is only a search input,
never full-source-read evidence.

`acquire` returns `status`, `path`, `version`, `source`, `manifest`, `requiredFiles`,
`license`, `missing`, and `bytes`. Manifest entries contain normalized bundle paths,
upstream `originPath`, byte size, SHA256, encoding, and viewer requirements.
`ready` means byte acquisition succeeded; `incomplete` exposes missing license or
declared local resource links; `needs_viewer` preserves binary/asset limitations.
Neither ready status nor text decoding proves understanding or tool callability.
The host must deliver, confirm, inspect and probe the method before dependent work.

Local versions hash the entire acquired source set; an unchanged SKILL.md with a
changed reference therefore produces a new version. Remote acquisition resolves
current HEAD, then pins the commit/tree and checks every raw file's Git blob hash.
The Skill directory is complete within the configured limits. A closest applicable
ancestor LICENSE/COPYING body is retained with its original source path. Runtime
caches and `.git` are excluded locally; unresolved outside directory references
remain incomplete. This is not static proof of every possible dynamic code import.

`fetchReference` performs a fresh bounded GET and returns a content-addressed raw
file, URL, SHA256, byte count, MIME, encoding and status. It never runs HTML or
silently truncates a response. PDFs/images/audio/fonts remain viewer requirements
even if their container happens to contain valid UTF-8. UTF-8 BOM bytes are kept.

## Network and cache checks

The default transport permits only credential-free public HTTPS on port 443.
It rejects all redirects, private/special IPv4 addresses, mapped/translated IPv6,
non-global IPv6, and mixed public/private DNS answers. Checked DNS answers are
pinned to the actual TLS connection; no second DNS lookup or pooled connection
selects a different destination. Both DNS and body transfer have deadlines.
Length mismatch, early close, compressed transfer and resource overflow fail.
The conservative special-address policy follows the
[IANA registry](https://www.iana.org/assignments/iana-ipv4-special-registry) and
[OWASP's SSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).

Cache copies are shared by source version and content, re-read before reuse,
and rejected on hash change, extra files or directory redirection. Cache and
provider code must remain outside the actor's writable workspace. This module
does not protect against a privileged machine owner modifying host code.

The catalog protocol is the one actually observed in pinned `skills@1.7.4`
(`https://skills.sh/api/search`). The CLI version/find commands were run, its
search implementation and MIT license inspected, and the
[official directory](https://skills.sh/) checked. Source trees use the
[GitHub Git trees API](https://docs.github.com/en/rest/git/trees).
Unauthenticated GitHub API limits can stop acquisition; a rate-limit/transport
failure is explicit and is not replaced with a stale snapshot.

## Verification

```powershell
node --test hosts/providers/source-provider.test.mjs
$env:SOURCE_PROVIDER_REAL_NETWORK = '1'
node --test hosts/providers/source-provider.integration.test.mjs
```

The unit cases cover BOM/raw bytes, metadata boundaries, changed resources,
missing licenses, binary/viewer requirements, unresolved links, cache tampering,
redirected caches, Git blob identities, truncated Git trees, symlinks, bounded
acquisition, obfuscated/private addresses, mixed DNS, redirects, short bodies,
overflow, DNS stalls, and cancellation before lookup. The opt-in integration test
uses the actually installed find-skills method, a live official catalog candidate,
its current GitHub commit and full license, and two real primary HTTPS references.
It does not call a model or execute acquired scripts.
