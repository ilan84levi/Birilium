@echo off
echo ========================================
echo Birilium Wallet - Bypass Terms Modal
echo ========================================
echo.
echo This will automatically accept the terms
echo so you can test the wallet functionality.
echo.
echo Press Ctrl+C to cancel, or
pause

echo.
echo Starting wallet with terms pre-accepted...
echo.

:: Set environment variable to bypass terms
set BYPASS_TERMS=true

:: Start the wallet
cd /d "%~dp0"
npm start

pause
