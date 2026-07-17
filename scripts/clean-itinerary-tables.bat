@echo off
chcp 65001 >nul 2>&1
setlocal Enableexpansion

:: ============================================================
::  行程相关表数据清理脚本
::  用法:
::     clean-itinerary-tables.bat            -- 默认清理（保留今天+未过期的任务，先预览后执行）
::     clean-itinerary-tables.bat /preview   -- 仅预览将要删除的数量
::     clean-itinerary-tables.bat /all       -- 清空全部行程表（保留 user 表）
::     clean-itinerary-tables.bat /days 30   -- 保留最近 N 天的数据
::     clean-itinerary-tables.bat /keep-runs -- 额外保留最近一次 RUNNING/PROCESSING 任务
:: ============================================================

set "DB=%~dp0..\data\travel.db"
set "LOG=%~dp0..\data\clean.log"

if not exist "%DB%" (
    echo [错误] 数据库文件不存在: %DB%
    exit /b 1
)

:: ---- 解析参数 ----
set "MODE=clean"
set "KEEP_DAYS=0"
set "KEEP_RUNNING=0"

:parse_args
if "%~1"=="" goto :args_done
if /i "%~1"=="/preview" set "MODE=preview" & shift & goto :parse_args
if /i "%~1"=="/all" set "MODE=all" & shift & goto :parse_args
if /i "%~1"=="/days" set "MODE=clean" & set "KEEP_DAYS=%~2" & shift & shift & goto :parse_args
if /i "%~1"=="/keep-runs" set "KEEP_RUNNING=1" & shift & goto :parse_args
if /i "%~1"=="/?" goto :help
if /i "%~1"=="-h" goto :help
if /i "%~1"=="--help" goto :help
echo [警告] 未知参数: %~1
shift
goto :parse_args

:args_done
echo ============================================================
echo  行程表数据清理
echo  数据库: %DB%
echo  模式:   %MODE%
if "%MODE%"=="clean" if "%KEEP_DAYS%"=="0" echo  策略: 保留今日数据 + 未过期任务
if "%MODE%"=="clean" if "%KEEP_DAYS%" NEQ "0" echo  策略: 保留最近 %KEEP_DAYS% 天
if "%MODE%"=="all" echo  策略: 清空全部行程表
echo ============================================================
echo.

:: ---- 计算时间戳 ----
:: SQLite 的 datetime('now','-N days') 由 SQL 内处理，这里只传标志

:: ---- 1. 先统计现状 ----
echo 【1/4】当前表记录数:

for %%T in (checkin_media checkin_item checkin_task track_point journey_review plan_task_ref itinerary_task ai_call_log itinerary_record trip_plan) do (
    set "CNT="
    for /f "delims=" %%A in ('sqlite3 "%DB%" "SELECT COUNT(*) FROM %%T;"') do set "CNT=%%A"
    echo    %%T : !CNT!
)
echo.

:: ---- 2. 预览将要删除的数量 ----
echo 【2/4】预计删除数量:

