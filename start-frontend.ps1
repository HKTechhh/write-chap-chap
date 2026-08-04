# Starts the Vite dev server on http://localhost:5173
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js is not installed." -ForegroundColor Red
    Write-Host "Install it with:  winget install OpenJS.NodeJS.LTS" -ForegroundColor Yellow
    Write-Host "Then restart this terminal and run this script again."
    exit 1
}

Set-Location (Join-Path $root "frontend")

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies (first run only)..." -ForegroundColor Cyan
    npm install
}

Write-Host ""
Write-Host "App  http://localhost:5173" -ForegroundColor Cyan
Write-Host "Make sure the backend is running too (./start-backend.ps1)" -ForegroundColor Yellow
Write-Host ""
npm run dev
