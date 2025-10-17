@echo off
echo ========================================
echo  BIRILIUM - START BLOCKCHAIN NODE ONLY
echo ========================================
echo.

cd node-backend

echo Starting blockchain node on port 3001...
echo.
echo Keep this window open while using the wallet.
echo Close this window to stop the node.
echo.

node node.js

pause
