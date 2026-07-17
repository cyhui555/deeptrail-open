package com.ai.travel;

import com.ai.travel.config.AppAuthProperties;
import com.ai.travel.config.AppCorsProperties;
import com.ai.travel.config.AppGeocodingProperties;
import com.ai.travel.config.AppJourneyProperties;
import com.ai.travel.config.AppReleaseProperties;
import com.ai.travel.config.AppStorageProperties;
import java.nio.file.Files;
import java.nio.file.Path;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

/**
 * 旅行行程规划应用启动入口。
 *
 * <p>启动前创建 SQLite 数据目录，并注册应用配置属性绑定。
 */
@SpringBootApplication
@MapperScan("com.ai.travel.mapper")
@EnableConfigurationProperties({AppStorageProperties.class, AppJourneyProperties.class,
    AppGeocodingProperties.class, AppCorsProperties.class, AppAuthProperties.class,
    AppReleaseProperties.class})
public class TravelPlannerApplication {

  private static final String DEFAULT_DATA_DIRECTORY = "../../data";

  /**
   * 应用启动入口。
   *
   * <p>启动前确保 {@code APP_DATA_DIR} 目录存在，用于 SQLite 与媒体文件存储。
   *
   * @param args 命令行参数
   */
  public static void main(String[] args) {
    try {
      Files.createDirectories(resolveDataDirectory(System.getenv("APP_DATA_DIR")));
    } catch (Exception e) {
      throw new RuntimeException("Unable to create data directory for SQLite", e);
    }
    SpringApplication.run(TravelPlannerApplication.class, args);
  }

  /**
   * 解析数据目录，并与 {@code application.yml} 中的默认值保持一致。
   *
   * <p>SQLite JDBC 不会自动创建父目录，因此必须在 Flyway 获取首个连接前完成创建。
   */
  static Path resolveDataDirectory(String configuredDirectory) {
    String directory = configuredDirectory == null || configuredDirectory.isBlank()
        ? DEFAULT_DATA_DIRECTORY : configuredDirectory.trim();
    return Path.of(directory).toAbsolutePath().normalize();
  }
}
