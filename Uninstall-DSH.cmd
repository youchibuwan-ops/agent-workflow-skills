@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\Manage-DshSkills.ps1" -Action Uninstall %*
set "aws_exit=%ERRORLEVEL%"
if not defined AWS_DSH_NO_PAUSE pause
exit /b %aws_exit%
