# Real child-process regression for the student CSV checker; no Desktop/model used.
param([string]$PackageRoot, [string]$ZipPath, [string]$ReportPath, [string]$LegacyVerifierPath)
$ErrorActionPreference = 'Stop'
if (-not $PackageRoot) { $PackageRoot = Split-Path $PSScriptRoot -Parent }
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('dsh-csv-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($scratch) | Out-Null
if ($ZipPath) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $ZipPath = [IO.Path]::GetFullPath($ZipPath)
    $PackageRoot = Join-Path $scratch 'extracted package'
    [IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $PackageRoot)
    if (-not (Test-Path -LiteralPath (Join-Path $PackageRoot 'Install-DSH.cmd'))) {
        $children = @(Get-ChildItem -LiteralPath $PackageRoot -Directory)
        if ($children.Count -ne 1) { throw 'Expected one repository folder in GitHub source ZIP' }
        $PackageRoot = $children[0].FullName
    }
}
$PackageRoot = [IO.Path]::GetFullPath($PackageRoot)
$results = New-Object 'System.Collections.Generic.List[object]'
$script:observations = New-Object 'System.Collections.Generic.List[object]'
$fixture = Join-Path $PackageRoot 'docs/dsh/trial-kit/discovery-project'
$launcher = Join-Path $PackageRoot 'docs/dsh/trial-kit/tools/CSV-Check.cmd'
$utf8 = New-Object Text.UTF8Encoding($false)
function Put($path, $text) { [IO.File]::WriteAllText($path, $text, $utf8) }
function Assert($ok, $message) { if (-not $ok) { throw $message } }
function Invoke-Check($action, $task, $baseline) {
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $env:ComSpec
    $info.Arguments = '/d /s /c ""' + $launcher + '" ' + $action + ' "' + $task + '" "' + $baseline + '""'
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $p = [Diagnostics.Process]::Start($info)
    try {
        $stdout = $p.StandardOutput.ReadToEndAsync()
        $stderr = $p.StandardError.ReadToEndAsync()
        $p.WaitForExit()
        $output = $stdout.GetAwaiter().GetResult() + $stderr.GetAwaiter().GetResult()
        $script:observations.Add(@{action=$action; exitCode=$p.ExitCode; output=$output.Replace($scratch,'<temporary-test-root>')})
        return @{ code = $p.ExitCode; output = $output }
    } finally { $p.Dispose() }
}
function Case($name, [scriptblock]$body) {
    $script:observations.Clear()
    $caseRoot = Join-Path $scratch ('case-' + $results.Count + ' ' + [char]0x4E2D)
    [IO.Directory]::CreateDirectory($caseRoot) | Out-Null
    Copy-Item -LiteralPath (Join-Path $fixture 'orders.csv'),(Join-Path $fixture 'rules.txt') -Destination $caseRoot
    $baseline = Join-Path $scratch ('baseline-' + $results.Count + '.json')
    Put (Join-Path $caseRoot 'summary.csv') "accepted_count,total,cancelled_count,duplicate_copy_count,conflicting_id_count,unresolved_count,invalid_amount_count`n3,185,1,1,1,1,1`n"
    try {
        & $body $caseRoot $baseline
        $results.Add(@{name=$name; result='pass'; processes=$script:observations.ToArray()})
        Write-Output "PASS $name"
    } catch {
        $results.Add(@{name=$name; result='fail'; error=$_.Exception.Message; processes=$script:observations.ToArray()})
        Write-Output "FAIL ${name}: $($_.Exception.Message)"
    }
}
function Snapshot($task, $baseline) {
    $r = Invoke-Check Snapshot $task $baseline
    Assert ($r.code -eq 0 -and $r.output -match 'SNAPSHOT_RESULT=PASS') "Snapshot failed: $($r.output)"
}
function Verify($task, $baseline, [bool]$good) {
    $before = @{}
    foreach ($name in @('orders.csv','rules.txt','summary.csv')) {
        $p = Join-Path $task $name
        if (Test-Path -LiteralPath $p) { $before[$name] = [Convert]::ToBase64String([IO.File]::ReadAllBytes($p)) }
    }
    $r = Invoke-Check Verify $task $baseline
    if ($good) { Assert ($r.code -eq 0 -and $r.output -match 'VERIFY_RESULT=PASS') "Valid result rejected: $($r.output)" }
    else { Assert ($r.code -ne 0 -and $r.output -match 'VERIFY_RESULT=FAIL' -and $r.output -notmatch 'VERIFY_RESULT=PASS') "Invalid result accepted: exit=$($r.code); $($r.output)" }
    foreach ($name in $before.Keys) { Assert ($before[$name] -ceq [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $task $name)))) "Checker changed $name" }
}
try {
    if ($LegacyVerifierPath) {
        Case 'wrong total must produce nonzero exit (historical checker)' {
            param($task,$baseline)
            Copy-Item -LiteralPath $LegacyVerifierPath -Destination (Join-Path $task 'verify.ps1')
            Put (Join-Path $task 'summary.csv') "accepted_count,total,cancelled_count,duplicate_copy_count,conflicting_id_count,unresolved_count,invalid_amount_count`n3,999,1,1,1,1,1`n"
            $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $task 'verify.ps1') 2>&1
            $code = $LASTEXITCODE
            Assert ($code -ne 0) "Historical defect reproduced: output=$($output -join ' '); process exit=$code"
        }
    } else {
        Case 'correct integer total and intact inputs accepted without changing files' { param($t,$b) Snapshot $t $b; Verify $t $b $true }
        Case 'numerically equivalent decimal total accepted' { param($t,$b) Snapshot $t $b; Put (Join-Path $t 'summary.csv') "accepted_count,total,cancelled_count,duplicate_copy_count,conflicting_id_count,unresolved_count,invalid_amount_count`n3,185.00,1,1,1,1,1`n"; Verify $t $b $true }
        Case 'wrong total produces FAIL and nonzero exit' { param($t,$b) Snapshot $t $b; Put (Join-Path $t 'summary.csv') "accepted_count,total,cancelled_count,duplicate_copy_count,conflicting_id_count,unresolved_count,invalid_amount_count`n3,999,1,1,1,1,1`n"; Verify $t $b $false }
        Case 'wrong conflict counter rejected' { param($t,$b) Snapshot $t $b; Put (Join-Path $t 'summary.csv') "accepted_count,total,cancelled_count,duplicate_copy_count,conflicting_id_count,unresolved_count,invalid_amount_count`n3,185,1,1,2,1,1`n"; Verify $t $b $false }
        Case 'extra summary row rejected' { param($t,$b) Snapshot $t $b; [IO.File]::AppendAllText((Join-Path $t 'summary.csv'),"3,185,1,1,1,1,1`n"); Verify $t $b $false }
        Case 'wrong header rejected' { param($t,$b) Snapshot $t $b; Put (Join-Path $t 'summary.csv') "wrong,total,cancelled_count,duplicate_copy_count,conflicting_id_count,unresolved_count,invalid_amount_count`n3,185,1,1,1,1,1`n"; Verify $t $b $false }
        Case 'quoted merged header cells rejected' { param($t,$b) Snapshot $t $b; Put (Join-Path $t 'summary.csv') "`"accepted_count,total`",cancelled_count,duplicate_copy_count,conflicting_id_count,unresolved_count,invalid_amount_count`n3,185,1,1,1,1,1`n"; Verify $t $b $false }
        Case 'missing summary rejected' { param($t,$b) Snapshot $t $b; Remove-Item -LiteralPath (Join-Path $t 'summary.csv'); Verify $t $b $false }
        Case 'missing pre-task baseline rejected' { param($t,$b) Verify $t $b $false }
        Case 'changed input rejected even when summary matches new input' { param($t,$b) Snapshot $t $b; $p=Join-Path $t 'orders.csv'; Put $p ([IO.File]::ReadAllText($p).Replace('A07,accepted,60','A07,accepted,61')); Put (Join-Path $t 'summary.csv') "accepted_count,total,cancelled_count,duplicate_copy_count,conflicting_id_count,unresolved_count,invalid_amount_count`n3,186,1,1,1,1,1`n"; Verify $t $b $false }
        Case 'changed rules rejected' { param($t,$b) Snapshot $t $b; [IO.File]::AppendAllText((Join-Path $t 'rules.txt'),'changed'); Verify $t $b $false }
        Case 'existing baseline cannot be silently overwritten' { param($t,$b) Snapshot $t $b; $old=[IO.File]::ReadAllText($b); $r=Invoke-Check Snapshot $t $b; Assert ($r.code -ne 0) 'Baseline overwritten'; Assert ($old -ceq [IO.File]::ReadAllText($b)) 'Historical baseline changed' }
        Case 'malformed baseline rejected' { param($t,$b) Put $b '{"schema":1,"files":[]}'; Verify $t $b $false }
        Case 'unknown rules refused at snapshot' { param($t,$b) Put (Join-Path $t 'rules.txt') 'different contract'; $r=Invoke-Check Snapshot $t $b; Assert ($r.code -ne 0) 'Unknown rules accepted' }
        Case 'malformed CSV extra field rejected' { param($t,$b) Snapshot $t $b; Put (Join-Path $t 'summary.csv') "accepted_count,total,cancelled_count,duplicate_copy_count,conflicting_id_count,unresolved_count,invalid_amount_count`n3,185,1,1,1,1,1,EXTRA`n"; Verify $t $b $false }
        Case 'decimal currency and quoted order ID computed independently' { param($t,$b) Put (Join-Path $t 'orders.csv') "order_id,status,amount`n`"A,1`",accepted,1.10`nA2,accepted,2.20`n"; Snapshot $t $b; Put (Join-Path $t 'summary.csv') "accepted_count,total,cancelled_count,duplicate_copy_count,conflicting_id_count,unresolved_count,invalid_amount_count`n2,3.30,0,0,0,0,0`n"; Verify $t $b $true }
    }
} finally {
    $report = [ordered]@{kind='csv-checker-child-process-regression'; shell=$PSVersionTable.PSVersion.ToString(); legacyProbe=[bool]$LegacyVerifierPath; cases=$results.ToArray(); desktop='unverified'; model='not used'}
    if (-not $LegacyVerifierPath) {
        $report.distributionVersion = ([IO.File]::ReadAllText((Join-Path $PackageRoot 'dsh-manifest.json')) | ConvertFrom-Json).version
        $report.verifierSha256 = (Get-FileHash -LiteralPath (Join-Path $PackageRoot 'docs/dsh/trial-kit/tools/Verify-CSV.ps1') -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    if ($ZipPath) { $report.zipSha256 = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant() }
    if ($ReportPath) { [IO.File]::WriteAllText([IO.Path]::GetFullPath($ReportPath), (($report | ConvertTo-Json -Depth 8)+"`n"), $utf8) }
    # Only remove this test's verified temporary directory.
    if ([IO.Path]::GetFullPath($scratch).StartsWith([IO.Path]::GetTempPath(),[StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $scratch -Recurse -Force }
}
if (@($results | Where-Object {$_.result -eq 'fail'}).Count) { exit 1 }
exit 0
