@echo off
echo ========================================
echo    BIRILIUM WALLET - INTEGRATED NODE
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed!
    echo.
    echo Please download and install Node.js from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo Node.js detected:
node --version
echo.

REM Check if wallet dependencies are installed
if not exist "wallet\node_modules\" (
    echo Installing wallet dependencies...
    cd wallet
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to install wallet dependencies!
        cd ..
        pause
        exit /b 1
    )
    cd ..
    echo.
)

REM Check if node-backend dependencies are installed
if not exist "wallet\node-backend\node_modules\" (
    echo Installing blockchain node dependencies...
    cd wallet\node-backend
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to install node-backend dependencies!
        cd ..\..
        pause
        exit /b 1
    )
    cd ..\..
    echo.
)

echo Starting Birilium Wallet with integrated blockchain node...
echo.
echo The wallet will open automatically in a few seconds.
echo Keep this window open while using the wallet.
echo.

cd wallet
npm start

pause
