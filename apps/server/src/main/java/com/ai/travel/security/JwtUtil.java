package com.ai.travel.security;

import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * JWT 工具类，负责 Token 的生成、解析、验证和剩余有效期查询。
 *
 * <p>使用 HMAC-SHA 算法签名，密钥通过 {@code app.jwt.secret} 配置项注入。
 * Token 有效期由 {@code app.jwt.expiration-days} 控制，默认 7 天。
 */
@Component
public class JwtUtil {

  private static final int MIN_SECRET_BYTES = 32;

  @Value("${app.jwt.secret}")
  private String secret;

  @Value("${app.jwt.expiration-days}")
  private int expirationDays;

  @PostConstruct
  void validateConfiguration() {
    if (secret == null || secret.isBlank()) {
      throw new IllegalStateException("JWT secret must be configured");
    }
    if (secret.getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
      throw new IllegalStateException("JWT secret must be at least 32 bytes");
    }
  }

  private SecretKey getKey() {
    return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
  }

  /**
   * 为用户生成 JWT Token。
   *
   * @param userId 用户 ID，写入 Token 的 subject 字段
   * @return 签名的 JWT 字符串
   */
  public String generate(Long userId) {
    Date now = new Date();
    Date exp = new Date(now.getTime() + expirationDays * 86400000L);
    return Jwts.builder()
        .subject(String.valueOf(userId))
        .issuer("travel-planner")
        .issuedAt(now)
        .expiration(exp)
        .signWith(getKey())
        .compact();
  }

  /**
   * 从 Token 中解析用户 ID。
   *
   * @param token JWT 字符串
   * @return 用户 ID
   */
  public Long getUserIdFromToken(String token) {
    return Long.parseLong(
        Jwts.parser().verifyWith(getKey()).build()
            .parseSignedClaims(token).getPayload().getSubject()
    );
  }

  /**
   * 验证 Token 是否合法（签名有效且未过期）。
   *
   * @param token JWT 字符串
   * @return 合法返回 true，否则返回 false
   */
  public boolean validate(String token) {
    try {
      Jwts.parser().verifyWith(getKey()).build().parseSignedClaims(token);
      return true;
    } catch (JwtException | IllegalArgumentException e) {
      return false;
    }
  }

  /**
   * 获取 Token 剩余有效天数。
   *
   * @param token JWT 字符串
   * @return 剩余天数，可能为负数（已过期）
   */
  public long getRemainingDays(String token) {
    Date exp = Jwts.parser().verifyWith(getKey()).build()
        .parseSignedClaims(token).getPayload().getExpiration();
    long remaining = exp.getTime() - System.currentTimeMillis();
    return remaining / 86400000L;
  }

  /**
   * 判断 Token 是否需要续期（剩余有效期不足 3 天）。
   *
   * @param token JWT 字符串
   * @return 需要续期返回 true，否则返回 false
   */
  public boolean needsRefresh(String token) {
    return getRemainingDays(token) < 3;
  }
}
