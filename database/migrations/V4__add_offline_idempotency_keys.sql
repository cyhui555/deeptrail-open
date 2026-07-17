-- 离线执行请求需要在应用进程重启后继续去重，因此幂等状态必须进入 SQLite。
-- 两个字段保持可空：未升级的旧客户端不传键时继续沿用原有行为。

ALTER TABLE checkin_item
    ADD COLUMN checkin_idempotency_key VARCHAR(128);

-- 打卡键在单日任务内唯一；不同任务、行程或用户可以安全复用相同键。
CREATE UNIQUE INDEX idx_checkin_item_task_idempotency
    ON checkin_item(checkin_task_id, checkin_idempotency_key);

ALTER TABLE track_point
    ADD COLUMN client_point_id VARCHAR(128);

-- SQLite 的 UNIQUE 允许多个 NULL，旧客户端轨迹点不会被意外合并。
CREATE UNIQUE INDEX idx_track_point_plan_client_point
    ON track_point(plan_id, client_point_id);
