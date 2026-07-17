$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$logDir = Join-Path $repoRoot 'log'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Write-Host 'Starting backend and frontend...'
Write-Host "Log directory: $logDir"
Write-Host 'Backend stdout: log\backend.log'
Write-Host 'Backend stderr: log\backend-error.log'
Write-Host 'Frontend stdout: log\frontend.log'
Write-Host 'Frontend stderr: log\frontend-error.log'
Write-Host 'Spring Boot log: log\travel-planner.log'

Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'call scripts\start-backend.bat' -WorkingDirectory $repoRoot
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'call scripts\start-frontend.bat' -WorkingDirectory $repoRoot
