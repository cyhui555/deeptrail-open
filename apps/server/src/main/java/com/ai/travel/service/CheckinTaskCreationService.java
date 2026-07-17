package com.ai.travel.service;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;
import com.ai.travel.dto.response.DayPlan;
import com.ai.travel.dto.response.ItineraryResponse;
import com.ai.travel.dto.response.NodeRevisionResponse;
import com.ai.travel.dto.response.ScheduleItem;
import com.ai.travel.entity.CheckinItem;
import com.ai.travel.entity.CheckinTask;
import com.ai.travel.entity.ItineraryTask;
import com.ai.travel.entity.TripPlan;
import com.ai.travel.exception.ForbiddenException;
import com.ai.travel.exception.PlanNotFoundException;
import com.ai.travel.mapper.ItineraryTaskMapper;
import com.ai.travel.mapper.TripPlanMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/** 从行程结果准备签到任务，并在外部 I/O 完成后交给写入服务落库。 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CheckinTaskCreationService {

  private final ItineraryTaskMapper itineraryTaskMapper;
  private final TripPlanMapper tripPlanMapper;
  private final ObjectMapper objectMapper;
  private final CheckinCoordinateService coordinateService;
  private final ItineraryTaskService itineraryTaskService;
  private final CheckinTaskWriter taskWriter;

  /** 创建按天拆分的签到任务，并返回首日任务 ID。 */
  public String startCheckinTask(String planId, Long userId, Integer startDay) {
    TripPlan plan = requirePlan(planId, userId);
    CheckinTask existing = taskWriter.findFirstTask(planId);
    if (existing != null) {
      log.info("Checkin tasks already exist for planId={}, skip creation, return firstId={}",
          planId, existing.getId());
      return existing.getId();
    }
    ItineraryTask itineraryTask = requireItineraryTask(plan);
    List<DayPlan> dayPlans = parseDayPlans(itineraryTask.getResultJson());
    if (CollUtil.isEmpty(dayPlans)) {
      throw new RuntimeException("行程数据为空，无法创建打卡任务");
    }

    int firstDay = startDay != null && startDay > 0 ? startDay : 1;
    List<NodeRevisionResponse> revisions = loadNodeRevisionsSafe(itineraryTask.getId());
    List<CheckinTaskDraft> drafts = new ArrayList<>();
    for (DayPlan dayPlan : dayPlans) {
      int dayNumber = dayPlan.getDay() != null ? dayPlan.getDay() : 1;
      if (dayNumber >= firstDay) {
        drafts.add(prepareDay(plan, itineraryTask, userId, dayPlan, dayNumber, revisions));
      }
    }
    if (drafts.isEmpty()) {
      throw new RuntimeException("未能创建任何打卡任务");
    }
    String firstTaskId = taskWriter.persistIfAbsent(planId, drafts);
    if (firstTaskId == null) {
      throw new RuntimeException("未能创建任何打卡任务");
    }
    log.info("Checkin tasks created: planId={}, startDay={}, firstTaskId={}",
        planId, startDay, firstTaskId);
    return firstTaskId;
  }

  private CheckinTaskDraft prepareDay(
      TripPlan plan,
      ItineraryTask itineraryTask,
      Long userId,
      DayPlan dayPlan,
      int dayNumber,
      List<NodeRevisionResponse> revisions) {
    List<ScheduleItem> schedule = dayPlan.getSchedule();
    CheckinTask task = new CheckinTask();
    task.setPlanId(plan.getId());
    task.setTaskId(itineraryTask.getId());
    task.setUserId(userId);
    task.setDayNumber(dayNumber);
    task.setItineraryDate(resolveDate(plan, dayPlan, dayNumber));
    task.setStatus("ACTIVE");
    task.setTotalPoi(CollUtil.isEmpty(schedule) ? 0 : schedule.size());
    task.setCompletedPoi(0);
    task.setCreatedAt(LocalDateTime.now());
    applyDayLevelData(task, dayPlan);

    List<CheckinItem> items = new ArrayList<>();
    Double[] cityAnchor = coordinateService.findDayCityAnchor(dayPlan);
    if (CollUtil.isNotEmpty(schedule)) {
      for (int index = 0; index < schedule.size(); index++) {
        items.add(prepareItem(plan, schedule.get(index), cityAnchor, revisions, dayNumber, index));
      }
    }
    return new CheckinTaskDraft(task, items);
  }

  private CheckinItem prepareItem(
      TripPlan plan,
      ScheduleItem scheduleItem,
      Double[] cityAnchor,
      List<NodeRevisionResponse> revisions,
      int dayNumber,
      int itemIndex) {
    CheckinItem item = new CheckinItem();
    applyPoi(plan, scheduleItem, cityAnchor, item);
    item.setStatus("PENDING");
    item.setCreatedAt(LocalDateTime.now());
    item.setPeriod(scheduleItem.getPeriod());
    item.setDescription(scheduleItem.getDescription());
    item.setEstimatedCost(scheduleItem.getEstimatedCost());
    item.setEstimatedVisitTime(scheduleItem.getEstimatedDuration());
    applyPoiDetails(scheduleItem, item);
    applyTransport(scheduleItem, item);
    applyNodeRevision(item, revisions, dayNumber, itemIndex);
    return item;
  }

  private void applyPoi(
      TripPlan plan, ScheduleItem scheduleItem, Double[] cityAnchor, CheckinItem item) {
    if (scheduleItem.getPoi() != null
        && StrUtil.isNotBlank(scheduleItem.getPoi().getName())) {
      item.setPoiName(scheduleItem.getPoi().getName());
      item.setPoiAddress(scheduleItem.getPoi().getAddress());
      Double latitude = scheduleItem.getPoi().getLatitude();
      Double longitude = scheduleItem.getPoi().getLongitude();
      if (latitude != null && longitude != null && latitude == 0.0 && longitude == 0.0) {
        latitude = null;
        longitude = null;
      }
      if (latitude != null && longitude != null
          && !coordinateService.isWithinCityRadius(
              latitude, longitude, cityAnchor, 300_000)) {
        log.warn("AI 坐标偏离城市锚点过远，准备走地理编码兜底: name={}, "
                + "aiLat={}, aiLng={}, anchorLat={}, anchorLng={}",
            item.getPoiName(), latitude, longitude, cityAnchor[0], cityAnchor[1]);
        latitude = null;
        longitude = null;
      }
      if (latitude == null || longitude == null) {
        Double[] resolved = coordinateService.resolveCoordinates(
            plan, item.getPoiName(), item.getPoiAddress());
        if (resolved != null) {
          latitude = resolved[0];
          longitude = resolved[1];
        }
      }
      item.setPoiLat(latitude);
      item.setPoiLng(longitude);
    } else if (StrUtil.isNotBlank(scheduleItem.getDescription())) {
      String name = scheduleItem.getDescription().split("[，。！？\\s]")[0].trim();
      item.setPoiName(name.length() > 12 ? name.substring(0, 12) : name);
    } else {
      item.setPoiName(scheduleItem.getPeriod() + "活动");
    }
  }

  private void applyPoiDetails(ScheduleItem scheduleItem, CheckinItem item) {
    if (scheduleItem.getPoi() == null) {
      return;
    }
    if (StrUtil.isBlank(item.getPoiAddress())) {
      item.setPoiAddress(scheduleItem.getPoi().getAddress());
    }
    item.setOpeningHours(blankToNull(scheduleItem.getPoi().getOpeningHours()));
    item.setAdmissionFee(blankToNull(scheduleItem.getPoi().getAdmissionFee()));
    item.setRating(blankToNull(scheduleItem.getPoi().getRating()));
    if (StrUtil.isBlank(item.getEstimatedVisitTime())) {
      item.setEstimatedVisitTime(blankToNull(scheduleItem.getPoi().getEstimatedVisitTime()));
    }
    item.setCategory(blankToNull(scheduleItem.getPoi().getCategory()));
    item.setPhone(blankToNull(scheduleItem.getPoi().getPhone()));
  }

  private void applyTransport(ScheduleItem scheduleItem, CheckinItem item) {
    if (CollUtil.isEmpty(scheduleItem.getTransportSegments())) {
      return;
    }
    try {
      item.setTransportToNext(
          objectMapper.writeValueAsString(scheduleItem.getTransportSegments().get(0)));
    } catch (Exception exception) {
      log.warn("序列化 transportToNext 失败: poiName={}, error={}",
          item.getPoiName(), exception.getMessage());
    }
  }

  private void applyNodeRevision(
      CheckinItem item,
      List<NodeRevisionResponse> revisions,
      int dayNumber,
      int itemIndex) {
    NodeRevisionResponse revision = revisions.stream()
        .filter(value -> value.getDayIndex() == dayNumber && value.getItemIndex() == itemIndex)
        .findFirst()
        .orElse(null);
    if (revision == null) {
      return;
    }
    if (revision.getCorrectedLat() != null && revision.getCorrectedLng() != null) {
      item.setCorrectedLat(revision.getCorrectedLat());
      item.setCorrectedLng(revision.getCorrectedLng());
    }
    if (Boolean.TRUE.equals(revision.isTransportCorrected())) {
      try {
        item.setTransportToNext(objectMapper.writeValueAsString(new TransportSegment(
            revision.getTransportMode() != null ? revision.getTransportMode() : "WALK",
            revision.getTransportDuration() != null ? revision.getTransportDuration() : 0,
            revision.getTransportDesc() != null ? revision.getTransportDesc() : "")));
      } catch (Exception exception) {
        log.warn("序列化 revision transportToNext 失败: poiName={}, error={}",
            item.getPoiName(), exception.getMessage());
      }
    }
  }

  private void applyDayLevelData(CheckinTask task, DayPlan dayPlan) {
    try {
      if (CollUtil.isNotEmpty(dayPlan.getMeals())) {
        task.setMealsJson(objectMapper.writeValueAsString(dayPlan.getMeals()));
      }
      if (dayPlan.getAccommodation() != null) {
        task.setAccommodationJson(objectMapper.writeValueAsString(dayPlan.getAccommodation()));
      }
      task.setTransportation(blankToNull(dayPlan.getTransportation()));
      task.setTip(blankToNull(dayPlan.getTip()));
      task.setTheme(blankToNull(dayPlan.getTheme()));
    } catch (Exception exception) {
      log.warn("序列化天级数据失败（day={}），跳过天级信息展示: {}",
          dayPlan.getDay(), exception.getMessage());
    }
  }

  private List<DayPlan> parseDayPlans(String resultJson) {
    try {
      ItineraryResponse response = objectMapper.readValue(resultJson, ItineraryResponse.class);
      if (CollUtil.isNotEmpty(response.getDays())) {
        return response.getDays();
      }
    } catch (Exception exception) {
      log.debug("Failed to parse as ItineraryResponse, trying raw array", exception);
    }
    try {
      return objectMapper.readValue(resultJson,
          objectMapper.getTypeFactory().constructCollectionType(List.class, DayPlan.class));
    } catch (Exception exception) {
      log.error("Failed to parse day plans from resultJson", exception);
      return new ArrayList<>();
    }
  }

  private TripPlan requirePlan(String planId, Long userId) {
    TripPlan plan = tripPlanMapper.selectById(planId);
    if (plan == null || plan.getDeletedAt() != null) {
      throw new PlanNotFoundException("行程清单不存在: " + planId);
    }
    if (userId != null && !userId.equals(plan.getUserId())) {
      throw new ForbiddenException("无权操作该清单");
    }
    return plan;
  }

  private ItineraryTask requireItineraryTask(TripPlan plan) {
    if (StrUtil.isBlank(plan.getActiveTaskId())) {
      throw new PlanNotFoundException("清单未关联有效的执行任务");
    }
    ItineraryTask task = itineraryTaskMapper.selectById(plan.getActiveTaskId());
    if (task == null || StrUtil.isBlank(task.getResultJson())) {
      throw new PlanNotFoundException("执行任务的结果数据不可用");
    }
    return task;
  }

  private String resolveDate(TripPlan plan, DayPlan dayPlan, int dayNumber) {
    if (StrUtil.isNotBlank(dayPlan.getDate())) {
      return dayPlan.getDate();
    }
    if (StrUtil.isBlank(plan.getPlannedDate())) {
      return null;
    }
    return LocalDate.parse(plan.getPlannedDate())
        .plusDays(dayNumber - 1L)
        .format(DateTimeFormatter.ISO_LOCAL_DATE);
  }

  private List<NodeRevisionResponse> loadNodeRevisionsSafe(String taskId) {
    try {
      return itineraryTaskService.listNodeRevisions(taskId);
    } catch (Exception exception) {
      log.warn("加载节点修正失败，跳过修正落地: taskId={}, error={}",
          taskId, exception.getMessage());
      return new ArrayList<>();
    }
  }

  private static String blankToNull(String value) {
    return StrUtil.isBlank(value) ? null : value;
  }

  /** transportToNext 的稳定序列化结构。 */
  private record TransportSegment(String mode, int durationMin, String description) {
  }
}
