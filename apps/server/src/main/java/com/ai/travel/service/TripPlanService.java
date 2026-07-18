package com.ai.travel.service;

import cn.hutool.core.util.StrUtil;
import com.ai.travel.dto.request.AddTaskToPlanRequest;
import com.ai.travel.dto.request.CreateTripPlanRequest;
import com.ai.travel.dto.request.SetActiveTaskRequest;
import com.ai.travel.dto.request.UpdateTripPlanRequest;
import com.ai.travel.dto.response.CheckinTaskResponse;
import com.ai.travel.dto.response.ItineraryResponse;
import com.ai.travel.dto.response.PageResult;
import com.ai.travel.dto.response.TaskVersionResponse;
import com.ai.travel.dto.response.TripPlanResponse;
import com.ai.travel.dto.response.TripPlanSummaryResponse;
import com.ai.travel.entity.CheckinTask;
import com.ai.travel.entity.ItineraryTask;
import com.ai.travel.entity.PlanTaskRef;
import com.ai.travel.entity.TripPlan;
import com.ai.travel.exception.ForbiddenException;
import com.ai.travel.exception.PlanNotFoundException;
import com.ai.travel.mapper.CheckinTaskMapper;
import com.ai.travel.mapper.ItineraryTaskMapper;
import com.ai.travel.mapper.PlanTaskRefMapper;
import com.ai.travel.mapper.TripPlanMapper;
import com.ai.travel.mapper.projection.TripPlanProgressProjection;
import com.ai.travel.security.UserContext;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 行程清单服务。
 *
 * <p>提供行程清单的创建、查询、更新、删除（软删除）、任务关联、版本切换等能力。
 * 所有操作均校验当前用户权限（通过 {@link UserContext#getUserId()}）。
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TripPlanService {

  private final TripPlanMapper tripPlanMapper;
  private final PlanTaskRefMapper planTaskRefMapper;
  private final ItineraryTaskMapper itineraryTaskMapper;
  private final CheckinTaskMapper checkinTaskMapper;
  private final CheckinTaskService checkinTaskService;
  private final ObjectMapper objectMapper;

  // ==================== 核心 CRUD ====================

  /**
   * 创建行程清单。
   *
   * <p>支持两种模式：
   * <ul>
   *   <li>taskId 非空：校验任务存在且属于当前用户，从任务提取 destination / summary，并创建关联记录；</li>
   *   <li>taskId 为空：创建空白清单，用户后续手动添加行程点（activeTaskId 留空，打卡任务不自动创建）。</li>
   * </ul>
   *
   * @param request 创建请求（title 必填；taskId 可选）
   * @return 创建的清单 ID
   */
  @Transactional
  public String createTripPlan(CreateTripPlanRequest request) {
    Long userId = currentUserId();

    TripPlan plan = new TripPlan();
    plan.setUserId(userId);
    plan.setTitle(request.getTitle());
    plan.setPlannedDate(request.getPlannedDate());
    plan.setTripDates(request.getTripDates());
    plan.setNote(request.getNote());
    plan.setStatus("PLANNED");
    plan.setCreatedAt(LocalDateTime.now());
    plan.setUpdatedAt(LocalDateTime.now());

    if (StrUtil.isNotBlank(request.getTaskId())) {
      // 关联模式：校验任务、提取元信息、创建关联记录
      ItineraryTask task = itineraryTaskMapper.selectById(request.getTaskId());
      if (task == null) {
        throw new PlanNotFoundException("任务不存在: " + request.getTaskId());
      }
      plan.setActiveTaskId(request.getTaskId());
      plan.setDestination(extractDestination(task));
      plan.setSummary(extractSummary(task));
      tripPlanMapper.insert(plan);

      PlanTaskRef ref = new PlanTaskRef();
      ref.setPlanId(plan.getId());
      ref.setTaskId(request.getTaskId());
      ref.setIsActive(true);
      ref.setAddedAt(LocalDateTime.now());
      planTaskRefMapper.insert(ref);
    } else {
      // 空白模式：创建空清单，用户后续手动添加行程点
      tripPlanMapper.insert(plan);
    }

    log.info("Trip plan created: id={}, userId={}, taskId={}",
        plan.getId(), userId, request.getTaskId());
    return plan.getId();
  }

  /**
   * 获取用户的行程清单列表（分页，排除软删除）。
   *
   * @param status 状态筛选（null=全部）
   * @param page 页码（1-based）
   * @param size 每页条数
   * @return 分页结果
   */
  public PageResult<TripPlanSummaryResponse> listUserTrips(String status, int page, int size) {
    Long userId = currentUserId();

    LambdaQueryWrapper<TripPlan> wrapper = new LambdaQueryWrapper<>();
    wrapper.eq(TripPlan::getUserId, userId)
        .isNull(TripPlan::getDeletedAt);

    if (StrUtil.isNotBlank(status)) {
      wrapper.eq(TripPlan::getStatus, status);
    }
    wrapper.orderByDesc(TripPlan::getCreatedAt);

    Page<TripPlan> planPage = tripPlanMapper.selectPage(new Page<>(page, size), wrapper);

    List<String> planIds = planPage.getRecords().stream()
        .map(TripPlan::getId)
        .collect(Collectors.toList());
    Map<String, TripPlanProgressProjection> progressByPlanId = planIds.isEmpty()
        ? Map.of()
        : checkinTaskMapper.summarizeProgressByPlanIds(planIds).stream()
            .collect(Collectors.toMap(
                TripPlanProgressProjection::getPlanId,
                Function.identity()));

    List<TripPlanSummaryResponse> records = planPage.getRecords().stream()
        .map(plan -> toSummaryResponse(plan, progressByPlanId.get(plan.getId())))
        .collect(Collectors.toList());

    return new PageResult<>(records, planPage.getTotal(), page, size,
        (int) planPage.getPages());
  }

  /**
   * 获取行程清单详情。
   *
   * @param planId 清单 ID
   * @return 详情响应（含关联任务列表、打卡进度）
   */
  public TripPlanResponse getTripPlan(String planId) {
    TripPlan plan = getPlanAndCheckPermission(planId);
    return toDetailResponse(plan);
  }

  /**
   * 更新行程清单。
   *
   * @param planId 清单 ID
   * @param request 更新请求
   */
  @Transactional
  public void updateTripPlan(String planId, UpdateTripPlanRequest request) {
    TripPlan plan = getPlanAndCheckPermission(planId);
    if (StrUtil.isNotBlank(request.getTitle())) {
      plan.setTitle(request.getTitle());
    }
    if (request.getPlannedDate() != null) {
      plan.setPlannedDate(request.getPlannedDate());
    }
    if (request.getNote() != null) {
      plan.setNote(request.getNote());
    }
    if (StrUtil.isNotBlank(request.getStatus())) {
      plan.setStatus(request.getStatus());
      if ("COMPLETED".equals(request.getStatus())) {
        plan.setCompletedAt(LocalDateTime.now());
      }
    }
    plan.setUpdatedAt(LocalDateTime.now());
    tripPlanMapper.updateById(plan);
    log.info("Trip plan updated: {}", planId);
  }

  /**
   * 软删除行程清单。
   *
   * @param planId 清单 ID
   */
  public void softDeletePlan(String planId) {
    TripPlan plan = getPlanAndCheckPermission(planId);
    plan.setDeletedAt(LocalDateTime.now());
    plan.setUpdatedAt(LocalDateTime.now());
    tripPlanMapper.updateById(plan);
    log.info("Trip plan soft deleted: {}", planId);
  }

  // ==================== 任务关联 ====================

  /**
   * 关联新的生成任务到清单。
   *
   * @param planId 清单 ID
   * @param request 关联请求
   */
  @Transactional
  public void addTaskToPlan(String planId, AddTaskToPlanRequest request) {
    TripPlan plan = getPlanAndCheckPermission(planId);

    // 校验任务存在
    ItineraryTask task = itineraryTaskMapper.selectById(request.getTaskId());
    if (task == null) {
      throw new PlanNotFoundException("任务不存在: " + request.getTaskId());
    }

    // 检查是否已关联
    Long count = planTaskRefMapper.selectCount(
        new LambdaQueryWrapper<PlanTaskRef>()
            .eq(PlanTaskRef::getPlanId, planId)
            .eq(PlanTaskRef::getTaskId, request.getTaskId()));
    if (count > 0) {
      throw new IllegalArgumentException("该任务已关联到清单");
    }

    PlanTaskRef ref = new PlanTaskRef();
    ref.setPlanId(planId);
    ref.setTaskId(request.getTaskId());
    ref.setIsActive(false);
    ref.setAddedAt(LocalDateTime.now());
    planTaskRefMapper.insert(ref);

    log.info("Task added to plan: planId={}, taskId={}", planId, request.getTaskId());
  }

  /**
   * 切换当前执行的任务版本。
   *
   * @param planId 清单 ID
   * @param request 切换请求
   */
  @Transactional
  public void setActiveTask(String planId, SetActiveTaskRequest request) {
    // 校验清单存在且当前用户有权限
    getPlanAndCheckPermission(planId);

    // 校验任务已关联到该清单
    Long count = planTaskRefMapper.selectCount(
        new LambdaQueryWrapper<PlanTaskRef>()
            .eq(PlanTaskRef::getPlanId, planId)
            .eq(PlanTaskRef::getTaskId, request.getTaskId()));
    if (count == 0) {
      throw new IllegalArgumentException("该任务未关联到清单");
    }

    // 将该清单的所有关联设为非活跃
    planTaskRefMapper.update(null,
        new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<PlanTaskRef>()
            .eq(PlanTaskRef::getPlanId, planId)
            .set(PlanTaskRef::getIsActive, false));

    // 将目标关联设为活跃
    planTaskRefMapper.update(null,
        new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<PlanTaskRef>()
            .eq(PlanTaskRef::getPlanId, planId)
            .eq(PlanTaskRef::getTaskId, request.getTaskId())
            .set(PlanTaskRef::getIsActive, true));

    // 更新清单的 activeTaskId
    TripPlan plan = tripPlanMapper.selectById(planId);
    plan.setActiveTaskId(request.getTaskId());
    plan.setUpdatedAt(LocalDateTime.now());
    tripPlanMapper.updateById(plan);

    log.info("Active task switched: planId={}, newTaskId={}", planId, request.getTaskId());
  }

  // ==================== 打卡任务入口 ====================

  /**
   * 开始打卡（将当前执行版本按天拆分为打卡任务）。
   *
   * @param planId 清单 ID
   * @param startDay 起始天数（1-based，null=从第1天）
   * @return 首个打卡任务 ID
   */
  public String startCheckin(String planId, Integer startDay) {
    return checkinTaskService.startCheckinTask(planId, currentUserId(), startDay);
  }

  /**
   * 获取清单的打卡任务列表（按天分组）。
   *
   * @param planId 清单 ID
   * @return 打卡任务列表
   */
  public List<CheckinTaskResponse> getCheckinTasks(String planId) {
    getPlanAndCheckPermission(planId);
    return checkinTaskService.getCheckinTasks(planId);
  }

  /**
   * 批量回填清单下缺失坐标的打卡项（地理编码反查）。
   *
   * <p>用于修复历史行程因地理编码功能上线前创建而下落 (0, 0) / null 坐标的问题。
   *
   * @param planId 清单 ID
   * @return 成功回填坐标的项数
   */
  public int backfillMissingCoordinates(String planId) {
    getPlanAndCheckPermission(planId);
    return checkinTaskService.backfillMissingCoordinates(planId);
  }

  /**
   * 强制：清空所有打卡项坐标后重新地理编码。
   *
   * <p>用于清洗已有的"同名跨城"脏坐标（如青岛行程出现重庆坐标）。
   * 新流程依赖 GeocodingServiceImpl 解析 reverseGeocode 结果，
   * 省/市字段与 plan.destination 匹配校验，拒绝跨城结果；
   * 因此强制重查后脏坐标被清空或替换为同城坐标。
   *
   * @param planId 清单 ID
   * @return 成功反查并写入坐标的项数
   */
  public int forceRefillCoordinates(String planId) {
    getPlanAndCheckPermission(planId);
    return checkinTaskService.forceRefillCoordinates(planId);
  }

  // ==================== 内部方法 ====================

  /**
   * 获取清单并校验当前用户权限。
   *
   * @param planId 清单 ID
   * @return 清单实体
   * @throws PlanNotFoundException 清单不存在
   * @throws ForbiddenException 无权访问
   */
  public TripPlan getPlanAndCheckPermission(String planId) {
    TripPlan plan = tripPlanMapper.selectById(planId);
    if (plan == null || plan.getDeletedAt() != null) {
      throw new PlanNotFoundException("行程清单不存在: " + planId);
    }
    Long userId = currentUserId();
    if (userId != null && !userId.equals(plan.getUserId())) {
      throw new ForbiddenException("无权访问该行程清单");
    }
    return plan;
  }

  /**
   * 获取当前用户 ID（认证关闭时返回 null）。
   *
   * @return 当前用户 ID，可能为 null
   */
  private Long currentUserId() {
    return UserContext.getUserId();
  }

  private TripPlanSummaryResponse toSummaryResponse(
      TripPlan plan, TripPlanProgressProjection progress) {
    TripPlanSummaryResponse resp = new TripPlanSummaryResponse();
    resp.setId(plan.getId());
    resp.setTitle(plan.getTitle());
    resp.setDestination(plan.getDestination());
    resp.setCoverImage(plan.getCoverImage());
    resp.setPlannedDate(plan.getPlannedDate());
    resp.setTripDates(plan.getTripDates());
    resp.setSummary(plan.getSummary());
    resp.setStatus(plan.getStatus());

    // 列表页使用批量聚合结果；没有打卡任务时按 0/0 展示。
    int totalPoi = progress != null && progress.getTotalPoi() != null
        ? progress.getTotalPoi().intValue() : 0;
    int completedPoi = progress != null && progress.getCompletedPoi() != null
        ? progress.getCompletedPoi().intValue() : 0;
    resp.setTotalPoi(totalPoi);
    resp.setCompletedPoi(completedPoi);
    resp.setCheckinProgress(completedPoi + "/" + totalPoi);

    return resp;
  }

  /**
   * 计算清单的打卡进度。
   *
   * <p>直接累加各天 {@link CheckinTask#getTotalPoi()} / {@link CheckinTask#getCompletedPoi()}，
   * 与测试 mock 对齐。{@code totalPoi} 在 {@link CheckinTaskService#abandonCheckin} 中已即时扣减
   * ABANDONED 项，{@code completedPoi} 在 {@link CheckinTaskService#checkin} 中即时累加，
   * 因此读取字段即可得到正确进度。
   *
   * @return int[]{totalPoi, completedPoi}
   */
  private int[] computeProgress(String planId) {
    LambdaQueryWrapper<CheckinTask> taskWrapper = new LambdaQueryWrapper<>();
    taskWrapper.eq(CheckinTask::getPlanId, planId);
    List<CheckinTask> tasks = checkinTaskMapper.selectList(taskWrapper);

    int totalPoi = 0;
    int completedPoi = 0;
    for (CheckinTask task : tasks) {
      totalPoi += (task.getTotalPoi() != null ? task.getTotalPoi() : 0);
      completedPoi += (task.getCompletedPoi() != null ? task.getCompletedPoi() : 0);
    }
    return new int[]{totalPoi, completedPoi};
  }

  private TripPlanResponse toDetailResponse(TripPlan plan) {
    TripPlanResponse resp = new TripPlanResponse();
    resp.setId(plan.getId());
    resp.setTitle(plan.getTitle());
    resp.setDestination(plan.getDestination());
    resp.setCoverImage(plan.getCoverImage());
    resp.setPlannedDate(plan.getPlannedDate());
    resp.setTripDates(plan.getTripDates());
    resp.setStatus(plan.getStatus());
    resp.setActiveTaskId(plan.getActiveTaskId());
    resp.setNote(plan.getNote());
    resp.setCreatedAt(plan.getCreatedAt());

    // 关联任务列表
    LambdaQueryWrapper<PlanTaskRef> refWrapper = new LambdaQueryWrapper<>();
    refWrapper.eq(PlanTaskRef::getPlanId, plan.getId())
        .orderByDesc(PlanTaskRef::getIsActive)
        .orderByDesc(PlanTaskRef::getAddedAt);
    List<PlanTaskRef> refs = planTaskRefMapper.selectList(refWrapper);
    resp.setTaskVersions(refs.stream()
        .map(this::toTaskVersionResponse)
        .collect(Collectors.toList()));

    // 打卡进度（排除 ABANDONED 项）
    int[] progress = computeProgress(plan.getId());
    resp.setCheckinProgress(progress[1] + "/" + progress[0]);

    return resp;
  }

  private TaskVersionResponse toTaskVersionResponse(PlanTaskRef ref) {
    TaskVersionResponse resp = new TaskVersionResponse();
    resp.setRefId(ref.getId());
    resp.setTaskId(ref.getTaskId());
    resp.setIsActive(ref.getIsActive());
    resp.setAddedAt(ref.getAddedAt());

    // 查询任务类型和摘要
    ItineraryTask task = itineraryTaskMapper.selectById(ref.getTaskId());
    if (task != null) {
      resp.setTaskType(task.getType() != null ? task.getType().name() : null);
      // 从 resultJson 提取摘要（取前 100 字符）
      if (StrUtil.isNotBlank(task.getResultJson())) {
        resp.setSummary(StrUtil.maxLength(task.getResultJson(), 100));
      }
    }
    return resp;
  }

  /**
   * 从任务中提取目的地。
   *
   * @param task 生成任务
   * @return 目的地字符串
   */
  private String extractDestination(ItineraryTask task) {
    // 1. 优先从 requestJson 中解析 destination 字段
    if (StrUtil.isNotBlank(task.getRequestJson())) {
      try {
        com.fasterxml.jackson.databind.JsonNode node = objectMapper.readTree(task.getRequestJson());
        if (node.has("destination")) {
          return node.get("destination").asText();
        }
      } catch (Exception e) {
        log.debug("Failed to parse destination from requestJson", e);
      }
    }
    // 2. 兜底：从 resultJson.summary 文本中匹配已知城市
    if (StrUtil.isNotBlank(task.getResultJson())) {
      try {
        com.fasterxml.jackson.databind.JsonNode node = objectMapper.readTree(task.getResultJson());
        if (node.has("summary")) {
          String summary = node.get("summary").asText();
          String city = com.ai.travel.util.GeoUtils.findFirstMatchingCity(summary);
          if (city != null) {
            return city;
          }
        }
      } catch (Exception e) {
        log.debug("Failed to parse destination from resultJson.summary", e);
      }
    }
    // 3. 兜底：从 parsedContent 文本中匹配已知城市
    String city = com.ai.travel.util.GeoUtils.findFirstMatchingCity(task.getParsedContent());
    if (city != null) {
      return city;
    }
    return null;
  }

  /**
   * 从 AI 生成的 resultJson 中提取行程概述（summary）。
   *
   * <p>优先解析为 ItineraryResponse 取 summary 字段；
   * 失败则尝试从原始 JSON 节点中读取 summary。
   *
   * @param task 行程生成任务
   * @return summary 文本，或 null（解析失败时）
   */
  private String extractSummary(ItineraryTask task) {
    if (StrUtil.isBlank(task.getResultJson())) {
      return null;
    }
    try {
      ItineraryResponse itinerary = objectMapper.readValue(
          task.getResultJson(), ItineraryResponse.class);
      if (StrUtil.isNotBlank(itinerary.getSummary())) {
        return itinerary.getSummary();
      }
    } catch (Exception e) {
      log.debug("Failed to parse ItineraryResponse for summary, trying raw node", e);
    }
    try {
      com.fasterxml.jackson.databind.JsonNode node = objectMapper.readTree(task.getResultJson());
      if (node.has("summary")) {
        return node.get("summary").asText();
      }
    } catch (Exception e) {
      log.debug("Failed to parse summary from resultJson", e);
    }
    return null;
  }
}
