# Windows PowerShell 5.1; no third-party modules. See docs/dsh/install.zh-CN.md.
[CmdletBinding()]
param(
    [ValidateSet('Install','Update','Uninstall','Check')][string]$Action = 'Install',
    [ValidateSet('both','proactive-skill-discovery','crafting-reference-based-svg-assets')][string]$Skill = 'both',
    [string]$DshHome,
    [string]$PackageRoot,
    [switch]$Yes,
    [switch]$NonInteractive
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2
if (-not $PSBoundParameters.ContainsKey('PackageRoot')) { $PackageRoot = Split-Path $PSScriptRoot -Parent }
$owner = 'youchibuwan-ops/agent-workflow-skills'
$receiptName = '.agent-workflow-skills.receipt.json'
$knownNames = @('proactive-skill-discovery','crafting-reference-based-svg-assets')
$selected = if ($Skill -eq 'both') { $knownNames } else { @($Skill) }
$lockStream = $null
$lockPath = $null
$stage = $null
$commitComplete = $false
$committed = New-Object System.Collections.Generic.List[object]

function Assert-PlainPath([string]$Path) {
    $current = [IO.Path]::GetFullPath($Path)
    while ($current) {
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse point/junction refused: $current" }
        }
        $parent = Split-Path $current -Parent
        if ($parent -eq $current) { break }
        $current = $parent
    }
}
function Get-Inventory([string]$Directory) {
    Assert-PlainPath $Directory
    if (-not [IO.Directory]::Exists($Directory)) { throw "Not a directory: $Directory" }
    $files = New-Object System.Collections.Generic.List[object]
    $queue = New-Object System.Collections.Generic.Queue[string]
    $queue.Enqueue($Directory)
    while ($queue.Count -gt 0) {
        foreach ($entry in Get-ChildItem -LiteralPath $queue.Dequeue() -Force) {
            if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked payload refused: $($entry.FullName)" }
            if ($entry.PSIsContainer) { $queue.Enqueue($entry.FullName) }
            else {
                $relative = $entry.FullName.Substring($Directory.TrimEnd('\','/').Length + 1).Replace('\','/')
                $files.Add([pscustomobject]@{ path = $relative; sha256 = (Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash.ToLowerInvariant() })
            }
        }
    }
    return @($files | Sort-Object path)
}
function Assert-FileList($Files) {
    $paths = @{}
    foreach ($f in @($Files)) {
        if ($f.path -notmatch '^(SKILL\.md|LICENSE|agents/[a-zA-Z0-9_-]+\.yaml|references/[a-zA-Z0-9_-]+\.md)$') { throw "Invalid payload path: $($f.path)" }
        if ($f.sha256 -notmatch '^[a-fA-F0-9]{64}$' -or $paths.ContainsKey($f.path)) { throw 'Invalid or duplicate payload digest/path' }
        $paths[$f.path] = $true
    }
    if (-not $paths.ContainsKey('SKILL.md') -or -not $paths.ContainsKey('LICENSE') -or $paths.Count -lt 3) { throw 'Incomplete skill file list' }
}
function Assert-Inventory([string]$Directory, $Files, [bool]$HasReceipt = $false) {
    Assert-FileList $Files
    $actual = @(Get-Inventory $Directory | Where-Object { -not ($HasReceipt -and $_.path -eq $receiptName) })
    if ($actual.Count -ne @($Files).Count) { throw "Extra or missing files; preserve local changes before proceeding: $Directory" }
    foreach ($expected in $Files) {
        $match = @($actual | Where-Object { $_.path -ceq $expected.path -and $_.sha256 -eq $expected.sha256 })
        if ($match.Count -ne 1) { throw "Changed or missing file; refusing replacement/removal: $Directory/$($expected.path)" }
    }
    $allowedDirectories = @{}
    foreach ($f in $Files) {
        $parent = Split-Path $f.path -Parent
        while ($parent) {
            $allowedDirectories[$parent.Replace('\','/')] = $true
            $parent = Split-Path $parent -Parent
        }
    }
    foreach ($subdir in Get-ChildItem -LiteralPath $Directory -Directory -Recurse -Force) {
        $relative = $subdir.FullName.Substring($Directory.Length + 1).Replace('\','/')
        if (-not $allowedDirectories.ContainsKey($relative)) { throw "Extra user directory; refusing replacement/removal: $($subdir.FullName)" }
    }
}
function Read-Receipt([string]$Directory, [string]$Name) {
    Assert-PlainPath $Directory
    $path = Join-Path $Directory $receiptName
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Foreign/unmanaged skill; no overwrite or removal: $Directory" }
    Assert-PlainPath $path
    $r = [IO.File]::ReadAllText($path) | ConvertFrom-Json
    if ($r.owner -ne $owner -or $r.schema -ne 1 -or $r.skill -cne $Name -or [string]::IsNullOrWhiteSpace($r.version) -or $r.sourceCommit -notmatch '^[a-f0-9]{40}$') { throw "Invalid ownership receipt: $Directory" }
    Assert-Inventory $Directory $r.files $true
    return $r
}
function Assert-NoAlias([string]$SkillsRoot, [string]$Name) {
    if (-not (Test-Path -LiteralPath $SkillsRoot)) { return }
    foreach ($entry in Get-ChildItem -LiteralPath $SkillsRoot -Force) {
        if ($entry.Name -eq $Name) { continue }
        if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Resolve linked skill root entry before installation: $($entry.FullName)" }
        $candidate = if ($entry.PSIsContainer) { Join-Path $entry.FullName 'SKILL.md' } elseif ($entry.Extension -eq '.md') { $entry.FullName } else { $null }
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            Assert-PlainPath $candidate
            $text = [IO.File]::ReadAllText($candidate)
            # Parse only unambiguous conventional frontmatter names. General YAML
            # features (anchors, folded names, quoted keys) need a manual review;
            # never guess that an unrecognized bundle cannot shadow our name.
            if ($text -notmatch '\A\uFEFF?---\r?\n(?<front>[\s\S]*?)\r?\n---(?:\r?\n|$)') { throw "Cannot safely identify existing skill; review manually: $candidate" }
            $front = $Matches.front
            if ($front -notmatch '(?m)^name:[ \t]*(?:"(?<double>[a-z0-9]+(?:-[a-z0-9]+)*)"|''(?<single>[a-z0-9]+(?:-[a-z0-9]+)*)''|(?<bare>[a-z0-9]+(?:-[a-z0-9]+)*))[ \t]*(?:#.*)?\r?$') { throw "Cannot safely identify existing YAML name; review manually: $candidate" }
            $found = [string]$Matches['double'] + [string]$Matches['single'] + [string]$Matches['bare']
            if ($found -ceq $Name) { throw "Same-name skill under another path: $candidate" }
        }
        if (-not $entry.PSIsContainer -and $entry.Name -eq "$Name.md") { throw "Flat-file collision: $($entry.FullName)" }
    }
}
function Confirm-Change {
    if ($Yes) { return }
    if ($NonInteractive) { throw 'Confirmation required; no files changed. Use -Yes only after reviewing the destination.' }
    $answer = Read-Host "Type $($Action.ToUpperInvariant()) to confirm (anything else cancels)"
    if ($answer -cne $Action.ToUpperInvariant()) { throw 'Cancelled; no files changed.' }
}
function Remove-Stage([string]$Path, [string]$SkillsRoot) {
    $full = [IO.Path]::GetFullPath($Path)
    if ((Split-Path $full -Parent) -ne $SkillsRoot -or (Split-Path $full -Leaf) -notlike '.agent-workflow-skills-stage-*') { throw 'Unsafe staging cleanup target' }
    Assert-PlainPath $full
    # Walk and reject every reparse point before any recursive deletion.
    Get-Inventory $full | Out-Null
    Remove-Item -LiteralPath $full -Recurse -Force
}
try {
    $userProfile = [Environment]::GetFolderPath('UserProfile')
    $chosen = if ($PSBoundParameters.ContainsKey('DshHome')) { $DshHome } elseif (-not [string]::IsNullOrWhiteSpace($env:DSH_HOME)) { $env:DSH_HOME } else { Join-Path $userProfile '.dsh' }
    if ([string]::IsNullOrWhiteSpace($chosen)) { throw 'Empty explicit DSH home refused' }
    if ($chosen -eq '~') { $chosen = $userProfile }
    elseif ($chosen.StartsWith('~/') -or $chosen.StartsWith('~\')) { $chosen = Join-Path $userProfile $chosen.Substring(2) }
    # A relative override is resolved against this process cwd, as in official DSH.
    $targetHome = [IO.Path]::GetFullPath($chosen).TrimEnd('\','/')
    if ($targetHome -eq [IO.Path]::GetPathRoot($targetHome).TrimEnd('\','/') -or $targetHome -eq $userProfile.TrimEnd('\','/')) { throw 'Drive root/user profile root cannot be the installation home' }
    $skillsRoot = Join-Path $targetHome 'skills'
    Assert-PlainPath $skillsRoot
    Write-Output "Action: $Action; selected: $($selected -join ', ')"
    Write-Output "DSH home: $targetHome"
    Write-Output "Skill directory: $skillsRoot"
    Write-Output 'Only owned skill bundles are managed. No DSH configuration or plugins are changed.'

    $manifest = $null
    if ($Action -eq 'Install' -or $Action -eq 'Update') {
        $PackageRoot = [IO.Path]::GetFullPath($PackageRoot).TrimEnd('\','/')
        Assert-PlainPath $PackageRoot
        $manifestPath = Join-Path $PackageRoot 'dsh-manifest.json'
        Assert-PlainPath $manifestPath
        $manifest = [IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
        if ($manifest.owner -ne $owner -or $manifest.schema -ne 1 -or [string]::IsNullOrWhiteSpace($manifest.version) -or $manifest.sourceCommit -notmatch '^[a-f0-9]{40}$') { throw 'Invalid package manifest/version/source commit' }
        if (@($manifest.skills).Count -ne 2 -or @($manifest.skills | Select-Object -ExpandProperty name -Unique).Count -ne 2) { throw 'Unexpected manifest skills' }
        foreach ($payload in $manifest.skills) {
            if ($knownNames -cnotcontains $payload.name) { throw 'Unknown manifest skill' }
            Assert-Inventory (Join-Path $PackageRoot "skills/$($payload.name)") $payload.files
        }
        Write-Output "Package version: $($manifest.version); source: $($manifest.sourceCommit)"
    }
    $plans = @()
    foreach ($name in $selected) {
        $destination = Join-Path $skillsRoot $name
        Assert-PlainPath $destination
        if ($Action -eq 'Install' -or $Action -eq 'Update') { Assert-NoAlias $skillsRoot $name }
        $exists = Test-Path -LiteralPath $destination
        $receipt = if ($exists) { Read-Receipt $destination $name } else { $null }
        $payload = if ($manifest) { @($manifest.skills | Where-Object { $_.name -ceq $name })[0] } else { $null }
        $change = $false
        if ($Action -eq 'Check') {
            if (-not $exists) { throw "Not installed: $name" }
            Write-Output "Inventory OK: $name; installed version $($receipt.version). Host discovery and model behavior are not checked."
        } elseif ($Action -eq 'Uninstall') { $change = $exists }
        elseif ($exists) {
            $same = $receipt.version -ceq $manifest.version
            if ($same) {
                try { Assert-Inventory $destination $payload.files $true } catch { $same = $false }
            }
            if (-not $same -and $Action -eq 'Install') { throw "Different managed version exists: $name ($($receipt.version)). Use Update after backup/review." }
            $change = -not $same
        } elseif ($Action -eq 'Update') { throw "Not installed: $name. Use Install first (or select the installed single skill)." }
        else { $change = $true }
        $plans += [pscustomobject]@{ name = $name; destination = $destination; existed = $exists; receipt = $receipt; payload = $payload; change = $change }
    }
    $changes = @($plans | Where-Object change)
    if ($Action -eq 'Check' -or $changes.Count -eq 0) { Write-Output 'No changes needed.'; exit 0 }
    Confirm-Change
    [IO.Directory]::CreateDirectory($skillsRoot) | Out-Null
    Assert-PlainPath $skillsRoot
    $lockPath = Join-Path $skillsRoot '.agent-workflow-skills.lock'
    $lockStream = [IO.File]::Open($lockPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    # Revalidate under the lock; no unguarded overwrite after preflight.
    foreach ($p in $plans) {
        Assert-PlainPath $p.destination
        if ($p.existed) {
            $current = Read-Receipt $p.destination $p.name
            if (($current | ConvertTo-Json -Depth 10 -Compress) -cne ($p.receipt | ConvertTo-Json -Depth 10 -Compress)) { throw 'Installation changed during confirmation; retry' }
        } elseif (Test-Path -LiteralPath $p.destination) { throw 'Destination appeared during confirmation; retry' }
        if ($manifest) { Assert-NoAlias $skillsRoot $p.name }
    }
    $stage = Join-Path $skillsRoot ('.agent-workflow-skills-stage-' + [guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($stage) | Out-Null
    foreach ($p in $changes) {
        if ($Action -ne 'Uninstall') {
            $staged = Join-Path $stage ($p.name + '-new')
            [IO.Directory]::CreateDirectory($staged) | Out-Null
            $source = Join-Path $PackageRoot "skills/$($p.name)"
            Assert-Inventory $source $p.payload.files
            foreach ($f in $p.payload.files) {
                $dest = Join-Path $staged $f.path
                [IO.Directory]::CreateDirectory((Split-Path $dest -Parent)) | Out-Null
                [IO.File]::Copy((Join-Path $source $f.path), $dest, $false)
            }
            Assert-Inventory $staged $p.payload.files
            $receipt = [ordered]@{ schema = 1; owner = $owner; skill = $p.name; version = $manifest.version; sourceCommit = $manifest.sourceCommit; files = $p.payload.files }
            [IO.File]::WriteAllText((Join-Path $staged $receiptName), ($receipt | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))
        }
    }
    foreach ($p in $changes) {
        $entry = [pscustomobject]@{ plan = $p; backedUp = $false; installed = $false }
        $committed.Add($entry)
        if ($p.existed) {
            Read-Receipt $p.destination $p.name | Out-Null
            [IO.Directory]::Move($p.destination, (Join-Path $stage ($p.name + '-old')))
            $entry.backedUp = $true
        }
        if ($Action -ne 'Uninstall') {
            [IO.Directory]::Move((Join-Path $stage ($p.name + '-new')), $p.destination)
            $entry.installed = $true
        }
    }
    # Committed installation state must not depend on garbage collection succeeding.
    # Once deletion starts, old copies are no longer valid rollback snapshots.
    $commitComplete = $true
    # Old directories are exact, unchanged receipt-owned inventories; no user files removed.
    Remove-Stage $stage $skillsRoot
    $stage = $null
    Write-Output "$Action completed. Open a NEW DSH conversation; verify both discovery and actual task behavior separately."
} catch {
    $failure = $_.Exception.Message
    if ($commitComplete -and $stage) {
        Write-Output "Changes are committed; backup cleanup failed. Current installed bundles are preserved. Recovery files: $stage. See troubleshooting guide."
    } elseif ($stage -and (Test-Path -LiteralPath $stage)) {
        try {
            for ($i = $committed.Count - 1; $i -ge 0; $i--) {
                $entry = $committed[$i]
                $p = $entry.plan
                if ($entry.installed) {
                    Read-Receipt $p.destination $p.name | Out-Null
                    [IO.Directory]::Move($p.destination, (Join-Path $stage ($p.name + '-failed-new')))
                }
                if ($entry.backedUp) { [IO.Directory]::Move((Join-Path $stage ($p.name + '-old')), $p.destination) }
            }
            Remove-Stage $stage $skillsRoot
            $stage = $null
        } catch { Write-Output "Recovery files retained at $stage. Do not delete; see troubleshooting guide. $($_.Exception.Message)" }
    }
    Write-Output "ERROR: $failure"
    exit 1
} finally {
    if ($lockStream) {
        $lockStream.Dispose()
        Remove-Item -LiteralPath $lockPath -Force
    }
}
