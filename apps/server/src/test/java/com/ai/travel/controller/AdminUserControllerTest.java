package com.ai.travel.controller;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ai.travel.dto.request.AdminCreateUserRequest;
import com.ai.travel.dto.request.AdminResetPasswordRequest;
import com.ai.travel.dto.request.AdminUpdateUserStatusRequest;
import com.ai.travel.dto.response.AdminUserResponse;
import com.ai.travel.dto.response.PageResult;
import com.ai.travel.enums.UserRole;
import com.ai.travel.service.AdminUserService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class AdminUserControllerTest {

  @Mock private AdminUserService adminUserService;
  @InjectMocks private AdminUserController adminUserController;

  @Test
  void listShouldDelegatePagingParameters() {
    PageResult<AdminUserResponse> page = new PageResult<>(List.of(), 0, 1, 20, 0);
    when(adminUserService.listUsers("旅", 1, 20)).thenReturn(page);

    adminUserController.list("旅", 1, 20);

    verify(adminUserService).listUsers("旅", 1, 20);
  }

  @Test
  void createShouldDelegateRequest() {
    AdminCreateUserRequest request = new AdminCreateUserRequest();
    request.setUsername("traveler");
    request.setPassword("secret123");
    when(adminUserService.createUser(request)).thenReturn(
        new AdminUserResponse(2L, "traveler", UserRole.USER, true, 1L, null));

    adminUserController.create(request);

    verify(adminUserService).createUser(request);
  }

  @Test
  void statusAndPasswordShouldDelegateRequests() {
    AdminUpdateUserStatusRequest statusRequest = new AdminUpdateUserStatusRequest();
    statusRequest.setEnabled(false);
    AdminResetPasswordRequest passwordRequest = new AdminResetPasswordRequest();
    passwordRequest.setPassword("new-secret");

    adminUserController.updateStatus(2L, statusRequest);
    adminUserController.resetPassword(2L, passwordRequest);

    verify(adminUserService).updateStatus(2L, statusRequest);
    verify(adminUserService).resetPassword(2L, passwordRequest);
  }
}
