param([Parameter(Mandatory=$true)][string]$ZipPath, [string]$ReportPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('aws-dsh-zip-' + [guid]::NewGuid().ToString('N'))
$unpacked = Join-Path $scratch ([string][char]0x4E2D + [char]0x6587 + ' extracted folder')
$target = Join-Path $scratch 'isolated DSH home'
[IO.Directory]::CreateDirectory($unpacked) | Out-Null
$oldHome = $env:DSH_HOME
$oldPause = $env:AWS_DSH_NO_PAUSE
try {
    [IO.Compression.ZipFile]::ExtractToDirectory([IO.Path]::GetFullPath($ZipPath), $unpacked)
    $layout = 'flat preview archive'
    if (-not (Test-Path -LiteralPath (Join-Path $unpacked 'Install-DSH.cmd'))) {
        $children = @(Get-ChildItem -LiteralPath $unpacked -Directory)
        if ($children.Count -ne 1 -or -not (Test-Path -LiteralPath (Join-Path $children[0].FullName 'Install-DSH.cmd'))) { throw 'Archive does not contain one recognizable DSH package root' }
        $unpacked = $children[0].FullName
        $layout = 'GitHub Download ZIP containing one repository folder'
    }
    $env:DSH_HOME = $target
    $env:AWS_DSH_NO_PAUSE = '1'
    foreach ($action in @('Install','Install','Check','Update','Uninstall','Uninstall')) {
        $launcher = Join-Path $unpacked ($action + '-DSH.cmd')
        $log = & $launcher -Yes -NonInteractive 2>&1
        if ($LASTEXITCODE -ne 0) { throw "$action launcher failed: $($log -join "`n")" }
        if ($action -eq 'Install' -or $action -eq 'Update' -or $action -eq 'Check') {
            $manifest = Get-Content -LiteralPath (Join-Path $unpacked 'dsh-manifest.json') -Raw | ConvertFrom-Json
            foreach ($skill in $manifest.skills) {
                foreach ($file in $skill.files) {
                    $installed = Join-Path $target "skills/$($skill.name)/$($file.path)"
                    if ((Get-FileHash -LiteralPath $installed -Algorithm SHA256).Hash -ne $file.sha256) { throw 'Installed ZIP bytes differ' }
                }
            }
        }
        Write-Output "PASS extracted ZIP $action launcher"
    }
    foreach ($name in @('proactive-skill-discovery','crafting-reference-based-svg-assets')) {
        if (Test-Path -LiteralPath (Join-Path $target "skills/$name")) { throw 'Uninstall left installed bundle' }
    }
    if ($ReportPath) {
        @{ kind = 'extracted-zip-cmd-lifecycle'; result = 'pass'; archiveLayout = $layout; zipSha256 = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant(); actions = @('Install','Install','Check','Update','Uninstall','Uninstall'); pathCase = 'Unicode and spaces'; desktop = 'unverified' } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $ReportPath -Encoding UTF8
    }
} finally {
    $env:DSH_HOME = $oldHome
    $env:AWS_DSH_NO_PAUSE = $oldPause
    $absolute = [IO.Path]::GetFullPath($scratch)
    if ((Split-Path $absolute -Parent) -ne ([IO.Path]::GetTempPath().TrimEnd('\')) -or (Split-Path $absolute -Leaf) -notlike 'aws-dsh-zip-*') { throw 'Unsafe ZIP cleanup target' }
    $linked = @(Get-ChildItem -LiteralPath $absolute -Force -Recurse | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })
    if ($linked.Count -ne 0) { throw 'ZIP test cleanup refused linked contents' }
    Remove-Item -LiteralPath $absolute -Recurse -Force
}
exit 0
