-- V5 之前 recorded_at 是无时区墙上时间，旧协议约定按 UTC+08:00 解释。
-- 带 Z/offset 的值可能来自修复期间的数据，SQLite 会先按其显式时区归一，避免重复减 8 小时。
UPDATE track_point
SET recorded_at = CASE
    WHEN instr(upper(substr(recorded_at, 20)), 'Z') > 0
      OR instr(substr(recorded_at, 20), '+') > 0
      OR instr(substr(recorded_at, 20), '-') > 0
      THEN strftime('%Y-%m-%d %H:%M:%f', recorded_at)
    ELSE strftime('%Y-%m-%d %H:%M:%f', recorded_at, '-8 hours')
  END
WHERE recorded_at IS NOT NULL;
