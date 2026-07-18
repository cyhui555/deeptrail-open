package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ai.travel.dto.request.AddCustomItemRequest;
import com.ai.travel.entity.CheckinItem;
import com.ai.travel.entity.CheckinTask;
import com.ai.travel.entity.TripPlan;
import com.ai.travel.exception.ForbiddenException;
import com.ai.travel.mapper.CheckinItemMapper;
import com.ai.travel.mapper.CheckinTaskMapper;
import com.ai.travel.mapper.TripPlanMapper;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** BUG-20260718-005：空白行程首个手动地点的服务层回归测试。 */
@ExtendWith(MockitoExtension.class)
class CheckinItemCommandServiceTest {

  @Mock private CheckinTaskMapper checkinTaskMapper;
  @Mock private CheckinItemMapper checkinItemMapper;
  @Mock private TripPlanMapper tripPlanMapper;

  private CheckinItemCommandService service;

  @BeforeEach
  void setUp() {
    service = new CheckinItemCommandService(
        checkinTaskMapper, checkinItemMapper, tripPlanMapper);
  }

  @Test
  @DisplayName("空白行程添加首个地点应同时持久化第一天任务和自定义项")
  void addCustomItemToPlan_blankPlan_persistsFirstDayAndItem() {
    TripPlan plan = blankPlan(1L);
    when(tripPlanMapper.selectById("plan-blank")).thenReturn(plan);
    when(checkinTaskMapper.selectList(any())).thenReturn(List.of());
    when(checkinItemMapper.insert(any(CheckinItem.class))).thenAnswer(invocation -> {
      invocation.getArgument(0, CheckinItem.class).setId(42L);
      return 1;
    });

    AddCustomItemRequest request = customItem("街角咖啡馆");
    Long itemId = service.addCustomItemToPlan("plan-blank", request, 1L);

    assertThat(itemId).isEqualTo(42L);
    ArgumentCaptor<CheckinTask> taskCaptor = ArgumentCaptor.forClass(CheckinTask.class);
    verify(checkinTaskMapper).insert(taskCaptor.capture());
    CheckinTask task = taskCaptor.getValue();
    assertThat(task.getPlanId()).isEqualTo("plan-blank");
    assertThat(task.getUserId()).isEqualTo(1L);
    assertThat(task.getDayNumber()).isEqualTo(1);
    assertThat(task.getItineraryDate()).isEqualTo("2026-08-01");
    assertThat(task.getTaskId()).isEqualTo(task.getId());
    assertThat(task.getTotalPoi()).isEqualTo(1);

    ArgumentCaptor<CheckinItem> itemCaptor = ArgumentCaptor.forClass(CheckinItem.class);
    verify(checkinItemMapper).insert(itemCaptor.capture());
    CheckinItem item = itemCaptor.getValue();
    assertThat(item.getCheckinTaskId()).isEqualTo(task.getId());
    assertThat(item.getPoiName()).isEqualTo("街角咖啡馆");
    assertThat(item.getIsCustom()).isTrue();
    assertThat(item.getStatus()).isEqualTo("PENDING");
    verify(checkinTaskMapper).updateById(task);
  }

  @Test
  @DisplayName("行程已有日程时行程级入口应复用首日且不重复建任务")
  void addCustomItemToPlan_existingTask_reusesTask() {
    TripPlan plan = blankPlan(1L);
    CheckinTask existing = new CheckinTask();
    existing.setId("existing-task");
    existing.setPlanId(plan.getId());
    existing.setUserId(1L);
    existing.setTotalPoi(2);
    when(tripPlanMapper.selectById("plan-blank")).thenReturn(plan);
    when(checkinTaskMapper.selectList(any())).thenReturn(List.of(existing));

    service.addCustomItemToPlan("plan-blank", customItem("第三个地点"), 1L);

    verify(checkinTaskMapper, never()).insert(any(CheckinTask.class));
    assertThat(existing.getTotalPoi()).isEqualTo(3);
    verify(checkinTaskMapper).updateById(existing);
  }

  @Test
  @DisplayName("非行程所有者不得创建首个手动地点")
  void addCustomItemToPlan_otherUser_throwsForbidden() {
    when(tripPlanMapper.selectById("plan-blank")).thenReturn(blankPlan(1L));

    assertThatThrownBy(() -> service.addCustomItemToPlan(
        "plan-blank", customItem("越权地点"), 2L))
        .isInstanceOf(ForbiddenException.class)
        .hasMessageContaining("无权操作");

    verify(checkinTaskMapper, never()).selectList(any());
    verify(checkinTaskMapper, never()).insert(any(CheckinTask.class));
    verify(checkinItemMapper, never()).insert(any(CheckinItem.class));
  }

  private static TripPlan blankPlan(Long userId) {
    TripPlan plan = new TripPlan();
    plan.setId("plan-blank");
    plan.setUserId(userId);
    plan.setPlannedDate("2026-08-01");
    plan.setStatus("PLANNED");
    return plan;
  }

  private static AddCustomItemRequest customItem(String name) {
    AddCustomItemRequest request = new AddCustomItemRequest();
    request.setName(name);
    request.setPeriod("下午");
    return request;
  }
}
