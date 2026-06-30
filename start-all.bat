@echo off
setlocal enabledelayedexpansion
title DocOps - Starting All Services
color 0A

echo.
echo  ██████╗  ██████╗  ██████╗ ██████╗ ██████╗ ███████╗
echo  ██╔══██╗██╔═══██╗██╔════╝██╔═══██╗██╔══██╗██╔════╝
echo  ██║  ██║██║   ██║██║     ██║   ██║██████╔╝███████╗
echo  ██║  ██║██║   ██║██║     ██║   ██║██╔═══╝ ╚════██║
echo  ██████╔╝╚██████╔╝╚██████╗╚██████╔╝██║     ███████║
echo  ╚═════╝  ╚═════╝  ╚═════╝ ╚═════╝ ╚═╝     ╚══════╝
echo.
echo  Enterprise v2.4 - AI-Powered Industrial Knowledge Platform
echo  ============================================================
echo.

:: Check for OpenAI Key
findstr /C:"sk-your-key-here" "%~dp0backend\.env" >nul 2>&1
if not errorlevel 1 (
    echo  [INFO] No OPENAI_API_KEY detected in backend/.env.
    echo  DocOps will start in local OFFLINE / Ollama mode.
    echo  ^(Set a key later in backend/.env to upgrade to cloud GPT models^).
    echo.
)

echo  [1/3] Starting Python AI Backend (port 8000)...
start "DocOps - AI Backend (8000)" cmd /k "cd /d %~dp0backend && echo [AI Backend] Starting... && python main.py"

echo  Waiting for backend to initialize...
timeout /t 5 /nobreak >nul

echo  [2/3] Starting Express Gateway (port 3001)...
start "DocOps - API Gateway (3001)" cmd /k "cd /d %~dp0gateway && echo [Gateway] Starting... && node server.js"

echo  Waiting for gateway to initialize...
timeout /t 3 /nobreak >nul

echo  [3/3] Starting Next.js Frontend (port 3000)...
start "DocOps - Frontend (3000)" cmd /k "cd /d %~dp0frontend && echo [Frontend] Starting... && npm run dev"

echo.
echo  ============================================================
echo  All services starting! Opening browser in 8 seconds...
echo.
echo  Frontend:  http://localhost:3000
echo  Gateway:   http://localhost:3001
echo  AI Engine: http://localhost:8000
echo  Health:    http://localhost:3001/api/health
echo  ============================================================
echo.
echo  Default login: admin / admin123
echo  (Register a new account if this is your first run)
echo.

timeout /t 8 /nobreak >nul
start "" http://localhost:3000

pause
