package db.migration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Set;
import java.util.stream.Collectors;
import org.flywaydb.core.api.migration.Context;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

/** 旧库字段对账迁移测试。 */
class LegacyColumnMigrationTest {

  @Test
  @DisplayName("V2 应为旧库补齐全部历史字段且可重复校验")
  void migrate_legacySchema_addsMissingColumns() throws Exception {
    try (Connection connection = DriverManager.getConnection("jdbc:sqlite::memory:")) {
      createLegacyTables(connection);
      Context context = Mockito.mock(Context.class);
      when(context.getConnection()).thenReturn(connection);

      new V2__reconcile_legacy_columns().migrate(context);

      assertThat(columns(connection, "itinerary_record")).contains("user_id");
      assertThat(columns(connection, "trip_plan")).contains("trip_dates", "summary");
      assertThat(columns(connection, "checkin_task"))
          .contains("meals_json", "accommodation_json", "transportation", "tip", "theme");
      assertThat(columns(connection, "checkin_item"))
          .contains("period", "description", "corrected_lat", "corrected_lng",
              "transport_to_next");
    }
  }

  private void createLegacyTables(Connection connection) throws Exception {
    try (Statement statement = connection.createStatement()) {
      statement.execute("CREATE TABLE itinerary_record (id INTEGER PRIMARY KEY)");
      statement.execute("CREATE TABLE ai_call_log (id INTEGER PRIMARY KEY)");
      statement.execute("CREATE TABLE itinerary_task (id VARCHAR(36) PRIMARY KEY)");
      statement.execute("CREATE TABLE trip_plan (id VARCHAR(36) PRIMARY KEY)");
      statement.execute("CREATE TABLE checkin_task (id VARCHAR(36) PRIMARY KEY)");
      statement.execute("CREATE TABLE checkin_item (id INTEGER PRIMARY KEY)");
    }
  }

  private Set<String> columns(Connection connection, String table) throws Exception {
    try (Statement statement = connection.createStatement();
         ResultSet result = statement.executeQuery("PRAGMA table_info(" + table + ")")) {
      var columns = new java.util.ArrayList<String>();
      while (result.next()) {
        columns.add(result.getString("name"));
      }
      return columns.stream().collect(Collectors.toSet());
    }
  }
}
