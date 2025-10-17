@echo off
echo ========================================
echo    BIRILIUM WALLET - DIAGNOSTIC TOOL
echo ========================================
echo.

echo Checking MongoDB...
netstat -ano | findstr ":27017"
if %ERRORLEVEL% EQU 0 (
    echo [OK] MongoDB is running on port 27017
) else (
    echo [ERROR] MongoDB is NOT running!
    echo Please start MongoDB first
    pause
    exit /b 1
)
echo.

echo Checking if blockchain node is running...
netstat -ano | findstr ":3001"
if %ERRORLEVEL% EQU 0 (
    echo [WARNING] Port 3001 is already in use
    echo This might be the blockchain node or another application
) else (
    echo [OK] Port 3001 is free
)
echo.

echo Checking packaged app files...
if exist "dist\win-unpacked\Birilium Wallet.exe" (
    echo [OK] Packaged app found
) else (
    echo [ERROR] Packaged app NOT found
    echo Please run: npm run build:win
    pause
    exit /b 1
)
echo.

if exist "dist\win-unpacked\resources\app\node-backend\node.js" (
    echo [OK] Blockchain node backend found
) else (
    echo [ERROR] Node backend NOT found in packaged app
    pause
    exit /b 1
)
echo.

if exist "dist\win-unpacked\resources\app\node-backend\.env" (
    echo [OK] .env file found
) else (
    echo [WARNING] .env file NOT found
    echo PayPal subscriptions might not work
)
echo.

if exist "dist\win-unpacked\resources\app\node-backend\node_modules" (
    echo [OK] Node modules found
) else (
    echo [ERROR] Node modules NOT found
    echo Please rebuild: npm run build:win
    pause
    exit /b 1
)
echo.

echo ========================================
echo All checks passed!
echo ========================================
echo.
echo Starting packaged app...
echo.

cd dist\win-unpacked
start "" "Birilium Wallet.exe"

echo.
echo Wallet should open in a few seconds.
echo.
echo If you see errors, check the console (F12) in the wallet.
echo Look for messages about blockchain node connection.
echo.
pause
