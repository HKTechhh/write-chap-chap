# Starts the Django API on http://127.0.0.1:8000
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $root ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
    Write-Host "Virtualenv missing. Run: python -m venv .venv" -ForegroundColor Red
    exit 1
}

Set-Location (Join-Path $root "backend")
& $python manage.py migrate --noinput
Write-Host ""
Write-Host "API      http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host "Docs     http://127.0.0.1:8000/api/docs/" -ForegroundColor Cyan
Write-Host "Admin    http://127.0.0.1:8000/admin/   (admin / Passw0rd!23)" -ForegroundColor Cyan
Write-Host ""
& $python manage.py runserver
