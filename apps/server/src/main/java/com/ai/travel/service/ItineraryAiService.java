package com.ai.travel.service;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import com.ai.travel.config.AppGeocodingProperties;
import com.ai.travel.dto.request.GenerateItineraryRequest;
import com.ai.travel.dto.request.OptimizeItineraryRequest;
import com.ai.travel.dto.request.XiaohongshuItineraryRequest;
import com.ai.travel.dto.response.ItineraryResponse;
import com.ai.travel.dto.response.OptimizeResponse;
import com.ai.travel.enums.AiCallStatus;
import com.ai.travel.enums.TaskType;
import com.ai.travel.exception.AiResponseValidationException;
import com.ai.travel.mapper.AiCallLogMapper;
import com.ai.travel.mapper.ItineraryRecordMapper;
import com.ai.travel.task.TaskExecutionContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Locale;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

/**
 * AI 行程用例编排门面。
 *
 * <p>模型调用、Prompt 构建、响应解析、坐标/交通增强和审计持久化均由独立组件负责，
 * 本类只维护生成、优化和小红书生成三个稳定业务入口。
 */
@Service
@Slf4j
public class ItineraryAiService {

  private final AiChatGateway chatGateway;
  private final ItineraryPromptFactory promptFactory;
  private final AiResponseParser responseParser;
  private final PoiCoordinateEnricher coordinateEnricher;
  private final TransportSegmentEnricher transportEnricher;
  private final AiResultPersistenceService persistenceService;
  private final XiaohongshuContentService xiaohongshuContentService;
  private final ReleaseOutcomeMetrics outcomeMetrics;

  /** Spring 运行时使用的职责化构造器。 */
  @Autowired
  public ItineraryAiService(
      AiChatGateway chatGateway,
      ItineraryPromptFactory promptFactory,
      AiResponseParser responseParser,
      PoiCoordinateEnricher coordinateEnricher,
      TransportSegmentEnricher transportEnricher,
      AiResultPersistenceService persistenceService,
      XiaohongshuContentService xiaohongshuContentService,
      ReleaseOutcomeMetrics outcomeMetrics) {
    this.chatGateway = chatGateway;
    this.promptFactory = promptFactory;
    this.responseParser = responseParser;
    this.coordinateEnricher = coordinateEnricher;
    this.transportEnricher = transportEnricher;
    this.persistenceService = persistenceService;
    this.xiaohongshuContentService = xiaohongshuContentService;
    this.outcomeMetrics = outcomeMetrics;
  }

  /**
   * 兼容既有单元测试的组合构造器；生产环境由 Spring 注入上方独立组件。
   *
   * <p>保留该入口可以让职责抽取与行为回归分步进行，避免一次变更同时重写 50 个用例。
   */
  public ItineraryAiService(
      ChatClient.Builder chatClientBuilder,
      Resource generatePromptResource,
      Resource optimizePromptResource,
      Resource xiaohongshuPromptResource,
      ObjectMapper objectMapper,
      AiResponseParser responseParser,
      ItineraryRecordMapper itineraryRecordMapper,
      AiCallLogMapper aiCallLogMapper,
      XiaohongshuContentFetcher contentFetcher,
      GeocodingService geocodingService,
      AppGeocodingProperties geocodingProperties) throws Exception {
    this(
        new AiChatGateway(chatClientBuilder),
        new ItineraryPromptFactory(
            generatePromptResource, optimizePromptResource, xiaohongshuPromptResource),
        responseParser,
        new PoiCoordinateEnricher(geocodingService, geocodingProperties),
        new TransportSegmentEnricher(),
        new AiResultPersistenceService(objectMapper, itineraryRecordMapper, aiCallLogMapper),
        new XiaohongshuContentService(contentFetcher),
        ReleaseOutcomeMetrics.noop());
  }

  /** 调用 AI 生成行程并完成结构化增强与审计。 */
  public ItineraryResponse generate(
      GenerateItineraryRequest request, String taskId, Long userId) {
    TaskExecutionResult<ItineraryResponse> execution = executeGenerate(
        request, taskId, userId, TaskExecutionContext.unbounded(taskId));
    persistSuccess(execution);
    return execution.result();
  }

