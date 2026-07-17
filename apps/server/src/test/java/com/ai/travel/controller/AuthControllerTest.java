package com.ai.travel.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ai.travel.dto.request.LoginRequest;
import com.ai.travel.dto.response.AuthResponse;
import com.ai.travel.dto.response.UserInfoResponse;
import com.ai.travel.enums.UserRole;
import com.ai.travel.security.UserContext;
import com.ai.travel.security.AuthCookieService;
import com.ai.travel.service.UserService;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class AuthControllerTest {

  @Mock private UserService userService;
  @Mock private AuthCookieService authCookieService;
  @Mock private HttpServletResponse response;

  @InjectMocks
  private AuthController authController;

  @BeforeEach
  void setUp() {
    UserContext.clear();
  }

  @AfterEach
  void tearDown() {
    UserContext.clear();
  }

  @Test
  void loginShouldReturnAuthAndSetCookie() {
    LoginRequest req = new LoginRequest();
    req.setUsername("testuser");
    req.setPassword("password123");

    AuthResponse auth = new AuthResponse("jwt-token-def", 2L, "testuser", UserRole.USER);
    when(userService.login(any(LoginRequest.class))).thenReturn(auth);

    authController.login(req, response);

    verify(userService).login(req);
    verify(authCookieService).addTokenCookie(response, "jwt-token-def");
  }

  @Test
  void meShouldReturnUserInfo() {
    UserContext.setUserId(42L);

    UserInfoResponse info = new UserInfoResponse();
    info.setUserId(42L);
    info.setUsername("current_user");
    info.setPhone("13800138000");
    info.setWechatBound(false);

    when(userService.getUserInfo(42L)).thenReturn(info);

    authController.me();

    verify(userService).getUserInfo(42L);
  }

  @Test
  void logoutShouldClearCookie() {
    authController.logout(response);

    verify(authCookieService).clearTokenCookie(response);
  }
}
