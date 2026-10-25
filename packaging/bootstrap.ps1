param([ValidateSet('install','skills','codex','dsh','export')][string]$Action='install')
$ErrorActionPreference='Stop'
$OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
try {
  if(-not [Environment]::Is64BitOperatingSystem){throw 'This preview requires Windows x64.'}
  $distributionRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
  function Get-Sha256([string]$path){
    $algorithm=[Security.Cryptography.SHA256]::Create();$stream=[IO.File]::OpenRead($path)
    try{return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}
    finally{$stream.Dispose();$algorithm.Dispose()}
  }
  $manifest=Get-Content -LiteralPath (Join-Path $distributionRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if($manifest.format -ne 1 -or $manifest.scope -ne 'controlled-host-preview'){throw 'Invalid preview manifest.'}
  foreach($file in $manifest.files){
    if($file.path -match '(^/|\\|:|(^|/)\.\.?(/|$))'){throw 'Unsafe manifest path.'}
    $absolute=[IO.Path]::GetFullPath((Join-Path $distributionRoot $file.path))
    if(-not $absolute.StartsWith($distributionRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Manifest escaped distribution.'}
    if(-not(Test-Path -LiteralPath $absolute -PathType Leaf)){throw ('Missing resource: '+$file.path)}
    $item=Get-Item -LiteralPath $absolute -Force
    if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint)-ne 0 -or $item.Length -ne $file.bytes -or (Get-Sha256 $absolute) -ne $file.sha256){throw ('Integrity mismatch: '+$file.path)}
  }
  function Test-UsableNode([string]$candidate){
    if(-not $candidate -or -not(Test-Path -LiteralPath $candidate -PathType Leaf)){return $false}
    try {$actual=& $candidate -p 'process.versions.node';if($LASTEXITCODE -ne 0){return $false};$v=[version]$actual;return ($v -ge [version]'24.9.0')}catch{return $false}
  }
  $nodePath=$env:WORKFLOW_PREVIEW_NODE
  if($nodePath -and -not(Test-UsableNode $nodePath)){throw 'WORKFLOW_PREVIEW_NODE is not callable Node >=24.9.'}
  if(-not $nodePath){$existing=Get-Command node.exe -ErrorAction SilentlyContinue;if($existing -and (Test-UsableNode $existing.Source)){$nodePath=$existing.Source}}
  if(-not $nodePath){
    $runtimeRoot=Join-Path $env:LOCALAPPDATA 'AgentWorkflowPreview/runtime'
    $nodePath=Join-Path $runtimeRoot 'node-v24.22.1-win-x64/node.exe'
    if(-not(Test-UsableNode $nodePath)){
      New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
      $archive=Join-Path $runtimeRoot 'node-v24.22.1-win-x64.zip'
      if(-not(Test-Path -LiteralPath $archive)){
        Write-Host 'Downloading the pinned official portable Node runtime...'
        [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing -Uri 'https://nodejs.org/dist/v24.22.1/node-v24.22.1-win-x64.zip' -OutFile $archive
      }
      $expected='d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5'
      if((Get-Sha256 $archive) -ne $expected){throw 'Official Node archive SHA256 differs; installation stopped.'}
      [void][Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem')
      [IO.Compression.ZipFile]::ExtractToDirectory($archive,$runtimeRoot)
      if(-not(Test-UsableNode $nodePath)){throw 'Extracted Node runtime is not callable.'}
    }
  }
  $launchArgs=@((Join-Path $distributionRoot 'packaging/run.mjs'),'--action',$Action,'--source',$distributionRoot,'--node',$nodePath)
  if($env:WORKFLOW_PREVIEW_BASE){$launchArgs+=@('--base',$env:WORKFLOW_PREVIEW_BASE)}
  & $nodePath @launchArgs
  exit $LASTEXITCODE
}catch{Write-Error $_.Exception.Message;exit 1}
