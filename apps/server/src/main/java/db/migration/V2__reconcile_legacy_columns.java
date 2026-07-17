package db.migration;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/**
 * 将历史版本通过启动时迁移器追加的字段统一纳入 Flyway。
 *
 * <p>SQLite 不支持 {@code ADD COLUMN IF NOT EXISTS}，因此迁移前使用 PRAGMA 检查字段。
 * 该迁移既能处理无历史表的全新数据库，也能接管没有 Flyway 历史表的旧数据库。
 */
public class V2__reconcile_legacy_columns extends BaseJavaMigration {

  private static final List<Column> COLUMNS = List.of(
      new Column("itinerary_record", "user_id", "INTEGER"),
      new Column("ai_call_log", "user_id", "INTEGER"),
      new Column("itinerary_task", "user_id", "INTEGER"),
      new Column("trip_plan", "trip_dates", "TEXT"),
      new Column("trip_plan", "summary", "TEXT"),
      new Column("checkin_task", "meals_json", "TEXT"),
      new Column("checkin_task", "accommodation_json", "TEXT"),
      new Column("checkin_task", "transportation", "VARCHAR(500)"),
      new Column("checkin_task", "tip", "TEXT"),
      new Column("checkin_task", "theme", "VARCHAR(200)"),
      new Column("checkin_item", "period", "VARCHAR(20)"),
      new Column("checkin_item", "description", "TEXT"),
      new Column("checkin_item", "estimated_visit_time", "VARCHAR(50)"),
      new Column("checkin_item", "opening_hours", "VARCHAR(100)"),
      new Column("checkin_item", "admission_fee", "VARCHAR(100)"),
      new Column("checkin_item", "estimated_cost", "VARCHAR(100)"),
      new Column("checkin_item", "rating", "VARCHAR(10)"),
      new Column("checkin_item", "category", "VARCHAR(50)"),
      new Column("checkin_item", "phone", "VARCHAR(30)"),
      new Column("checkin_item", "is_custom", "BOOLEAN DEFAULT FALSE"),
      new Column("checkin_item", "corrected_lat", "DOUBLE"),
      new Column("checkin_item", "corrected_lng", "DOUBLE"),
      new Column("checkin_item", "transport_to_next", "VARCHAR(500)"));

  @Override
  public void migrate(Context context) throws Exception {
    Connection connection = context.getConnection();
    for (Column column : COLUMNS) {
      requireTable(connection, column.table());
      if (!columnExists(connection, column.table(), column.name())) {
        try (Statement statement = connection.createStatement()) {
          statement.executeUpdate("ALTER TABLE " + column.table()
              + " ADD COLUMN " + column.name() + " " + column.definition());
        }
      }
    }
  }

  private void requireTable(Connection connection, String table) throws SQLException {
    try (var statement = connection.prepareStatement(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")) {
      statement.setString(1, table);
      try (ResultSet result = statement.executeQuery()) {
        if (!result.next()) {
          throw new SQLException("Required table is missing before migration: " + table);
        }
      }
    }
  }

  private boolean columnExists(Connection connection, String table, String column)
      throws SQLException {
    try (Statement statement = connection.createStatement();
         ResultSet result = statement.executeQuery("PRAGMA table_info(" + table + ")")) {
      while (result.next()) {
        if (column.equalsIgnoreCase(result.getString("name"))) {
          return true;
        }
      }
    }
    return false;
  }

  private record Column(String table, String name, String definition) {
  }
}
