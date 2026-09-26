@echo off
cd /d "%~dp0"

where py >nul 2>nul
if not errorlevel 1 (
    py -3 launch.py
) else (
    where python >nul 2>nul
    if errorlevel 1 (
        echo Python 3.10 or newer was not found. Install Python and enable "Add python.exe to PATH".
        pause
        exit /b 1
    )
    python launch.py
)

if errorlevel 1 pause