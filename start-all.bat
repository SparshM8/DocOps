@echo off
echo ============================================
echo   DocOps - Industrial Knowledge Copilot
echo ============================================
echo.
echo Starting all three services...
echo.

:: Start Python AI Backend on port 8000
echo [1/3] Starting Python FastAPI backend (port 8000)...
start "DocOps - AI Backend" cmd /k "cd /d %~dp0backend && uvicorn main:app --reload --port 8000"

timeout /t 3 /nobreak >nul

:: Start Node.js API Gateway on port 3001
echo [2/3] Starting Express API Gateway (port 3001)...
start "DocOps - Gateway" cmd /k "cd /d %~dp0gateway && node server.js"

timeout /t 2 /nobreak >nul

:: Start Next.js Frontend on port 3000
echo [3/3] Starting Next.js Frontend (port 3000)...
start "DocOps - Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo All services starting! Open http://localhost:3000 in your browser.
echo.
echo REMINDER: Make sure backend\.env has your OPENAI_API_KEY set before querying.
echo.
pause
