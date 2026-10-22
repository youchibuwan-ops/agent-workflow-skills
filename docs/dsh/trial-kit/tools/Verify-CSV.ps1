# Offline checker for this trial kit's rules.txt. Windows PowerShell 5.1; no installs.
param(
    [Parameter(Mandatory=$true)][ValidateSet('Snapshot','Verify')][string]$Action,
    [Parameter(Mandatory=$true)][string]$TaskDirectory,
    [Parameter(Mandatory=$true)][string]$BaselinePath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$culture = [Globalization.CultureInfo]::InvariantCulture
$columns = @('accepted_count','total','cancelled_count','duplicate_copy_count','conflicting_id_count','unresolved_count','invalid_amount_count')
function Hash-Bytes([byte[]]$bytes) {
    $h = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($h.ComputeHash($bytes)).Replace('-','').ToLowerInvariant() }
    finally { $h.Dispose() }
}
function Hash-File([string]$path) { return Hash-Bytes ([IO.File]::ReadAllBytes($path)) }
function Check-Rules($path) {
    $normalized = [IO.File]::ReadAllText($path).Replace("`r`n","`n").TrimEnd()
    if ((Hash-Bytes ([Text.Encoding]::UTF8.GetBytes($normalized))) -cne '7bc3b5d51a608a5966bad96b304b237dc4c2eab1fef99938348e671b08b26787') {
        throw 'Unsupported rules.txt: this checker only implements the supplied offline trial contract.'
    }
}
function Read-Table($path, [string[]]$header) {
    Add-Type -AssemblyName Microsoft.VisualBasic
    $parser = New-Object Microsoft.VisualBasic.FileIO.TextFieldParser($path, [Text.Encoding]::UTF8, $true)
    try {
        $parser.SetDelimiters(',')
        $parser.HasFieldsEnclosedInQuotes = $true
        $parser.TrimWhiteSpace = $false
        if ($parser.EndOfData) { throw 'CSV is empty.' }
        $actual = $parser.ReadFields()
        if ($actual.Length -ne $header.Length) { throw 'CSV header field count differs from the trial contract.' }
        for ($i=0; $i -lt $header.Length; $i++) {
            if ($actual[$i] -cne $header[$i]) { throw 'CSV header differs from the trial contract.' }
        }
        while (-not $parser.EndOfData) {
            $fields = $parser.ReadFields()
            if ($fields.Length -ne $header.Length) { throw 'Malformed CSV field count.' }
            [pscustomobject]@{ fields = $fields }
        }
    } finally { $parser.Dispose() }
}
function Currency($text) {
    $value = [decimal]0
    if ($text -notmatch '^[+-]?[0-9]+(?:\.[0-9]+)?$' -or -not [decimal]::TryParse($text, [Globalization.NumberStyles]::AllowLeadingSign -bor [Globalization.NumberStyles]::AllowDecimalPoint, $culture, [ref]$value)) { throw 'Invalid decimal currency value.' }
    return $value
}
try {
    $TaskDirectory = [IO.Path]::GetFullPath($TaskDirectory)
    $BaselinePath = [IO.Path]::GetFullPath($BaselinePath)
    $orders = Join-Path $TaskDirectory 'orders.csv'
    $rules = Join-Path $TaskDirectory 'rules.txt'
    Check-Rules $rules
    $inputHashes = [ordered]@{'orders.csv'=(Hash-File $orders); 'rules.txt'=(Hash-File $rules)}
    if ($Action -eq 'Snapshot') {
        $record = [ordered]@{schema=1; kind='dsh-csv-input-baseline'; files=$inputHashes}
        $bytes = [Text.Encoding]::UTF8.GetBytes(($record | ConvertTo-Json -Depth 5)+"`n")
        # Never replace a historical snapshot, including on a repeated command.
        $stream = [IO.File]::Open($BaselinePath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        try { $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }
        Write-Output 'SNAPSHOT_RESULT=PASS'
        Write-Output 'This is a local input snapshot, not an authenticated execution trace. Keep it outside the model task folder.'
        exit 0
    }
    $baseline = [IO.File]::ReadAllText($BaselinePath) | ConvertFrom-Json
    if ($baseline.schema -ne 1 -or $baseline.kind -cne 'dsh-csv-input-baseline' -or @($baseline.files.PSObject.Properties).Count -ne 2) { throw 'Malformed input baseline.' }
    foreach ($name in $inputHashes.Keys) {
        $old = $baseline.files.$name
        if ($old -cnotmatch '^[a-f0-9]{64}$' -or $old -cne $inputHashes[$name]) { throw "Input differs from pre-task snapshot: $name" }
    }
    $rows = @(Read-Table $orders @('order_id','status','amount'))
    $groups = New-Object 'System.Collections.Generic.Dictionary[string,object]' ([StringComparer]::Ordinal)
    $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
    $expected = [ordered]@{accepted_count=0; total=[decimal]0; cancelled_count=0; duplicate_copy_count=0; conflicting_id_count=0; unresolved_count=0; invalid_amount_count=0}
    foreach ($row in $rows) {
        $f = $row.fields
        if (-not $f[0]) { throw 'Empty order ID.' }
        $key = ConvertTo-Json -InputObject $f -Compress
        if (-not $seen.Add($key)) { $expected.duplicate_copy_count++; continue }
        if (-not $groups.ContainsKey($f[0])) { $groups.Add($f[0], (New-Object 'System.Collections.Generic.List[object]')) }
        $groups[$f[0]].Add($row)
    }
    foreach ($group in $groups.Values) {
        if ($group.Count -gt 1) { $expected.conflicting_id_count++; continue }
        $f = $group[0].fields
        $valid = $true
        try { $amount = Currency $f[2] } catch { $valid = $false; $expected.invalid_amount_count++ }
        if ($f[1] -ceq 'accepted') {
            if ($valid) { $expected.accepted_count++; $expected.total += $amount }
        } elseif ($f[1] -ceq 'cancelled') { $expected.cancelled_count++ }
        else { $expected.unresolved_count++ }
    }
    $summary = @(Read-Table (Join-Path $TaskDirectory 'summary.csv') $columns)
    if ($summary.Count -ne 1) { throw 'summary.csv must contain exactly one data row.' }
    for ($i=0; $i -lt $columns.Length; $i++) {
        $name = $columns[$i]
        $text = $summary[0].fields[$i]
        if ($name -ne 'total' -and $text -notmatch '^[0-9]+$') { throw "Invalid counter: $name" }
        if ((Currency $text) -ne $expected[$name]) { throw "Mismatch in ${name}: expected=$($expected[$name].ToString($culture)); actual=$text" }
    }
    foreach ($name in $inputHashes.Keys) {
        if ((Hash-File (Join-Path $TaskDirectory $name)) -cne $inputHashes[$name]) { throw "Input changed during verification: $name" }
        Write-Output "INPUT_SHA256 ${name}=$($inputHashes[$name]); matches pre-task snapshot and verification end"
    }
    Write-Output ('EXPECTED=' + (($columns | ForEach-Object {$expected[$_].ToString($culture)}) -join ','))
    Write-Output 'VERIFY_RESULT=PASS'
    exit 0
} catch {
    if ($Action -eq 'Snapshot') { Write-Output 'SNAPSHOT_RESULT=FAIL' } else { Write-Output 'VERIFY_RESULT=FAIL' }
    Write-Output ('ERROR: ' + $_.Exception.Message)
    exit 1
}
