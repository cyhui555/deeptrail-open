-- 行程列表固定按当前用户、软删除状态和创建时间倒序查询。
-- 部分索引排除已软删除记录，避免历史数据拖慢核心列表。
CREATE INDEX IF NOT EXISTS idx_trip_plan_user_created_active
    ON trip_plan(user_id, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_trip_plan_user_status_created_active
    ON trip_plan(user_id, status, created_at DESC)
    WHERE deleted_at IS NULL;