if "%MODE%"=="all" (
    for %%T in (checkin_media checkin_item checkin_task track_point journey_review plan_task_ref itinerary_task ai_call_log itinerary_record trip_plan) do (
        set "CNT="
        for /f "delims=" %%A in ('sqlite3 "%DB%" "SELECT COUNT(*) FROM %%T;"') do set "CNT=%%A"
        echo   将清空 %%T : !CNT! 条
    )
) else (
    :: 行程清单：按 created_at 过滤（今日或最近N天）
    if "%KEEP_DAYS%"=="0" (
        set "PLAN_WHERE=date(created_at) >= date('now')"
        set "ALL_WHERE=date(created_at) >= date('now')"
    ) else (
        set "PLAN_WHERE=created_at >= datetime('now','-%KEEP_DAYS% days')"
        set "ALL_WHERE=created_at >= datetime('now','-%KEEP_DAYS% days')"
    )
    :: 额外保留当天仍在运行的任务
    if "%KEEP_RUNNING%"=="1" (
        set "TASK_WHERE=(%ALL_WHERE% OR status IN ('PENDING','PROCESSING'))"
    ) else (
        set "TASK_WHERE=%ALL_WHERE%"
    )

    :: trip_plan 待删数
    for /f "delims=" %%A in ('sqlite3 "%DB%" "SELECT COUNT(*) FROM trip_plan WHERE NOT (%PLAN_WHERE%);"') do set "DEL_PLAN=%%A"
    echo   将删除 trip_plan: %DEL_PLAN% 条

    :: 关联子表：根据 plan_id 是否在待删 plan 范围内
    for /f "delims=" %%A in ('sqlite3 "%DB%" "SELECT COUNT(*) FROM plan_task_ref WHERE plan_id IN (SELECT id FROM trip_plan WHERE NOT (%PLAN_WHERE%));"') do set "DEL_REF=%%A"
    echo   将删除 plan_task_ref: %DEL_REF% 条

    for /f "delims=" %%A in ('sqlite3 "%DB%" "SELECT COUNT(*) FROM checkin_task WHERE plan_id IN (SELECT id FROM trip_plan WHERE NOT (%PLAN_WHERE%));"') do set "DEL_CKT=%%A"
    echo   将删除 checkin_task: %DEL_CKT% 条

    for /f "delims=" %%A in ('sqlite3 "%DB%" "SELECT COUNT(*) FROM checkin_item WHERE checkin_task_id IN (SELECT id FROM checkin_task WHERE plan_id IN (SELECT id FROM trip_plan WHERE NOT (%PLAN_WHERE%)));"') do set "DEL_CKI=%%A"
    echo   将删除 checkin_item: %DEL_CKI% 条

    for /f "delims=" %%A in ('sqlite3 "%DB%" "SELECT COUNT(*) FROM checkin_media WHERE checkin_item_id IN (SELECT id FROM checkin_item WHERE checkin_task_id IN (SELECT id FROM checkin_task WHERE plan_id IN (SELECT id FROM trip_plan WHERE NOT (%PLAN_WHERE%))));"') do set "DEL_CKM=%%A"
    echo   将删除 checkin_media: %DEL_CKM% 条

    for /f "delims=" %%A in ('sqlite3 "%DB%" "SELECT COUNT(*) FROM track_point WHERE plan_id IN (SELECT id FROM trip_plan WHERE NOT (%PLAN_WHERE%));"') do set "DEL_TP=%%A"
    echo   将删除 track_point: %DEL_TP% 条

    for /f "delims=" %%A in ('sqlite3 "%DB%" "SELECT COUNT(*) FROM journey_review WHERE plan_id IN (SELECT id FROM trip_plan WHERE NOT (%PLAN_WHERE%));"') do set "DEL_JR=%%A"
    echo   将删除 journey_review: %DEL_JR% 条

    :: itinerary_task：独立清理
    for /f "delims=" %%A in ('sqlite3 "%DB%" "SELECT COUNT(*) FROM itinerary_task WHERE NOT (%TASK_WHERE%);"') do set "DEL_TASK=%%A"
    echo   将删除 itinerary_task: %DEL_TASK% 条

    :: ai_call_log 与 itinerary_record
    for /f "delims=" %%A in ('sqlite3 "%DB%" "SELECT COUNT(*) FROM ai_call_log WHERE NOT (%ALL_WHERE%);"') do set "DEL_AI=%%A"
    echo   将删除 ai_call_log: %DEL_AI% 条

    for /f "delims=" %%A in ('sqlite3 "%DB%" "SELECT COUNT(*) FROM itinerary_record WHERE NOT (%ALL_WHERE%);"') do set "DEL_REC=%%A"
    echo   将删除 itinerary_record: %DEL_REC% 条
)
echo.

:: ---- 如果是 preview 模式到此结束 ----
if "%MODE%"=="preview" (
    echo [预览模式完成，未执行任何删除]
    goto :eof
)

:: ---- 3. 确认执行 ----
echo 【3/4】确认执行 (Y/N):
set /p "CONFIRM="
if /i not "%CONFIRM%"=="Y" (
    echo  已取消。
    goto :eof
)
echo  开始清理...
echo.

:: ---- 4. 执行删除（注意顺序：子表 → 父表） ----
echo 【4/4】执行删除:
echo [%date% %time%] 开始清理 >> "%LOG%"

