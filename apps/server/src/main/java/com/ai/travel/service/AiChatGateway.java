package com.ai.travel.service;

import com.ai.travel.config.AiProviderRuntimeGuard;
import com.ai.travel.task.TaskExecutionCancelledException;
import com.ai.travel.task.TaskExecutionContext;
import java.io.IOException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/** 统一封装模型调用、I/O 重试和 Token 用量提取。 */
@Component
@Slf4j
public class AiChatGateway {

  private final ChatClient.Builder chatClientBuilder;
  private final AiProviderRuntimeGuard providerGuard;

  /** 创建生产模型网关，所有真实调用必须先通过 Provider 配置校验。 */
  @Autowired
  public AiChatGateway(
      ChatClient.Builder chatClientBuilder,
      AiProviderRuntimeGuard providerGuard) {
    this.chatClientBuilder = chatClientBuilder;
    this.providerGuard = providerGuard;
  }

  /** 兼容既有单元测试组合构造器；生产环境始终使用带保护器的 Spring 构造器。 */
  AiChatGateway(ChatClient.Builder chatClientBuilder) {
    this.chatClientBuilder = chatClientBuilder;
    this.providerGuard = null;
  }

  /** 调用模型并返回业务编排所需的标准结果。 */
  public AiChatResult call(String action, String taskId, Prompt prompt) {
    return call(action, taskId, prompt, TaskExecutionContext.unbounded(taskId));
  }

  /** 调用模型并在首次请求、重试和响应边界传播任务取消。 */
  public AiChatResult call(
      String action, String taskId, Prompt prompt, TaskExecutionContext execution) {
    execution.checkpoint();
    if (providerGuard != null) {
      providerGuard.assertProviderAvailable();
    }
    long startedAt = System.currentTimeMillis();
    try {
      ChatResponse response = callWithRetry(
          action, taskId, execution,
          () -> chatClientBuilder.build().prompt(prompt).call().chatResponse());
      execution.checkpoint();
      String text = response.getResult().getOutput().getText();
      Integer tokenUsed = extractTokenUsage(response);
      int latencyMs = (int) (System.currentTimeMillis() - startedAt);
      log.info("AI response: action={}, latencyMs={}, tokens={}, rawLength={}",
          action, latencyMs, tokenUsed, text == null ? 0 : text.length());
      return new AiChatResult(text, tokenUsed, latencyMs);
    } catch (TaskExecutionCancelledException exception) {
      log.info("AI call cancelled: action={}, taskId={}, reason={}",
          action, taskId, exception.getReason());
      throw exception;
    } catch (RuntimeException exception) {
      if (execution.isCancelled()) {
        execution.checkpoint();
      }
      log.error("AI call failed: action={}, taskId={}, reason={}",
          action, taskId, exception.getMessage(), exception);
      throw new RuntimeException("AI service call failed: " + exception.getMessage(), exception);
    }
  }

  private ChatResponse callWithRetry(
      String action, String taskId, TaskExecutionContext execution, AiTask task) {
    try {
      execution.checkpoint();
      return task.execute();
    } catch (RuntimeException exception) {
      if (execution.isCancelled()) {
        execution.checkpoint();
      }
      if (!isIoException(exception)) {
        throw exception;
      }
      log.warn("[Retry] action={}, taskId={}, reason={}", action, taskId, exception.getMessage());
      try {
        execution.checkpoint();
        ChatResponse result = task.execute();
        execution.checkpoint();
        log.info("[Retry] action={}, taskId={}, result=success", action, taskId);
        return result;
      } catch (RuntimeException retryException) {
        if (execution.isCancelled()) {
          execution.checkpoint();
        }
        log.error("[Retry] action={}, taskId={}, result=failed, reason={}",
            action, taskId, retryException.getMessage(), retryException);
        throw new RuntimeException(
            "AI service call failed after retry: " + retryException.getMessage(), retryException);
      }
    }
  }

  private boolean isIoException(RuntimeException exception) {
    Throwable current = exception;
    while (current != null) {
      if (current instanceof IOException) {
        return true;
      }
      current = current.getCause();
    }
    return false;
  }

  Integer extractTokenUsage(ChatResponse response) {
    if (response == null || response.getMetadata() == null
        || response.getMetadata().getUsage() == null) {
      return null;
    }
    Integer total = response.getMetadata().getUsage().getTotalTokens();
    return total != null && total > 0 ? total : null;
  }

  @FunctionalInterface
  private interface AiTask {
    ChatResponse execute();
  }

  /** 单次模型调用结果。 */
  public record AiChatResult(String text, Integer tokenUsed, int latencyMs) {
  }
}
