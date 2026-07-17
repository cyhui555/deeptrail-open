package com.ai.travel.controller;

import com.ai.travel.config.AiProviderRuntimeGuard;
import com.ai.travel.dto.ApiResponse;
import com.ai.travel.dto.response.AiProviderStatusResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 提供经过脱敏的 AI 服务就绪状态，供已认证的 Web 客户端在提交前判断。 */
@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiStatusController {

  private final AiProviderRuntimeGuard providerGuard;

  /** 返回模型服务是否可接受真实生成请求，不携带任何连接或密钥信息。 */
  @GetMapping("/status")
  public ApiResponse<AiProviderStatusResponse> status() {
    boolean available = providerGuard.isProviderAvailable();
    String message = available ? "AI 规划服务已就绪" : "AI 规划服务尚未配置";
    return ApiResponse.ok(new AiProviderStatusResponse(available, message));
  }
}
