@echo off
setlocal

call "%~dp0start-recorder.bat" build %*
exit /b %errorlevel%
