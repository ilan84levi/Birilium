@echo off
echo ========================================
echo Birilium Wallet - Clean User Data
echo ========================================
echo.
echo This script will delete ALL wallet data including:
echo - Saved wallets and private keys
echo - Settings and preferences
echo - Cached blockchain data
echo - Logs and temporary files
echo.
echo WARNING: Make sure you have backed up your wallet!
echo Press Ctrl+C to cancel, or
pause

echo.
echo Closing Birilium Wallet and Electron processes...
taskkill /F /IM "Birilium Wallet.exe" 2>nul
taskkill /F /IM "electron.exe" 2>nul
timeout /t 2 /nobreak >nul

echo.
echo Deleting wallet user data...
if exist "%APPDATA%\birilium-wallet" (
    echo Deleting: %APPDATA%\birilium-wallet
    rmdir /S /Q "%APPDATA%\birilium-wallet"
    echo   ✓ Wallet data deleted (birilium-wallet)
) else (
    echo   - No wallet data found (birilium-wallet)
)

if exist "%APPDATA%\Birilium Wallet" (
    echo Deleting: %APPDATA%\Birilium Wallet
    rmdir /S /Q "%APPDATA%\Birilium Wallet"
    echo   ✓ Wallet data deleted (Birilium Wallet)
) else (
    echo   - No wallet data found (Birilium Wallet)
)

echo.
echo ========================================
echo Clean-up complete!
echo ========================================
echo.
echo Your wallet data has been removed.
echo You can now:
echo   1. Test a fresh installation
echo   2. Start the wallet with a clean state
echo   3. Create a new wallet
echo.
echo Note: This simulates what a new user will see
echo when they first install your wallet.
echo.
pause
