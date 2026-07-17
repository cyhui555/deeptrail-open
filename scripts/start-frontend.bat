@echo off
setlocal

pushd "%~dp0.."

REM 确保日志目录存在
if not exist "log" mkdir "log"

set LOG_DIR=log

echo Starting frontend...
echo Frontend log: %LOG_DIR%\frontend.log
echo Error log:   %LOG_DIR%\frontend-error.log

call pnpm --filter @deeptrail/web dev 1>"%LOG_DIR%\frontend.log" 2>"%LOG_DIR%\frontend-error.log"

set EXIT_CODE=%ERRORLEVEL%
popd
exit /b %EXIT_CODE%
