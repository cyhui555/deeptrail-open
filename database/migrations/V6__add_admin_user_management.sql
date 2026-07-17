-- 为后台运营补充最小角色与账号状态，并以 BCrypt 哈希初始化唯一管理员。
ALTER TABLE user ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'USER';
ALTER TABLE user ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE user ADD COLUMN created_by_user_id INTEGER NULL;

INSERT INTO user (username, password, role, enabled, created_at)
SELECT
    'admin',
    '$2b$12$vHakm8YHevcijOJK1Nx8NOH9M3mMimmgxuUmWIjT24kgdqpBRjzR2',
    'ADMIN',
    TRUE,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM user WHERE username = 'admin');

-- 已存在同名账号时也收敛为本次明确指定的管理员身份与初始凭据。
UPDATE user
SET password = '$2b$12$vHakm8YHevcijOJK1Nx8NOH9M3mMimmgxuUmWIjT24kgdqpBRjzR2',
    role = 'ADMIN',
    enabled = TRUE,
    created_by_user_id = id
WHERE username = 'admin';

CREATE INDEX IF NOT EXISTS idx_user_role_enabled ON user(role, enabled);
CREATE INDEX IF NOT EXISTS idx_user_created_by ON user(created_by_user_id);
