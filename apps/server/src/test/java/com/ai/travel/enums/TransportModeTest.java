package com.ai.travel.enums;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** {@link TransportMode} 枚举单元测试。 */
class TransportModeTest {

  @Test
  @DisplayName("of 大小写不敏感 — 小写/大写/混合均匹配")
  void of_caseInsensitive() {
    assertThat(TransportMode.of("walk")).isEqualTo(TransportMode.WALK);
    assertThat(TransportMode.of("WALK")).isEqualTo(TransportMode.WALK);
    assertThat(TransportMode.of("Walk")).isEqualTo(TransportMode.WALK);
    assertThat(TransportMode.of("drive")).isEqualTo(TransportMode.DRIVE);
    assertThat(TransportMode.of("SUBWAY")).isEqualTo(TransportMode.SUBWAY);
  }

  @Test
  @DisplayName("of 未知值返回 null")
  void of_unknown_returnsNull() {
    assertThat(TransportMode.of("FLYING_CAR")).isNull();
    assertThat(TransportMode.of("")).isNull();
    assertThat(TransportMode.of(null)).isNull();
  }

  @Test
  @DisplayName("getCode 返回大写枚举名")
  void getCode_returnsName() {
    assertThat(TransportMode.WALK.getCode()).isEqualTo("WALK");
    assertThat(TransportMode.FLIGHT.getCode()).isEqualTo("FLIGHT");
  }
}
