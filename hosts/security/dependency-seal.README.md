# Dependency installation seals

This is a trusted installer/startup API. It is not a model tool and does not
make an existing dependency directory trustworthy merely by measuring it.
It also does not prove a dependency is benign, callable or suitable for a task.

```js
import {createDependencySealAuthority} from './dependency-seal.mjs';

const authority = createDependencySealAuthority({
  sealRoot: '/private-host-state/dependency-seals',
  key: hostOwnedKey, // >=32 random bytes, never stored in payload/model scope
  payloadRoots: ['/protected-installed-application/payload'],
  actorWritableRoots: ['/actual/allowed/project-write-root'],
  trustedLinkRoots: [], // or explicit {id, path} objects for protected stores
});
const sealed = await authority.installAndSeal({
  installRoot: '/protected-dependencies/new-lock-version', // must not exist
  sourcePackage: {path: verifiedPackageJson, sha256: verifiedReleasePackageHash},
  sourceLock: {path: verifiedPackageLock, sha256: verifiedReleaseLockHash},
  installer: {
    nodePath: verifiedNode,
    nodeSha256: verifiedNodeHash,
    npmCliPath: verifiedNpmCli,
    npmCliSha256: verifiedNpmCliHash,
    toolRoot: verifiedNpmDirectory, // includes bin, lib and npm's dependencies
    expectedTreeSha256: independentlyVerifiedNpmTreeHash,
  },
});
// Before importing installed third-party code at startup:
authority.verify({installRoot, sealPath: sealed.sealPath});
```

The expected source/tool hashes must come from a separately verified distribution
or trusted installation authority. Do not derive that authority by hashing an
arbitrary downloaded script or accepting a model's `passed: true`. The API checks
those identities before execution, creates a fresh root, copies locked inputs,
runs fixed `npm ci --ignore-scripts --omit=dev --no-audit --no-fund`, observes the
actual child result, rechecks the source identities and locked copies, measures
the resulting tree, then signs both provenance and tree with the host-owned key.
`offline: true` adds only npm's offline flag. Nonzero exit, timeout, changed inputs
or no dependencies produces no accepted seal. Failed roots remain untrusted.

The complete npm tool tree is checked against `expectedTreeSha256` before any
child starts and again after it exits. An unchanged `npm-cli.js` alone does not
authenticate its imported `lib` or `node_modules`. The expected tree digest must
come from a separately authenticated official archive or earlier trusted tool
seal. Hashing an arbitrary current npm directory is not a production bootstrap.
`treeSha256` hashes canonical relative entries; the full signed manifest also
binds absolute roots. Absolute link text remains identity-bearing, so moving an
absolute junction requires a newly verified expected layout.

There is no `sealExisting`/trust-on-first-use operation. If a pre-existing runtime
has no genuine earlier seal, it needs a fresh observed installation; it cannot
be promoted by a current hash list or a borrowed JSON receipt. `measureDependencyTree`
is available for read-only inspection but returns `attested: false` and
`status: measurement-only`. It cannot mint a successful-install record.

The manifest covers the full installation root: files, empty directories,
ordinary Windows `.bin` shims, and symlink/junction identity. Every file is SHA256
hashed; no `node_modules` subtree is skipped. Directory links resolve only inside
the installation or explicitly configured trusted roots. Their target contents
are measured too. Repeated/cyclic directory targets refer to already covered
paths instead of causing infinite traversal. Dangling links, unknown filesystem
nodes, root escapes, changed targets and all added/deleted/type-changed/content-
changed entries fail. Changes to trusted external target contents also fail.

The seal is stored independently of payload, dependencies and actor writes.
Verification authenticates its HMAC and original install record before measuring
current bytes. It requires the same host key after restart; this module never
persists or exposes that key. The integrating application must protect its key
storage and supply the complete actual actor-write policy. Additional actor
roots can be passed to `verify` using `actorWritableRoots`; broad/intersecting
workspaces fail explicitly instead of weakening protection.

This is startup content-integrity verification, not an OS permission system.
The host must keep dependencies, seal store, key and verifier code out of actor
writes for the entire execution, including aliases/hard links and native tools.
It does not defeat a privileged machine owner or a tampered executable that ran
before the verifier. Do not treat a package-lock's archive integrity or this
seal as a semantic safety review. Runtime import/callability probes and actual
task validation remain separate requirements. Dependencies that require install
scripts are unsupported until a separately reviewed explicit script policy is
implemented; this module never falls back to unrestricted scripts.

## Owner canonical path binding

MSIX filesystem virtualization can make a successful installation visible under
one logical AppData path while ordinary processes need its native physical path.
Do not move the directory, edit the old signed JSON, or issue first trust to a
different directory that happens to have equal bytes.

While the original namespace still works, an owner can call:

```js
const binding = await authority.rebindCanonicalPath({
  installRoot: originalLogicalInstallation,
  sealPath: originalSuccessfulInstallationSeal,
});
authority.verify({installRoot: binding.canonicalRoot, sealPath: binding.sealPath});
```

This first verifies the original complete installation and both original HMACs,
proves native realpaths identify the same physical directory, and remeasures the
complete canonical tree with exactly the same entries and entry digest. It then
writes a fresh `dependency-canonical-alias-seal` using a separate HMAC domain.
The original signed document is preserved byte for byte inside it, along with
its SHA256, successful npm provenance and signed logical-to-canonical binding.
The original seal file is never edited. Canonical verification authenticates the
outer binding and the original nested seal/install record, then remeasures every
canonical entry; it does not require the old logical namespace to exist later.

The first version explicitly refuses installations containing links or external
trusted roots. This is an owner-only alias correction after an observed trusted
installation, not a general `sealExisting` operation or a model-facing tool.

## Verification

```powershell
node --test hosts/security/dependency-seal.test.mjs
```

Tests use actual small child processes and filesystem fixtures. One test invokes
the installed real npm CLI with only an offline local fixture package, loads the
result, and verifies that a later edit is rejected. Other cases cover missing
provenance, pre-existing directories, forged seals, wrong keys, locked-source
changes, failed installers, ordinary additions/removals/modifications/types,
installer submodule edits before execution and tool-tree changes during execution,
future actor subdirectories, link escapes, dangling and retargeted junctions,
external target edits, actor-located seals, and read-only untrusted measurements.
Fixture installer doubles test only collection/authentication boundaries and are
not evidence that a registry package was installed. No SDK is copied or downloaded.
The real npm test observes its already installed tool tree only as a local test
fixture; it does not establish publisher trust for that installation.

The reported external 54-case subset is not this local test count. The original
`allowDependencies` omission was separately reproduced against the current
preview verifier with an actual modified dependency file; this module alone
does not wire startup verification into that installer or a daily host.

Primary interfaces: [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/),
[Node file operations](https://nodejs.org/api/fs.html), and
[Node crypto](https://nodejs.org/api/crypto.html).
