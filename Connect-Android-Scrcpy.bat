@echo off
title Android Wireless Scrcpy Connector
echo Starting Android Scrcpy Connection Script...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\sachi\.scrcpy-connect.ps1"

if %ERRORLEVEL% neq 0 (
    echo.
    echo An error occurred during execution.
    pause
)
