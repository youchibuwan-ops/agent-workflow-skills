@echo off
setlocal
rem Do not pass PowerShell 7 module locations to Windows PowerShell 5.1.
set "PSModulePath="
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\Manage-DshSkills.ps1" -Action Check %*
set "aws_exit=%ERRORLEVEL%"
if not defined AWS_DSH_NO_PAUSE pause
exit /b %aws_exit%
