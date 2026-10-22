@echo off
setlocal
set "PSModulePath="
if "%~3"=="" (
  echo Usage: CSV-Check.cmd Snapshot^|Verify "task folder" "baseline.json"
  exit /b 2
)
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0Verify-CSV.ps1" -Action "%~1" -TaskDirectory "%~2" -BaselinePath "%~3"
exit /b %errorlevel%
