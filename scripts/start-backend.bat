@echo off
setlocal

pushd "%~dp0.."

REM 确保日志目录存在
if not exist "log" mkdir log

echo Starting backend...
echo Backend log: log\backend.log
echo Error log:   log\backend-error.log

call pnpm --filter @deeptrail/server dev 1>log\backend.log 2>log\backend-error.log

set EXIT_CODE=%ERRORLEVEL%
popd
exit /b %EXIT_CODE%
