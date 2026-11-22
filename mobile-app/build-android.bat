@echo off
if exist "%~dp0..\build-android.bat" (
    call "%~dp0..\build-android.bat" %*
) else (
    echo [ERROR] Root build-android.bat not found.
    pause
)
