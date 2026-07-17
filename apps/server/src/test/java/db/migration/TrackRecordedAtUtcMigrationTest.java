package db.migration;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** 轨迹记录时间 UTC 归一迁移测试。 */
class TrackRecordedAtUtcMigrationTest {

  @Test
  @DisplayName("V5 应把旧 UTC+08:00 墙上时间归一为 UTC 并保留显式时区值")
  void migrate_normalizesLegacyTrackTimesToUtc(@TempDir Path tempDir) throws Exception {
    String url = "jdbc:sqlite:" + tempDir.resolve("track-time.db");
    migrate(url, "4");

    try (Connection connection = DriverManager.getConnection(url);
         Statement statement = connection.createStatement()) {
      statement.executeUpdate("""
          INSERT INTO track_point (plan_id, latitude, longitude, recorded_at)
          VALUES ('legacy', 30.1, 104.1, '2026-07-01 10:00:00.123')
          """);
      statement.executeUpdate("""
          INSERT INTO track_point (plan_id, latitude, longitude, recorded_at)
          VALUES ('offset', 30.2, 104.2, '2026-07-01T10:00:00Z')
          """);
    }

    migrate(url, null);

    try (Connection connection = DriverManager.getConnection(url);
         Statement statement = connection.createStatement();
         ResultSet rows = statement.executeQuery(
             "SELECT plan_id, recorded_at FROM track_point ORDER BY plan_id")) {
      assertThat(rows.next()).isTrue();
      assertThat(rows.getString("plan_id")).isEqualTo("legacy");
      assertThat(rows.getString("recorded_at")).isEqualTo("2026-07-01 02:00:00.123");
      assertThat(rows.next()).isTrue();
      assertThat(rows.getString("plan_id")).isEqualTo("offset");
      assertThat(rows.getString("recorded_at")).isEqualTo("2026-07-01 10:00:00.000");
      assertThat(rows.next()).isFalse();
    }
  }

  private void migrate(String url, String target) {
    var configuration = Flyway.configure()
        .dataSource(url, null, null)
        .locations("classpath:db/migration");
    if (target != null) {
      configuration.target(target);
    }
    configuration.load().migrate();
  }
}
