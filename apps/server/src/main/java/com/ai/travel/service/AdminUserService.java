package com.ai.travel.service;

import cn.hutool.crypto.digest.BCrypt;
import com.ai.travel.dto.request.AdminCreateUserRequest;
import com.ai.travel.dto.request.AdminResetPasswordRequest;
import com.ai.travel.dto.request.AdminUpdateUserStatusRequest;
import com.ai.travel.dto.response.AdminUserResponse;
import com.ai.travel.dto.response.PageResult;
import com.ai.travel.entity.User;
import com.ai.travel.enums.UserRole;
import com.ai.travel.exception.ForbiddenException;
import com.ai.travel.exception.UserNotFoundException;
import com.ai.travel.exception.UsernameExistsException;
import com.ai.travel.mapper.UserMapper;
import com.ai.travel.security.UserContext;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 管理后台用户服务，统一执行管理员校验并避免暴露用户实体。 */
@Service
@RequiredArgsConstructor
public class AdminUserService {

  private static final int MAX_PAGE_SIZE = 100;

  private final UserMapper userMapper;

  /** 查询用户列表。 */
  public PageResult<AdminUserResponse> listUsers(String keyword, int page, int size) {
    requireAdmin();
    int safePage = Math.max(1, page);
    int safeSize = Math.min(MAX_PAGE_SIZE, Math.max(1, size));
    String safeKeyword = keyword == null ? "" : keyword.trim();
    long total = userMapper.countAdminUsers(safeKeyword);
    List<AdminUserResponse> records = userMapper
        .selectAdminPage(safeKeyword, safeSize, (safePage - 1) * safeSize)
        .stream()
        .map(this::toResponse)
        .toList();
    int totalPages = total == 0 ? 0 : (int) Math.ceil((double) total / safeSize);
    return new PageResult<>(records, total, safePage, safeSize, totalPages);
  }

  /** 由当前管理员分配一个普通用户账号。 */
  @Transactional
  public AdminUserResponse createUser(AdminCreateUserRequest request) {
    final User admin = requireAdmin();
    String username = request.getUsername().trim();
    User existing = userMapper.selectOne(
        Wrappers.<User>lambdaQuery().eq(User::getUsername, username));
    if (existing != null) {
      throw new UsernameExistsException(username);
    }

    User user = new User();
    user.setUsername(username);
    user.setPassword(BCrypt.hashpw(request.getPassword()));
    user.setRole(UserRole.USER);
    user.setEnabled(true);
    user.setCreatedByUserId(admin.getId());
    userMapper.insert(user);
    return toResponse(user);
  }

  /** 启用或停用普通用户账号。 */
  @Transactional
  public AdminUserResponse updateStatus(Long userId, AdminUpdateUserStatusRequest request) {
    User admin = requireAdmin();
    User target = requireManagedUser(userId);
    if (target.getId().equals(admin.getId()) || target.getRole() == UserRole.ADMIN) {
      throw new ForbiddenException("管理员账号不能在用户管理中停用");
    }
    target.setEnabled(request.getEnabled());
    userMapper.updateById(target);
    return toResponse(target);
  }

  /** 重置普通用户密码；旧密码哈希不会保留。 */
  @Transactional
  public void resetPassword(Long userId, AdminResetPasswordRequest request) {
    requireAdmin();
    User target = requireManagedUser(userId);
    if (target.getRole() == UserRole.ADMIN) {
      throw new ForbiddenException("管理员账号不能在用户管理中重置密码");
    }
    target.setPassword(BCrypt.hashpw(request.getPassword()));
    userMapper.updateById(target);
  }

  private User requireAdmin() {
    Long currentUserId = UserContext.getUserId();
    User currentUser = currentUserId == null ? null : userMapper.selectById(currentUserId);
    if (currentUser == null || currentUser.getRole() != UserRole.ADMIN
        || Boolean.FALSE.equals(currentUser.getEnabled())) {
      throw new ForbiddenException("仅管理员可访问后台运营功能");
    }
    return currentUser;
  }

  private User requireManagedUser(Long userId) {
    User user = userMapper.selectById(userId);
    if (user == null) {
      throw new UserNotFoundException(userId);
    }
    return user;
  }

  private AdminUserResponse toResponse(User user) {
    return new AdminUserResponse(
        user.getId(),
        user.getUsername(),
        user.getRole(),
        !Boolean.FALSE.equals(user.getEnabled()),
        user.getCreatedByUserId(),
        user.getCreatedAt());
  }
}
