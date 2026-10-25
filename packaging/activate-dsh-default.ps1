[CmdletBinding()]
param([ValidateSet('Plan','Enable','Verify','Library')][string]$Action='Plan')
$ErrorActionPreference='Stop'
Set-StrictMode -Version 2.0
$env:PSModulePath=[IO.Path]::Combine($PSHOME,'Modules')
Import-Module ([IO.Path]::Combine($PSHOME,'Modules/Microsoft.PowerShell.Management/Microsoft.PowerShell.Management.psd1')) -ErrorAction Stop
Import-Module ([IO.Path]::Combine($PSHOME,'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1')) -ErrorAction Stop
function New-WorkflowUserPath([string]$Previous,[string]$Bin){
 if($Bin.Contains(';')){throw 'An owner path containing a semicolon cannot be represented in PATH'}
 $target=[IO.Path]::GetFullPath($Bin).TrimEnd([char]'\');$parts=New-Object 'Collections.Generic.List[string]';$parts.Add($target)
 foreach($part in $Previous.Split(';')){if(!$part.Trim()){continue};$same=$false;try{$same=[IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($part.Trim())).TrimEnd([char]'\').Equals($target,[StringComparison]::OrdinalIgnoreCase)}catch{};if(!$same){$parts.Add($part)}}
 return [string]::Join(';',$parts)
}
function Test-WorkflowResolution([string]$MachinePath,[string]$UserPath,[string]$Expected,[string]$WorkingDirectory){
 $code=@'
$ErrorActionPreference='Stop'
$env:PSModulePath=[IO.Path]::Combine($PSHOME,'Modules')
Import-Module ([IO.Path]::Combine($PSHOME,'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1'))
[Console]::OutputEncoding=[Text.Encoding]::GetEncoding([Globalization.CultureInfo]::CurrentCulture.TextInfo.OEMCodePage)
$commands=@(Get-Command dsh -CommandType Application -ErrorAction Stop);$g=$commands[0]
$w=@(& ([IO.Path]::Combine($env:SystemRoot,'System32/where.exe')) dsh)
$j=@{getCommand=$g.Source;where=$w}|ConvertTo-Json -Compress
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
[Console]::WriteLine($j)
'@
 $start=New-Object Diagnostics.ProcessStartInfo;$start.FileName=[IO.Path]::Combine($env:SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');$start.Arguments='-NoLogo -NoProfile -EncodedCommand '+[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($code));$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true;$start.StandardOutputEncoding=New-Object Text.UTF8Encoding($false);$start.WorkingDirectory=$WorkingDirectory
 $combined=([Environment]::ExpandEnvironmentVariables($MachinePath).TrimEnd([char]';')+';'+[Environment]::ExpandEnvironmentVariables($UserPath)).Trim([char]';');$start.EnvironmentVariables['PATH']=$combined;$start.EnvironmentVariables.Remove('NODE_OPTIONS');$start.EnvironmentVariables.Remove('NODE_PATH')
 $process=New-Object Diagnostics.Process;$process.StartInfo=$start;[void]$process.Start();$stdout=$process.StandardOutput.ReadToEnd();$stderr=$process.StandardError.ReadToEnd();$process.WaitForExit();if($process.ExitCode -ne 0){return @{isDefault=$false;error=$stderr;environmentSource='fresh-child-registry-machine-plus-user'}}
 $result=$stdout.Trim()|ConvertFrom-Json;$where=@($result.where);$firstWhere=if($where.Count){[string]$where[0]}else{''};$expectedPath=[IO.Path]::GetFullPath($Expected);$matches=([IO.Path]::GetFullPath([string]$result.getCommand)).Equals($expectedPath,[StringComparison]::OrdinalIgnoreCase) -and ([IO.Path]::GetFullPath($firstWhere)).Equals($expectedPath,[StringComparison]::OrdinalIgnoreCase)
 return @{isDefault=$matches;firstGetCommand=[string]$result.getCommand;firstWhere=$firstWhere;environmentSource='fresh-child-registry-machine-plus-user'}
}
function Get-WorkflowHash([string]$Path){$stream=[IO.File]::OpenRead($Path);$hash=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose();$stream.Dispose()}}
if($Action -eq 'Library'){return}
try{
 $owner=[IO.Path]::Combine([Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile),'.agent-workflow/global');$bin=Join-Path $owner 'bin';$alias=Join-Path $bin 'dsh.cmd';$userPath=[Environment]::GetEnvironmentVariable('Path','User');$machinePath=[Environment]::GetEnvironmentVariable('Path','Machine');$desired=New-WorkflowUserPath ([string]$userPath) $bin
 if($Action -eq 'Plan'){@{status='not-enabled-plan-only';alias=$alias;userPathOnly=$true;systemPathChanged=$false;restartRequired=$true}|ConvertTo-Json -Compress;exit 0}
 $checkDirectory=Join-Path $owner 'activation-checks';[IO.Directory]::CreateDirectory($checkDirectory)|Out-Null
 if($Action -eq 'Verify'){$proof=Test-WorkflowResolution $machinePath ([string]$userPath) $alias $checkDirectory;$proof|ConvertTo-Json -Compress;if(!$proof.isDefault){exit 2};exit 0}
 $configPath=Join-Path $owner 'owner-config.dsh.json';$config=[IO.File]::ReadAllText($configPath,[Text.Encoding]::UTF8)|ConvertFrom-Json;$payload=[IO.Path]::GetFullPath($config.integrity.payloadRoot);$manifestPath=[string]$config.integrity.manifestPath
 if((Get-WorkflowHash $manifestPath) -ne $config.integrity.manifestSha256){throw 'Owner release manifest SHA256 mismatch'};$manifest=[IO.File]::ReadAllText($manifestPath,[Text.Encoding]::UTF8)|ConvertFrom-Json;$entry=@($manifest.files|Where-Object{$_.path -eq 'packaging/global-bootstrap.ps1'});if($entry.Count -ne 1){throw 'Pinned bootstrap source missing'};$bootstrap=Join-Path $payload 'packaging/global-bootstrap.ps1';if((Get-WorkflowHash $bootstrap) -ne $entry[0].sha256){throw 'Pinned bootstrap source changed'}
 $nodeRoot=Join-Path $owner 'node-runtime/node-v24.22.1-win-x64';$archive=Join-Path $owner 'downloads/node-v24.22.1-win-x64.zip';$node=Join-Path $nodeRoot 'node.exe';if(!([IO.Path]::GetFullPath([string]$config.nodeExecutable)).Equals($node,[StringComparison]::OrdinalIgnoreCase)){throw 'Default activation requires the verified permanent Node runtime'}
 $env:NODE_OPTIONS=$null;$env:NODE_PATH=$null
 & $bootstrap -SourceRoot $payload -ManifestSha256 $config.integrity.manifestSha256 -NodeArchive $archive -NodeRoot $nodeRoot -CheckOnly
 if($LASTEXITCODE -ne 0){throw 'Source/Node preflight refused activation'}
 $script="import fs from 'node:fs';import {pathToFileURL} from 'node:url';const c=JSON.parse(fs.readFileSync(process.argv[1]));const m=await import(pathToFileURL(process.argv[2]).href);await m.verifyInstallation({config:c,profile:'default-activation'});console.log('SOURCE_AND_DEPENDENCIES_VERIFIED');"
 & $node --input-type=module -e $script $configPath (Join-Path $payload 'hosts/security/installation-verifier.mjs');if($LASTEXITCODE -ne 0){throw 'Dependency seal refused activation'}
 [IO.Directory]::CreateDirectory($bin)|Out-Null;$expected="@echo off`r`nsetlocal`r`nset `"NODE_OPTIONS=`"`r`nset `"NODE_PATH=`"`r`n`"%~dp0..\dsh.cmd`" %*`r`n";$encoding=New-Object Text.UTF8Encoding($false)
 if(Test-Path -LiteralPath $alias){if([IO.File]::ReadAllText($alias,$encoding) -ne $expected){throw 'Existing owner alias differs; no stock executable will be overwritten'}}else{[IO.File]::WriteAllText($alias,$expected,$encoding)}
 $before=Test-WorkflowResolution $machinePath $desired $alias $checkDirectory;if(!$before.isDefault){@{status='not-default-machine-or-other-earlier-command-wins';userPathChanged=$false;proof=$before}|ConvertTo-Json -Depth 6 -Compress;exit 2}
 $backups=Join-Path $owner 'path-backups';[IO.Directory]::CreateDirectory($backups)|Out-Null;$backup=Join-Path $backups ([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-ffff')+'.json');$record=@{variable='Path';target='User';previousValue=$userPath;previousWasNull=($null -eq $userPath);ownerRoot=$owner;createdAt=[DateTime]::UtcNow.ToString('o')};[IO.File]::WriteAllText($backup,($record|ConvertTo-Json -Depth 5),$encoding)
 [Environment]::SetEnvironmentVariable('Path',$desired,'User')
 $after=Test-WorkflowResolution ([Environment]::GetEnvironmentVariable('Path','Machine')) ([Environment]::GetEnvironmentVariable('Path','User')) $alias $checkDirectory
 if(!$after.isDefault){[Environment]::SetEnvironmentVariable('Path',$userPath,'User');@{status='not-default-rolled-back';backupPath=$backup;proof=$after}|ConvertTo-Json -Depth 6 -Compress;exit 2}
 $broadcast=$false;try{Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class WorkflowEnvironmentNotice{[DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)]public static extern IntPtr SendMessageTimeout(IntPtr w,uint m,UIntPtr p,string l,uint f,uint t,out UIntPtr r);}';$result=[UIntPtr]::Zero;$sent=[WorkflowEnvironmentNotice]::SendMessageTimeout([IntPtr]0xffff,0x1a,[UIntPtr]::Zero,'Environment',2,5000,[ref]$result);$broadcast=($sent -ne [IntPtr]::Zero)}catch{}
 @{status='user-default-dsh-enabled-reopen-terminal';proof=$after;backupPath=$backup;systemPathChanged=$false;stockExecutableChanged=$false;currentSessionPathChanged=$false;environmentNoticeSent=$broadcast;scope='dsh resolved through this alias; direct stock SDK, web and third-party UI are outside this guarantee'}|ConvertTo-Json -Depth 6 -Compress
}catch{Write-Error ('Default DSH activation blocked: '+$_.Exception.Message);exit 1}
