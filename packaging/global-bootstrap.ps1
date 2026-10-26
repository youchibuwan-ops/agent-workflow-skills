[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$SourceRoot,
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ManifestSha256,
 [string]$ReleaseId='20261026-r02',
 [string]$NodeArchive='',
 [string]$NodeRoot='',
 [switch]$CheckOnly,
 [switch]$NodeOnly
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$env:PSModulePath=[IO.Path]::Combine($PSHOME,'Modules')
Import-Module ([IO.Path]::Combine($PSHOME,'Modules/Microsoft.PowerShell.Management/Microsoft.PowerShell.Management.psd1')) -ErrorAction Stop
Import-Module ([IO.Path]::Combine($PSHOME,'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1')) -ErrorAction Stop
$workflowNodeVersion='node-v24.22.1-win-x64'
$workflowNodeZipSha='d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5'
$workflowNodeTreeSha='8c862fa5a190b0e1a53cad0cd0b361c53d280939cb30f4342867ffbf57e0cd85'
$workflowOwner=Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)) '.agent-workflow/global'
function Get-Hash([string]$Path){$f=[IO.File]::OpenRead($Path);$h=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($h.ComputeHash($f))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose();$f.Dispose()}}
function Get-BytesHash([byte[]]$Bytes){$h=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($h.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}}
function Assert-Plain([string]$Path){$p=[IO.Path]::GetFullPath($Path);while($p){if(Test-Path -LiteralPath $p){$x=Get-Item -LiteralPath $p -Force;if(($x.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw "Redirected installer path refused: $p"}};$next=[IO.Path]::GetDirectoryName($p);if($next -eq $p){break};$p=$next}}
function Walk-Plain([string]$Root){
 $queue=New-Object 'Collections.Generic.Queue[string]';$queue.Enqueue($Root);$found=New-Object 'Collections.Generic.List[object]'
 while($queue.Count){$directory=$queue.Dequeue();foreach($item in Get-ChildItem -LiteralPath $directory -Force){if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw "Linked resource refused: $($item.FullName)"};$found.Add($item);if($item.PSIsContainer){$queue.Enqueue($item.FullName)}}};return $found.ToArray()
}
function Test-Release([string]$Root,[string]$Pin){
 Assert-Plain $Root;$rootFull=[IO.Path]::GetFullPath($Root).TrimEnd([char]'\');$manifest=Join-Path $rootFull 'manifest.json';if((Get-Hash $manifest) -ne $Pin){throw 'Release manifest SHA256 mismatch'}
 $doc=[IO.File]::ReadAllText($manifest,[Text.Encoding]::UTF8)|ConvertFrom-Json;if($doc.format -ne 1 -or @($doc.files).Count -lt 1){throw 'Incomplete release manifest'}
 $names=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase);$total=[long]0
 foreach($entry in $doc.files){$name=[string]$entry.path;if(!$name -or $name -match '[\\:\x00]' -or $name.StartsWith('/') -or @($name.Split('/')|Where-Object{$_ -eq '' -or $_ -eq '.' -or $_ -eq '..' -or $_ -match '[. ]$'}).Count -or !$names.Add($name)){throw 'Unsafe or colliding manifest member'}
  if([string]$entry.sha256 -notmatch '^[a-f0-9]{64}$' -or [long]$entry.bytes -lt 0){throw 'Malformed source digest'};$path=Join-Path $rootFull $name;Assert-Plain $path;$item=Get-Item -LiteralPath $path -Force;if($item.PSIsContainer -or $item.Length -ne [long]$entry.bytes -or (Get-Hash $path) -ne $entry.sha256){throw "Release resource differs: $name"};$total+=$item.Length;if($total -gt 67108864){throw 'Release size limit exceeded'}
 }
 $actual=@(Walk-Plain $rootFull|Where-Object{!$_.PSIsContainer});if($actual.Count -ne $names.Count+1){throw 'Unlisted release payload file'};foreach($item in $actual){$name=$item.FullName.Substring($rootFull.Length+1).Replace('\','/');if($name -ne 'manifest.json' -and !$names.Contains($name)){throw 'Unlisted release resource'}}
 return $rootFull
}
function Test-NodeTree([string]$Archive,[string]$Runtime){
 if((Get-Hash $Archive) -ne $workflowNodeZipSha){throw 'Official Node ZIP SHA256 mismatch'};Assert-Plain $Archive;Assert-Plain $Runtime
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $zip=[IO.Compression.ZipFile]::OpenRead($Archive);$expected=New-Object 'Collections.Generic.Dictionary[string,object]' ([StringComparer]::Ordinal);$names=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
 $expected.Add('.',[ordered]@{path='.';type='directory'});$total=[long]0
 try{foreach($entry in $zip.Entries){$full=$entry.FullName;if(!$full.StartsWith($workflowNodeVersion+'/',[StringComparison]::Ordinal)){throw 'Wrong Node archive prefix'};$name=$full.Substring($workflowNodeVersion.Length+1).TrimEnd([char]'/');if(!$name){continue};if($name -match '[\\:\x00]' -or $name.StartsWith('/') -or @($name.Split('/')|Where-Object{$_ -eq '' -or $_ -eq '.' -or $_ -eq '..'}).Count -or !$names.Add($name)){throw 'Unsafe Node archive member'}
   $parts=$name.Split('/');for($n=1;$n -lt $parts.Length;$n++){$parent=[string]::Join('/',$parts[0..($n-1)]);if(!$expected.ContainsKey($parent)){$expected.Add($parent,[ordered]@{path=$parent;type='directory'})}}
   $path=Join-Path $Runtime $name;Assert-Plain $path;$item=Get-Item -LiteralPath $path -Force
   if($full.EndsWith('/')){if(!$item.PSIsContainer){throw 'Node directory type mismatch'};$expected[$name]=[ordered]@{path=$name;type='directory'}}
   else{if($item.PSIsContainer -or $entry.Length -ne $item.Length -or $entry.Length -gt 268435456){throw 'Node file type/length mismatch'};$total+=$entry.Length;if($total -gt 536870912){throw 'Node archive exceeds bounds'};$stream=$entry.Open();$h=[Security.Cryptography.SHA256]::Create();try{$digest=([BitConverter]::ToString($h.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose();$stream.Dispose()};if((Get-Hash $path) -ne $digest){throw "Node resource differs from official ZIP: $name"};$expected[$name]=[ordered]@{bytes=[long]$entry.Length;path=$name;sha256=$digest;type='file'}}
  }
 }finally{$zip.Dispose()}
 $all=@(Walk-Plain $Runtime);if($all.Count+1 -ne $expected.Count){throw 'Unexpected/missing Node runtime entry'};foreach($item in $all){$name=$item.FullName.Substring($Runtime.TrimEnd([char]'\').Length+1).Replace('\','/');if(!$expected.ContainsKey($name)){throw 'Unlisted Node runtime entry'}}
 $sorted=New-Object 'Collections.Generic.List[string]';foreach($name in $expected.Keys){$sorted.Add($name)};$sorted.Sort([StringComparer]::Ordinal);$entries=@(foreach($name in $sorted){$expected[$name]});$json=([ordered]@{entries=$entries}|ConvertTo-Json -Depth 10 -Compress);$tree=Get-BytesHash ([Text.Encoding]::UTF8.GetBytes($json));if($tree -ne $workflowNodeTreeSha){throw "Independent Node tree SHA mismatch: $tree"};return @{treeSha256=$tree;entries=$expected.Count;bytes=$total}
}
try{
 if(![Environment]::Is64BitOperatingSystem){throw 'The pinned Windows x64 runtime requires a 64-bit system'}
 $SourceRoot=Test-Release $SourceRoot $ManifestSha256
 $env:NODE_OPTIONS=$null;$env:NODE_PATH=$null
 if(!$NodeArchive){$downloads=Join-Path $workflowOwner 'downloads';Assert-Plain $downloads;[IO.Directory]::CreateDirectory($downloads)|Out-Null;$NodeArchive=Join-Path $downloads ($workflowNodeVersion+'.zip');if(!(Test-Path -LiteralPath $NodeArchive)){
   if($CheckOnly){throw 'Check-only requires an existing official Node ZIP'};$temporary=$NodeArchive+'.partial-'+[Guid]::NewGuid().ToString('N');[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
   Invoke-WebRequest -UseBasicParsing -Uri ('https://nodejs.org/dist/v24.22.1/'+$workflowNodeVersion+'.zip') -OutFile $temporary -MaximumRedirection 0
   if((Get-Hash $temporary) -ne $workflowNodeZipSha){throw 'Downloaded Node ZIP failed its fixed publisher SHA256'};[IO.File]::Move($temporary,$NodeArchive)
  }}
 $NodeArchive=[IO.Path]::GetFullPath($NodeArchive);if((Get-Hash $NodeArchive) -ne $workflowNodeZipSha){throw 'Official Node ZIP SHA256 mismatch before extraction'}
 if(!$NodeRoot){$NodeRoot=Join-Path $workflowOwner ('node-runtime/'+$workflowNodeVersion)};$NodeRoot=[IO.Path]::GetFullPath($NodeRoot);Assert-Plain $NodeRoot
 if(!(Test-Path -LiteralPath $NodeRoot)){
  if($CheckOnly){throw 'Check-only requires an existing Node runtime'};if([IO.Path]::GetFileName($NodeRoot) -ne $workflowNodeVersion){throw 'Fresh Node runtime requires its pinned version directory'}
  Add-Type -AssemblyName System.IO.Compression.FileSystem;$parent=[IO.Path]::GetDirectoryName($NodeRoot);[IO.Directory]::CreateDirectory($parent)|Out-Null;$z=[IO.Compression.ZipFile]::OpenRead($NodeArchive);try{foreach($e in $z.Entries){if(!$e.FullName.StartsWith($workflowNodeVersion+'/') -or $e.FullName -match '(^|/)\.\.(/|$)|[\\:]'){throw 'Unsafe fixed Node ZIP entry'}}}finally{$z.Dispose()};[IO.Compression.ZipFile]::ExtractToDirectory($NodeArchive,$parent)
 }
 $nodeCheck=Test-NodeTree $NodeArchive $NodeRoot;$node=Join-Path $NodeRoot 'node.exe';$version=& $node --version;if($LASTEXITCODE -ne 0 -or $version.Trim() -ne 'v24.22.1'){throw 'Verified Node executable did not run the required version'}
 if($CheckOnly -or $NodeOnly){@{status='verified-no-sdk-or-model-called';nodeExecutable=$node;nodeTree=$nodeCheck;manifestSha256=$ManifestSha256;ownerRoot=$workflowOwner}|ConvertTo-Json -Compress;exit 0}
 $releaseRoot=Join-Path $workflowOwner ('releases/'+$ReleaseId)
 if(Test-Path -LiteralPath $releaseRoot){[void](Test-Release $releaseRoot $ManifestSha256)}else{& $node (Join-Path $SourceRoot 'packaging/global-install.mjs') stage $SourceRoot $ManifestSha256 $ReleaseId;if($LASTEXITCODE -ne 0){throw 'Immutable release preparation refused'}}
 & $node (Join-Path $releaseRoot 'packaging/global-install.mjs') dsh-install $releaseRoot $ManifestSha256 $NodeRoot $NodeArchive;if($LASTEXITCODE -ne 0){throw 'Controlled DSH installation did not finish'}
 Write-Host 'Controlled DSH installed. No model, API-key copy or browser launch occurred.'
 Write-Host 'Set your own key in your PowerShell window; never share the real key:'
 Write-Host '$env:DEEPSEEK_API_KEY = ''YOUR_OWN_KEY'''
 Write-Host ('Then cd to your project and run: & "'+(Join-Path $workflowOwner 'dsh.cmd')+'" web')
 Write-Host 'Open the printed local URL manually. In Web, add/select the actual project workspace and verify its name before submitting a task.'
 Write-Host 'Use the same Web conversation for choice, feedback and acceptance. Headless is one-shot and cannot complete that interaction.'
}catch{Write-Error ('Installation blocked: '+$_.Exception.Message);exit 1}
