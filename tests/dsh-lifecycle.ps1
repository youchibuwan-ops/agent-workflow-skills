param([string]$ReportPath)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$manager = Join-Path $repo 'windows/Manage-DshSkills.ps1'
if (-not (Test-Path -LiteralPath $manager)) { throw 'DSH lifecycle manager is not implemented.' }
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('aws-dsh-tests-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($scratch) | Out-Null
$results = New-Object System.Collections.Generic.List[object]
$names = @('proactive-skill-discovery', 'crafting-reference-based-svg-assets')
function Assert($condition, $message) { if (-not $condition) { throw $message } }
function Run($action, $target, $source = $repo, [string[]]$extra = @(), [bool]$ok = $true) {
    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $manager -Action $action -DshHome $target -PackageRoot $source -NonInteractive -Yes @extra 2>&1
    $code = $LASTEXITCODE
    if ($ok) { Assert ($code -eq 0) ("$action failed: " + ($output -join "`n")) }
    else { Assert ($code -ne 0) "$action unexpectedly succeeded" }
    return ($output -join "`n")
}
function Case($name, [scriptblock]$body) {
    & $body
    $results.Add(@{ name = $name; result = 'pass' })
    Write-Output "PASS $name"
}
function SkillPath($target, $name = $names[0]) { return Join-Path $target ('skills/' + $name) }
function ClonePackage($destination) {
    [IO.Directory]::CreateDirectory($destination) | Out-Null
    Copy-Item -LiteralPath (Join-Path $repo 'skills') -Destination $destination -Recurse
    Copy-Item -LiteralPath (Join-Path $repo 'dsh-manifest.json') -Destination $destination
}
try {
    $target = Join-Path $scratch ([string][char]0x4E2D + [char]0x6587 + ' user with spaces')
    Case 'install both complete payloads; preserve config and other plugins' {
        [IO.Directory]::CreateDirectory((Join-Path $target 'profiles/desktop')) | Out-Null
        [IO.File]::WriteAllText((Join-Path $target 'profiles/desktop/qq-bridge-sentinel.json'), '{"unchanged":true}')
        Run Install $target | Out-Null
        foreach ($name in $names) {
            foreach ($f in Get-ChildItem -LiteralPath (Join-Path $repo "skills/$name") -File -Recurse) {
                $relative = $f.FullName.Substring((Join-Path $repo "skills/$name").Length).TrimStart('\','/')
                $installed = Join-Path (SkillPath $target $name) $relative
                Assert ((Get-FileHash -LiteralPath $installed).Hash -eq (Get-FileHash -LiteralPath $f.FullName).Hash) "Payload mismatch: $relative"
            }
        }
        Assert ((Get-Content -LiteralPath (Join-Path $target 'profiles/desktop/qq-bridge-sentinel.json') -Raw) -eq '{"unchanged":true}') 'Other config changed'
    }
    Case 'repeat install is an idempotent no-op' {
        $receipt = Join-Path (SkillPath $target) '.agent-workflow-skills.receipt.json'
        $before = (Get-FileHash -LiteralPath $receipt).Hash
        Run Install $target | Out-Null
        Assert ((Get-FileHash -LiteralPath $receipt).Hash -eq $before) 'Receipt changed on repeat install'
    }
    Case 'receipt separates distribution identity from Skill content baseline' {
        $manifestPath = Join-Path $repo 'dsh-manifest.json'
        $digest = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
        foreach ($name in $names) {
            $receipt = Get-Content -LiteralPath (Join-Path (SkillPath $target $name) '.agent-workflow-skills.receipt.json') -Raw | ConvertFrom-Json
            Assert ($receipt.version -eq '0.1.0-dsh-preview.2') 'Expected repaired distribution version'
            Assert ($receipt.sourceCommit -eq 'c1434f04704938774eb359053aaafdf38ee90868') 'Skill content baseline changed'
            Assert ($receipt.manifestSha256 -eq $digest) 'Exact distribution manifest digest was not recorded'
        }
        $path = Join-Path (SkillPath $target) '.agent-workflow-skills.receipt.json'
        $original = [IO.File]::ReadAllBytes($path)
        try {
            $bad = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
            $bad.manifestSha256 = 'not-a-sha256'
            $bad | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $path -Encoding UTF8
            Run Uninstall $target $repo @() $false | Out-Null
            Assert (Test-Path -LiteralPath (Join-Path (SkillPath $target) 'SKILL.md')) 'Bad receipt caused destructive fallback'
        } finally { [IO.File]::WriteAllBytes($path, $original) }
    }
    Case 'legacy preview.1 receipts update to current provenance without payload changes' {
        $legacy = Join-Path $scratch 'legacy-receipt-fixture'
        Run Install $legacy | Out-Null
        foreach ($name in $names) {
            $receiptPath = Join-Path (SkillPath $legacy $name) '.agent-workflow-skills.receipt.json'
            $r = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
            $r.version = '0.1.0-dsh-preview.1'
            $r.PSObject.Properties.Remove('manifestSha256')
            $r | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $receiptPath -Encoding UTF8
        }
        Run Check $legacy | Out-Null
        Run Update $legacy | Out-Null
        foreach ($name in $names) {
            $r = Get-Content -LiteralPath (Join-Path (SkillPath $legacy $name) '.agent-workflow-skills.receipt.json') -Raw | ConvertFrom-Json
            Assert ($r.version -eq '0.1.0-dsh-preview.2' -and $r.manifestSha256) 'Legacy receipt upgrade failed'
        }
        Run Uninstall $legacy | Out-Null
    }
    Case 'check inventories without loading a model' { Run Check $target | Out-Null }
    Case 'single-skill install does not add its sibling' {
        $single = Join-Path $scratch 'single'
        Run Install $single $repo @('-Skill', $names[0]) | Out-Null
        Assert (-not (Test-Path -LiteralPath (SkillPath $single $names[1]))) 'Sibling installed'
    }
    Case 'foreign same-name directory blocks both before any installation' {
        $foreign = Join-Path $scratch 'foreign'
        [IO.Directory]::CreateDirectory((SkillPath $foreign $names[1])) | Out-Null
        Run Install $foreign $repo @() $false | Out-Null
        Assert (-not (Test-Path -LiteralPath (SkillPath $foreign))) 'Partial installation'
    }
    Case 'flat skill name collision blocks installation' {
        $flat = Join-Path $scratch 'flat'
        [IO.Directory]::CreateDirectory((Join-Path $flat 'skills')) | Out-Null
        [IO.File]::WriteAllText((Join-Path $flat 'skills/alias.md'), "---`nname: proactive-skill-discovery`ndescription: foreign`n---`nforeign")
        Run Install $flat $repo @() $false | Out-Null
        Assert (-not (Test-Path -LiteralPath (SkillPath $flat))) 'Alias overwritten'
    }
    Case 'quoted YAML alias with inline comment is a name collision' {
        $alias = Join-Path $scratch 'quoted-alias'
        $directory = Join-Path $alias 'skills/different-folder'
        [IO.Directory]::CreateDirectory($directory) | Out-Null
        [IO.File]::WriteAllText((Join-Path $directory 'SKILL.md'), "---`nname: 'proactive-skill-discovery' # user skill`ndescription: foreign`n---`nforeign")
        Run Install $alias $repo @() $false | Out-Null
        Assert (-not (Test-Path -LiteralPath (SkillPath $alias))) 'Quoted alias overwritten'
    }
    Case 'bookkeeping-like directory cannot hide a foreign same-name skill' {
        $alias = Join-Path $scratch 'hidden-alias'
        $directory = Join-Path $alias 'skills/.agent-workflow-skills-foreign'
        [IO.Directory]::CreateDirectory($directory) | Out-Null
        [IO.File]::WriteAllText((Join-Path $directory 'SKILL.md'), "---`nname: proactive-skill-discovery`ndescription: foreign`n---`nforeign")
        Run Install $alias $repo @() $false | Out-Null
        Assert (-not (Test-Path -LiteralPath (SkillPath $alias))) 'Prefixed alias bypassed collision check'
    }
    Case 'damaged source fails before creating a destination' {
        $bad = Join-Path $scratch 'bad-package'
        ClonePackage $bad
        Add-Content -LiteralPath (Join-Path $bad "skills/$($names[0])/SKILL.md") -Value 'corrupt'
        $badTarget = Join-Path $scratch 'bad-target'
        Run Install $badTarget $bad @() $false | Out-Null
        Assert (-not (Test-Path -LiteralPath $badTarget)) 'Preflight wrote destination'
    }
    Case 'local edits block update and uninstall' {
        $edited = Join-Path (SkillPath $target) 'SKILL.md'
        $original = [IO.File]::ReadAllBytes($edited)
        Add-Content -LiteralPath $edited -Value 'local edit'
        Run Update $target $repo @() $false | Out-Null
        Run Uninstall $target $repo @() $false | Out-Null
        Assert (Test-Path -LiteralPath $edited) 'Local edit removed'
        [IO.File]::WriteAllBytes($edited, $original)
    }
    Case 'extra user file blocks uninstall' {
        $added = Join-Path (SkillPath $target) 'my-notes.txt'
        [IO.File]::WriteAllText($added, 'keep')
        Run Uninstall $target $repo @() $false | Out-Null
        Assert (Test-Path -LiteralPath $added) 'User file removed'
        Remove-Item -LiteralPath $added
    }
    Case 'empty user directory blocks uninstall' {
        $added = Join-Path (SkillPath $target) 'my-empty-directory'
        [IO.Directory]::CreateDirectory($added) | Out-Null
        Run Uninstall $target $repo @() $false | Out-Null
        Assert (Test-Path -LiteralPath $added) 'User directory removed'
        [IO.Directory]::Delete($added)
    }
    Case 'nested junction blocks uninstall without touching external data' {
        $outside = Join-Path $scratch 'nested-outside'
        [IO.Directory]::CreateDirectory($outside) | Out-Null
        $junction = Join-Path (SkillPath $target) 'linked-notes'
        New-Item -ItemType Junction -Path $junction -Target $outside | Out-Null
        Run Uninstall $target $repo @() $false | Out-Null
        Assert (Test-Path -LiteralPath $outside) 'External directory removed'
        [IO.Directory]::Delete($junction)
    }
    Case 'receipt traversal is rejected and outside files survive' {
        $receiptPath = Join-Path (SkillPath $target) '.agent-workflow-skills.receipt.json'
        $original = [IO.File]::ReadAllBytes($receiptPath)
        $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
        $receipt.files[0].path = '../outside.txt'
        $receipt | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $receiptPath -Encoding UTF8
        Run Uninstall $target $repo @() $false | Out-Null
        [IO.File]::WriteAllBytes($receiptPath, $original)
    }
    Case 'update changes version and payload only with matching ownership' {
        $new = Join-Path $scratch 'new-package'
        ClonePackage $new
        $path = Join-Path $new "skills/$($names[0])/references/adapting-upstream-skills.md"
        [IO.File]::AppendAllText($path, "`nTest-only next-version fixture.`n")
        $manifestPath = Join-Path $new 'dsh-manifest.json'
        $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        $manifest.version = 'test-next-version'
        foreach ($skill in $manifest.skills) {
            foreach ($f in $skill.files) { $f.sha256 = (Get-FileHash -LiteralPath (Join-Path $new "skills/$($skill.name)/$($f.path)") -Algorithm SHA256).Hash.ToLowerInvariant() }
        }
        $manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
        Run Install $target $new @() $false | Out-Null
        Run Update $target $new | Out-Null
        Assert ((Get-Content -LiteralPath (Join-Path (SkillPath $target) '.agent-workflow-skills.receipt.json') -Raw) -match 'test-next-version') 'Update not applied'
        Assert ((Get-FileHash -LiteralPath (Join-Path (SkillPath $target) 'references/adapting-upstream-skills.md')).Hash -eq (Get-FileHash -LiteralPath $path).Hash) 'Updated payload differs'
        Run Update $target $new | Out-Null
    }
    Case 'second-bundle commit failure restores the first bundle' {
        $path = Join-Path (SkillPath $target $names[1]) 'SKILL.md'
        $before = @{}
        foreach ($name in $names) { $before[$name] = (Get-FileHash -LiteralPath (Join-Path (SkillPath $target $name) '.agent-workflow-skills.receipt.json')).Hash }
        $handle = [IO.File]::Open($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
        try {
            Run Update $target $repo @() $false | Out-Null
            foreach ($name in $names) {
                $after = (Get-FileHash -LiteralPath (Join-Path (SkillPath $target $name) '.agent-workflow-skills.receipt.json')).Hash
                Assert ($after -eq $before[$name]) 'Partial commit was not rolled back'
            }
            Run Check $target | Out-Null
        } finally { $handle.Dispose() }
    }
    Case 'committed update survives backup-cleanup failure' {
        # Only this temporary fixture receives ACL changes. Hashing and directory
        # rename remain allowed, while deletion of one backup file fails.
        $directory = SkillPath $target
        $file = Join-Path $directory 'SKILL.md'
        $originalDirectoryAcl = Get-Acl -LiteralPath $directory
        $originalFileAcl = Get-Acl -LiteralPath $file
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
        $dirAcl = Get-Acl -LiteralPath $directory
        $dirAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles, [Security.AccessControl.AccessControlType]::Deny)))
        Set-Acl -LiteralPath $directory -AclObject $dirAcl
        $fileAcl = Get-Acl -LiteralPath $file
        $fileAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, [Security.AccessControl.FileSystemRights]::Delete, [Security.AccessControl.AccessControlType]::Deny)))
        Set-Acl -LiteralPath $file -AclObject $fileAcl
        try {
            Run Update $target $repo @() $false | Out-Null
            # The new pair was committed; a garbage-collection failure must never
            # remove it or restore partially deleted rollback copies.
            foreach ($name in $names) {
                $receipt = Get-Content -LiteralPath (Join-Path (SkillPath $target $name) '.agent-workflow-skills.receipt.json') -Raw | ConvertFrom-Json
                Assert ($receipt.version -eq '0.1.0-dsh-preview.2') 'Healthy committed update was rolled back'
            }
            Run Check $target | Out-Null
        } finally {
            $locations = @(Get-ChildItem -LiteralPath (Join-Path $target 'skills') -Directory -Force -Recurse | Where-Object { $_.Name -eq $names[0] -or $_.Name -eq ($names[0] + '-old') })
            foreach ($location in $locations) {
                Set-Acl -LiteralPath $location.FullName -AclObject $originalDirectoryAcl
                $remaining = Join-Path $location.FullName 'SKILL.md'
                if (Test-Path -LiteralPath $remaining) { Set-Acl -LiteralPath $remaining -AclObject $originalFileAcl }
            }
        }
    }
    Case 'concurrent/stale lock blocks mutation' {
        $lock = Join-Path $target 'skills/.agent-workflow-skills.lock'
        [IO.File]::WriteAllText($lock, 'other process')
        Run Uninstall $target $repo @() $false | Out-Null
        Remove-Item -LiteralPath $lock
    }
    Case 'junction home rejected; external sentinel survives' {
        $outside = Join-Path $scratch 'outside'
        [IO.Directory]::CreateDirectory($outside) | Out-Null
        [IO.File]::WriteAllText((Join-Path $outside 'sentinel.txt'), 'keep')
        $junction = Join-Path $scratch 'linked-home'
        New-Item -ItemType Junction -Path $junction -Target $outside | Out-Null
        Run Install $junction $repo @() $false | Out-Null
        Assert (-not (Test-Path -LiteralPath (Join-Path $outside 'skills'))) 'Wrote through junction'
        [IO.Directory]::Delete($junction)
    }
    Case 'uninstall only owned directories; repeated uninstall succeeds' {
        Run Uninstall $target | Out-Null
        foreach ($name in $names) { Assert (-not (Test-Path -LiteralPath (SkillPath $target $name))) 'Owned skill remains' }
        Assert (Test-Path -LiteralPath (Join-Path $target 'profiles/desktop/qq-bridge-sentinel.json')) 'Other data removed'
        Run Uninstall $target | Out-Null
    }
    Case 'DSH_HOME environment selection' {
        $old = $env:DSH_HOME
        try {
            $env:DSH_HOME = Join-Path $scratch 'env-home'
            $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $manager -Action Install -PackageRoot $repo -Skill $names[0] -Yes -NonInteractive 2>&1
            Assert ($LASTEXITCODE -eq 0) ($output -join "`n")
            Assert (Test-Path -LiteralPath (SkillPath $env:DSH_HOME)) 'DSH_HOME ignored'
        } finally { $env:DSH_HOME = $old }
    }
    Case 'double-click entry point default package root works' {
        $old = $env:DSH_HOME
        try {
            $env:DSH_HOME = Join-Path $scratch 'launcher-home'
            $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $manager -Action Install -Yes -NonInteractive 2>&1
            Assert ($LASTEXITCODE -eq 0) ($output -join "`n")
            Assert (Test-Path -LiteralPath (SkillPath $env:DSH_HOME)) 'Default package root failed'
        } finally { $env:DSH_HOME = $old }
    }
    Case 'no affirmative consent fails without destination changes' {
        $cancel = Join-Path $scratch 'no-consent'
        $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $manager -Action Install -DshHome $cancel -PackageRoot $repo -NonInteractive 2>&1
        Assert ($LASTEXITCODE -ne 0) 'Missing consent accepted'
        Assert (-not (Test-Path -LiteralPath $cancel)) 'Cancelled operation wrote files'
    }
    if ($ReportPath) {
        @{ kind = 'windows-filesystem-lifecycle'; powershell = $PSVersionTable.PSVersion.ToString(); cases = $results; desktop = 'not tested'; model = 'not used' } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ReportPath -Encoding UTF8
    }
    Write-Output ("PASS {0} lifecycle cases" -f $results.Count)
} finally {
    $resolved = [IO.Path]::GetFullPath($scratch)
    Assert ((Split-Path $resolved -Parent) -eq ([IO.Path]::GetTempPath().TrimEnd('\'))) 'Unsafe cleanup parent'
    Assert ((Split-Path $resolved -Leaf) -like 'aws-dsh-tests-*') 'Unsafe cleanup target'
    # Fixtures remove their junction explicitly before recursive cleanup.
    if (@(Get-ChildItem -LiteralPath $resolved -Force -Recurse | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count -eq 0) {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
# Expected-failure subprocess cases leave LASTEXITCODE=1. GitHub's PowerShell
# wrapper propagates it unless the successfully completed test runner exits explicitly.
exit 0
