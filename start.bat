@echo off
REM Launch Sarmaya (client + server) from the correct folder, no matter where
REM this file is run from. %~dp0 is this script's own directory.
cd /d "%~dp0"
echo Starting Sarmaya from %CD%
call npm run dev
pause
