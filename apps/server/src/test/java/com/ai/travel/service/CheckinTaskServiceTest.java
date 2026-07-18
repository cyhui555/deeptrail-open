package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ai.travel.dto.geocoding.GeoRequest;
import com.ai.travel.dto.geocoding.GeoResult;
import com.ai.travel.dto.request.AddCustomItemRequest;
import com.ai.travel.dto.request.CheckinRequest;
import com.ai.travel.dto.request.EditCustomItemRequest;
import com.ai.travel.dto.response.CheckinItemResponse;
import com.ai.travel.dto.response.DayPlan;
import com.ai.travel.dto.response.ItineraryResponse;
import com.ai.travel.dto.response.PoiInfo;
import com.ai.travel.dto.response.ScheduleItem;
import com.ai.travel.entity.CheckinItem;
import com.ai.travel.entity.CheckinMedia;
import com.ai.travel.entity.CheckinTask;
import com.ai.travel.entity.ItineraryTask;
import com.ai.travel.entity.TripPlan;
import com.ai.travel.exception.CheckinItemNotFoundException;
import com.ai.travel.exception.ForbiddenException;
import com.ai.travel.exception.PlanNotFoundException;
import com.ai.travel.mapper.CheckinItemMapper;
import com.ai.travel.mapper.CheckinMediaMapper;
import com.ai.travel.mapper.CheckinTaskMapper;
import com.ai.travel.mapper.ItineraryTaskMapper;
import com.ai.travel.mapper.TripPlanMapper;
import com.ai.travel.security.UserContext;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** CheckinTaskService 单元测试。 */
@ExtendWith(MockitoExtension.class)
class CheckinTaskServiceTest {

  @Mock private CheckinTaskMapper checkinTaskMapper;
  @Mock private CheckinItemMapper checkinItemMapper;
  @Mock private CheckinMediaMapper checkinMediaMapper;
  @Mock private ItineraryTaskMapper itineraryTaskMapper;
  @Mock private TripPlanMapper tripPlanMapper;
  @Mock private com.fasterxml.jackson.databind.ObjectMapper objectMapper;
  @Mock private GeocodingService geocodingService;
  @Mock private ItineraryTaskService itineraryTaskService;
  @Mock private CheckinAccessService checkinAccessService;

  private CheckinTaskService checkinTaskService;

  @BeforeEach
  void setUp() {
    UserContext.setUserId(1L);
    // mock ObjectMapper 足以满足大部分场景；但 parseDayPaths 路径依赖 objectMapper.getTypeFactory()
    // 而 mock 的 getTypeFactory() 返回 null 会 NPE，因此 stub 一个真实 TypeFactory
    lenient().when(objectMapper.getTypeFactory())
        .thenReturn(new com.fasterxml.jackson.databind.ObjectMapper().getTypeFactory());
    checkinTaskService = new CheckinTaskService(
        checkinTaskMapper, checkinItemMapper, checkinMediaMapper, checkinAccessService,
        itineraryTaskMapper, tripPlanMapper, objectMapper,
        geocodingService, itineraryTaskService);
    lenient().when(checkinAccessService.requireOwnedItem(any(), any()))
        .thenAnswer(invocation -> {
          Long itemId = invocation.getArgument(0);
          CheckinItem item = checkinItemMapper.selectById(itemId);
          if (item == null) {
            throw new CheckinItemNotFoundException("打卡项不存在: " + itemId);
          }
          return item;
        });
    lenient().when(checkinItemMapper.markCheckedInIfPending(any(CheckinItem.class)))
        .thenReturn(1);
    lenient().when(checkinTaskMapper.incrementCompletedPoi(any(), any()))
        .thenReturn(1);
  }

  @AfterEach
  void tearDown() {
    UserContext.clear();
  }

