package com.ai.travel.service;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import com.ai.travel.dto.request.GenerateItineraryRequest;
import com.ai.travel.dto.response.ItineraryResponse;
import com.ai.travel.entity.AiCallLog;
import com.ai.travel.entity.ItineraryRecord;
import com.ai.travel.enums.AiCallStatus;
import com.ai.travel.enums.TaskType;
import com.ai.travel.mapper.AiCallLogMapper;
import com.ai.travel.mapper.ItineraryRecordMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** 在独立事务中持久化 AI 结果和调用审计，不阻断主业务响应。 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AiResultPersistenceService {

  private final ObjectMapper objectMapper;
  private final ItineraryRecordMapper itineraryRecordMapper;
  private final AiCallLogMapper aiCallLogMapper;

  /** 保存生成行程记录；写入失败时仅记录告警。 */
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void saveItinerary(
      GenerateItineraryRequest request, ItineraryResponse response, Long userId) {
    try {
      ItineraryRecord record = new ItineraryRecord();
      record.setDepartureLocation(request.getDepartureLocation());
      record.setDepartureTime(request.getDepartureTime());
      record.setDestination(request.getDestination());
      record.setDays(request.getDays());
      record.setPeopleCount(request.getPeopleCount());
      record.setBudget(request.getBudget());
      record.setPreferences(joinList(request.getPreferences()));
      record.setSpecialRequirements(request.getSpecialRequirements());
      record.setResultJson(objectMapper.writeValueAsString(response));
      record.setUserId(userId);
      itineraryRecordMapper.insert(record);
      log.debug("Itinerary record saved, id={}", record.getId());
    } catch (Exception exception) {
      log.warn("Failed to save itinerary record (non-blocking): {}", exception.getMessage());
    }
  }

  /** 保存 AI 调用审计；写入失败时仅记录告警。 */
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void saveCallLog(
      TaskType callType,
      String summary,
      AiCallStatus status,
      Integer tokenUsed,
      Integer durationMs,
      String taskId,
      Long userId) {
    try {
      AiCallLog logEntry = new AiCallLog();
      logEntry.setCallType(callType);
      logEntry.setRequestSummary(StrUtil.maxLength(summary, 200));
      logEntry.setResponseStatus(status);
      logEntry.setTokenUsed(tokenUsed);
      logEntry.setDurationMs(durationMs);
      logEntry.setTaskId(taskId);
      logEntry.setUserId(userId);
      logEntry.setCreatedAt(LocalDateTime.now());
      aiCallLogMapper.insert(logEntry);
    } catch (Exception exception) {
      log.warn("Failed to save AI call log (non-blocking): {}", exception.getMessage());
    }
  }

  private String joinList(List<String> values) {
    if (CollUtil.isEmpty(values)) {
      return "无特殊偏好";
    }
    return CollUtil.join(values.stream()
        .filter(StrUtil::isNotBlank)
        .collect(Collectors.toList()), "、");
  }
}
