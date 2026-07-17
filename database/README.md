# 数据库资产

- `migrations/V1__initial_schema.sql`：SQLite 基础结构。
- 后续 `V*__*.sql` 或 Flyway Java migration：只追加新的版本化变更。

Maven 构建会将 SQL 迁移打包到 `db/migration/`，Spring Boot 启动时由 Flyway 按版本执行。
禁止恢复 `schema.sql`、`spring.sql.init` 或启动时手写迁移器，避免出现多个结构事实源。

旧数据库首次接入时会建立版本 0 基线，再执行 V1 的幂等建表和 V2 的字段对账；任何迁移失败都会阻止应用启动。
