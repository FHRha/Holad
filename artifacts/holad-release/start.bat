@echo off
cd server
if not exist "node_modules" (
    echo Installing production dependencies...
    call npm install --production
)
node dist\index.js
pause
