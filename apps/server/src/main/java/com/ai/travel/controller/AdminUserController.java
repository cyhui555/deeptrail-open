package com.ai.travel.controller;

import com.ai.travel.dto.ApiResponse;
import com.ai.travel.dto.request.AdminCreateUserRequest;
import com.ai.travel.dto.request.AdminResetPasswordRequest;
import com.ai.travel.dto.request.AdminUpdateUserStatusRequest;
import com.ai.travel.dto.response.AdminUserResponse;
import com.ai.travel.dto.response.PageResult;
import com.ai.travel.service.AdminUserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 后台运营用户管理接口。 */
@Tag(name = "后台用户管理", description = "管理员分配、启停和重置普通用户账号")
@RestController
@RequestMapping("/api/admin/users")
@RequiredArgsConstructor
@Validated
public class AdminUserController {

  private final AdminUserService adminUserService;

  @Operation(summary = "查询用户列表")
  @GetMapping
  public ApiResponse<PageResult<AdminUserResponse>> list(
      @RequestParam(required = false) String keyword,
      @RequestParam(defaultValue = "1") @Min(1) int page,
      @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
    return ApiResponse.ok(adminUserService.listUsers(keyword, page, size));
  }

  @Operation(summary = "分配普通用户账号")
  @PostMapping
  public ApiResponse<AdminUserResponse> create(
      @Valid @RequestBody AdminCreateUserRequest request) {
    return ApiResponse.ok(adminUserService.createUser(request));
  }

  @Operation(summary = "启用或停用普通用户")
  @PatchMapping("/{userId}/status")
  public ApiResponse<AdminUserResponse> updateStatus(
      @PathVariable Long userId,
      @Valid @RequestBody AdminUpdateUserStatusRequest request) {
    return ApiResponse.ok(adminUserService.updateStatus(userId, request));
  }

  @Operation(summary = "重置普通用户密码")
  @PutMapping("/{userId}/password")
  public ApiResponse<Void> resetPassword(
      @PathVariable Long userId,
      @Valid @RequestBody AdminResetPasswordRequest request) {
    adminUserService.resetPassword(userId, request);
    return ApiResponse.ok();
  }
}
