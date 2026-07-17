@echo off
setlocal

pushd "%~dp0.."

REM 确保日志目录存在
if not exist "log" mkdir log

echo ========================================
echo  旅迹 - 一键启动
echo ========================================
echo.
echo Starting backend and frontend...
echo Log directory: %CD%\log
echo.
echo Backend stdout: log\backend.log
echo Backend stderr: log\backend-error.log
echo Frontend stdout: log\frontend.log
echo Frontend stderr: log\frontend-error.log
echo.
echo Spring Boot 日志: log\travel-planner.log (由 logback 配置)
echo.

start "travel-planner-backend" cmd /c "call scripts\start-backend.bat"
timeout /t 5 /nobreak >nul
start "travel-planner-frontend" cmd /c "call scripts\start-frontend.bat"

echo.
echo Both services started. Check log directory for output.
echo Backend:  http://localhost:8080
echo Frontend: http://localhost:3000
echo Swagger:  http://localhost:8080/swagger-ui.html
echo.

popd
