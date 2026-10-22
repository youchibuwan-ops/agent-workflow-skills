@echo off
setlocal
rem This launcher needs only Windows PowerShell built-ins; rebuild its native module path.
set "PSModulePath="
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\Manage-DshSkills.ps1" -Action Install %*
set "aws_exit=%ERRORLEVEL%"
if not defined AWS_DSH_NO_PAUSE pause
exit /b %aws_exit%
