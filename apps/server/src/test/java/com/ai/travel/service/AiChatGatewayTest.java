package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatResponse;

/** AI 模型网关的 Token 提取边界测试。 */
class AiChatGatewayTest {

  private final AiChatGateway gateway = new AiChatGateway(mock(ChatClient.Builder.class));

  @Test
  @DisplayName("响应为空时 Token 用量为空")
  void extractTokenUsage_nullResponse_returnsNull() {
    assertThat(gateway.extractTokenUsage(null)).isNull();
  }

  @Test
  @DisplayName("元数据为空时 Token 用量为空")
  void extractTokenUsage_nullMetadata_returnsNull() {
    ChatResponse response = mock(ChatResponse.class);
    when(response.getMetadata()).thenReturn(null);

    assertThat(gateway.extractTokenUsage(response)).isNull();
  }

  @Test
  @DisplayName("Usage 为空时 Token 用量为空")
  void extractTokenUsage_nullUsage_returnsNull() {
    ChatResponse response = mock(ChatResponse.class, org.mockito.Mockito.RETURNS_DEEP_STUBS);
    when(response.getMetadata().getUsage()).thenReturn(null);

    assertThat(gateway.extractTokenUsage(response)).isNull();
  }

  @Test
  @DisplayName("Token 为零时按未知处理")
  void extractTokenUsage_zeroTokens_returnsNull() {
    ChatResponse response = mock(ChatResponse.class, org.mockito.Mockito.RETURNS_DEEP_STUBS);
    when(response.getMetadata().getUsage().getTotalTokens()).thenReturn(0);

    assertThat(gateway.extractTokenUsage(response)).isNull();
  }

  @Test
  @DisplayName("Token 大于零时返回实际用量")
  void extractTokenUsage_positiveTokens_returnsValue() {
    ChatResponse response = mock(ChatResponse.class, org.mockito.Mockito.RETURNS_DEEP_STUBS);
    when(response.getMetadata().getUsage().getTotalTokens()).thenReturn(128);

    assertThat(gateway.extractTokenUsage(response)).isEqualTo(128);
  }
}
