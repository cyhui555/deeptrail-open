package com.ai.travel.dto.response;

/** AI Provider 对用户可见的安全就绪状态，不包含任何运行时密钥或连接信息。 */
public record AiProviderStatusResponse(boolean available, String message) {
}
