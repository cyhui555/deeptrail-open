package db.migration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.HashSet;
import java.util.Set;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** 离线幂等字段与唯一约束迁移测试。 */
class OfflineIdempotencyMigrationTest {

  @Test
  @DisplayName("V4 应持久化幂等键并按任务或行程隔离唯一性")
  void migrate_addsPersistentScopedIdempotencyKeys(@TempDir Path tempDir) throws Exception {
    Path database = tempDir.resolve("idempotency.db");
    String url = "jdbc:sqlite:" + database;
    Flyway.configure()
        .dataSource(url, null, null)
        .locations("classpath:db/migration")
        .load()
        .migrate();

    try (Connection connection = DriverManager.getConnection(url)) {
      assertThat(columns(connection, "checkin_item"))
          .contains("checkin_idempotency_key");
      assertThat(columns(connection, "track_point"))
          .contains("client_point_id");

      try (Statement statement = connection.createStatement()) {
        statement.executeUpdate("""
            INSERT INTO checkin_item (
                checkin_task_id, poi_name, checkin_idempotency_key
            ) VALUES ('task-1', '点位 A', 'same-key')
            """);
        assertThatThrownBy(() -> statement.executeUpdate("""
            INSERT INTO checkin_item (
                checkin_task_id, poi_name, checkin_idempotency_key
            ) VALUES ('task-1', '点位 B', 'same-key')
            """))
            .hasMessageContaining("UNIQUE");
        assertThat(statement.executeUpdate("""
            INSERT INTO checkin_item (
                checkin_task_id, poi_name, checkin_idempotency_key
            ) VALUES ('task-2', '点位 C', 'same-key')
            """))
            .isEqualTo(1);

        statement.executeUpdate("""
            INSERT INTO track_point (
                plan_id, client_point_id, latitude, longitude, recorded_at
            ) VALUES ('plan-1', 'point-1', 30.1, 104.1, CURRENT_TIMESTAMP)
            """);
        assertThatThrownBy(() -> statement.executeUpdate("""
            INSERT INTO track_point (
                plan_id, client_point_id, latitude, longitude, recorded_at
            ) VALUES ('plan-1', 'point-1', 30.2, 104.2, CURRENT_TIMESTAMP)
            """))
            .hasMessageContaining("UNIQUE");
        assertThat(statement.executeUpdate("""
            INSERT INTO track_point (
                plan_id, client_point_id, latitude, longitude, recorded_at
            ) VALUES ('plan-2', 'point-1', 30.3, 104.3, CURRENT_TIMESTAMP)
            """))
            .isEqualTo(1);

        // NULL 不参与 SQLite 唯一冲突，确保未升级客户端保持逐点写入语义。
        assertThat(statement.executeUpdate("""
            INSERT INTO track_point (
                plan_id, latitude, longitude, recorded_at
            ) VALUES ('plan-1', 30.4, 104.4, CURRENT_TIMESTAMP)
            """))
            .isEqualTo(1);
        assertThat(statement.executeUpdate("""
            INSERT INTO track_point (
                plan_id, latitude, longitude, recorded_at
            ) VALUES ('plan-1', 30.4, 104.4, CURRENT_TIMESTAMP)
            """))
            .isEqualTo(1);
      }
    }
  }

  private Set<String> columns(Connection connection, String table) throws Exception {
    Set<String> result = new HashSet<>();
    try (Statement statement = connection.createStatement();
         ResultSet rows = statement.executeQuery("PRAGMA table_info(" + table + ")")) {
      while (rows.next()) {
        result.add(rows.getString("name"));
      }
    }
    return result;
  }
}
