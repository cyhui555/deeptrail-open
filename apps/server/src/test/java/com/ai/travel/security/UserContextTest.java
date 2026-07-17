package com.ai.travel.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** UserContext 线程局部存储单元测试。 */
class UserContextTest {

  @BeforeEach
  void setUp() {
    UserContext.clear();
  }

  @AfterEach
  void tearDown() {
    UserContext.clear();
  }

  @Test
  @DisplayName("未设置用户 ID 时应返回 null")
  void getUserId_notSet_returnsNull() {
    assertThat(UserContext.getUserId()).isNull();
  }

  @Test
  @DisplayName("设置用户 ID 后应能获取")
  void getUserId_afterSet_returnsValue() {
    UserContext.setUserId(42L);
    assertThat(UserContext.getUserId()).isEqualTo(42L);
  }

  @Test
  @DisplayName("清除后应返回 null")
  void getUserId_afterClear_returnsNull() {
    UserContext.setUserId(42L);
    UserContext.clear();
    assertThat(UserContext.getUserId()).isNull();
  }

  @Test
  @DisplayName("设置 null 用户 ID 后应返回 null")
  void getUserId_setNull_returnsNull() {
    UserContext.setUserId(42L);
    UserContext.setUserId(null);
    assertThat(UserContext.getUserId()).isNull();
  }
}
