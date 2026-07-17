package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;

import cn.hutool.crypto.digest.BCrypt;
import com.ai.travel.dto.request.LoginRequest;
import com.ai.travel.dto.request.RegisterRequest;
import com.ai.travel.dto.response.AuthResponse;
import com.ai.travel.entity.User;
import com.ai.travel.enums.UserRole;
import com.ai.travel.exception.UnauthorizedException;
import com.ai.travel.mapper.UserMapper;
import com.ai.travel.security.JwtUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

  private final JwtUtil jwtUtil = new JwtUtil();
  @Mock
  private UserMapper userMapper;

  private UserService userService;

  @BeforeEach
  void setUp() {
    ReflectionTestUtils.setField(jwtUtil, "secret", "test-secret-key-for-unit-test-minimum-256-bits-long!");
    ReflectionTestUtils.setField(jwtUtil, "expirationDays", 7);
    userService = new UserService(userMapper, jwtUtil);
  }

  @Test
  void testRegistrationShouldCreateUserAndReturnToken() {
    when(userMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);
    doAnswer(inv -> {
      User u = inv.getArgument(0);
      u.setId(1L);
      return 1;
    }).when(userMapper).insert(any(User.class));

    RegisterRequest req = new RegisterRequest();
    req.setUsername("newuser");
    req.setPassword("password123");

    AuthResponse resp = userService.registerForTesting(req);

    assertThat(resp.getUsername()).isEqualTo("newuser");
    assertThat(resp.getToken()).isNotNull();
    assertThat(resp.getUserId()).isEqualTo(1L);
    assertThat(resp.getRole()).isEqualTo(UserRole.USER);
  }

  @Test
  void testRegistrationShouldRejectDuplicateUsername() {
    User existing = new User();
    existing.setUsername("existing");
    when(userMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(existing);

    RegisterRequest req = new RegisterRequest();
    req.setUsername("existing");
    req.setPassword("password123");

    assertThatThrownBy(() -> userService.registerForTesting(req))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("用户名已存在");
  }

  @Test
  void loginShouldReturnTokenForValidCredentials() {
    User user = new User();
    user.setId(1L);
    user.setUsername("testuser");
    user.setPassword(BCrypt.hashpw("correct"));
    user.setRole(UserRole.ADMIN);
    user.setEnabled(true);
    when(userMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(user);

    LoginRequest req = new LoginRequest();
    req.setUsername("testuser");
    req.setPassword("correct");

    AuthResponse resp = userService.login(req);

    assertThat(resp.getUsername()).isEqualTo("testuser");
    assertThat(resp.getToken()).isNotNull();
    assertThat(resp.getRole()).isEqualTo(UserRole.ADMIN);
  }

  @Test
  void loginShouldRejectDisabledUser() {
    User user = new User();
    user.setId(1L);
    user.setUsername("disabled-user");
    user.setPassword(BCrypt.hashpw("correct"));
    user.setRole(UserRole.USER);
    user.setEnabled(false);
    when(userMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(user);

    LoginRequest req = new LoginRequest();
    req.setUsername("disabled-user");
    req.setPassword("correct");

    assertThatThrownBy(() -> userService.login(req))
        .isInstanceOf(UnauthorizedException.class)
        .hasMessageContaining("账号已停用");
  }

  @Test
  void loginShouldRejectWrongPassword() {
    User user = new User();
    user.setId(1L);
    user.setUsername("testuser");
    user.setPassword(BCrypt.hashpw("correct"));
    when(userMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(user);

    LoginRequest req = new LoginRequest();
    req.setUsername("testuser");
    req.setPassword("wrong");

    assertThatThrownBy(() -> userService.login(req))
        .isInstanceOf(UnauthorizedException.class)
        .hasMessageContaining("用户名或密码错误");
  }

  @Test
  void loginShouldRejectNonexistentUser() {
    when(userMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);

    LoginRequest req = new LoginRequest();
    req.setUsername("ghost");
    req.setPassword("whatever");

    assertThatThrownBy(() -> userService.login(req))
        .isInstanceOf(UnauthorizedException.class);
  }

  @Test
  void getUserInfoShouldReturnUserDetails() {
    User user = new User();
    user.setId(1L);
    user.setUsername("testuser");
    user.setWechatOpenId("wx123");
    user.setRole(UserRole.USER);
    user.setEnabled(true);
    when(userMapper.selectById(1L)).thenReturn(user);

    var info = userService.getUserInfo(1L);

    assertThat(info.getUsername()).isEqualTo("testuser");
    assertThat(info.isWechatBound()).isTrue();
    assertThat(info.getRole()).isEqualTo(UserRole.USER);
    assertThat(info.isEnabled()).isTrue();
  }

  @Test
  void getUserInfoShouldThrowWhenUserNotFound() {
    when(userMapper.selectById(99L)).thenReturn(null);

    assertThatThrownBy(() -> userService.getUserInfo(99L))
        .isInstanceOf(UnauthorizedException.class)
        .hasMessageContaining("登录已过期");
  }

  @Test
  void loginShouldLockAfterMaxAttempts() {
    // 模拟用户不存在，每次失败都累加 LoginAttempt
    when(userMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);

    LoginRequest req = new LoginRequest();
    req.setUsername("locked-user");
    req.setPassword("wrong");

    // 前 5 次失败抛出"用户名或密码错误"
    for (int i = 0; i < 5; i++) {
      assertThatThrownBy(() -> userService.login(req))
          .isInstanceOf(UnauthorizedException.class)
          .hasMessageContaining("用户名或密码错误");
    }

    // 第 6 次：账号已锁定
    assertThatThrownBy(() -> userService.login(req))
        .isInstanceOf(UnauthorizedException.class)
        .hasMessageContaining("登录过于频繁");
  }

  @Test
  void loginShouldClearAttemptsOnSuccess() {
    User user = new User();
    user.setId(1L);
    user.setUsername("testuser");
    user.setPassword(BCrypt.hashpw("correct"));
    when(userMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(user);

    // 先失败 3 次
    LoginRequest wrongReq = new LoginRequest();
    wrongReq.setUsername("testuser");
    wrongReq.setPassword("wrong");
    for (int i = 0; i < 3; i++) {
      assertThatThrownBy(() -> userService.login(wrongReq))
          .isInstanceOf(UnauthorizedException.class);
    }

    // 成功登录 → 清除 attempts
    LoginRequest correctReq = new LoginRequest();
    correctReq.setUsername("testuser");
    correctReq.setPassword("correct");
    AuthResponse resp = userService.login(correctReq);
    assertThat(resp.getToken()).isNotNull();

    // 再次失败不会立即锁定（attempts 已清除）
    assertThatThrownBy(() -> userService.login(wrongReq))
        .isInstanceOf(UnauthorizedException.class)
        .hasMessageContaining("用户名或密码错误");
  }

  @Test
  void jwtNeedsRefresh_returnsTrueWhenExpiringSoon() {
    // 生成一个有效期 1 天的 token（< 3 天阈值）
    ReflectionTestUtils.setField(jwtUtil, "expirationDays", 1);
    String token = jwtUtil.generate(1L);
    assertThat(jwtUtil.needsRefresh(token)).isTrue();
  }

  @Test
  void jwtNeedsRefresh_returnsFalseWhenFresh() {
    // 生成一个有效期 30 天的 token（>= 3 天阈值）
    ReflectionTestUtils.setField(jwtUtil, "expirationDays", 30);
    String token = jwtUtil.generate(1L);
    assertThat(jwtUtil.needsRefresh(token)).isFalse();
  }
}
