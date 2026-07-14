@echo off
echo ===========================================
echo Starting StreamNavi Backend and Frontend...
echo ===========================================

echo Verifying and installing Backend Dependencies...
cd server
call pnpm install --reporter=silent
cd ..

echo Verifying and installing Frontend Dependencies...
cd client
call pnpm install --reporter=silent
cd ..

echo Starting Backend Server in a new window...
start "StreamNavi Backend" cmd /c "cd server && pnpm run dev"

echo Starting Frontend Server in a new window...
start "StreamNavi Frontend" cmd /c "cd client && pnpm run dev"

echo Both servers are starting up!
echo Frontend will be available at: http://localhost:5173/jam
pause
