@echo off
setlocal

call "%~dp0start-recorder.bat" server %*
exit /b %errorlevel%
