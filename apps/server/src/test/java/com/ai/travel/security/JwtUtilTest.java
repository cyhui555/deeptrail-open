package com.ai.travel.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class JwtUtilTest {

  private final JwtUtil jwtUtil = new JwtUtil();

  @BeforeEach
  void setUp() {
    ReflectionTestUtils.setField(jwtUtil, "secret", "test-secret-key-for-unit-test-minimum-256-bits-long!");
    ReflectionTestUtils.setField(jwtUtil, "expirationDays", 7);
  }

  @Test
  void generateAndValidateShouldSucceed() {
    String token = jwtUtil.generate(1L);
    assertThat(jwtUtil.validate(token)).isTrue();
    assertThat(jwtUtil.getUserIdFromToken(token)).isEqualTo(1L);
  }

  @Test
  void validateShouldFailForInvalidToken() {
    assertThat(jwtUtil.validate("invalid-token")).isFalse();
    assertThat(jwtUtil.validate("")).isFalse();
    assertThat(jwtUtil.validate(null)).isFalse();
  }

  @Test
  void validateShouldFailForTamperedToken() {
    String token = jwtUtil.generate(1L);
    String tampered = token.substring(0, token.length() - 2) + "xx";
    assertThat(jwtUtil.validate(tampered)).isFalse();
  }

  @Test
  void generateShouldProduceDifferentTokensForDifferentUsers() {
    String token1 = jwtUtil.generate(1L);
    String token2 = jwtUtil.generate(2L);
    assertThat(token1).isNotEqualTo(token2);
    assertThat(jwtUtil.getUserIdFromToken(token1)).isEqualTo(1L);
    assertThat(jwtUtil.getUserIdFromToken(token2)).isEqualTo(2L);
  }

  @Test
  void getRemainingDaysShouldReturnNonNegative() {
    String token = jwtUtil.generate(1L);
    long remaining = jwtUtil.getRemainingDays(token);
    assertThat(remaining).isGreaterThanOrEqualTo(0);
    assertThat(remaining).isLessThanOrEqualTo(7);
  }

  @Test
  void validateConfigurationAcceptsStrongSecret() {
    assertThatCode(jwtUtil::validateConfiguration).doesNotThrowAnyException();
  }

  @Test
  void validateConfigurationRejectsBlankSecret() {
    ReflectionTestUtils.setField(jwtUtil, "secret", " ");

    assertThatThrownBy(jwtUtil::validateConfiguration)
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("JWT secret must be configured");
  }

  @Test
  void validateConfigurationRejectsShortSecret() {
    ReflectionTestUtils.setField(jwtUtil, "secret", "too-short");

    assertThatThrownBy(jwtUtil::validateConfiguration)
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("JWT secret must be at least 32 bytes");
  }

  @Test
  void validationErrorDoesNotExposeSecret() {
    String sensitiveValue = "short-sensitive-value";
    ReflectionTestUtils.setField(jwtUtil, "secret", sensitiveValue);

    assertThatThrownBy(jwtUtil::validateConfiguration)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageNotContaining(sensitiveValue);
  }
}
