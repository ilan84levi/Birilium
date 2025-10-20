@echo off
REM Birilium One-Click Mining Wallet Launcher
REM This script starts the integrated wallet+node

echo.
echo ========================================
echo   BIRILIUM ONE-CLICK MINING WALLET
echo ========================================
echo.
echo Starting integrated blockchain node and wallet...
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed!
    echo.
    echo Please download and install Node.js 18+ from:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Check if dependencies are installed
if not exist "node_modules\" (
    echo Installing dependencies... (this may take a few minutes)
    echo.
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
    echo.
    echo Dependencies installed successfully!
    echo.
)

REM Check if wallet dependencies are installed
if not exist "..\birilium-wallet\node_modules\" (
    echo Installing wallet dependencies...
    echo.
    cd ..\birilium-wallet
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo ERROR: Failed to install wallet dependencies
        pause
        exit /b 1
    )
    cd ..\Birilium
    echo.
    echo Wallet dependencies installed successfully!
    echo.
)

REM Start the wallet (which will auto-start the node)
echo Starting Birilium Wallet...
echo.
echo TIP: The blockchain node will start automatically
echo TIP: Wait for "Blockchain node started successfully" message
echo TIP: Then you can create a wallet and start mining!
echo.

cd ..\birilium-wallet
npm start

pause
