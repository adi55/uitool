@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PS_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS_EXE%" set "PS_EXE=powershell.exe"

set "STDOUT_FILE=%TEMP%\tim-ui-recorder-%RANDOM%-%RANDOM%.stdout.log"
set "STDERR_FILE=%TEMP%\tim-ui-recorder-%RANDOM%-%RANDOM%.stderr.log"

"%PS_EXE%" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\recorder-bootstrap.ps1" %* 1>"%STDOUT_FILE%" 2>"%STDERR_FILE%"
set "EXIT_CODE=%ERRORLEVEL%"

if exist "%STDOUT_FILE%" type "%STDOUT_FILE%"
if exist "%STDERR_FILE%" type "%STDERR_FILE%" 1>&2
del /q "%STDOUT_FILE%" "%STDERR_FILE%" >nul 2>&1

exit /b %EXIT_CODE%
