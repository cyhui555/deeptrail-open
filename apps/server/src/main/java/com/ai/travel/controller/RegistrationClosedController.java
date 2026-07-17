package com.ai.travel.controller;

import com.ai.travel.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Hidden;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 公开注册关闭时返回稳定的 404，不接收或处理请求体中的凭据。 */
@Hidden
@ConditionalOnProperty(
    prefix = "app.auth",
    name = "registration-enabled",
    havingValue = "false",
    matchIfMissing = true)
@RestController
@RequestMapping("/api/auth")
public class RegistrationClosedController {

  @PostMapping("/register")
  public ResponseEntity<ApiResponse<Void>> registerClosed() {
    return ResponseEntity.status(HttpStatus.NOT_FOUND)
        .body(ApiResponse.error("REGISTRATION_CLOSED", "公开注册已关闭，请联系管理员分配账号"));
  }
}
