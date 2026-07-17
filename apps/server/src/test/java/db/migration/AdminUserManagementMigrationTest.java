package db.migration;

import static org.assertj.core.api.Assertions.assertThat;

import cn.hutool.crypto.digest.BCrypt;
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

/** 管理员角色、状态与初始账号迁移测试。 */
class AdminUserManagementMigrationTest {

  @Test
  @DisplayName("V6 应新增用户管理字段并只保存唯一管理员的 BCrypt 哈希")
  void migrate_addsAdminRoleAndUniqueBootstrapAccount(@TempDir Path tempDir) throws Exception {
    String url = "jdbc:sqlite:" + tempDir.resolve("admin-users.db");
    Flyway flyway = Flyway.configure()
        .dataSource(url, null, null)
        .locations("classpath:db/migration")
        .load();

    flyway.migrate();
    flyway.migrate();

    try (Connection connection = DriverManager.getConnection(url)) {
      assertThat(columns(connection, "user"))
          .contains("role", "enabled", "created_by_user_id");
      try (Statement statement = connection.createStatement();
           ResultSet row = statement.executeQuery("""
               SELECT id, password, role, enabled, created_by_user_id
               FROM user WHERE username = 'admin'
               """)) {
        assertThat(row.next()).isTrue();
        long id = row.getLong("id");
        String passwordHash = row.getString("password");
        assertThat(passwordHash).isNotEqualTo("123123").startsWith("$2");
        assertThat(BCrypt.checkpw("123123", passwordHash)).isTrue();
        assertThat(row.getString("role")).isEqualTo("ADMIN");
        assertThat(row.getBoolean("enabled")).isTrue();
        assertThat(row.getLong("created_by_user_id")).isEqualTo(id);
        assertThat(row.next()).isFalse();
      }
      try (Statement statement = connection.createStatement();
           ResultSet count = statement.executeQuery(
               "SELECT COUNT(*) FROM user WHERE username = 'admin'")) {
        assertThat(count.next()).isTrue();
        assertThat(count.getInt(1)).isEqualTo(1);
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