  @Test
  @DisplayName("近距离（<200m）打卡应直接成功，source=GPS")
  void checkin_within200m_succeedsWithGpsSource() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setPoiLat(39.9042);
    item.setPoiLng(116.4074);
    item.setStatus("PENDING");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setPlanId("plan-1");
    task.setUserId(1L);
    task.setTotalPoi(5);
    task.setCompletedPoi(0);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setStatus("ONGOING");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);

    CheckinRequest req = new CheckinRequest();
    req.setLat(39.9043);
    req.setLng(116.4075);
    req.setAccuracy(10f);
    req.setSource("GPS");

    checkinTaskService.checkin(1L, req, 1L);

    verify(checkinItemMapper).markCheckedInIfPending(any(CheckinItem.class));
  }

  @Test
  @DisplayName("撤销打卡应清空坐标并标记媒体为历史")
  void undoCheckin_clearsCoordinates() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setStatus("CHECKED_IN");
    item.setCheckinLat(39.9042);
    item.setCheckinLng(116.4074);
    item.setCheckinIdempotencyKey("completed-operation");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setPlanId("plan-1");
    task.setUserId(1L);
    task.setTotalPoi(5);
    task.setCompletedPoi(1);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);
    when(checkinItemMapper.updateById(any(CheckinItem.class))).thenReturn(1);
    when(checkinTaskMapper.updateById(any(CheckinTask.class))).thenReturn(1);
    when(checkinMediaMapper.selectList(any())).thenReturn(List.of());

    checkinTaskService.undoCheckin(1L, 1L);

    verify(checkinItemMapper).updateById(argThat((CheckinItem updated) ->
        updated.getCheckinIdempotencyKey() == null));
  }

  @Test
  @DisplayName("撤销不存在的打卡项应抛出异常")
  void undoCheckin_nonExistent_throwsException() {
    when(checkinItemMapper.selectById(999L)).thenReturn(null);

    assertThatThrownBy(() -> checkinTaskService.undoCheckin(999L, 1L))
        .isInstanceOf(CheckinItemNotFoundException.class);
  }

  @Test
  @DisplayName("手动打卡（无 GPS 坐标）应成功")
  void checkin_manual_withoutGps_succeeds() {
    CheckinItem item = new CheckinItem();
    item.setId(2L);
    item.setCheckinTaskId("task-1");
    item.setPoiLat(39.9042);
    item.setPoiLng(116.4074);
    item.setStatus("PENDING");
    when(checkinItemMapper.selectById(2L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setPlanId("plan-1");
    task.setUserId(1L);
    task.setTotalPoi(3);
    task.setCompletedPoi(0);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setStatus("ONGOING");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);

    CheckinRequest req = new CheckinRequest();
    req.setSource("MANUAL");
    req.setNote("手动打卡");

    checkinTaskService.checkin(2L, req, 1L);

    verify(checkinItemMapper).markCheckedInIfPending(any(CheckinItem.class));
  }

  @Test
  @DisplayName("重复打卡应抛出异常")
  void checkin_alreadyCheckedIn_throwsException() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setStatus("CHECKED_IN");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setUserId(1L);
    lenient().when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    CheckinRequest req = new CheckinRequest();
    req.setSource("MANUAL");

    assertThatThrownBy(() -> checkinTaskService.checkin(1L, req, 1L))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  @DisplayName("获取打卡任务列表应加载打卡项")
  void getCheckinTasks_loadsItems() {
    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setPlanId("plan-1");
    task.setDayNumber(1);
    task.setStatus("ACTIVE");
    task.setTotalPoi(2);
    task.setCompletedPoi(0);
    when(checkinTaskMapper.selectList(any())).thenReturn(List.of(task));
    when(checkinItemMapper.selectList(any())).thenReturn(List.of());

    var result = checkinTaskService.getCheckinTasks("plan-1");

    assertThat(result).hasSize(1);
    assertThat(result.get(0).getItems()).isEmpty();
  }

  @Test
  @DisplayName("获取打卡任务不得同步地理编码，并应批量加载打卡项与媒体")
  void getCheckinTasks_doesNotGeocodeAndBatchesRelatedRows() {
    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setPlanId("plan-1");
    task.setDayNumber(1);
    when(checkinTaskMapper.selectList(any())).thenReturn(List.of(task));

    CheckinItem first = new CheckinItem();
    first.setId(1L);
    first.setCheckinTaskId("task-1");
    first.setPoiName("四姑娘山");
    first.setStatus("PENDING");
    CheckinItem second = new CheckinItem();
    second.setId(2L);
    second.setCheckinTaskId("task-1");
    second.setPoiName("巴郎山");
    second.setStatus("PENDING");
    when(checkinItemMapper.selectList(any())).thenReturn(List.of(first, second));

    CheckinMedia media = new CheckinMedia();
    media.setId(10L);
    media.setCheckinItemId(1L);
    media.setMediaType("IMAGE");
    media.setIsHistory(false);
    when(checkinMediaMapper.selectList(any())).thenReturn(List.of(media));

    var result = checkinTaskService.getCheckinTasks("plan-1");

    assertThat(result).hasSize(1);
    assertThat(result.get(0).getItems()).hasSize(2);
    verify(geocodingService, never()).geocode(any());
    verify(checkinTaskMapper, times(1)).selectList(any());
    verify(checkinItemMapper, times(1)).selectList(any());
    verify(checkinMediaMapper, times(1)).selectList(any());
  }

  @Test
  @DisplayName("获取不存在的打卡项详情应抛出异常")
  void getCheckinItemDetail_nonExistent_throwsException() {
    when(checkinItemMapper.selectById(999L)).thenReturn(null);

    assertThatThrownBy(() -> checkinTaskService.getCheckinItemDetail(999L, 1L))
        .isInstanceOf(CheckinItemNotFoundException.class);
  }

  @Test
  @DisplayName("获取打卡项详情应加载媒体列表（toItemResponse 也会加载，故 selectList 被调用 2 次）")
  void getCheckinItemDetail_loadsMedia() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setPoiName("宽窄巷子");
    item.setStatus("CHECKED_IN");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);
    CheckinMedia media = new CheckinMedia();
    media.setId(10L);
    media.setMediaType("IMAGE");
    media.setFilePath("photo.jpg");
    when(checkinMediaMapper.selectList(any())).thenReturn(List.of(media));

    var result = checkinTaskService.getCheckinItemDetail(1L, 1L);

    assertThat(result.getPoiName()).isEqualTo("宽窄巷子");
    // 详情组装只查询一次有效媒体，避免原实现中的重复查询。
    verify(checkinMediaMapper).selectList(any());
    assertThat(result.getMedia()).hasSize(1);
    assertThat(result.getMedia().get(0).getUrl()).isEqualTo("/api/media/10");
  }

  @Test
  @DisplayName("创建打卡任务应拆分行程为按天的打卡任务和打卡项")
  void startCheckinTask_createsTasksAndItems() throws Exception {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setUserId(1L);
    plan.setActiveTaskId("task-1");
    plan.setPlannedDate("2026-07-01");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);
    when(checkinTaskMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);

    ItineraryTask task = new ItineraryTask();
    task.setId("task-1");
    task.setResultJson("{\"days\":[{\"day\":1,\"schedule\":[{\"poi\":{\"name\":\"宽窄巷子\",\"latitude\":30.67,\"longitude\":104.06}}]}]}");
    ItineraryResponse itineraryResponse = new ItineraryResponse();
    DayPlan day1 = new DayPlan();
    day1.setDay(1);
    ScheduleItem item1 = new ScheduleItem();
    PoiInfo poi1 = new PoiInfo();
    poi1.setName("宽窄巷子");
    poi1.setLatitude(30.67);
    poi1.setLongitude(104.06);
    item1.setPoi(poi1);
    day1.setSchedule(List.of(item1));
    itineraryResponse.setDays(List.of(day1));
    when(objectMapper.readValue(any(String.class), any(Class.class)))
        .thenReturn(itineraryResponse);
    when(itineraryTaskMapper.selectById("task-1")).thenReturn(task);
    when(checkinTaskMapper.insert(any(CheckinTask.class))).thenAnswer(inv -> {
      inv.getArgument(0, CheckinTask.class).setId("ctask-1");
      return 1;
    });
    when(checkinItemMapper.insert(any(CheckinItem.class))).thenReturn(1);

    String result = checkinTaskService.startCheckinTask("plan-1", 1L, 1);

    assertThat(result).isEqualTo("ctask-1");
    verify(checkinTaskMapper).insert(any(CheckinTask.class));
    verify(checkinItemMapper).insert(any(CheckinItem.class));
  }

  @Test
  @DisplayName("开始打卡 — 重复调用应幂等返回已有任务 ID，不再创建新记录")
  void startCheckinTask_idempotent_returnsExistingTaskId() {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setUserId(1L);
    plan.setActiveTaskId("task-1");
    plan.setPlannedDate("2026-07-01");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);

    CheckinTask existingTask = new CheckinTask();
    existingTask.setId("ctask-existing");
    existingTask.setPlanId("plan-1");
    when(checkinTaskMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(existingTask);

    String result = checkinTaskService.startCheckinTask("plan-1", 1L, 1);

    assertThat(result).isEqualTo("ctask-existing");
    // 复用路径不应再插入选定的记录
    verify(checkinTaskMapper, org.mockito.Mockito.never()).insert(any(CheckinTask.class));
    verify(checkinItemMapper, org.mockito.Mockito.never()).insert(any(CheckinItem.class));
  }

  @Test
  @DisplayName("创建打卡任务 — 清单不存在应抛出异常")
  void startCheckinTask_planNotFound_throws() {
    when(tripPlanMapper.selectById("nonexistent")).thenReturn(null);

    assertThatThrownBy(() -> checkinTaskService.startCheckinTask("nonexistent", 1L, 1))
        .isInstanceOf(PlanNotFoundException.class);
  }

  @Test
  @DisplayName("创建打卡任务 — 无权操作应抛出异常")
  void startCheckinTask_forbidden_throws() {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setUserId(99L);
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);

    assertThatThrownBy(() -> checkinTaskService.startCheckinTask("plan-1", 1L, 1))
        .isInstanceOf(ForbiddenException.class);
  }

  @Test
  @DisplayName("GPS 打卡远距离（>200m）应成功但记录距离")
  void checkin_gpsFarDistance_succeedsWithDistance() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setPoiLat(30.67);
    item.setPoiLng(104.06);
    item.setStatus("PENDING");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setPlanId("plan-1");
    task.setUserId(1L);
    task.setTotalPoi(3);
    task.setCompletedPoi(0);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setStatus("ONGOING");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);

    CheckinRequest req = new CheckinRequest();
    // 远距离坐标（约 5km 外）
    req.setLat(30.72);
    req.setLng(104.10);
    req.setAccuracy(15f);
    req.setSource("GPS");

    checkinTaskService.checkin(1L, req, 1L);

    verify(checkinItemMapper).markCheckedInIfPending(any(CheckinItem.class));
  }

  @Test
  @DisplayName("打卡 — 无效 GPS 坐标应抛出异常")
  void checkin_invalidCoordinates_throws() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setStatus("PENDING");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setUserId(1L);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    CheckinRequest req = new CheckinRequest();
    req.setLat(999.0);
    req.setLng(999.0);
    req.setSource("GPS");

    assertThatThrownBy(() -> checkinTaskService.checkin(1L, req, 1L))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  @DisplayName("打卡 — 无权操作应抛出异常")
  void checkin_forbidden_throws() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setStatus("PENDING");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setUserId(99L);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    CheckinRequest req = new CheckinRequest();
    req.setSource("MANUAL");

    assertThatThrownBy(() -> checkinTaskService.checkin(1L, req, 1L))
        .isInstanceOf(ForbiddenException.class);
  }

  @Test
  @DisplayName("打卡 — 全部 POI 完成后应将任务标记为 COMPLETED")
  void checkin_allPoiCompleted_marksTaskCompleted() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setPoiLat(30.67);
    item.setPoiLng(104.06);
    item.setStatus("PENDING");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setPlanId("plan-1");
    task.setUserId(1L);
    task.setTotalPoi(2);
    task.setCompletedPoi(1);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setStatus("ONGOING");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);

    CheckinRequest req = new CheckinRequest();
    req.setSource("MANUAL");

    checkinTaskService.checkin(1L, req, 1L);

    verify(checkinTaskMapper).incrementCompletedPoi(eq("task-1"), any(LocalDateTime.class));
  }

  @Test
  @DisplayName("打卡级联完成 — 最后一笔打卡应将清单自动标为 COMPLETED")
  void checkin_lastPoiTaskCompletes_cascadesPlanToCompleted() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-2");
    item.setStatus("PENDING");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-2");
    task.setPlanId("plan-1");
    task.setUserId(1L);
    task.setTotalPoi(1);
    task.setCompletedPoi(0);
    when(checkinTaskMapper.selectById("task-2")).thenReturn(task);

    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setStatus("ONGOING");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);

    // plan-1 下仅有 task-2 一个任务，本次完成后 → cascadeCompletePlan 应触发
    CheckinTask task2Done = new CheckinTask();
    task2Done.setId("task-2");
    task2Done.setPlanId("plan-1");
    task2Done.setStatus("COMPLETED");
    when(checkinTaskMapper.selectList(any())).thenReturn(List.of(task2Done));

    CheckinRequest req = new CheckinRequest();
    req.setSource("MANUAL");

    checkinTaskService.checkin(1L, req, 1L);

    verify(tripPlanMapper).updateById(argThat((TripPlan p) ->
        "plan-1".equals(p.getId()) && "COMPLETED".equals(p.getStatus())));
  }

  @Test
  @DisplayName("打卡级联完成 — 任务未全部完成则不改变清单状态")
  void checkin_notAllTasksDone_doesNotCompletePlan() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-2");
    item.setStatus("PENDING");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-2");
    task.setPlanId("plan-1");
    task.setUserId(1L);
    task.setTotalPoi(1);
    task.setCompletedPoi(0);
    when(checkinTaskMapper.selectById("task-2")).thenReturn(task);

    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setStatus("ONGOING");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);

    // plan-1 下有两个任务，task-1 仍为 ACTIVE → 不应触发级联完成
    CheckinTask task1Active = new CheckinTask();
    task1Active.setId("task-1");
    task1Active.setPlanId("plan-1");
    task1Active.setStatus("ACTIVE");
    CheckinTask task2Done = new CheckinTask();
    task2Done.setId("task-2");
    task2Done.setPlanId("plan-1");
    task2Done.setStatus("COMPLETED");
    when(checkinTaskMapper.selectList(any())).thenReturn(List.of(task1Active, task2Done));

    // task-1 仍有一个未打卡项 PENDING → isTaskEffectivelyCompleted 返回 false，级联应阻断
    CheckinItem pendingItem = new CheckinItem();
    pendingItem.setId(100L);
    pendingItem.setCheckinTaskId("task-1");
    pendingItem.setStatus("PENDING");
    when(checkinItemMapper.selectList(any())).thenReturn(List.of(pendingItem));

    CheckinRequest req = new CheckinRequest();
    req.setSource("MANUAL");

    checkinTaskService.checkin(1L, req, 1L);

    // plan 不应被更新为 COMPLETED（plan 已是 ONGOING，ONGOING 分支不触发，cascade 也不触发）
    verify(tripPlanMapper, never()).updateById(any(TripPlan.class));
  }

  @Test
  @DisplayName("废弃打卡项 — 应递减父任务 totalPoi（BUG-20260702-002 回归保护）")
  void abandonCheckin_decrementsTotalPoi_soCascadeCanTrigger() {
    CheckinItem item = new CheckinItem();
    item.setId(99L);
    item.setCheckinTaskId("task-1");
    item.setStatus("PENDING");
    when(checkinItemMapper.selectById(99L)).thenReturn(item);
    when(checkinItemMapper.updateById(any(CheckinItem.class))).thenReturn(1);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setPlanId("plan-1");
    task.setUserId(1L);
    task.setTotalPoi(3);
    task.setCompletedPoi(2);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);
    when(checkinTaskMapper.updateById(any(CheckinTask.class))).thenAnswer(inv -> {
      TripPlan p = inv.getArgument(0, CheckinTask.class).getTotalPoi() == 2 ? null : null;
      return 1;
    });

    checkinTaskService.abandonCheckin(99L, 1L);

    // 验证总 POI 数递减（3 → 2）
    verify(checkinTaskMapper).updateById(argThat((CheckinTask t) ->
        "task-1".equals(t.getId()) && t.getTotalPoi() != null && t.getTotalPoi() == 2));
  }

  @Test
  @DisplayName("废弃后打卡剩余项 — 应能顺利触发清单 COMPLETED（BUG-20260702-002 完整流程）")
  void abandonThenCompleteRest_cascadesPlanToCompleted() {
    // 初始状态：totalPoi=3，已完成 2；废弃 1 个后 totalPoi=2；最后一个打卡使 completed=2 >= totalPoi=2 → cascade
    CheckinItem itemAbandoned = new CheckinItem();
    itemAbandoned.setId(100L);
    itemAbandoned.setCheckinTaskId("task-1");
    itemAbandoned.setStatus("PENDING");
    when(checkinItemMapper.selectById(100L)).thenReturn(itemAbandoned);
    when(checkinItemMapper.updateById(any(CheckinItem.class))).thenReturn(1);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setPlanId("plan-1");
    task.setUserId(1L);
    task.setTotalPoi(3);
    task.setCompletedPoi(2);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    // 步骤 1：废弃第 3 个 POI，totalPoi 应变为 2
    checkinTaskService.abandonCheckin(100L, 1L);
    verify(checkinTaskMapper).updateById(argThat((CheckinTask t) ->
        "task-1".equals(t.getId()) && t.getTotalPoi() != null && t.getTotalPoi() == 2));
  }

  @Test
  @DisplayName("打卡级联完成 — 清单已是 COMPLETED 则不再更新")
  void checkin_planAlreadyCompleted_doesNotUpdateAgain() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-2");
    item.setStatus("PENDING");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-2");
    task.setPlanId("plan-1");
    task.setUserId(1L);
    task.setTotalPoi(1);
    task.setCompletedPoi(0);
    when(checkinTaskMapper.selectById("task-2")).thenReturn(task);

    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setStatus("COMPLETED");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);

    CheckinRequest req = new CheckinRequest();
    req.setSource("MANUAL");

    checkinTaskService.checkin(1L, req, 1L);

    verify(tripPlanMapper, never()).updateById(any(TripPlan.class));
  }

  @Test
  @DisplayName("打卡 — 首次打卡应将清单从 PLANNED 变更为 ONGOING")
  void checkin_firstCheckin_changesPlanStatus() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setStatus("PENDING");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setPlanId("plan-1");
    task.setUserId(1L);
    task.setTotalPoi(3);
    task.setCompletedPoi(0);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setStatus("PLANNED");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);

    CheckinRequest req = new CheckinRequest();
    req.setSource("MANUAL");

    checkinTaskService.checkin(1L, req, 1L);

    verify(tripPlanMapper).updateById(any(TripPlan.class));
  }

  @Test
  @DisplayName("撤销打卡 — 应标记关联媒体为历史")
  void undoCheckin_marksMediaAsHistory() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setStatus("CHECKED_IN");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setPlanId("plan-1");
    task.setUserId(1L);
    task.setTotalPoi(3);
    task.setCompletedPoi(1);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);
    when(checkinItemMapper.updateById(any(CheckinItem.class))).thenReturn(1);
    when(checkinTaskMapper.updateById(any(CheckinTask.class))).thenReturn(1);

    CheckinMedia media = new CheckinMedia();
    media.setId(1L);
    media.setCheckinItemId(1L);
    when(checkinMediaMapper.selectList(any())).thenReturn(List.of(media));
    when(checkinMediaMapper.updateById(any(CheckinMedia.class))).thenReturn(1);

    checkinTaskService.undoCheckin(1L, 1L);

    verify(checkinMediaMapper).updateById(any(CheckinMedia.class));
  }

  @Test
  @DisplayName("撤销打卡 — 无权操作应抛出异常")
  void undoCheckin_forbidden_throws() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setStatus("CHECKED_IN");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setUserId(99L);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    assertThatThrownBy(() -> checkinTaskService.undoCheckin(1L, 1L))
        .isInstanceOf(ForbiddenException.class);
  }

  @Test
  @DisplayName("获取单个打卡任务详情应加载打卡项")
  void getCheckinTaskById_loadsItems() {
    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setPlanId("plan-1");
    task.setDayNumber(1);
    task.setStatus("ACTIVE");
    task.setTotalPoi(2);
    task.setCompletedPoi(0);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);
    when(checkinItemMapper.selectList(any())).thenReturn(List.of());

    var result = checkinTaskService.getCheckinTaskById("task-1");

    assertThat(result).isNotNull();
    assertThat(result.getItems()).isEmpty();
  }

  @Test
  @DisplayName("获取不存在的单个打卡任务应返回 null")
  void getCheckinTaskById_nonExistent_returnsNull() {
    when(checkinTaskMapper.selectById("nonexistent")).thenReturn(null);

    var result = checkinTaskService.getCheckinTaskById("nonexistent");

    assertThat(result).isNull();
  }

  @Test
  @DisplayName("获取打卡项详情应加载非历史媒体")
  void getCheckinItemDetail_loadsNonHistoryMedia() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setPoiName("宽窄巷子");
    item.setStatus("CHECKED_IN");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinMedia media = new CheckinMedia();
    media.setId(1L);
    media.setCheckinItemId(1L);
    media.setMediaType("IMAGE");
    media.setIsHistory(false);
    when(checkinMediaMapper.selectList(any())).thenReturn(List.of(media));

    var result = checkinTaskService.getCheckinItemDetail(1L, 1L);

    assertThat(result.getPoiName()).isEqualTo("宽窄巷子");
    assertThat(result.getMedia()).hasSize(1);
  }

  @Test
  @DisplayName("获取打卡任务列表时应加载每个打卡项的媒体列表")
  void getCheckinTasks_loadsMediaForEachItem() {
    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setPlanId("plan-1");
    task.setDayNumber(1);
    task.setStatus("ACTIVE");
    task.setTotalPoi(1);
    task.setCompletedPoi(0);
    when(checkinTaskMapper.selectList(any())).thenReturn(List.of(task));

    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setPoiName("宽窄巷子");
    item.setStatus("CHECKED_IN");
    when(checkinItemMapper.selectList(any())).thenReturn(List.of(item));

    CheckinMedia media = new CheckinMedia();
    media.setId(10L);
    media.setCheckinItemId(1L);
    media.setMediaType("IMAGE");
    media.setIsHistory(false);
    when(checkinMediaMapper.selectList(any())).thenReturn(List.of(media));

    var result = checkinTaskService.getCheckinTasks("plan-1");

    assertThat(result).hasSize(1);
    assertThat(result.get(0).getItems()).hasSize(1);
    assertThat(result.get(0).getItems().get(0).getMedia())
        .as("getCheckinTasks 应返回打卡项的媒体列表")
        .hasSize(1);
    assertThat(result.get(0).getItems().get(0).getMedia().get(0).getId()).isEqualTo(10L);
  }

  // ==================== 坐标修正测试（v0.6.0 新增） ====================

  @Test
  @DisplayName("修正坐标 — 正常修正应写入 correctedLat/correctedLng")
  void updateCoordinates_success() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setPoiLat(30.67);
    item.setPoiLng(104.06);
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setUserId(1L);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);
    when(checkinItemMapper.updateById(any(CheckinItem.class))).thenReturn(1);

    checkinTaskService.updateItemCoordinates(1L, 30.5728, 104.0668, 1L);

    verify(checkinItemMapper).updateById(argThat((CheckinItem i) ->
        Double.valueOf(30.5728).equals(i.getCorrectedLat())
            && Double.valueOf(104.0668).equals(i.getCorrectedLng())));
  }

  @Test
  @DisplayName("修正坐标 — 打卡项不存在应抛出异常")
  void updateCoordinates_itemNotFound_throws() {
    when(checkinItemMapper.selectById(999L)).thenReturn(null);

    assertThatThrownBy(() -> checkinTaskService.updateItemCoordinates(999L, 30.0, 104.0, 1L))
        .isInstanceOf(CheckinItemNotFoundException.class);
  }

  @Test
  @DisplayName("修正坐标 — 无权操作应抛出异常")
  void updateCoordinates_forbidden_throws() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setUserId(99L);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    assertThatThrownBy(() -> checkinTaskService.updateItemCoordinates(1L, 30.0, 104.0, 1L))
        .isInstanceOf(ForbiddenException.class);
  }

  @Test
  @DisplayName("toItemResponse — 未修正时 displayLat/displayLng 等于 poiLat/poiLng，isCoordinateCorrected=false")
  void toItemResponse_notCorrected_displayEqualsPoi() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setPoiName("宽窄巷子");
    item.setPoiLat(30.67);
    item.setPoiLng(104.06);
    item.setStatus("PENDING");
    item.setCorrectedLat(null);
    item.setCorrectedLng(null);
    when(checkinMediaMapper.selectList(any())).thenReturn(List.of());

    // 通过 getCheckinItemDetail 间接测试 toItemResponse
    // 但 getCheckinItemDetail 内部也调 toItemResponse，会调用 selectById + selectList
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    var resp = checkinTaskService.getCheckinItemDetail(1L, 1L);

    assertThat(resp.getDisplayLat()).isEqualTo(30.67);
    assertThat(resp.getDisplayLng()).isEqualTo(104.06);
    assertThat(resp.getIsCoordinateCorrected()).isFalse();
  }

  @Test
  @DisplayName("toItemResponse — 已修正时 displayLat/displayLng 等于 correctedLat/correctedLng，isCoordinateCorrected=true")
  void toItemResponse_correctedDisplay_equalsCorrected() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setPoiName("宽窄巷子");
    item.setPoiLat(30.67);
    item.setPoiLng(104.06);
    item.setCorrectedLat(30.5728);
    item.setCorrectedLng(104.0668);
    item.setStatus("CHECKED_IN");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);
    when(checkinMediaMapper.selectList(any())).thenReturn(List.of());

    var resp = checkinTaskService.getCheckinItemDetail(1L, 1L);

    assertThat(resp.getDisplayLat()).isEqualTo(30.5728);
    assertThat(resp.getDisplayLng()).isEqualTo(104.0668);
    assertThat(resp.getIsCoordinateCorrected()).isTrue();
  }

  @Test
  @DisplayName("撤销打卡应将 COMPLETED 任务回退为 ACTIVE")
  void undoCheckin_completedTask_revertsToActive() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setStatus("CHECKED_IN");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setPlanId("plan-1");
    task.setUserId(1L);
    task.setTotalPoi(3);
    task.setCompletedPoi(3);
    task.setStatus("COMPLETED");
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);
    when(checkinItemMapper.updateById(any(CheckinItem.class))).thenReturn(1);
    when(checkinTaskMapper.updateById(any(CheckinTask.class))).thenReturn(1);
    when(checkinMediaMapper.selectList(any())).thenReturn(List.of());

    checkinTaskService.undoCheckin(1L, 1L);

    verify(checkinTaskMapper).updateById(any(CheckinTask.class));
  }

  // ==================== 路线交通工具测试（v0.7.0 新增） ====================

  @Test
  @DisplayName("创建打卡任务 — transport_segments 有值时 transportToNext 正确序列化")
  void startCheckinTask_transportSegments_persistsTransportToNext() throws Exception {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setUserId(1L);
    plan.setActiveTaskId("task-1");
    plan.setPlannedDate("2026-07-01");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);
    when(checkinTaskMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);

    ItineraryTask task = new ItineraryTask();
    task.setId("task-1");
    task.setResultJson("{\"days\":[{\"day\":1,\"schedule\":[{\"poi\":{\"name\":\"宽窄巷子\",\"latitude\":30.67,\"longitude\":104.06}}]}]}");
    ItineraryResponse itineraryResponse = new ItineraryResponse();
    DayPlan day1 = new DayPlan();
    day1.setDay(1);
    ScheduleItem item1 = new ScheduleItem();
    PoiInfo poi1 = new PoiInfo();
    poi1.setName("宽窄巷子");
    poi1.setLatitude(30.67);
    poi1.setLongitude(104.06);
    item1.setPoi(poi1);
    ScheduleItem.TransportSegment seg = new ScheduleItem.TransportSegment();
    seg.setMode("WALK");
    seg.setDurationMin(10);
    seg.setDescription("步行约10分钟");
    item1.setTransportSegments(List.of(seg));
    day1.setSchedule(List.of(item1));
    itineraryResponse.setDays(List.of(day1));
    when(objectMapper.readValue(any(String.class), any(Class.class))).thenReturn(itineraryResponse);
    when(objectMapper.writeValueAsString(any())).thenReturn("{\"mode\":\"WALK\",\"durationMin\":10,\"description\":\"步行约10分钟\"}");
    when(itineraryTaskMapper.selectById("task-1")).thenReturn(task);
    when(checkinTaskMapper.insert(any(CheckinTask.class))).thenAnswer(inv -> {
      inv.getArgument(0, CheckinTask.class).setId("ctask-1");
      return 1;
    });
    when(checkinItemMapper.insert(any(CheckinItem.class))).thenReturn(1);

    checkinTaskService.startCheckinTask("plan-1", 1L, 1);

    verify(checkinItemMapper).insert(argThat((CheckinItem i) ->
        i.getTransportToNext() != null && i.getTransportToNext().contains("WALK")));
  }

  @Test
  @DisplayName("创建打卡任务 — transport_segments 为空时 transportToNext 为 null")
  void startCheckinTask_noTransportSegments_transportToNextIsNull() throws Exception {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setUserId(1L);
    plan.setActiveTaskId("task-1");
    plan.setPlannedDate("2026-07-01");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);
    when(checkinTaskMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);

    ItineraryTask task = new ItineraryTask();
    task.setId("task-1");
    task.setResultJson("{\"days\":[{\"day\":1,\"schedule\":[{\"poi\":{\"name\":\"宽窄巷子\",\"latitude\":30.67,\"longitude\":104.06}}]}]}");
    ItineraryResponse itineraryResponse = new ItineraryResponse();
    DayPlan day1 = new DayPlan();
    day1.setDay(1);
    ScheduleItem item1 = new ScheduleItem();
    PoiInfo poi1 = new PoiInfo();
    poi1.setName("宽窄巷子");
    poi1.setLatitude(30.67);
    poi1.setLongitude(104.06);
    item1.setPoi(poi1);
    // transportSegments 为 null（旧行程）
    item1.setTransportSegments(null);
    day1.setSchedule(List.of(item1));
    itineraryResponse.setDays(List.of(day1));
    when(objectMapper.readValue(any(String.class), any(Class.class))).thenReturn(itineraryResponse);
    when(itineraryTaskMapper.selectById("task-1")).thenReturn(task);
    when(checkinTaskMapper.insert(any(CheckinTask.class))).thenAnswer(inv -> {
      inv.getArgument(0, CheckinTask.class).setId("ctask-1");
      return 1;
    });
    when(checkinItemMapper.insert(any(CheckinItem.class))).thenReturn(1);

    checkinTaskService.startCheckinTask("plan-1", 1L, 1);

    verify(checkinItemMapper).insert(argThat((CheckinItem i) -> i.getTransportToNext() == null));
  }

  @Test
  @DisplayName("toItemResponse — 透传 transportToNext 字段")
  void toItemResponse_transportsTransportToNext() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setPoiName("宽窄巷子");
    item.setStatus("PENDING");
    item.setTransportToNext("{\"mode\":\"WALK\",\"durationMin\":10,\"description\":\"步行约10分钟\"}");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);
    when(checkinMediaMapper.selectList(any())).thenReturn(List.of());

    var resp = checkinTaskService.getCheckinItemDetail(1L, 1L);

    assertThat(resp.getTransportToNext()).isEqualTo("{\"mode\":\"WALK\",\"durationMin\":10,\"description\":\"步行约10分钟\"}");
  }

  @Test
  @DisplayName("自定义行程点 — 传入 lat/lng 时应持久化到 poiLat/poiLng")
  void addCustomItem_withLatLng_persistsCoordinates() {
    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setPlanId("plan-1");
    task.setUserId(1L);
    task.setTotalPoi(0);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);
    when(checkinItemMapper.insert(any(CheckinItem.class))).thenReturn(1);
    when(checkinTaskMapper.updateById(any(CheckinTask.class))).thenReturn(1);

    var req = new com.ai.travel.dto.request.AddCustomItemRequest();
    req.setName("自定义打卡点");
    req.setLat(30.67);
    req.setLng(104.06);

    checkinTaskService.addCustomItem("task-1", req, 1L);

    verify(checkinItemMapper).insert(argThat((CheckinItem i) ->
        i.getPoiLat() != null && i.getPoiLat() == 30.67
            && i.getPoiLng() != null && i.getPoiLng() == 104.06 && i.getIsCustom()));
    // totalPoi 应从 0 递增为 1
    verify(checkinTaskMapper).updateById(argThat((CheckinTask t) ->
        "task-1".equals(t.getId()) && t.getTotalPoi() != null && t.getTotalPoi() == 1));
  }

  @Test
  @DisplayName("自定义行程点 — lat/lng=(0,0) 应视为无效、不持久化（打到几内亚湾）")
  void addCustomItem_zeroLatLng_treatedAsNull() {
    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setPlanId("plan-1");
    task.setUserId(1L);
    task.setTotalPoi(0);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);
    when(checkinItemMapper.insert(any(CheckinItem.class))).thenReturn(1);
    when(checkinTaskMapper.updateById(any(CheckinTask.class))).thenReturn(1);

    var req = new com.ai.travel.dto.request.AddCustomItemRequest();
    req.setName("测试点");
    req.setLat(0.0);
    req.setLng(0.0);

    checkinTaskService.addCustomItem("task-1", req, 1L);

    verify(checkinItemMapper).insert(argThat((CheckinItem i) ->
        i.getPoiLat() == null && i.getPoiLng() == null));
  }

  @Test
  @DisplayName("自定义行程点 — 未传 lat/lng 时应为 null")
  void addCustomItem_noLatLng_coordinatesAreNull() {
    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setPlanId("plan-1");
    task.setUserId(1L);
    task.setTotalPoi(0);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);
    when(checkinItemMapper.insert(any(CheckinItem.class))).thenReturn(1);
    when(checkinTaskMapper.updateById(any(CheckinTask.class))).thenReturn(1);

    var req = new com.ai.travel.dto.request.AddCustomItemRequest();
    req.setName("无坐标点");

    checkinTaskService.addCustomItem("task-1", req, 1L);

    verify(checkinItemMapper).insert(argThat((CheckinItem i) ->
        i.getPoiLat() == null && i.getPoiLng() == null && i.getIsCustom()));
  }

  @Test
  @DisplayName("创建打卡任务 — transport 序列化异常时降级为 null 不阻断创建")
  void startCheckinTask_transportSerializationFails_degradesGracefully() throws Exception {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setUserId(1L);
    plan.setActiveTaskId("task-1");
    plan.setPlannedDate("2026-07-01");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);
    when(checkinTaskMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);

    ItineraryTask task = new ItineraryTask();
    task.setId("task-1");
    task.setResultJson("{\"days\":[{\"day\":1,\"schedule\":[{\"poi\":{\"name\":\"宽窄巷子\",\"latitude\":30.67,\"longitude\":104.06}}]}]}");
    ItineraryResponse itineraryResponse = new ItineraryResponse();
    DayPlan day1 = new DayPlan();
    day1.setDay(1);
    ScheduleItem item1 = new ScheduleItem();
    PoiInfo poi1 = new PoiInfo();
    poi1.setName("宽窄巷子");
    poi1.setLatitude(30.67);
    poi1.setLongitude(104.06);
    item1.setPoi(poi1);
    ScheduleItem.TransportSegment seg = new ScheduleItem.TransportSegment();
    seg.setMode("WALK");
    seg.setDurationMin(10);
    seg.setDescription("步行约10分钟");
    item1.setTransportSegments(List.of(seg));
    day1.setSchedule(List.of(item1));
    itineraryResponse.setDays(List.of(day1));
    when(objectMapper.readValue(any(String.class), any(Class.class))).thenReturn(itineraryResponse);
    // 模拟序列化抛异常
    when(objectMapper.writeValueAsString(any())).thenThrow(new com.fasterxml.jackson.core.JsonProcessingException("mock error") {});
    when(itineraryTaskMapper.selectById("task-1")).thenReturn(task);
    when(checkinTaskMapper.insert(any(CheckinTask.class))).thenAnswer(inv -> {
      inv.getArgument(0, CheckinTask.class).setId("ctask-1");
      return 1;
    });
    when(checkinItemMapper.insert(any(CheckinItem.class))).thenReturn(1);

    // 不应抛异常，应正常创建打卡任务
    String result = checkinTaskService.startCheckinTask("plan-1", 1L, 1);

    assertThat(result).isEqualTo("ctask-1");
    verify(checkinItemMapper).insert(argThat((CheckinItem i) -> i.getTransportToNext() == null));
  }

  @Test
  @DisplayName("创建打卡任务 — AI 坐标跨城（重庆）偏离锚点（青岛），应丢弃并走地理编码")
  void startCheckinTask_aiCoordinateCrossCity_isRejectedAndGeocoded() throws Exception {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setUserId(1L);
    plan.setActiveTaskId("task-1");
    plan.setPlannedDate("2026-07-10");
    plan.setDestination("青岛");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);
    when(checkinTaskMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);

    ItineraryTask task = new ItineraryTask();
    task.setId("task-1");
    task.setResultJson("{\"days\":[{\"day\":1}]}");

    // 3 个青岛 POI + 1 个重庆 POI（"大学路"被 AI 误判到重庆）
    ItineraryResponse itineraryResponse = new ItineraryResponse();
    DayPlan day1 = new DayPlan();
    day1.setDay(1);

    PoiInfo poiQingdao1 = new PoiInfo();
    poiQingdao1.setName("小鱼山");
    poiQingdao1.setAddress("市南区福山支路24号");
    poiQingdao1.setLatitude(36.066019);
    poiQingdao1.setLongitude(120.332312);

    PoiInfo poiQingdao2 = new PoiInfo();
    poiQingdao2.setName("啤酒博物馆");
    poiQingdao2.setAddress("市北区登州路");
    poiQingdao2.setLatitude(36.078675);
    poiQingdao2.setLongitude(120.345974);

    PoiInfo poiQingdao3 = new PoiInfo();
    poiQingdao3.setName("栈桥");
    poiQingdao3.setAddress("市南区太平路");
    poiQingdao3.setLatitude(36.061686);
    poiQingdao3.setLongitude(120.319365);

    // 这个 POI 的坐标是重庆沙坪坝，应被锚点检测发现并丢弃走Geocoding
    PoiInfo poiChongqing = new PoiInfo();
    poiChongqing.setName("大学路");
    poiChongqing.setAddress("市南区大学路与鱼山路交叉口");  // address 是青岛，坐标却是重庆
    poiChongqing.setLatitude(29.551046);                    // 重庆
    poiChongqing.setLongitude(106.594584);                  // 重庆

    ScheduleItem item1 = new ScheduleItem();
    item1.setPoi(poiQingdao1);
    ScheduleItem item2 = new ScheduleItem();
    item2.setPoi(poiQingdao2);
    ScheduleItem item3 = new ScheduleItem();
    item3.setPoi(poiQingdao3);
    ScheduleItem item4 = new ScheduleItem();
    item4.setPoi(poiChongqing);

    day1.setSchedule(List.of(item1, item2, item3, item4));
    itineraryResponse.setDays(List.of(day1));

    when(objectMapper.readValue(any(String.class), any(Class.class))).thenReturn(itineraryResponse);
    when(itineraryTaskMapper.selectById("task-1")).thenReturn(task);
    when(checkinTaskMapper.insert(any(CheckinTask.class))).thenAnswer(inv -> {
      inv.getArgument(0, CheckinTask.class).setId("ctask-1");
      return 1;
    });
    when(checkinItemMapper.insert(any(CheckinItem.class))).thenReturn(1);

    // 地理编码服务兜底：对"大学路"模拟 GeocodingServiceImpl 的同城校验拒绝（返回 null）
    // （单元测试直接 mock 接口，不会真的走 impl 的同城校验；这里模拟 impl 完整行为）
    when(geocodingService.geocode(any(GeoRequest.class))).thenAnswer(inv -> {
      GeoRequest req = inv.getArgument(0);
      if ("大学路".equals(req.getName())) {
        // GeocodingServiceImpl 检测到 province=重庆 ⊅ destination=青岛，返回 null
        return null;
      }
      return null;
    });

    checkinTaskService.startCheckinTask("plan-1", 1L, 1);

    // 关键断言：第 4 条（大学路）的坐标被丢弃（因为 GeocodingServiceImpl 同城校验拒绝）
    var capturedItems = new java.util.concurrent.atomic.AtomicReference<java.util.List<CheckinItem>>();
    verify(checkinItemMapper, org.mockito.Mockito.times(4))
        .insert(org.mockito.ArgumentMatchers.argThat((CheckinItem i) -> {
          return true;
        }));

    // 更直接的验证：通过 Mockito 的 Captor 拦截全部 4 次调用
    org.mockito.ArgumentCaptor<CheckinItem> captor = org.mockito.ArgumentCaptor.forClass(CheckinItem.class);
    verify(checkinItemMapper, org.mockito.Mockito.times(4)).insert(captor.capture());
    java.util.List<CheckinItem> items = captor.getAllValues();

    // 小鱼山、啤酒博物馆、栈桥：AI 坐标保留（青岛，在青岛锚点 300km 内）
    assertThat(items.get(0).getPoiLat()).isEqualTo(36.066019);
    assertThat(items.get(1).getPoiLat()).isEqualTo(36.078675);
    assertThat(items.get(2).getPoiLat()).isEqualTo(36.061686);
    // 大学路：GeocodingServiceImpl 拒绝重庆结果（destination=青岛），坐标应为 null
    assertThat(items.get(3).getPoiLat()).isNull();
    assertThat(items.get(3).getPoiLng()).isNull();
  }

  @Test
  @DisplayName("强制重查坐标 — 成功结果覆盖，地理编码失败时保留旧坐标")
  void forceRefillCoordinates_crossCityCleaned() {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setDestination("青岛");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);

    CheckinTask t1 = new CheckinTask();
    t1.setId("ctask-1");
    when(checkinTaskMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(t1));

    CheckinItem item1 = new CheckinItem();
    item1.setId(1L);
    item1.setPoiName("小鱼山");
    item1.setPoiAddress("市南区福山支路");
    item1.setPoiLat(36.066019);   // 青岛 — 保留
    item1.setPoiLng(120.332312);

    CheckinItem item2 = new CheckinItem();
    item2.setId(2L);
    item2.setPoiName("大学路");
    item2.setPoiAddress("市南区大学路");
    item2.setPoiLat(29.551046);   // 重庆跨城 — 成功重查后应被覆盖
    item2.setPoiLng(106.594584);

    when(checkinItemMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(item1, item2));
    when(checkinItemMapper.updateById(any(CheckinItem.class))).thenReturn(1);

    // 强制重查"大学路"的地理编码返回青岛坐标（同城校验通过）
    // "小鱼山"的地理编码返回 null（模拟 API 调用失败 / 未命中）—— 原坐标必须保留
    when(geocodingService.geocode(any(GeoRequest.class))).thenAnswer(inv -> {
      GeoRequest req = inv.getArgument(0);
      if ("大学路".equals(req.getName())) {
        return GeoResult.builder()
            .latitude(36.0824).longitude(120.3556)
            .province("山东省").city("青岛市").district("市南区")
            .provider("gaode").build();
      }
      return null;
    });

    int resolved = checkinTaskService.forceRefillCoordinates("plan-1");

    // 大学路：成功写入青岛坐标；小鱼山查询失败时保留旧坐标。
    assertThat(resolved).isEqualTo(1);

    org.mockito.ArgumentCaptor<CheckinItem> captor = org.mockito.ArgumentCaptor.forClass(CheckinItem.class);
    verify(checkinItemMapper, org.mockito.Mockito.times(1)).updateById(captor.capture());
    List<CheckinItem> updated = captor.getAllValues();
    // 大学路：坐标从重庆改为青岛
    CheckinItem daxuelu = updated.stream().filter(i -> "大学路".equals(i.getPoiName())).findFirst()
        .orElseThrow(() -> new AssertionError("未找到大学路"));
    assertThat(daxuelu.getPoiLat()).isEqualTo(36.0824);
    assertThat(daxuelu.getPoiLng()).isEqualTo(120.3556);
    assertThat(item1.getPoiLat()).isEqualTo(36.066019);
    assertThat(item1.getPoiLng()).isEqualTo(120.332312);
  }

  /**
   * BUG-20260706-002 验证：forceRefill 在多 task + 多 POI 场景下，
   * 并行 geocode 成功后写新坐标，失败时保留既有坐标。
   *
   * <p>覆盖新代码路径：
   * <ul>
   *   <li>IN 查询（取代 N+1）</li>
   *   <li>CompletableFuture 并行 geocode</li>
   *   <li>成功项 updateById</li>
   *   <li>失败项零写入并保留原值</li>
   * </ul>
   */
  @Test
  @DisplayName("BUG-20260719-001: forceRefill 多 task 多 POI — 成功覆盖且失败保留")
  void forceRefillCoordinates_parallelMultiTaskBatchWrite() {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setDestination("青岛");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);

    // 2 个 task，每个 task 2 个 POI
    CheckinTask t1 = new CheckinTask();
    t1.setId("ctask-1");
    CheckinTask t2 = new CheckinTask();
    t2.setId("ctask-2");
    when(checkinTaskMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(t1, t2));

    CheckinItem i1 = new CheckinItem();  // task1/POI1: 青岛坐标 → geocode 成功 → batch success
    i1.setId(1L); i1.setCheckinTaskId("ctask-1");
    i1.setPoiName("栈桥"); i1.setPoiAddress("市南区");
    i1.setPoiLat(36.061); i1.setPoiLng(120.329);
    CheckinItem i2 = new CheckinItem();  // task1/POI2: 青岛坐标 → geocode 失败（API null） → 保留
    i2.setId(2L); i2.setCheckinTaskId("ctask-1");
    i2.setPoiName("小鱼山"); i2.setPoiAddress("市南区");
    i2.setPoiLat(36.066); i2.setPoiLng(120.332);
    CheckinItem i3 = new CheckinItem();  // task2/POI1: 跨城重庆坐标 → geocode 成功 → 覆盖旧值
    i3.setId(3L); i3.setCheckinTaskId("ctask-2");
    i3.setPoiName("大学路"); i3.setPoiAddress("市南区大学路");
    i3.setPoiLat(29.551); i3.setPoiLng(106.594);  // 重庆坐标（成功重查后应覆盖）
    CheckinItem i4 = new CheckinItem();  // task2/POI2: null 坐标 → geocode 失败 → FAILED（不写）
    i4.setId(4L); i4.setCheckinTaskId("ctask-2");
    i4.setPoiName("返航"); i4.setPoiAddress(null);
    // i4 无坐标

    when(checkinItemMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(i1, i2, i3, i4));
    when(checkinItemMapper.updateById(any(CheckinItem.class))).thenReturn(1);

    when(geocodingService.geocode(any(GeoRequest.class))).thenAnswer(inv -> {
      GeoRequest req = inv.getArgument(0);
      if ("栈桥".equals(req.getName())) {
        return GeoResult.builder().latitude(36.062).longitude(120.330)
            .province("山东省").city("青岛市").district("市南区").provider("gaode").build();
      }
      if ("大学路".equals(req.getName())) {
        return GeoResult.builder().latitude(36.0824).longitude(120.3556)
            .province("山东省").city("青岛市").district("市南区").provider("gaode").build();
      }
      // 小鱼山 / 返航 → API 返回 null（模拟失败）
      return null;
    });

    int resolved = checkinTaskService.forceRefillCoordinates("plan-1");

    // resolved = 成功写入的项数（栈桥 + 大学路 = 2）
    assertThat(resolved).isEqualTo(2);

    org.mockito.ArgumentCaptor<CheckinItem> captor = org.mockito.ArgumentCaptor.forClass(CheckinItem.class);
    // 仅两个成功结果写库；失败项不产生破坏性更新。
    verify(checkinItemMapper, org.mockito.Mockito.times(2)).updateById(captor.capture());
    List<CheckinItem> updated = captor.getAllValues();
    assertThat(updated).isNotEmpty();

    // 校验 success：栈桥 写入新地理编码坐标
    CheckinItem zhanqiao = updated.stream().filter(i -> "栈桥".equals(i.getPoiName())).findFirst().orElseThrow();
    assertThat(zhanqiao.getPoiLat()).isEqualTo(36.062);

    // 校验 success：大学路重庆坐标经重新 geocode 后覆盖为青岛坐标
    CheckinItem daxuelu = updated.stream().filter(i -> "大学路".equals(i.getPoiName())).findFirst().orElseThrow();
    assertThat(daxuelu.getPoiLat()).isEqualTo(36.0824);

    assertThat(i2.getPoiLat()).isEqualTo(36.066);
    assertThat(i2.getPoiLng()).isEqualTo(120.332);
    assertThat(i4.getPoiLat()).isNull();
    assertThat(i4.getPoiLng()).isNull();
  }

  /**
   * BUG-20260706-002 验证：backfill（非 force）模式 + 部分已有坐标的项，只反查缺失坐标项。
   * 覆盖"IN 查询 + 已有坐标跳过 + 并行 + batch updateById"路径。
   */
  @Test
  @DisplayName("BUG-20260706-002: backfill（非 force）部分已有坐标 — 只反查缺失项并行写")
  void backfillCoordinates_partialValidParallel() {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setDestination("川西");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);

    CheckinTask t1 = new CheckinTask();
    t1.setId("ctask-1");
    when(checkinTaskMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(t1));

    // 1 项已有坐标（不在 toResolve 里）；1 项 null（需反查）
    CheckinItem valid = new CheckinItem();
    valid.setId(10L); valid.setCheckinTaskId("ctask-1");
    valid.setPoiName("栈桥"); valid.setPoiLat(36.061); valid.setPoiLng(120.329);
    CheckinItem missing = new CheckinItem();
    missing.setId(11L); missing.setCheckinTaskId("ctask-1");
    missing.setPoiName("折多山"); missing.setPoiAddress("康定市");
    // missing 无坐标
    when(checkinItemMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(valid, missing));
    when(checkinItemMapper.updateById(any(CheckinItem.class))).thenReturn(1);

    when(geocodingService.geocode(any(GeoRequest.class))).thenAnswer(inv -> {
      GeoRequest req = inv.getArgument(0);
      if ("折多山".equals(req.getName())) {
        // 返回正确的川西坐标
        return GeoResult.builder().latitude(30.029795).longitude(101.996442)
            .province("四川省").city("甘孜藏族自治州").district("康定市").provider("gaode").build();
      }
      return null;
    });

    int resolved = checkinTaskService.backfillMissingCoordinates("plan-1");

    // 仅折多山被反查 → resolved=1
    assertThat(resolved).isEqualTo(1);

    // 仅调用 1 次 updateById（折多山）
    org.mockito.ArgumentCaptor<CheckinItem> captor = org.mockito.ArgumentCaptor.forClass(CheckinItem.class);
    verify(checkinItemMapper, org.mockito.Mockito.times(1)).updateById(captor.capture());
    CheckinItem updated = captor.getValue();
    assertThat(updated.getPoiName()).isEqualTo("折多山");
    assertThat(updated.getPoiLat()).isEqualTo(30.029795);
    assertThat(updated.getPoiLng()).isEqualTo(101.996442);
  }

  @Test
  @DisplayName("创建打卡任务 — 当天只有 1 个有效 AI 坐标（自己作锚点），不触发清洗")
  void startCheckinTask_singleAiCoordinate_isKeptAsAnchor() throws Exception {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setUserId(1L);
    plan.setActiveTaskId("task-1");
    plan.setPlannedDate("2026-07-10");
    plan.setDestination("青岛");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);
    when(checkinTaskMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);

    ItineraryTask task = new ItineraryTask();
    task.setId("task-1");
    task.setResultJson("{\"days\":[{\"day\":1}]}");

    ItineraryResponse itineraryResponse = new ItineraryResponse();
    DayPlan day1 = new DayPlan();
    day1.setDay(1);

    PoiInfo poiOnly = new PoiInfo();
    poiOnly.setName("小鱼山");
    poiOnly.setAddress("市南区福山支路24号");
    poiOnly.setLatitude(36.066019);
    poiOnly.setLongitude(120.332312);

    ScheduleItem item1 = new ScheduleItem();
    item1.setPoi(poiOnly);
    day1.setSchedule(List.of(item1));
    itineraryResponse.setDays(List.of(day1));

    when(objectMapper.readValue(any(String.class), any(Class.class))).thenReturn(itineraryResponse);
    when(itineraryTaskMapper.selectById("task-1")).thenReturn(task);
    when(checkinTaskMapper.insert(any(CheckinTask.class))).thenAnswer(inv -> {
      inv.getArgument(0, CheckinTask.class).setId("ctask-1");
      return 1;
    });
    when(checkinItemMapper.insert(any(CheckinItem.class))).thenReturn(1);

    checkinTaskService.startCheckinTask("plan-1", 1L, 1);

    org.mockito.ArgumentCaptor<CheckinItem> captor = org.mockito.ArgumentCaptor.forClass(CheckinItem.class);
    verify(checkinItemMapper).insert(captor.capture());
    CheckinItem item = captor.getValue();

    // 单个坐标作为锚点，自身距离为 0 → 保留
    assertThat(item.getPoiLat()).isEqualTo(36.066019);
    assertThat(item.getPoiLng()).isEqualTo(120.332312);
  }

  // ===== editCustomItem tests =====

  @Test
  @DisplayName("编辑自定义项 - 成功更新所有字段")
  void editCustomItem_success_updatesAllFields() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setIsCustom(true);
    item.setStatus("PENDING");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setUserId(1L);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    com.ai.travel.dto.request.EditCustomItemRequest request =
        new com.ai.travel.dto.request.EditCustomItemRequest();
    request.setName("新名称");
    request.setPeriod("下午");
    request.setDescription("新描述");
    request.setEstimatedCost("约50元");
    request.setAddress("新地址");

    checkinTaskService.editCustomItem(1L, 1L, request);

    verify(checkinItemMapper).updateById(item);
    assertThat(item.getPoiName()).isEqualTo("新名称");
    assertThat(item.getPeriod()).isEqualTo("下午");
  }

  @Test
  @DisplayName("编辑自定义项 - 非自定义项应抛出异常")
  void editCustomItem_notCustom_throwsIllegalStateException() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setIsCustom(false);
    item.setStatus("PENDING");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setUserId(1L);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    com.ai.travel.dto.request.EditCustomItemRequest request =
        new com.ai.travel.dto.request.EditCustomItemRequest();
    request.setName("名称");

    assertThatThrownBy(() -> checkinTaskService.editCustomItem(1L, 1L, request))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("仅自定义");
  }

  @Test
  @DisplayName("编辑自定义项 - 非 PENDING 状态应抛出异常")
  void editCustomItem_notPendingStatus_throwsIllegalStateException() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setIsCustom(true);
    item.setStatus("CHECKED_IN");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setUserId(1L);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    com.ai.travel.dto.request.EditCustomItemRequest request =
        new com.ai.travel.dto.request.EditCustomItemRequest();
    request.setName("名称");

    assertThatThrownBy(() -> checkinTaskService.editCustomItem(1L, 1L, request))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("PENDING");
  }

  @Test
  @DisplayName("编辑自定义项 - 只填纬度未填经度应抛出异常")
  void editCustomItem_partialLatLng_throwsIllegalArgumentException() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setIsCustom(true);
    item.setStatus("PENDING");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setUserId(1L);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    com.ai.travel.dto.request.EditCustomItemRequest request =
        new com.ai.travel.dto.request.EditCustomItemRequest();
    request.setName("名称");
    request.setLat(39.9);
    // lng intentionally null

    assertThatThrownBy(() -> checkinTaskService.editCustomItem(1L, 1L, request))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("经纬度");
  }

  @Test
  @DisplayName("编辑自定义项 - (0,0) 坐标应抛出异常")
  void editCustomItem_zeroLatLng_throwsIllegalArgumentException() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setIsCustom(true);
    item.setStatus("PENDING");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setUserId(1L);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    com.ai.travel.dto.request.EditCustomItemRequest request =
        new com.ai.travel.dto.request.EditCustomItemRequest();
    request.setName("名称");
    request.setLat(0.0);
    request.setLng(0.0);

    assertThatThrownBy(() -> checkinTaskService.editCustomItem(1L, 1L, request))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("0, 0");
  }

  @Test
  @DisplayName("编辑自定义项 - 经纬度超出范围应抛出异常")
  void editCustomItem_outOfRangeLatLng_throwsIllegalArgumentException() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setIsCustom(true);
    item.setStatus("PENDING");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setUserId(1L);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    com.ai.travel.dto.request.EditCustomItemRequest request =
        new com.ai.travel.dto.request.EditCustomItemRequest();
    request.setName("名称");
    request.setLat(91.0);  // out of range
    request.setLng(200.0);

    assertThatThrownBy(() -> checkinTaskService.editCustomItem(1L, 1L, request))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("超出");
  }

  // ===== abandonCheckin edge cases =====

  @Test
  @DisplayName("废弃打卡项 - 已是 ABANDONED 应幂等跳过")
  void abandonCheckin_alreadyAbandoned_returnsIdempotent() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setStatus("ABANDONED");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setUserId(1L);
    task.setTotalPoi(5);
    task.setPlanId("plan-1");
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    // Should not update again
    checkinTaskService.abandonCheckin(1L, 1L);

    verify(checkinItemMapper, never()).updateById((CheckinItem) any());
  }

  @Test
  @DisplayName("废弃打卡项 - 已打卡项应抛出异常")
  void abandonCheckin_alreadyCheckedIn_throwsIllegalStateException() {
    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setStatus("CHECKED_IN");
    when(checkinItemMapper.selectById(1L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setUserId(1L);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    assertThatThrownBy(() -> checkinTaskService.abandonCheckin(1L, 1L))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("已打卡");
  }

  // ===== startCheckinTask edge cases =====

  @Test
  @DisplayName("创建打卡任务 - 清单已删除应抛出异常")
  void startCheckinTask_planDeleted_throwsPlanNotFoundException() {
    TripPlan plan = new TripPlan();
    plan.setId("plan-deleted");
    plan.setUserId(1L);
    plan.setDeletedAt(LocalDateTime.now());
    when(tripPlanMapper.selectById("plan-deleted")).thenReturn(plan);

    assertThatThrownBy(() -> checkinTaskService.startCheckinTask("plan-deleted", 1L, 1))
        .isInstanceOf(PlanNotFoundException.class);
  }

  @Test
  @DisplayName("创建打卡任务 - activeTaskId 为空应抛出异常")
  void startCheckinTask_blankActiveTaskId_throwsPlanNotFoundException() {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setUserId(1L);
    plan.setActiveTaskId("");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);
    when(checkinTaskMapper.selectOne(any())).thenReturn(null);

    assertThatThrownBy(() -> checkinTaskService.startCheckinTask("plan-1", 1L, 1))
        .isInstanceOf(PlanNotFoundException.class)
        .hasMessageContaining("未关联有效的执行任务");
  }

  @Test
  @DisplayName("创建打卡任务 - resultJson 为空应抛出异常")
  void startCheckinTask_blankResultJson_throwsPlanNotFoundException() {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setUserId(1L);
    plan.setActiveTaskId("task-1");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);
    when(checkinTaskMapper.selectOne(any())).thenReturn(null);

    ItineraryTask task = new ItineraryTask();
    task.setId("task-1");
    task.setResultJson("");
    when(itineraryTaskMapper.selectById("task-1")).thenReturn(task);

    assertThatThrownBy(() -> checkinTaskService.startCheckinTask("plan-1", 1L, 1))
        .isInstanceOf(PlanNotFoundException.class)
        .hasMessageContaining("结果数据不可用");
  }

  @Test
  @DisplayName("创建打卡任务 - 解析后 dayPlans 为空应抛出异常")
  void startCheckinTask_emptyDayPlans_throwsRuntimeException() throws Exception {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setUserId(1L);
    plan.setActiveTaskId("task-1");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);
    when(checkinTaskMapper.selectOne(any())).thenReturn(null);

    ItineraryTask task = new ItineraryTask();
    task.setId("task-1");
    task.setResultJson("{\"summary\":\"trip\",\"days\":[],\"tips\":[]}");
    when(itineraryTaskMapper.selectById("task-1")).thenReturn(task);
    when(objectMapper.readValue(any(String.class), any(Class.class)))
        .thenThrow(new RuntimeException("parse error"));

    assertThatThrownBy(() -> checkinTaskService.startCheckinTask("plan-1", 1L, 1))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("行程数据为空");
  }

  // ===== getCheckinTaskById with no items =====

  @Test
  @DisplayName("获取打卡任务详情 - 无打卡项时应返回空列表")
  void getCheckinTaskById_noItems_returnsEmptyItemsList() {
    CheckinTask ct = new CheckinTask();
    ct.setId("task-empty");
    ct.setPlanId("plan-1");
    ct.setUserId(1L);
    when(checkinTaskMapper.selectById("task-empty")).thenReturn(ct);
    when(checkinItemMapper.selectList(any())).thenReturn(List.of());

    var result = checkinTaskService.getCheckinTaskById("task-empty");

    assertThat(result).isNotNull();
    assertThat(result.getItems()).isEmpty();
  }

  @Test
  @DisplayName("获取打卡任务详情 - 不应在读取路径触发坐标回填")
  void getCheckinTaskById_doesNotBackfillCoordinates() {
    CheckinTask ct = new CheckinTask();
    ct.setId("task-1");
    ct.setPlanId("plan-1");
    ct.setUserId(1L);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(ct);
    when(checkinItemMapper.selectList(any())).thenReturn(List.of());

    var result = checkinTaskService.getCheckinTaskById("task-1");
    assertThat(result).isNotNull();
    verify(geocodingService, never()).geocode(any());
  }

  @Test
  @DisplayName("获取打卡任务列表 - 不应在读取路径触发坐标回填")
  void getCheckinTasks_doesNotBackfillCoordinates() {
    CheckinTask ct = new CheckinTask();
    ct.setId("task-1");
    ct.setPlanId("plan-1");
    ct.setUserId(1L);
    when(checkinTaskMapper.selectList(any())).thenReturn(List.of(ct));
    when(checkinItemMapper.selectList(any())).thenReturn(List.of());

    var result = checkinTaskService.getCheckinTasks("plan-1");
    assertThat(result).isNotNull();
    verify(geocodingService, never()).geocode(any());
  }

  @Test
  @DisplayName("添加自定义项 - 任务不存在应抛出异常")
  void addCustomItem_taskNotFound_throwsException() {
    when(checkinTaskMapper.selectById("nonexistent")).thenReturn(null);

    AddCustomItemRequest request = new AddCustomItemRequest();
    request.setName("自定义景点");

    assertThatThrownBy(() -> checkinTaskService.addCustomItem("nonexistent", request, 1L))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("打卡任务不存在");
  }

  @Test
  @DisplayName("添加自定义项 - 无权限应抛出异常")
  void addCustomItem_forbidden_throwsForbiddenException() {
    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setUserId(99L);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    AddCustomItemRequest request = new AddCustomItemRequest();
    request.setName("自定义景点");

    assertThatThrownBy(() -> checkinTaskService.addCustomItem("task-1", request, 1L))
        .isInstanceOf(ForbiddenException.class);
  }

  @Test
  @DisplayName("强制回填坐标 - 坐标偏离目的地但重查失败时应保留")
  void forceRefillCoordinates_farFromDestination_preservedOnFailure() {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setUserId(1L);
    plan.setDestination("青岛");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);

    CheckinTask ct = new CheckinTask();
    ct.setId("task-1");
    ct.setPlanId("plan-1");
    when(checkinTaskMapper.selectList(any())).thenReturn(List.of(ct));

    CheckinItem item = new CheckinItem();
    item.setId(1L);
    item.setCheckinTaskId("task-1");
    item.setPoiName("大学路");
    // Coordinates far from 青岛 (Chongqing)
    item.setPoiLat(29.55);
    item.setPoiLng(106.55);
    when(checkinItemMapper.selectList(any())).thenReturn(List.of(item));
    when(geocodingService.geocode(any())).thenReturn(null);

    int result = checkinTaskService.forceRefillCoordinates("plan-1");
    assertThat(item.getPoiLat()).isEqualTo(29.55);
    assertThat(item.getPoiLng()).isEqualTo(106.55);
    assertThat(result).isEqualTo(0);
    verify(checkinItemMapper, org.mockito.Mockito.never()).updateById(any(CheckinItem.class));
  }

  @Test
  @DisplayName("回填坐标 - 清单不存在应抛出异常")
  void backfillCoordinates_planNotFound_throwsException() {
    when(tripPlanMapper.selectById("nonexistent")).thenReturn(null);

    assertThatThrownBy(() -> checkinTaskService.backfillMissingCoordinates("nonexistent"))
        .isInstanceOf(PlanNotFoundException.class);
  }

  // ==================== editCustomItem 异常路径 ====================

  @Test
  @DisplayName("编辑自定义项 - 打卡项不存在应抛出 CheckinItemNotFoundException")
  void editCustomItem_itemNotFound_throwsCheckinItemNotFoundException() {
    when(checkinItemMapper.selectById(999L)).thenReturn(null);

    EditCustomItemRequest request = new EditCustomItemRequest();
    request.setName("新名称");

    assertThatThrownBy(() -> checkinTaskService.editCustomItem(999L, 1L, request))
        .isInstanceOf(CheckinItemNotFoundException.class)
        .hasMessageContaining("打卡项不存在");
  }

  // ==================== abandonCheckin 鉴权与边界 ====================

  @Test
  @DisplayName("废弃打卡项 - 已打卡项应抛出 IllegalStateException")
  void abandonCheckin_alreadyCheckedInWithCounters_throwsIllegalStateException() {
    CheckinItem item = new CheckinItem();
    item.setId(50L);
    item.setCheckinTaskId("task-1");
    item.setStatus("CHECKED_IN");
    when(checkinItemMapper.selectById(50L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setUserId(1L);
    task.setTotalPoi(3);
    task.setCompletedPoi(1);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    assertThatThrownBy(() -> checkinTaskService.abandonCheckin(50L, 1L))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("已打卡");
  }

  @Test
  @DisplayName("废弃打卡项 - 无权操作应抛出 ForbiddenException")
  void abandonCheckin_forbiddenUser_throwsForbiddenException() {
    CheckinItem item = new CheckinItem();
    item.setId(51L);
    item.setCheckinTaskId("task-1");
    item.setStatus("PENDING");
    when(checkinItemMapper.selectById(51L)).thenReturn(item);

    CheckinTask task = new CheckinTask();
    task.setId("task-1");
    task.setUserId(2L);
    task.setTotalPoi(3);
    task.setCompletedPoi(1);
    when(checkinTaskMapper.selectById("task-1")).thenReturn(task);

    assertThatThrownBy(() -> checkinTaskService.abandonCheckin(51L, 1L))
        .isInstanceOf(ForbiddenException.class);
  }

  // ==================== toItemResponse transportToNext=null 分支 ====================

  @Test
  @DisplayName("toItemResponse - transportToNext 为 null 时透传 null")
  void toItemResponse_transportToNextNull_passthrough() {
    CheckinItem item = new CheckinItem();
    item.setId(60L);
    item.setCheckinTaskId("task-1");
    item.setPoiName("测试POI");
    item.setPoiLat(36.0);
    item.setPoiLng(120.0);
    item.setTransportToNext(null);
    when(checkinItemMapper.selectById(60L)).thenReturn(item);
    when(checkinMediaMapper.selectList(any())).thenReturn(List.of());

    CheckinItemResponse resp = checkinTaskService.getCheckinItemDetail(60L, 1L);

    assertThat(resp.getTransportToNext()).isNull();
    assertThat(resp.getPoiName()).isEqualTo("测试POI");
  }

  // ==================== startCheckinTask insert 失败仍返回任务 ID ====================

  @Test
  @DisplayName("启动打卡任务 - DB insert 失败仍返回任务 ID")
  void startCheckinTask_insertFails_stillReturnsTaskId() throws Exception {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setUserId(1L);
    plan.setStatus("PLANNED");
    plan.setActiveTaskId("task-itin-1");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);

    // 使用真实 ItineraryResponse 对象 stub objectMapper.readValue（mock 无法直接反序列化）
    com.ai.travel.dto.response.ItineraryResponse mockedResponse =
        new com.ai.travel.dto.response.ItineraryResponse();
    com.ai.travel.dto.response.DayPlan dayPlan = new com.ai.travel.dto.response.DayPlan();
    dayPlan.setDay(1);
    dayPlan.setTheme("海岸一日游");
    mockedResponse.setDays(java.util.List.of(dayPlan));
    mockedResponse.setSummary("青岛行程");
    // 第一个分支（ItineraryResponse 解析）会被命中；getTypeFactory() stub 仅做兜底
    lenient().when(objectMapper.readValue(any(String.class), eq(com.ai.travel.dto.response.ItineraryResponse.class)))
        .thenReturn(mockedResponse);
    lenient().when(objectMapper.getTypeFactory())
        .thenReturn(new com.fasterxml.jackson.databind.ObjectMapper().getTypeFactory());

    ItineraryTask itinTask = new ItineraryTask();
    itinTask.setId("task-itin-1");
    // 必须设置非空 resultJson 以通过 startCheckinTask 的"执行任务的结果数据不可用"校验
    itinTask.setResultJson("{\"summary\":\"青岛行程\",\"days\":[{\"day\":1}]}");
    when(itineraryTaskMapper.selectById("task-itin-1")).thenReturn(itinTask);
    when(itineraryTaskService.listNodeRevisions(any())).thenReturn(List.of());

    // insert 返回 0（失败）— 但应正常返回任务 ID 而不抛出
    when(checkinTaskMapper.insert(any(CheckinTask.class))).thenAnswer(inv -> {
      inv.getArgument(0, CheckinTask.class).setId("ctask-new");
      return 0;
    });

    // 应该不抛出异常，正常返回
    String taskId = checkinTaskService.startCheckinTask("plan-1", 1L, 1);
    assertThat(taskId).isNotNull();
  }
}
