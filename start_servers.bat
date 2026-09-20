@echo off
echo Starting QPath System...
echo ===================================

start "QPath Backend (FastAPI)" cmd /k "cd backend && python main.py"
timeout /t 2 /nobreak >nul
start "QPath Frontend (React)" cmd /k "cd frontend && npm start"

echo Both services launched!
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:3000
echo ===================================
