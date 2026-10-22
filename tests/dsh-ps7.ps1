# Developer regression: run using REAL PowerShell 7, without sanitizing its child env.
param([string]$PackageRoot, [string]$ZipPath, [string]$PreviousZipPath, [string]$ReportPath)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'Run this regression with pwsh.exe (PowerShell 7).' }
if (-not $PackageRoot) { $PackageRoot = Split-Path $PSScriptRoot -Parent }
$PackageRoot = [IO.Path]::GetFullPath($PackageRoot)
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('aws-dsh-ps7-' + [guid]::NewGuid().ToString('N'))
$target = Join-Path $scratch ([string][char]0x4E2D + [char]0x6587 + ' DSH home')
[IO.Directory]::CreateDirectory($scratch) | Out-Null
$before = @{}
foreach ($key in @('PSModulePath','DSH_HOME','AWS_DSH_NO_PAUSE')) { $before[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
$userModules = [Environment]::GetEnvironmentVariable('PSModulePath', 'User')
$machineModules = [Environment]::GetEnvironmentVariable('PSModulePath', 'Machine')
$report = [ordered]@{ kind = 'real-powershell7-cmd-windows-powershell-regression'; parentVersion = $PSVersionTable.PSVersion.ToString(); modulePath = 'PowerShell 7 modules deliberately first; never sanitized by test'; result = 'fail'; actions = @(); desktop = 'unverified'; model = 'not used' }
function Invoke-CmdLauncher([string]$Launcher, [switch]$LegacySetup) {
    # Pass CMD's command string verbatim, avoiding PS7 native-argument re-quoting
    # when the actual extracted package path contains spaces/Unicode.
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $env:ComSpec
    $info.Arguments = '/d /s /c ""' + $Launcher + '" -Yes -NonInteractive"'
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    if ($LegacySetup) { $info.Environment.Remove('PSModulePath') | Out-Null }
    $process = [Diagnostics.Process]::Start($info)
    try {
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        return @{ code = $process.ExitCode; log = $stdout.GetAwaiter().GetResult() + $stderr.GetAwaiter().GetResult() }
    } finally { $process.Dispose() }
}
try {
    if ($ZipPath) {
        $archive = [IO.Path]::GetFullPath($ZipPath)
        $PackageRoot = Join-Path $scratch 'extracted package'
        [IO.Compression.ZipFile]::ExtractToDirectory($archive, $PackageRoot)
        if (-not [IO.File]::Exists((Join-Path $PackageRoot 'Install-DSH.cmd'))) {
            $children = @(Get-ChildItem -LiteralPath $PackageRoot -Directory)
            if ($children.Count -ne 1) { throw 'Expected exactly one repository folder in source ZIP' }
            $PackageRoot = $children[0].FullName
        }
        $report.zipSha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    $modules = Join-Path $PSHOME 'Modules'
    if (-not [IO.File]::Exists((Join-Path $modules 'Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1'))) { throw 'Real PowerShell 7 Utility module is required for this regression' }
    $env:PSModulePath = $modules + [IO.Path]::PathSeparator + $before.PSModulePath
    $poisoned = $env:PSModulePath
    $env:DSH_HOME = $target
    $env:AWS_DSH_NO_PAUSE = '1'
    $actions = @('Install','Install','Check','Update','Uninstall','Uninstall')
    if ($PreviousZipPath) {
        $previousArchive = [IO.Path]::GetFullPath($PreviousZipPath)
        $previousRoot = Join-Path $scratch 'previous preview'
        [IO.Compression.ZipFile]::ExtractToDirectory($previousArchive, $previousRoot)
        if (-not [IO.File]::Exists((Join-Path $previousRoot 'Install-DSH.cmd'))) {
            $children = @(Get-ChildItem -LiteralPath $previousRoot -Directory)
            if ($children.Count -ne 1) { throw 'Unexpected previous ZIP root' }
            $previousRoot = $children[0].FullName
        }
        # Set up the real old package using its supported clean module environment.
        # Only this setup is sanitized. Every NEW launcher still receives PS7-first.
        $oldLauncher = Join-Path $previousRoot 'Install-DSH.cmd'
        $setup = Invoke-CmdLauncher $oldLauncher -LegacySetup
        if ($setup.code -ne 0) { throw "Previous-version setup failed: $($setup.log)" }
        $previousManifest = [IO.File]::ReadAllText((Join-Path $previousRoot 'dsh-manifest.json')) | ConvertFrom-Json
        if ($previousManifest.version -ne '0.1.0-dsh-preview.1') { throw 'Expected original preview.1 archive' }
        $report.previousVersionSetup = 'real preview.1 ZIP installed under clean module environment; new launchers remain unsanitized'
        $report.previousZipSha256 = (Get-FileHash -LiteralPath $previousArchive -Algorithm SHA256).Hash.ToLowerInvariant()
        $actions = @('Update','Install','Check','Update','Uninstall','Uninstall')
    }
    foreach ($action in $actions) {
        $launcher = Join-Path $PackageRoot ($action + '-DSH.cmd')
        # Explicit CMD hop preserves the PS7 parent environment; no env filtering,
        # module import workaround, mocked executable or test-only production flag.
        $invocation = Invoke-CmdLauncher $launcher
        $code = $invocation.code
        if ($code -ne 0) { throw "$action via PS7 -> CMD -> Windows PowerShell exited ${code}: $($invocation.log)" }
        if ($env:PSModulePath -cne $poisoned -or $env:DSH_HOME -cne $target) { throw 'Launcher changed the PowerShell 7 parent environment' }
        if ($action -in @('Install','Check','Update')) {
            $manifestPath = Join-Path $PackageRoot 'dsh-manifest.json'
            $manifest = [IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
            $digest = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
            $report.distributionVersion = $manifest.version
            $report.skillContentCommit = $manifest.sourceCommit
            $report.manifestSha256 = $digest
            foreach ($skill in $manifest.skills) {
                foreach ($file in $skill.files) {
                    if ((Get-FileHash -LiteralPath (Join-Path $target "skills/$($skill.name)/$($file.path)") -Algorithm SHA256).Hash -ne $file.sha256) { throw 'Installed payload differs from source' }
                }
                $receipt = [IO.File]::ReadAllText((Join-Path $target "skills/$($skill.name)/.agent-workflow-skills.receipt.json")) | ConvertFrom-Json
                if ($receipt.manifestSha256 -ne $digest -or $receipt.version -ne $manifest.version -or $receipt.sourceCommit -ne $manifest.sourceCommit) { throw 'Receipt does not distinguish distribution manifest/version from Skill content source' }
            }
        }
        $report.actions += @{ action = $action; result = 'pass'; exitCode = $code }
        Write-Output "PASS PS7 -> CMD -> Windows PowerShell: $action"
    }
    foreach ($name in @('proactive-skill-discovery','crafting-reference-based-svg-assets')) {
        if (Test-Path -LiteralPath (Join-Path $target "skills/$name")) { throw 'Installed bundle remains after uninstall' }
    }
    if ([Environment]::GetEnvironmentVariable('PSModulePath', 'User') -cne $userModules -or [Environment]::GetEnvironmentVariable('PSModulePath', 'Machine') -cne $machineModules) { throw 'Persisted module path was modified' }
    $report.result = 'pass'
    $report.parentEnvironmentPreserved = $true
    $report.userAndMachineEnvironmentPreserved = $true
} catch {
    $report.error = $_.Exception.Message.Replace($scratch, '<temporary-test-root>').Replace($PackageRoot, '<package-root>')
    throw
} finally {
    foreach ($key in $before.Keys) { [Environment]::SetEnvironmentVariable($key, $before[$key], 'Process') }
    if ($ReportPath) { [IO.File]::WriteAllText([IO.Path]::GetFullPath($ReportPath), (($report | ConvertTo-Json -Depth 10) + "`n"), (New-Object Text.UTF8Encoding($false))) }
    $absolute = [IO.Path]::GetFullPath($scratch)
    if ((Split-Path $absolute -Parent) -ne ([IO.Path]::GetTempPath().TrimEnd('\')) -or (Split-Path $absolute -Leaf) -notlike 'aws-dsh-ps7-*') { throw 'Unsafe PS7 test cleanup target' }
    if (@(Get-ChildItem -LiteralPath $absolute -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count -ne 0) { throw 'Refusing PS7 test cleanup of linked contents' }
    Remove-Item -LiteralPath $absolute -Recurse -Force
}
exit 0