  /** 执行生成链路但暂不持久化成功审计，由调度器赢得 COMPLETED 后统一提交。 */
  public TaskExecutionResult<ItineraryResponse> executeGenerate(
      GenerateItineraryRequest request,
      String taskId,
      Long userId,
      TaskExecutionContext execution) {
    log.info("Generating itinerary: {} -> {}, {} days",
        request.getDepartureLocation(), request.getDestination(), request.getDays());
    final long startedAt = System.currentTimeMillis();

    execution.checkpoint();
    AiChatGateway.AiChatResult aiResult = chatGateway.call(
        "generate", taskId, promptFactory.buildGenerate(request), execution);
    execution.checkpoint();
    ItineraryResponse result;
    try {
      result = responseParser.parseItinerary(aiResult.text(), AiCallStatus.SUCCESS);
    } catch (AiResponseValidationException exception) {
      outcomeMetrics.recordParseFailure(TaskType.GENERATE, exception.getReason());
      throw exception;
    }
    execution.checkpoint();
    coordinateEnricher.enrich(
        result, request.getDestination(), request.getDestination(), execution);
    transportEnricher.enrich(result);
    execution.checkpoint();

    int durationMs = elapsedMillis(startedAt);
    return new TaskExecutionResult<>(
        result,
        TaskType.GENERATE,
        request.getDestination(),
        aiResult.tokenUsed(),
        durationMs,
        taskId,
        userId,
        request,
        null);
  }

  /** 调用 AI 优化现有行程并补全坐标与交通段。 */
  public OptimizeResponse optimize(
      OptimizeItineraryRequest request, String taskId, Long userId) {
    TaskExecutionResult<OptimizeResponse> execution = executeOptimize(
        request, taskId, userId, TaskExecutionContext.unbounded(taskId));
    persistSuccess(execution);
    return execution.result();
  }

  /** 执行优化链路但延迟成功审计，防止 watchdog 已失败后仍写 SUCCESS。 */
  public TaskExecutionResult<OptimizeResponse> executeOptimize(
      OptimizeItineraryRequest request,
      String taskId,
      Long userId,
      TaskExecutionContext execution) {
    log.info("Optimizing itinerary: goal={}", request.getOptimizationGoal());
    final long startedAt = System.currentTimeMillis();

    execution.checkpoint();
    AiChatGateway.AiChatResult aiResult = chatGateway.call(
        "optimize", taskId, promptFactory.buildOptimize(request), execution);
    execution.checkpoint();
    OptimizeResponse result;
    try {
      result = responseParser.parseOptimize(aiResult.text(), AiCallStatus.SUCCESS);
    } catch (AiResponseValidationException exception) {
      outcomeMetrics.recordParseFailure(TaskType.OPTIMIZE, exception.getReason());
      throw exception;
    }
    execution.checkpoint();
    if (CollUtil.isNotEmpty(result.getDays())) {
      coordinateEnricher.enrichDays(
          result.getDays(), request.getOptimizationGoal(), null, execution);
    }
    transportEnricher.enrich(result);
    execution.checkpoint();

    int durationMs = elapsedMillis(startedAt);
    return new TaskExecutionResult<>(
        result,
        TaskType.OPTIMIZE,
        request.getOptimizationGoal(),
        aiResult.tokenUsed(),
        durationMs,
        taskId,
        userId,
        null,
        null);
  }

  /** 从小红书链接或直接粘贴的笔记内容生成行程。 */
  public XiaohongshuResult generateFromXiaohongshu(
      XiaohongshuItineraryRequest request, String taskId, Long userId) {
    TaskExecutionResult<ItineraryResponse> execution = executeXiaohongshu(
        request, taskId, userId, TaskExecutionContext.unbounded(taskId));
    persistSuccess(execution);
    return new XiaohongshuResult(execution.result(), execution.parsedContent());
  }

