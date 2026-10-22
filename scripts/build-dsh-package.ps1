param([string]$OutputDirectory, [switch]$RefreshManifest)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $repo 'dist' }
$names = @('proactive-skill-discovery','crafting-reference-based-svg-assets')
if ($RefreshManifest) {
    $skills = foreach ($name in $names) {
        $directory = Join-Path $repo "skills/$name"
        $files = foreach ($file in Get-ChildItem -LiteralPath $directory -File -Recurse) {
            if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked source refused' }
            [ordered]@{ path = $file.FullName.Substring($directory.Length + 1).Replace('\','/'); sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
        }
        [ordered]@{ name = $name; files = @($files | Sort-Object path) }
    }
    $manifest = [ordered]@{ schema = 1; owner = 'youchibuwan-ops/agent-workflow-skills'; version = '0.1.0-dsh-preview.1'; sourceCommit = 'c1434f04704938774eb359053aaafdf38ee90868'; skills = @($skills) }
    [IO.File]::WriteAllText((Join-Path $repo 'dsh-manifest.json'), (($manifest | ConvertTo-Json -Depth 10) + "`n"), (New-Object Text.UTF8Encoding($false)))
}
[IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$zip = Join-Path $OutputDirectory 'agent-workflow-skills-dsh-preview.zip'
if (Test-Path -LiteralPath $zip) { throw "Output already exists; choose a fresh output directory: $zip" }
$include = @('README.md','README.zh-CN.md','LICENSE','CHANGELOG.md','skills','windows','docs','scripts','tests/dsh-lifecycle.ps1','tests/dsh-zip.ps1','tests/dsh-runtime/package.json','tests/dsh-runtime/package-lock.json','examples','package.json','package-lock.json','.markdownlint.json','Install-DSH.cmd','Update-DSH.cmd','Uninstall-DSH.cmd','Check-DSH.cmd','dsh-manifest.json')
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open($zip, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($relative in $include) {
        $source = Join-Path $repo $relative
        $files = if (Test-Path -LiteralPath $source -PathType Container) { Get-ChildItem -LiteralPath $source -File -Recurse } else { Get-Item -LiteralPath $source }
        foreach ($file in $files) {
            $name = $file.FullName.Substring($repo.Length + 1).Replace('\','/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $name, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    }
} finally { $archive.Dispose() }
$hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText(($zip + '.sha256'), "$hash  $([IO.Path]::GetFileName($zip))`n")
Write-Output "Created $zip SHA256=$hash"
