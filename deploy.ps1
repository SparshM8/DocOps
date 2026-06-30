# DocOps Production Deployment Script (Windows Server)
# This script orchestrates the Docker deployment for the DocOps platform.

$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "🚀 Starting DocOps Production Deployment..." -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# 1. Check for Docker
try {
    docker --version | Out-Null
    docker-compose --version | Out-Null
} catch {
    Write-Host "❌ Docker or docker-compose is not installed or not running!" -ForegroundColor Red
    Write-Host "Please install Docker Desktop or Docker Engine and try again." -ForegroundColor Yellow
    exit 1
}

# 2. Check and Create Environment Variables
Write-Host "`n[1/4] Checking Environment Configurations..." -ForegroundColor Blue

if (-not (Test-Path "gateway/.env")) {
    Write-Host "⚠️  gateway/.env not found. Creating default template..." -ForegroundColor Yellow
    @"
PORT=3001
JWT_SECRET=$(New-Guid)
MONGODB_URI=mongodb://mongodb:27017/docops
PYTHON_API_URL=http://backend:8000
"@ | Out-File "gateway/.env" -Encoding UTF8
    Write-Host "✅ Created gateway/.env. Please configure it later if needed." -ForegroundColor Green
}

if (-not (Test-Path "backend/.env")) {
    Write-Host "⚠️  backend/.env not found. Creating default template..." -ForegroundColor Yellow
    @"
OLLAMA_BASE_URL=http://host.docker.internal:11434
QDRANT_URL=http://qdrant:6333
COLLECTION=docops_manuals
"@ | Out-File "backend/.env" -Encoding UTF8
    Write-Host "✅ Created backend/.env." -ForegroundColor Green
}

if (-not (Test-Path "frontend/.env.local")) {
    Write-Host "⚠️  frontend/.env.local not found. Creating default template..." -ForegroundColor Yellow
    @"
NEXT_PUBLIC_GATEWAY_URL=http://localhost:3001
"@ | Out-File "frontend/.env.local" -Encoding UTF8
    Write-Host "✅ Created frontend/.env.local." -ForegroundColor Green
}

# 3. Stop Existing Containers
Write-Host "`n[2/4] Stopping existing DocOps containers..." -ForegroundColor Blue
docker-compose down

# 4. Build and Start
Write-Host "`n[3/4] Building and launching containers in detached mode..." -ForegroundColor Blue
docker-compose up -d --build

# 5. Verify Health
Write-Host "`n[4/4] Verifying deployment health..." -ForegroundColor Blue
Start-Sleep -Seconds 10
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3001/api/health" -Method Get
    Write-Host "Gateway Status: $($health.gateway)" -ForegroundColor Green
    Write-Host "Database Status: $($health.database)" -ForegroundColor Green
    Write-Host "AI Backend Status: $($health.ai_backend)" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Could not reach gateway health check immediately. Containers might still be starting." -ForegroundColor Yellow
}

Write-Host "`n=============================================" -ForegroundColor Cyan
Write-Host "🎉 DocOps successfully deployed!" -ForegroundColor Green
Write-Host "Frontend App: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Gateway API:  http://localhost:3001" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
