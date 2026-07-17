package com.ai.travel.service;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.IdUtil;
import cn.hutool.core.util.StrUtil;
import com.ai.travel.dto.request.GenerateItineraryRequest;
import com.ai.travel.dto.request.OptimizeItineraryRequest;
import com.ai.travel.dto.request.SaveNodeRevisionRequest;
import com.ai.travel.dto.request.XiaohongshuItineraryRequest;
import com.ai.travel.dto.response.NodeRevisionResponse;
import com.ai.travel.dto.response.OptimizeResponse;
import com.ai.travel.dto.response.PageResult;
import com.ai.travel.dto.response.TaskStatusResponse;
import com.ai.travel.dto.response.TaskSummaryResponse;
import com.ai.travel.entity.AiCallLog;
import com.ai.travel.entity.ItineraryTask;
import com.ai.travel.entity.NodeRevision;
import com.ai.travel.enums.TaskStatus;
import com.ai.travel.enums.TaskType;
import com.ai.travel.enums.TransportMode;
import com.ai.travel.exception.ForbiddenException;
import com.ai.travel.exception.UnauthorizedException;
import com.ai.travel.mapper.AiCallLogMapper;
import com.ai.travel.mapper.ItineraryTaskMapper;
import com.ai.travel.mapper.NodeRevisionMapper;
import com.ai.travel.security.UserContext;
import com.ai.travel.task.InMemoryTaskStore;
import com.ai.travel.task.TaskExecutionContext;
import com.ai.travel.task.TaskExecutionRegistry;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 异步任务服务，采用双存储（数据库 + 内存缓存）。
 *
 * <p>提交时先写数据库再写缓存；查询时先查缓存，
 * 缓存未命中则回退到数据库。
 *
 * <p>实际的 AI 执行由 {@link com.ai.travel.task.TaskScheduler} 驱动。
 *
 * <p><b>双写策略：</b>数据库为准（source of truth），内存作读加速。
 *
 * <p>写入顺序：先 DB 后内存；异常时内存可能暂时缺失，
 * 启动恢复或下次查询会自动补偿。
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ItineraryTaskService {

  private final InMemoryTaskStore taskStore;
  private final TaskExecutionRegistry executionRegistry;
  private final ItineraryTaskMapper taskMapper;
  private final AiCallLogMapper aiCallLogMapper;
  private final NodeRevisionMapper nodeRevisionMapper;
  private final ObjectMapper objectMapper;

  /**
   * 提交行程生成任务，立即返回 taskId。
   *
   * @param req 生成请求
   * @return 任务 ID
   */
  public String submitGenerateTask(GenerateItineraryRequest req) {
    return submit(TaskType.GENERATE, req);
  }

  /**
   * 提交行程优化任务，立即返回 taskId。
   *
   * @param req 优化请求
   * @return 任务 ID
   */
  public String submitOptimizeTask(OptimizeItineraryRequest req) {
    return submit(TaskType.OPTIMIZE, req);
  }

  /**
   * 提交小红书行程任务，立即返回 taskId。
   *
   * @param req 小红书请求
   * @return 任务 ID
   */
  public String submitXiaohongshuTask(XiaohongshuItineraryRequest req) {
    return submit(TaskType.XIAOHONGSHU, req);
  }

  private String submit(TaskType type, Object requestBody) {
    ItineraryTask task = new ItineraryTask();
    task.setId(IdUtil.fastSimpleUUID());
    task.setType(type);
    task.setStatus(TaskStatus.PENDING);
    try {
      task.setRequestJson(objectMapper.writeValueAsString(requestBody));
    } catch (JsonProcessingException e) {
      throw new RuntimeException("Request serialization failed", e);
    }
    task.setCreatedAt(LocalDateTime.now());
    task.setExpiresAt(task.getCreatedAt().plusHours(24));

    Long userId = UserContext.getUserId();
    if (userId != null) {
      task.setUserId(userId);
    } else {
      // 防御：DB 层 user_id 为 NOT NULL，无登录上下文时必须显式报错，
      // 避免让数据库抛出 SQLiteConstraintException 后走兜底 INTERNAL_ERROR。
      throw new UnauthorizedException("未登录，请先登录后再提交任务");
    }

    taskMapper.insert(task);
    taskStore.save(task);

    return task.getId();
  }

  /**
   * 查询任务状态。优先查缓存，缓存未命中则回退到数据库。
   *
   * @param taskId 任务 ID
   * @return 任务状态响应，如果状态为 COMPLETED 则包含反序列化后的结果
   * @throws RuntimeException 如果任务未找到
   */
  public TaskStatusResponse getStatus(String taskId) {
    ItineraryTask task = taskStore.findById(taskId);
    if (task == null) {
      task = taskMapper.selectById(taskId);
      if (task == null) {
        throw new RuntimeException("Task not found");
      }
      taskStore.save(task);
    }

    Long userId = UserContext.getUserId();
    if (userId != null && task.getUserId() != null && !userId.equals(task.getUserId())) {
      throw new ForbiddenException("无权访问该任务");
    }
    TaskStatusResponse resp = new TaskStatusResponse();
    BeanUtil.copyProperties(task, resp, "resultJson");
    resp.setTaskId(task.getId());
    resp.setSubmittedAt(task.getCreatedAt());
    resp.setSummary(buildSummary(task));
    resp.setParsedContent(task.getParsedContent());
    resp.setRequestJson(task.getRequestJson());

    AiCallLog latestLog = aiCallLogMapper.selectOne(
        Wrappers.<AiCallLog>lambdaQuery()
            .eq(AiCallLog::getTaskId, taskId)
            .orderByDesc(AiCallLog::getCreatedAt)
            .last("LIMIT 1"));
    if (latestLog != null) {
      resp.setTokenUsed(latestLog.getTokenUsed());
      resp.setDurationMs(latestLog.getDurationMs());
    }

    if (task.getStatus() == TaskStatus.COMPLETED && task.getResultJson() != null) {
      try {
        resp.setResult(objectMapper.readValue(task.getResultJson(), task.getType().resultClass()));
      } catch (Exception e) {
        log.warn("Failed to parse result JSON for task {}", taskId, e);
      }
    }
    // 补偿：AI 可能将结构化数据作为 JSON 字符串塞进 optimizedItinerary 字段
    fillOptimizeResultFromInnerJson(resp);
    if (task.getStatus() == TaskStatus.FAILED) {
      resp.setErrorMessage(task.getErrorMessage());
    }
    return resp;
  }

  /**
   * 分页列出任务，可按状态过滤。
   *
   * @param status 可选的状态过滤条件
   * @param page   页码（从 1 开始）
   * @param size   每页条数（最大 50）
   * @return 分页任务摘要
   */
  public PageResult<TaskSummaryResponse> listTasks(TaskStatus status, int page, int size) {
    LambdaQueryWrapper<ItineraryTask> wrapper = Wrappers.lambdaQuery();
    wrapper.orderByDesc(ItineraryTask::getCreatedAt);
    if (status != null) {
      wrapper.eq(ItineraryTask::getStatus, status);
    }
    Long userId = UserContext.getUserId();
    if (userId != null) {
      wrapper.eq(ItineraryTask::getUserId, userId);
    }
    int safePage = Math.max(page, 1);
    int safeSize = Math.max(Math.min(size, 50), 1);
    Page<ItineraryTask> pageReq = Page.of(safePage, safeSize);
    Page<ItineraryTask> pageResult = taskMapper.selectPage(pageReq, wrapper);

    List<TaskSummaryResponse> records = pageResult.getRecords().stream().map(task -> {
      TaskSummaryResponse resp = new TaskSummaryResponse();
      BeanUtil.copyProperties(task, resp);
      resp.setTaskId(task.getId());
      resp.setSubmittedAt(task.getCreatedAt());
      resp.setSummary(buildSummary(task));
      return resp;
    }).collect(Collectors.toList());

    return new PageResult<>(records, pageResult.getTotal(), safePage,
        safeSize, (int) pageResult.getPages());
  }

  private String buildSummary(ItineraryTask task) {
    try {
      JsonNode json = objectMapper.readTree(task.getRequestJson());
      return switch (task.getType()) {
        case GENERATE -> {
          String from = json.path("departureLocation").asText("");
          String to = json.path("destination").asText("");
          int days = json.path("days").asInt(0);
          String s = from + " → " + to;
          if (days > 0) {
            s += " " + days + "天";
          }
          yield StrUtil.isBlank(from) && StrUtil.isBlank(to) ? "生成行程" : s;
        }
        case OPTIMIZE -> {
          String goal = json.path("optimizationGoal").asText("");
          yield StrUtil.isNotBlank(goal) ? "优化: " + goal : "优化行程";
        }
        case XIAOHONGSHU -> {
          String url = json.path("url").asText("");
          String note = json.path("noteContent").asText("");
          if (StrUtil.isNotBlank(note)) {
            yield "笔记: " + StrUtil.maxLength(note.trim(), 50);
          }
          if (StrUtil.isNotBlank(url)) {
            yield "笔记: " + StrUtil.maxLength(url, 50);
          }
          yield "小红书生成";
        }
      };
    } catch (Exception e) {
      log.warn("Failed to build summary for task {}", task.getId(), e);
      return task.getType().name();
    }
  }

  /**
   * 补偿优化结果中结构化字段缺失的问题。
   *
   * <p>AI 有时将 summary/days/tips/estimatedBudget 作为 JSON 字符串塞进
   * optimizedItinerary 字段，导致前端无法渲染沉浸式时间线。
   * 此方法检测到该情况时，解析内层 JSON 并填充到对应字段。
   *
   * <p>同时处理 AI 输出被截断的情况（括号不平衡），
   * 尽力补全未闭合的括号后解析。
   */
  private void fillOptimizeResultFromInnerJson(TaskStatusResponse resp) {
    if (resp.getType() != TaskType.OPTIMIZE || resp.getResult() == null) {
      return;
    }
    try {
      String resultJson = objectMapper.writeValueAsString(resp.getResult());
      com.fasterxml.jackson.databind.JsonNode node = objectMapper.readTree(resultJson);
      if (node == null || !node.has("optimizedItinerary")) {
        return;
      }
      String optimizedItinerary = node.path("optimizedItinerary").asText("");
      boolean hasStructuredData = node.path("days").isArray() && node.path("days").size() > 0;
      if (hasStructuredData || StrUtil.isBlank(optimizedItinerary)) {
        return;
      }
      // 清理 markdown 代码块标记
      String cleaned = optimizedItinerary.replaceAll("(?s)```json\\s*", "")
          .replaceAll("(?s)```\\s*", "")
          .trim();
      com.fasterxml.jackson.databind.JsonNode inner;
      try {
        inner = objectMapper.readTree(cleaned);
      } catch (Exception parseEx) {
        // JSON 可能被截断，尝试补全未闭合的括号后重新解析
        String repaired = repairTruncatedJson(cleaned);
        if (repaired == null) {
          return;
        }
        try {
          inner = objectMapper.readTree(repaired);
          log.info("Repaired truncated inner JSON for task {}", resp.getTaskId());
        } catch (Exception retryEx) {
          return; // 修复后仍无法解析，放弃
        }
      }
      if (inner == null || !inner.has("days")) {
        return;
      }
      // 用内层 JSON 的字段覆盖顶层缺失字段
      com.fasterxml.jackson.databind.JsonNode rootNode = objectMapper.readTree(resultJson);
      com.fasterxml.jackson.databind.node.ObjectNode rootObj =
          (com.fasterxml.jackson.databind.node.ObjectNode) rootNode;
      if (rootObj.path("summary").isMissingNode() && inner.has("summary")) {
        rootObj.set("summary", inner.get("summary"));
      }
      if (!rootObj.has("days") && inner.has("days")) {
        rootObj.set("days", inner.get("days"));
      }
      if (!rootObj.has("tips") && inner.has("tips")) {
        rootObj.set("tips", inner.get("tips"));
      }
      if (!rootObj.has("estimatedBudget") && inner.has("estimatedBudget")) {
        rootObj.set("estimatedBudget", inner.get("estimatedBudget"));
      }
      rootObj.put("optimizedItinerary", "");
      OptimizeResponse fixed = objectMapper.treeToValue(rootObj, OptimizeResponse.class);
      resp.setResult(fixed);
      log.info("Filled optimize structured data from inner JSON for task {}", resp.getTaskId());
    } catch (Exception e) {
      log.debug("Skip optimize inner JSON compensation for task {}: {}",
          resp.getTaskId(), e.getMessage());
    }
  }

  /**
   * 修复被截断的 JSON 字符串。
   *
   * <p>策略：识别所有完整的 day 对象（通过 "day": N 定位，
   * 扫描匹配的 { }），
   *
   * <p>只保留完整的 day，丢弃不完整的尾部。然后重新组装为合法 JSON。
   *
   * @return 修复后的 JSON 字符串，如果无法修复则返回 null。
   */
  private String repairTruncatedJson(String broken) {
    if (StrUtil.isBlank(broken)) {
      return null;
    }
    String text = broken.trim();

    // 提取 summary（一定在 days 之前且通常完整）
    String summaryPart = "";
    java.util.regex.Matcher summaryMatcher = java.util.regex.Pattern
        .compile("\"summary\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"")
        .matcher(text);
    if (summaryMatcher.find()) {
      summaryPart = summaryMatcher.group(0);
    }

    // 找所有 "day": N 的位置
    java.util.regex.Matcher dayMatcher = java.util.regex.Pattern
        .compile("\"day\"\\s*:\\s*(\\d+)")
        .matcher(text);
    java.util.List<int[]> dayKeyPositions = new java.util.ArrayList<>(); // [pos, dayNumber]
    while (dayMatcher.find()) {
      dayKeyPositions.add(new int[] {dayMatcher.start(), Integer.parseInt(dayMatcher.group(1))});
    }
    if (dayKeyPositions.isEmpty()) {
      return null;
    }

    // 对每个 day key，找到包含它的完整 { } 对象
    java.util.List<int[]> completeDays = new java.util.ArrayList<>(); // [start, end]
    for (int[] dk : dayKeyPositions) {
      int keyPos = dk[0];
      // 向前找 {
      int depth = 0;
      int objStart = -1;
      for (int i = keyPos; i >= 0; i--) {
        char ch = text.charAt(i);
        if (ch == '}') {
          depth++;
        }
        if (ch == '{') {
          depth--;
          if (depth < 0) {
            objStart = i;
            break;
          }
        }
      }
      if (objStart < 0) {
        continue;
      }
      // 向后找匹配的 }
      depth = 0;
      boolean inStr = false;
      boolean esc = false;
      int objEnd = -1;
      for (int i = objStart; i < text.length(); i++) {
        char ch = text.charAt(i);
        if (esc) {
          esc = false;
          continue;
        }
        if (ch == '\\' && inStr) {
          esc = true;
          continue;
        }
        if (ch == '"') {
          inStr = !inStr;
          continue;
        }
        if (inStr) {
          continue;
        }
        if (ch == '{') {
          depth++;
        }
        if (ch == '}') {
          depth--;
          if (depth == 0) {
            objEnd = i;
            break;
          }
        }
      }
      if (objEnd < 0) {
        break; // 这个 day 不完整，后面的也不完整
      }
      completeDays.add(new int[]{objStart, objEnd});
    }

    if (completeDays.isEmpty()) {
      return null;
    }

    // 重新组装 JSON
    StringBuilder sb = new StringBuilder();
    sb.append("{\n");
    if (StrUtil.isNotBlank(summaryPart)) {
      sb.append("  ").append(summaryPart).append(",\n");
    }
    sb.append("  \"days\": [\n");
    for (int i = 0; i < completeDays.size(); i++) {
      int[] d = completeDays.get(i);
      sb.append("    ").append(text.substring(d[0], d[1] + 1));
      if (i < completeDays.size() - 1) {
        sb.append(",");
      }
      sb.append("\n");
    }
    sb.append("  ]\n");
    sb.append("}");
    return sb.toString();
  }

  /**
   * 取消一个非终态任务。
   *
   * <p>先通过数据库条件更新（防止竞态），再同步内存缓存。
   *
   * <p>数据库和内存终态提交后，通过执行注册表向当前 AI 工作线程传播取消与中断。
   *
   * @param taskId 任务 ID
   * @throws RuntimeException 如果任务未找到或已处于终态
   */
  public void cancel(String taskId) {
    ItineraryTask update = new ItineraryTask();
    update.setStatus(TaskStatus.CANCELLED);
    update.setCompletedAt(LocalDateTime.now());
    LambdaUpdateWrapper<ItineraryTask> wrapper = Wrappers.<ItineraryTask>lambdaUpdate()
        .eq(ItineraryTask::getId, taskId)
        .notIn(ItineraryTask::getStatus,
            TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED);
    Long userId = UserContext.getUserId();
    if (userId != null) {
      wrapper.eq(ItineraryTask::getUserId, userId);
    }
    int rows = taskMapper.update(update, wrapper);
    if (rows == 0) {
      // DB 中没有可取消的行：可能任务已被其他线程/实例取消，
      // 或任务处于终态。
      // 此时同步检查内存状态，若内存中已 CANCELLED 则视为幂等成功。
      ItineraryTask memTask = taskStore.findById(taskId);
      if (memTask != null && memTask.getStatus() == TaskStatus.CANCELLED) {
        executionRegistry.cancel(
            taskId, TaskExecutionContext.CancellationReason.USER_CANCELLED);
        return;
      }
      throw new RuntimeException("Task cannot be cancelled (already terminal)");
    }
    // DB 写入成功后同步内存，确保后续 scheduler 不会重复处理。
    ItineraryTask task = taskStore.findById(taskId);
    if (task != null) {
      task.setStatus(TaskStatus.CANCELLED);
      task.setCompletedAt(LocalDateTime.now());
      taskStore.save(task);
    }
    executionRegistry.cancel(
        taskId, TaskExecutionContext.CancellationReason.USER_CANCELLED);
  }

  // ========== 节点修正 ==========

  /**
   * 列出任务下所有节点修正。
   *
   * @param taskId 任务 ID
   * @return 修正记录列表
   * @throws ForbiddenException 任务不属于当前用户
   */
  public List<NodeRevisionResponse> listNodeRevisions(String taskId) {
    ItineraryTask task = loadTaskAndCheckOwnership(taskId);
    List<NodeRevision> rows = nodeRevisionMapper.selectList(
        new QueryWrapper<NodeRevision>().eq("task_id", taskId));
    return rows.stream().map(this::toNodeRevisionResponse).collect(Collectors.toList());
  }

  /**
   * 保存节点修正（UPSERT）。相同 (task, day, item) 多次保存会覆盖并刷新
   * updated_at。
   *
   * @param taskId 任务 ID
   * @param req 修正请求
   * @return 保存后的修正响应
   * @throws ForbiddenException 任务不属于当前用户
   * @throws IllegalArgumentException 校验失败（越界、半对坐标、非法 mode、
   *     什么都没填）
   */
  public NodeRevisionResponse saveNodeRevision(String taskId, SaveNodeRevisionRequest req) {
    ItineraryTask task = loadTaskAndCheckOwnership(taskId);
    validateRevisionRequest(task, req);

    String originalJson =
        extractNodeOriginalJson(task, req.getDayIndex(), req.getItemIndex());

    // 使用字符串列名而非 lambda 引用，避免单元测试中
    // MyBatis-Plus lambda 缓存未初始化
    UpdateWrapper<NodeRevision> updateWrapper = new UpdateWrapper<>();
    updateWrapper
        .eq("task_id", taskId)
        .eq("day_index", req.getDayIndex())
        .eq("item_index", req.getItemIndex())
        .set("corrected_lat", req.getCorrectedLat())
        .set("corrected_lng", req.getCorrectedLng())
        .set("transport_mode", TransportMode.of(req.getTransportMode()))
        .set("transport_duration", req.getTransportDuration())
        .set("transport_desc", req.getTransportDesc())
        .set("original_json", originalJson)
        .set("updated_at", LocalDateTime.now());

    int rows = nodeRevisionMapper.update(null, updateWrapper);

    if (rows == 0) {
      NodeRevision entity = new NodeRevision();
      entity.setTaskId(taskId);
      entity.setDayIndex(req.getDayIndex());
      entity.setItemIndex(req.getItemIndex());
      entity.setCorrectedLat(req.getCorrectedLat());
      entity.setCorrectedLng(req.getCorrectedLng());
      entity.setTransportMode(TransportMode.of(req.getTransportMode()));
      entity.setTransportDuration(req.getTransportDuration());
      entity.setTransportDesc(req.getTransportDesc());
      entity.setOriginalJson(originalJson);
      entity.setUserId(task.getUserId());
      entity.setCreatedAt(LocalDateTime.now());
      entity.setUpdatedAt(LocalDateTime.now());
      nodeRevisionMapper.insert(entity);
      return toNodeRevisionResponse(entity);
    }

    NodeRevision after = nodeRevisionMapper.selectOne(
        new QueryWrapper<NodeRevision>()
            .eq("task_id", taskId)
            .eq("day_index", req.getDayIndex())
            .eq("item_index", req.getItemIndex()));
    return toNodeRevisionResponse(after);
  }

  /**
   * 删除节点修正。
   *
   * @param taskId 任务 ID
   * @param dayIndex 天序号
   * @param itemIndex 时段序号
   * @throws ForbiddenException 任务不属于当前用户
   */
  public void deleteNodeRevision(String taskId, int dayIndex, int itemIndex) {
    loadTaskAndCheckOwnership(taskId);
    nodeRevisionMapper.delete(new QueryWrapper<NodeRevision>()
        .eq("task_id", taskId)
        .eq("day_index", dayIndex)
        .eq("item_index", itemIndex));
  }

  // ========== 节点修正私有 helper ==========

  /**
   * 加载任务并校验当前用户所有权。
   *
   * @param taskId 任务 ID
   * @return 任务实体（非 null）
   * @throws ForbiddenException 用户不匹配
   */
  private ItineraryTask loadTaskAndCheckOwnership(String taskId) {
    ItineraryTask task = taskStore.findById(taskId);
    if (task == null) {
      task = taskMapper.selectById(taskId);
    }
    if (task == null) {
      throw new RuntimeException("Task not found: " + taskId);
    }
    Long currentUserId = UserContext.getUserId();
    if (currentUserId != null && !Objects.equals(currentUserId, task.getUserId())) {
      throw new ForbiddenException("无权操作该任务");
    }
    return task;
  }

  /**
   * 校验节点修正请求：边界、坐标完整性、枚举合法性、至少填一类。
   */
  private void validateRevisionRequest(ItineraryTask task, SaveNodeRevisionRequest req) {
    JsonNode root;
    try {
      root = objectMapper.readTree(task.getResultJson());
    } catch (JsonProcessingException e) {
      throw new IllegalArgumentException("任务结果 JSON 无法解析: " + taskIdLog(task));
    }

    JsonNode daysNode = root.get("days");
    if (daysNode == null || !daysNode.isArray() || daysNode.isEmpty()) {
      throw new IllegalArgumentException(
          "任务无结构化日程，无法修正节点: " + taskIdLog(task));
    }

    JsonNode dayNode = resolveScheduleNode(task, req.getDayIndex());
    if (dayNode == null) {
      throw new IllegalArgumentException(
          String.format("dayIndex=%d 越界，任务 %s 共 %d 天",
              req.getDayIndex(), taskIdLog(task), daysNode.size()));
    }

    JsonNode scheduleNode = dayNode.get("schedule");
    if (scheduleNode == null || !scheduleNode.isArray()) {
      throw new IllegalArgumentException(
          String.format("第 %d 天无 schedule 字段", req.getDayIndex()));
    }
    if (req.getItemIndex() < 0 || req.getItemIndex() >= scheduleNode.size()) {
      throw new IllegalArgumentException(
          String.format("itemIndex=%d 越界，第 %d 天共 %d 个时段",
              req.getItemIndex(), req.getDayIndex(), scheduleNode.size()));
    }

    // lat/lng 必须成对
    boolean hasLat = req.getCorrectedLat() != null;
    boolean hasLng = req.getCorrectedLng() != null;
    if (hasLat != hasLng) {
      throw new IllegalArgumentException("经纬度必须同时填写或同时为空");
    }
    if (hasLat && (req.getCorrectedLat() < -90 || req.getCorrectedLat() > 90
        || req.getCorrectedLng() < -180 || req.getCorrectedLng() > 180)) {
      throw new IllegalArgumentException("经纬度范围非法");
    }

    // 枚举校验（null 表示不修正 transport）
    if (req.getTransportMode() != null && TransportMode.of(req.getTransportMode()) == null) {
      throw new IllegalArgumentException("非法交通方式: " + req.getTransportMode());
    }

    // 至少填一类
    boolean hasGeo = hasLat;
    boolean hasTransport = req.getTransportMode() != null
        || req.getTransportDuration() != null
        || req.getTransportDesc() != null;
    if (!hasGeo && !hasTransport) {
      throw new IllegalArgumentException("至少填写坐标或交通之一");
    }
  }

  /**
   * 根据 dayIndex（从 1 开始）定位对应的 day JsonNode。
   * 优先匹配 day 字段，否则按数组 index = dayIndex - 1。
   */
  private JsonNode resolveScheduleNode(ItineraryTask task, int dayIndex) {
    try {
      JsonNode root = objectMapper.readTree(task.getResultJson());
      JsonNode daysNode = root.get("days");
      if (daysNode == null || !daysNode.isArray()) {
        return null;
      }
      // 优先按 day 字段匹配
      for (JsonNode d : daysNode) {
        JsonNode dayField = d.get("day");
        if (dayField != null && dayField.asInt() == dayIndex) {
          return d;
        }
      }
      // 兜底：按位置
      int idx = dayIndex - 1;
      if (idx >= 0 && idx < daysNode.size()) {
        return daysNode.get(idx);
      }
      return null;
    } catch (JsonProcessingException e) {
      return null;
    }
  }

  /**
   * 提取目标节点的 JSON 快照（审计用）。
   */
  private String extractNodeOriginalJson(ItineraryTask task, int dayIndex, int itemIndex) {
    try {
      JsonNode dayNode = resolveScheduleNode(task, dayIndex);
      if (dayNode == null) {
        return "{}";
      }
      JsonNode scheduleNode = dayNode.get("schedule");
      if (scheduleNode == null || !scheduleNode.isArray()
          || itemIndex < 0 || itemIndex >= scheduleNode.size()) {
        return "{}";
      }
      return objectMapper.writeValueAsString(scheduleNode.get(itemIndex));
    } catch (JsonProcessingException e) {
      return "{}";
    }
  }

  /**
   * 实体 → 响应 DTO 映射。
   */
  private NodeRevisionResponse toNodeRevisionResponse(NodeRevision rev) {
    boolean transportCorrected = rev.getTransportMode() != null
        || rev.getTransportDuration() != null
        || rev.getTransportDesc() != null;
    return NodeRevisionResponse.builder()
        .id(rev.getId())
        .dayIndex(rev.getDayIndex())
        .itemIndex(rev.getItemIndex())
        .correctedLat(rev.getCorrectedLat())
        .correctedLng(rev.getCorrectedLng())
        .transportMode(rev.getTransportMode() != null ? rev.getTransportMode().getCode() : null)
        .transportDuration(rev.getTransportDuration())
        .transportDesc(rev.getTransportDesc())
        .originalJson(rev.getOriginalJson())
        .transportCorrected(transportCorrected)
        .updatedAt(rev.getUpdatedAt())
        .build();
  }

  /**
   * 任务 ID 安全日志输出（null 保护）。
   */
  private String taskIdLog(ItineraryTask task) {
    return task != null ? task.getId() : "null";
  }
}
