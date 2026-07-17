package com.ai.travel;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 应用启动目录解析测试。 */
class TravelPlannerApplicationTest {

  @Test
  @DisplayName("配置 APP_DATA_DIR 时应使用规范化后的绝对路径")
  void resolveDataDirectory_configuredPath_usesConfiguredDirectory() {
    Path resolved = TravelPlannerApplication.resolveDataDirectory(" ./custom-data ");

    assertThat(resolved).isAbsolute();
    assertThat(resolved.getFileName().toString()).isEqualTo("custom-data");
  }

  @Test
  @DisplayName("APP_DATA_DIR 为空时应使用应用默认数据目录")
  void resolveDataDirectory_blankPath_usesDefaultDirectory() {
    Path resolved = TravelPlannerApplication.resolveDataDirectory(" ");

    assertThat(resolved).isAbsolute();
    assertThat(resolved.getFileName().toString()).isEqualTo("data");
  }
}
