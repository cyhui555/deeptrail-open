package com.ai.travel.service;

import cn.hutool.crypto.digest.BCrypt;
import com.ai.travel.dto.request.LoginRequest;
import com.ai.travel.dto.request.RegisterRequest;
import com.ai.travel.dto.response.AuthResponse;
import com.ai.travel.dto.response.UserInfoResponse;
import com.ai.travel.entity.User;
import com.ai.travel.enums.UserRole;
import com.ai.travel.exception.UnauthorizedException;
import com.ai.travel.exception.UsernameExistsException;
import com.ai.travel.mapper.UserMapper;
import com.ai.travel.security.JwtUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 用户业务服务，处理登录、测试账号夹具、用户信息查询及登录防爆破限流。
 *
 * <p>登录失败连续 5 次后锁定 15 分钟，重置密码错误计数器需登录成功。
 */
@Service
@RequiredArgsConstructor
public class UserService {

  private final UserMapper userMapper;
  private final JwtUtil jwtUtil;

  /** 登录失败尝试记录，key 为用户名。 */
  private final ConcurrentHashMap<String, LoginAttempt> loginAttempts = new ConcurrentHashMap<>();

  /**
   * 仅供 test Profile 的注册夹具创建隔离账号。
   *
   * @param req 注册请求，用户名至少 3 字符，密码至少 6 字符
   * @return 认证响应，包含 JWT Token
   * @throws UsernameExistsException 当用户名已被注册时抛出
   */
  public AuthResponse registerForTesting(RegisterRequest req) {
    User exist = userMapper.selectOne(
        Wrappers.<User>lambdaQuery().eq(User::getUsername, req.getUsername()));
    if (exist != null) {
      throw new UsernameExistsException(req.getUsername());
    }
    User user = new User();
    user.setUsername(req.getUsername());
    user.setPassword(BCrypt.hashpw(req.getPassword()));
    user.setRole(UserRole.USER);
    user.setEnabled(true);
    userMapper.insert(user);
    String token = jwtUtil.generate(user.getId());
    return new AuthResponse(token, user.getId(), user.getUsername(), user.getRole());
  }

  /**
   * 用户登录。
   *
   * @param req 登录请求，包含用户名和密码
   * @return 认证响应，包含 JWT Token
   * @throws UnauthorizedException 当用户名/密码错误或账号被锁定时抛出
   */
  public AuthResponse login(LoginRequest req) {
    String username = req.getUsername();

    LoginAttempt attempt = loginAttempts.get(username);
    if (attempt != null && attempt.isLocked()) {
      long remainSec = attempt.remainingSeconds();
      throw new UnauthorizedException("登录过于频繁，请 " + remainSec + " 秒后重试");
    }

    User user = userMapper.selectOne(
        Wrappers.<User>lambdaQuery().eq(User::getUsername, username));
    if (user == null || !BCrypt.checkpw(req.getPassword(), user.getPassword())) {
      loginAttempts.compute(username, (k, v) ->
          v == null ? new LoginAttempt() : v.increment());
      throw new UnauthorizedException("用户名或密码错误");
    }
    if (Boolean.FALSE.equals(user.getEnabled())) {
      throw new UnauthorizedException("账号已停用，请联系管理员");
    }

    loginAttempts.remove(username);
    String token = jwtUtil.generate(user.getId());
    return new AuthResponse(token, user.getId(), user.getUsername(), user.getRole());
  }

  /**
   * 根据 ID 查询用户。
   *
   * @param userId 用户 ID
   * @return 用户实体，不存在返回 null
   */
  public User getById(Long userId) {
    return userMapper.selectById(userId);
  }

  /**
   * 获取用户详细信息。
   *
   * @param userId 用户 ID
   * @return 用户信息响应
   * @throws UnauthorizedException 当 Token 引用的用户不存在时抛出，等同于 Token 无效
   */
  public UserInfoResponse getUserInfo(Long userId) {
    User user = userMapper.selectById(userId);
    if (user == null) {
      throw new UnauthorizedException("登录已过期，请重新登录");
    }
    UserInfoResponse resp = new UserInfoResponse();
    resp.setUserId(user.getId());
    resp.setUsername(user.getUsername());
    resp.setRole(user.getRole());
    resp.setEnabled(!Boolean.FALSE.equals(user.getEnabled()));
    resp.setPhone(user.getPhone());
    resp.setWechatBound(user.getWechatOpenId() != null);
    resp.setCreatedAt(user.getCreatedAt());
    return resp;
  }

  /**
   * 单次登录失败尝试记录。
   */
  private static class LoginAttempt {
    int count = 1;
    long firstFailAt = System.currentTimeMillis();
    static final int MAX_ATTEMPTS = 5;
    static final long LOCK_MINUTES = 15;

    LoginAttempt increment() {
      count++;
      firstFailAt = System.currentTimeMillis();
      return this;
    }

    boolean isLocked() {
      if (count < MAX_ATTEMPTS) {
        return false;
      }
      long elapsed = System.currentTimeMillis() - firstFailAt;
      return elapsed < Duration.ofMinutes(LOCK_MINUTES).toMillis();
    }

    long remainingSeconds() {
      long elapsed = System.currentTimeMillis() - firstFailAt;
      return Math.max(0, Duration.ofMinutes(LOCK_MINUTES).toSeconds() - elapsed / 1000);
    }
  }
}
