package com.ai.travel.service;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import com.ai.travel.dto.response.ItineraryResponse;
import com.ai.travel.dto.response.OptimizeResponse;
import com.ai.travel.enums.AiCallStatus;
import com.ai.travel.exception.AiResponseValidationException;
import com.ai.travel.exception.AiResponseValidationException.Reason;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/** AI 文本到结构化行程响应的容错解析器。 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AiResponseParser {

  private final ObjectMapper objectMapper;

  /** 按直接解析、片段提取、降级响应三级策略解析生成结果。 */
  public ItineraryResponse parseItinerary(String raw, AiCallStatus status) {
    if (StrUtil.isBlank(raw)) {
      throw invalidResponse(status, Reason.EMPTY_RESPONSE);
    }
    ItineraryResponse result = null;
    String parsePath = "invalid";
    try {
      result = objectMapper.readValue(cleanJson(raw), ItineraryResponse.class);
      parsePath = "direct";
    } catch (Exception directError) {
      logParsePath("direct", false);
      log.warn("Direct parse failed: {}", directError.getClass().getSimpleName());
    }
    if (result == null) {
      try {
        String extracted = extractJson(raw);
        if (!extracted.equals(raw)) {
          result = objectMapper.readValue(extracted, ItineraryResponse.class);
          parsePath = "extract";
        }
      } catch (Exception extractError) {
        logParsePath("extract", false);
        log.warn("Extract parse failed: {}", extractError.getClass().getSimpleName());
      }
    }
    if (result == null) {
      throw invalidResponse(status, Reason.MALFORMED_JSON);
    }
    requireDays(result.getDays(), status);
    logParsePath(parsePath, true);
    return result;
  }

  /** 解析优化结果，并兼容 AI 将结构化 JSON 放入字符串字段的历史格式。 */
  public OptimizeResponse parseOptimize(String raw, AiCallStatus status) {
    if (StrUtil.isBlank(raw)) {
      throw invalidResponse(status, Reason.EMPTY_RESPONSE);
    }
    OptimizeResponse result = null;
    String parsePath = "fallback";
    try {
      result = objectMapper.readValue(cleanJson(raw), OptimizeResponse.class);
      parsePath = "direct";
    } catch (Exception directError) {
      logParsePath("direct", false);
      log.warn("Direct parse failed: {}", directError.getClass().getSimpleName());
    }
    if (result == null) {
      try {
        String extracted = extractJson(raw);
        if (!extracted.equals(raw)) {
          result = objectMapper.readValue(extracted, OptimizeResponse.class);
          parsePath = "extract";
        }
      } catch (Exception extractError) {
        logParsePath("extract", false);
        log.warn("Extract parse failed: {}", extractError.getClass().getSimpleName());
      }
    }
    if (result != null && CollUtil.isEmpty(result.getDays())
        && StrUtil.isNotBlank(result.getOptimizedItinerary())) {
      parsePath = parsePath + "+inner-compensation";
      try {
        OptimizeResponse inner = objectMapper.readValue(
            cleanJson(result.getOptimizedItinerary()), OptimizeResponse.class);
        if (CollUtil.isNotEmpty(inner.getDays())) {
          result.setDays(inner.getDays());
          result.setSummary(inner.getSummary());
          result.setTips(inner.getTips());
          result.setEstimatedBudget(inner.getEstimatedBudget());
          log.info("[ParsePath] path=inner-compensation, status={}", status);
        }
      } catch (Exception innerError) {
        log.debug("optimizedItinerary is not a nested JSON, skip inner parse");
      }
    }
    if (result != null) {
      requireDays(result.getDays(), status);
      logParsePath(parsePath, true);
      return result;
    }
    throw invalidResponse(status, Reason.MALFORMED_JSON);
  }

  private void logParsePath(String path, boolean success) {
    log.info("[ParsePath] path={}, status={}", path, success ? "success" : "failed");
  }

  private String cleanJson(String text) {
    return text.replaceAll("(?s)```json\\s*", "")
        .replaceAll("(?s)```\\s*", "")
        .trim();
  }

  private String extractJson(String text) {
    int start = text.indexOf('{');
    int end = text.lastIndexOf('}');
    return start != -1 && end > start ? text.substring(start, end + 1) : text;
  }

  private void requireDays(java.util.List<?> days, AiCallStatus status) {
    if (CollUtil.isEmpty(days) || days.stream().anyMatch(java.util.Objects::isNull)) {
      throw invalidResponse(status, Reason.MISSING_DAYS);
    }
  }

  private AiResponseValidationException invalidResponse(AiCallStatus status, Reason reason) {
    log.info("[ParsePath] path=invalid, status={}, reason={}", status, reason);
    return new AiResponseValidationException(reason);
  }
}