  /** 执行小红书生成链路但暂不持久化成功审计。 */
  public TaskExecutionResult<ItineraryResponse> executeXiaohongshu(
      XiaohongshuItineraryRequest request,
      String taskId,
      Long userId,
      TaskExecutionContext execution) {
    log.info("Xiaohongshu itinerary: url={}, hasNoteContent={}",
        request.getUrl(), StrUtil.isNotBlank(request.getNoteContent()));
    final long startedAt = System.currentTimeMillis();

    execution.checkpoint();
    String noteContent = xiaohongshuContentService.resolve(
        request.getUrl(), request.getNoteContent());
    execution.checkpoint();
    AiChatGateway.AiChatResult aiResult = chatGateway.call(
        "xiaohongshu", taskId,
        promptFactory.buildXiaohongshu(noteContent, request), execution);
    execution.checkpoint();
    ItineraryResponse result;
    try {
      result = responseParser.parseItinerary(aiResult.text(), AiCallStatus.SUCCESS);
    } catch (AiResponseValidationException exception) {
      outcomeMetrics.recordParseFailure(TaskType.XIAOHONGSHU, exception.getReason());
      throw exception;
    }
    execution.checkpoint();
    coordinateEnricher.enrich(
        result, "xiaohongshu:" + request.getUrl(), null, execution);
    transportEnricher.enrich(result);
    execution.checkpoint();

    int durationMs = elapsedMillis(startedAt);
    return new TaskExecutionResult<>(
        result,
        TaskType.XIAOHONGSHU,
        request.getUrl(),
        aiResult.tokenUsed(),
        durationMs,
        taskId,
        userId,
        null,
        noteContent);
  }

  /** 仅在调度器原子提交 COMPLETED 后写生成副本和 AI 成功审计。 */
  public void persistSuccess(TaskExecutionResult<?> execution) {
    Object result = execution.result();
    if (execution.type() == TaskType.GENERATE
        && execution.generateRequest() != null
        && result instanceof ItineraryResponse itinerary) {
      persistenceService.saveItinerary(
          execution.generateRequest(), itinerary, execution.userId());
    }
    persistenceService.saveCallLog(
        execution.type(),
        execution.summary(),
        AiCallStatus.SUCCESS,
        execution.tokenUsed(),
        execution.durationMs(),
        execution.taskId(),
        execution.userId());

    Object days = result instanceof ItineraryResponse itinerary
        ? itinerary.getDays()
        : result instanceof OptimizeResponse optimize ? optimize.getDays() : null;
    logSummary(
        execution.taskId(), execution.type(), execution.durationMs(), execution.tokenUsed(), days);
    outcomeMetrics.recordTerminal(
        execution.type(), "completed", execution.durationMs(), execution.tokenUsed());
  }

  /** 仅在 FAILED 终态提交后写失败审计；摘要由异常类型映射，不保存异常消息或模型原文。 */
  public void persistFailure(
      TaskType type, Throwable failure, int durationMs, String taskId, Long userId) {
    String safeSummary = failure instanceof AiResponseValidationException validationException
        ? "invalid_ai_response:"
            + validationException.getReason().name().toLowerCase(Locale.ROOT)
        : "execution_failed";
    persistenceService.saveCallLog(
        type,
        safeSummary,
        AiCallStatus.FAILED,
        null,
        durationMs,
        taskId,
        userId);
    log.info("[AiCallSummary] taskId={}, type={}, status=FAILED, reason={}, durationMs={}",
        taskId, type, safeSummary, durationMs);
  }

  /** AI 计算结果及其成功审计元数据；不携带任何密钥或原始 Provider 响应。 */
  public record TaskExecutionResult<T>(
      T result,
      TaskType type,
      String summary,
      Integer tokenUsed,
      int durationMs,
      String taskId,
      Long userId,
      GenerateItineraryRequest generateRequest,
      String parsedContent) {
  }

  private int elapsedMillis(long startedAt) {
    return (int) (System.currentTimeMillis() - startedAt);
  }

  private void logSummary(
      String taskId,
      TaskType type,
      int durationMs,
      Integer tokenUsed,
      ItineraryResponse response) {
    logSummary(taskId, type, durationMs, tokenUsed,
        response == null ? null : response.getDays());
  }

  private void logSummary(
      String taskId, TaskType type, int durationMs, Integer tokenUsed, Object days) {
    int dayCount = days instanceof java.util.List<?> values ? values.size() : 0;
    log.info("[AiCallSummary] taskId={}, type={}, status=SUCCESS, durationMs={}, "
            + "tokens={}, dayCount={}",
        taskId, type, durationMs, tokenUsed, dayCount);
  }

}
