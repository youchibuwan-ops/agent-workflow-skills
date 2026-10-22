# Windows DSH preview: install, use, update, remove

[中文零基础教程](install.zh-CN.md) · [Codex instructions](../installation.md)

This is preview.3. Supplementary trial logs, receipts and artifacts have been reviewed;
complete classmate/Desktop acceptance remains unverified. Students need official
DSH Desktop and built-in Windows PowerShell 5.1. No Codex, Git, Node.js, Python,
administrator access or developer tools are needed to install these instruction bundles.
Individual tasks still need suitable host tools: network/search for discovery, and
actual rendering plus image viewing for SVG work. Skill installation does not provide
those capabilities. The skill bodies and references are currently Chinese.

## Install from ZIP

1. Obtain **official** Desktop from the [DeepSeek Harness site](https://deepseek.com/harness/).
   Sign in following its instructions and record the About version. First confirm an
   ordinary chat works. Community desktop wrappers are outside this test scope.
2. On this GitHub repository select branch `codex/dsh-windows-distribution-20261023`,
   then **Code → Download ZIP**, or use the [preview branch ZIP](https://github.com/youchibuwan-ops/agent-workflow-skills/archive/refs/heads/codex/dsh-windows-distribution-20261023.zip).
   For a reproducible trial use a fixed commit ZIP and record its revision. The Actions
   workflow also produces downloadable preview artifacts; this is not a formal Release.
3. Right-click the ZIP → **Extract All**. Open the extracted folder containing
   `Install-DSH.cmd`, `windows`, `skills` and `dsh-manifest.json`. Do not run inside the ZIP.
4. Double-click **Install-DSH.cmd**. Review the version and absolute destination.
   Type **INSTALL** to consent; any other input cancels before writing.
5. Double-click **Check-DSH.cmd** for a file-integrity check, then open a **new DSH chat**.
   Ask for the current catalog and retain catalog/tool evidence, not just a model's claim.

Already using preview.1/.2? Run the **new package's Update-DSH.cmd**, not Install.
See [provenance](provenance.md) for the content baseline, distribution version,
receipt manifest hash and separate ZIP revision/checksum.

Home precedence: explicit `-DshHome`, then nonblank inherited `DSH_HOME`, then
`%USERPROFILE%\.dsh`. Tilde prefixes are supported; relative overrides follow process cwd.
Prefer absolute paths for custom homes and confirm they match Desktop's actual home.
The installer does not configure Desktop to use a custom path.

Optional commands, in PowerShell opened in the extracted folder:

```powershell
.\Install-DSH.cmd -DshHome "D:\My DSH Data"
.\Install-DSH.cmd -Skill proactive-skill-discovery
```

Both skills are installed by default. If selecting one, use the same `-Skill` selection
for Check/Update/Uninstall. No DSH config, QQ Bridge, other plugins, official application
files, machine execution policy or credentials are modified. Process-only Bypass is
used for the included PowerShell script; it downloads nothing. This package is unsigned.
If school policy blocks scripts, use manual copying or the device administrator;
do not disable system protections. Hashes detect corruption, not a maliciously replaced package.

Since preview.2 all four CMD launchers locally clear inherited `PSModulePath` so Windows
PowerShell 5.1 rebuilds its built-in module locations when started from PowerShell 7
or Windows Terminal. Parent-process, user and machine environment values stay unchanged.
No manual environment workaround is needed. Use the CMD entry points; invoking the
internal PS1 directly is outside this launch-compatibility guarantee.

## Explicit use

Place the slash token at the beginning of the first line of a new user message:

```text
/proactive-skill-discovery
Read the full instructions and references/adapting-upstream-skills.md, then audit
the trial CSV project. Use available tools and preserve inputs; do not install
tools, change personal skills or publish anything. Retain actual validation evidence.
```

```text
/crafting-reference-based-svg-assets
Read the full instructions and references/execution-record.md. Review faulty.svg
against reference.svg at 160px width. Render and view the current source, inspect
the whole object and relevant details, and write repairs to new files only.
```

Use the isolated inputs in the [trial kit](trial-kit/README.en.md). Resolve relative
references against the loaded skill's resource base, not the task workspace.
DSH uses `/name`; Codex uses `$name`. Automatic selection needs separate model tests.

The full SVG result exceeds the standard 8192-character tool-result pruning budget.
First load is complete; under context-pressure compaction a later model view can lose
the middle. At stage boundaries, ask the agent to reread the installed `SKILL.md` in
sections and required references, recording actual reads. Restart with `/name` in a
new conversation if necessary. Do not modify official DSH pruning/configuration.
Desktop recovery and long-context behavior remain unverified.

## Update and remove

Download a new ZIP into a new folder. Back up local adaptations outside installed
skill folders. Run **Update-DSH.cmd**, review the version/home, type **UPDATE**.
The manager replaces only unchanged bundles bearing its valid ownership receipt.
Install refuses a different existing version; same-version identical reinstall/update
does nothing. Selecting an older package for Update can downgrade, so check its version.

Run **Uninstall-DSH.cmd**, review the home, type **UNINSTALL**. Only receipt-owned,
unchanged skill directories are removed; repeat uninstall does nothing. Local edits,
extra files/directories, broken receipts and links block replacement/removal. Back up
your changes first. Open a new DSH chat to check removal from the active catalog.

## Manual alternative

Open `%USERPROFILE%\.dsh\skills` in Explorer, or your actual custom home plus `skills`.
Copy one complete `skills/<name>` folder from the ZIP. Keep `SKILL.md`, `LICENSE`,
`agents` and `references` together, directly under the target skill root. Cancel on
any name collision; never merge or replace an unknown installation. Record provenance
and destination. Manual copies have no manager receipt and cannot be adopted by it.
To update, back up and move away only the folder you copied, then copy the new one.
To remove, move only that known folder to the Recycle Bin. Stop if ownership is unclear.

For failures, run Check and retain its visible error; see [recovery guide](troubleshooting.zh-CN.md).
An unexpected same-name entry can come from a higher-priority project/shared skill root.
Check paths before changing anything. File installation, host loading, automatic
selection and real task success are separate rows in the [feedback form](trial-kit/feedback-template.md).
