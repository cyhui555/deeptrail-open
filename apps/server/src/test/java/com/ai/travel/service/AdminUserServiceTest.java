package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import cn.hutool.crypto.digest.BCrypt;
import com.ai.travel.dto.request.AdminCreateUserRequest;
import com.ai.travel.dto.request.AdminResetPasswordRequest;
import com.ai.travel.dto.request.AdminUpdateUserStatusRequest;
import com.ai.travel.entity.User;
import com.ai.travel.enums.UserRole;
import com.ai.travel.exception.ForbiddenException;
import com.ai.travel.mapper.UserMapper;
import com.ai.travel.security.UserContext;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class AdminUserServiceTest {

  @Mock private UserMapper userMapper;

  private AdminUserService adminUserService;
  private User admin;

  @BeforeEach
  void setUp() {
    adminUserService = new AdminUserService(userMapper);
    admin = user(1L, "admin", UserRole.ADMIN, true);
    UserContext.setUserId(1L);
  }

  @AfterEach
  void tearDown() {
    UserContext.clear();
  }

  @Test
  void listUsersShouldReturnSafePagedResponses() {
    User traveler = user(2L, "traveler", UserRole.USER, true);
    traveler.setCreatedByUserId(1L);
    when(userMapper.selectById(1L)).thenReturn(admin);
    when(userMapper.countAdminUsers("travel")).thenReturn(1L);
    when(userMapper.selectAdminPage("travel", 20, 0)).thenReturn(List.of(traveler));

    var result = adminUserService.listUsers(" travel ", 1, 20);

    assertThat(result.getTotal()).isEqualTo(1);
    assertThat(result.getRecords()).singleElement().satisfies(response -> {
      assertThat(response.getUsername()).isEqualTo("traveler");
      assertThat(response.getRole()).isEqualTo(UserRole.USER);
      assertThat(response.isEnabled()).isTrue();
    });
  }

  @Test
  void createUserShouldAssignOrdinaryRoleAndHashPassword() {
    when(userMapper.selectById(1L)).thenReturn(admin);
    when(userMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);
    doAnswer(invocation -> {
      User created = invocation.getArgument(0);
      created.setId(2L);
      created.setCreatedAt(LocalDateTime.now());
      return 1;
    }).when(userMapper).insert(any(User.class));
    AdminCreateUserRequest request = new AdminCreateUserRequest();
    request.setUsername(" new-user ");
    request.setPassword("secret123");

    var response = adminUserService.createUser(request);

    assertThat(response.getUsername()).isEqualTo("new-user");
    assertThat(response.getRole()).isEqualTo(UserRole.USER);
    assertThat(response.getCreatedByUserId()).isEqualTo(1L);
    verify(userMapper).insert(any(User.class));
  }

  @Test
  void updateStatusShouldDisableOrdinaryUser() {
    User target = user(2L, "traveler", UserRole.USER, true);
    when(userMapper.selectById(1L)).thenReturn(admin);
    when(userMapper.selectById(2L)).thenReturn(target);
    AdminUpdateUserStatusRequest request = new AdminUpdateUserStatusRequest();
    request.setEnabled(false);

    var response = adminUserService.updateStatus(2L, request);

    assertThat(response.isEnabled()).isFalse();
    assertThat(target.getEnabled()).isFalse();
    verify(userMapper).updateById(target);
  }

  @Test
  void resetPasswordShouldStoreNewHash() {
    User target = user(2L, "traveler", UserRole.USER, true);
    target.setPassword(BCrypt.hashpw("old-password"));
    when(userMapper.selectById(1L)).thenReturn(admin);
    when(userMapper.selectById(2L)).thenReturn(target);
    AdminResetPasswordRequest request = new AdminResetPasswordRequest();
    request.setPassword("new-password");

    adminUserService.resetPassword(2L, request);

    assertThat(BCrypt.checkpw("new-password", target.getPassword())).isTrue();
    verify(userMapper).updateById(eq(target));
  }

  @Test
  void ordinaryUserShouldNotAccessAdminFunctions() {
    UserContext.setUserId(2L);
    when(userMapper.selectById(2L)).thenReturn(user(2L, "traveler", UserRole.USER, true));

    assertThatThrownBy(() -> adminUserService.listUsers(null, 1, 20))
        .isInstanceOf(ForbiddenException.class)
        .hasMessageContaining("仅管理员");
  }

  @Test
  void adminAccountShouldNotBeDisabled() {
    when(userMapper.selectById(1L)).thenReturn(admin);
    AdminUpdateUserStatusRequest request = new AdminUpdateUserStatusRequest();
    request.setEnabled(false);

    assertThatThrownBy(() -> adminUserService.updateStatus(1L, request))
        .isInstanceOf(ForbiddenException.class)
        .hasMessageContaining("管理员账号");
  }

  private User user(Long id, String username, UserRole role, boolean enabled) {
    User user = new User();
    user.setId(id);
    user.setUsername(username);
    user.setRole(role);
    user.setEnabled(enabled);
    user.setCreatedAt(LocalDateTime.now());
    return user;
  }
}