if "%MODE%"=="all" (
    call :exec "DELETE FROM checkin_media;"
    call :exec "DELETE FROM checkin_item;"
    call :exec "DELETE FROM checkin_media WHERE 1=1;"  -- 兜底
    call :exec "DELETE FROM journey_review;"
    call :exec "DELETE FROM track_point;"
    call :exec "DELETE FROM plan_task_ref;"
    call :exec "DELETE FROM checkin_task;"
    call :exec "DELETE FROM itinerary_task;"
    call :exec "DELETE FROM ai_call_log;"
    call :exec "DELETE FROM itinerary_record;"
    call :exec "DELETE FROM trip_plan;"
    call :exec "DELETE FROM sqlite_sequence WHERE name IN ('checkin_media','checkin_item','journey_review','track_point','plan_task_ref','itinerary_record','ai_call_log');"
) else (
    if "%KEEP_DAYS%"=="0" (
        set "PLAN_WHERE=date(created_at) >= date('now')"
        set "ALL_WHERE=date(created_at) >= date('now')"
    ) else (
        set "PLAN_WHERE=created_at >= datetime('now','-%KEEP_DAYS% days')"
        set "ALL_WHERE=created_at >= datetime('now','-%KEEP_DAYS% days')"
    )
    if "%KEEP_RUNNING%"=="1" (
        set "TASK_WHERE=(%ALL_WHERE% OR status IN ('PENDING','PROCESSING'))"
    ) else (
        set "TASK_WHERE=%ALL_WHERE%"
    )

    :: 子表
    call :exec "DELETE FROM checkin_media WHERE checkin_item_id IN (SELECT id FROM checkin_item WHERE checkin_task_id IN (SELECT id FROM checkin_task WHERE plan_id IN (SELECT id FROM trip_plan WHERE NOT (%PLAN_WHERE%))));"
    call :exec "DELETE FROM checkin_item WHERE checkin_task_id IN (SELECT id FROM checkin_task WHERE plan_id IN (SELECT id FROM trip_plan WHERE NOT (%PLAN_WHERE%)));"
    call :exec "DELETE FROM checkin_task WHERE plan_id IN (SELECT id FROM trip_plan WHERE NOT (%PLAN_WHERE%));"
    call :exec "DELETE FROM track_point WHERE plan_id IN (SELECT id FROM trip_plan WHERE NOT (%PLAN_WHERE%));"
    call :exec "DELETE FROM journey_review WHERE plan_id IN (SELECT id FROM trip_plan WHERE NOT (%PLAN_WHERE%));"
    call :exec "DELETE FROM plan_task_ref WHERE plan_id IN (SELECT id FROM trip_plan WHERE NOT (%PLAN_WHERE%));"
    call :exec "DELETE FROM trip_plan WHERE NOT (%PLAN_WHERE%);"

    :: 独立表
    call :exec "DELETE FROM itinerary_task WHERE NOT (%TASK_WHERE%);"
    call :exec "DELETE FROM ai_call_log WHERE NOT (%ALL_WHERE%);"
    call :exec "DELETE FROM itinerary_record WHERE NOT (%ALL_WHERE%);"
)

:: ---- 5. VACUUM 回收空间 ----
echo.
echo [5] 执行 VACUUM 回收磁盘空间 ...
sqlite3 "%DB%" "VACUUM;"
echo   VACUUM 完成。

echo.
echo [完成] 清理日志已写入: %LOG%
goto :eof

:: ---- 执行单条 SQL 并输出影响行数 ----
:exec
set "SQL=%~1"
sqlite3 "%DB%" "%SQL%"
echo   执行: %SQL%
echo   [%date% %time%] %SQL% >> "%LOG%"
goto :eof

:: ---- 帮助 ----
:help
echo 用法: %~nx0 [选项]
echo.
echo 选项:
echo   无参数        默认清理，保留今天数据 + 未过期任务
echo   /preview      仅预览将要删除的数量，不执行
echo   /all          清空全部行程表（保留 user 表）
echo   /days N       保留最近 N 天的数据
echo   /keep-runs    额外保留状态为 PENDING/PROCESSING 的运行中任务
echo.
echo 示例:
echo   %~nx0                   保留今日数据
echo   %~nx0 /days 7           保留最近一周
echo   %~nx0 /all              全部清空
goto :eof
