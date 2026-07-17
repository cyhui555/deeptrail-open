package com.ai.travel.security;

/**
 * 当前请求用户 ID 的线程局部存储。
 *
 * <p>由 {@link AuthInterceptor} 在请求开始时写入，请求结束时清除。
 * 业务层通过 {@link #getUserId()} 获取当前用户 ID，无需从 Controller 层层传递。
 */
public class UserContext {

  private static final ThreadLocal<Long> USER_ID_HOLDER = new ThreadLocal<>();

  /**
   * 设置当前用户 ID。
   *
   * @param userId 用户 ID
   */
  public static void setUserId(Long userId) {
    USER_ID_HOLDER.set(userId);
  }

  /**
   * 获取当前用户 ID。
   *
   * @return 用户 ID，未设置时返回 null
   */
  public static Long getUserId() {
    return USER_ID_HOLDER.get();
  }

  /** 清除当前线程的用户 ID，防止线程复用导致数据泄漏。 */
  public static void clear() {
    USER_ID_HOLDER.remove();
  }
}
