@echo off
cd /d "%~dp0"
"C:\Program Files\nodejs\node.exe" scheduler.js >> scheduler.log 2>&1