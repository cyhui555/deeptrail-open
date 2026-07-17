package com.ai.travel.service;

import com.ai.travel.dto.request.AddCustomItemRequest;
import com.ai.travel.dto.request.CheckinRequest;
import com.ai.travel.dto.request.EditCustomItemRequest;
import com.ai.travel.dto.response.CheckinItemResponse;
import com.ai.travel.dto.response.CheckinTaskResponse;
import com.ai.travel.mapper.CheckinItemMapper;
import com.ai.travel.mapper.CheckinMediaMapper;
import com.ai.travel.mapper.CheckinTaskMapper;
import com.ai.travel.mapper.ItineraryTaskMapper;
import com.ai.travel.mapper.TripPlanMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 签到领域兼容门面。
 *
 * <p>Controller 继续依赖这个稳定入口；创建、查询、坐标、命令和执行职责由独立服务承接。
 */
@Service
public class CheckinTaskService {

  private final CheckinTaskCreationService creationService;
  private final CheckinQueryService queryService;
  private final CheckinCoordinateService coordinateService;
  private final CheckinItemCommandService itemCommandService;
  private final CheckinExecutionService executionService;

  /** 生产环境由 Spring 注入各职责服务，确保事务代理在跨服务调用时生效。 */
  @Autowired
  public CheckinTaskService(
      CheckinTaskCreationService creationService,
      CheckinQueryService queryService,
      CheckinCoordinateService coordinateService,
      CheckinItemCommandService itemCommandService,
      CheckinExecutionService executionService) {
    this.creationService = creationService;
    this.queryService = queryService;
    this.coordinateService = coordinateService;
    this.itemCommandService = itemCommandService;
    this.executionService = executionService;
  }

  /**
   * 兼容既有单元测试的构造入口；生产环境不使用此构造器。
   * 后续组件测试完成迁移后可删除。
   */
  public CheckinTaskService(
      CheckinTaskMapper checkinTaskMapper,
      CheckinItemMapper checkinItemMapper,
      CheckinMediaMapper checkinMediaMapper,
      CheckinAccessService checkinAccessService,
      ItineraryTaskMapper itineraryTaskMapper,
      TripPlanMapper tripPlanMapper,
      ObjectMapper objectMapper,
      GeocodingService geocodingService,
      ItineraryTaskService itineraryTaskService) {
    CheckinCoordinateService coordinates = new CheckinCoordinateService(
        checkinTaskMapper,
        checkinItemMapper,
        tripPlanMapper,
        geocodingService,
        itineraryTaskMapper,
        objectMapper);
    CheckinResponseAssembler assembler = new CheckinResponseAssembler(checkinMediaMapper);
    this.coordinateService = coordinates;
    this.creationService = new CheckinTaskCreationService(
        itineraryTaskMapper,
        tripPlanMapper,
        objectMapper,
        coordinates,
        itineraryTaskService,
        new CheckinTaskWriter(checkinTaskMapper, checkinItemMapper));
    this.queryService = new CheckinQueryService(
        checkinTaskMapper,
        checkinItemMapper,
        checkinAccessService,
        assembler);
    this.itemCommandService = new CheckinItemCommandService(
        checkinTaskMapper, checkinItemMapper);
    this.executionService = new CheckinExecutionService(
        checkinTaskMapper, checkinItemMapper, checkinMediaMapper, tripPlanMapper);
  }

  public String startCheckinTask(String planId, Long userId, Integer startDay) {
    return creationService.startCheckinTask(planId, userId, startDay);
  }

  public List<CheckinTaskResponse> getCheckinTasks(String planId) {
    return queryService.getCheckinTasks(planId);
  }

  public CheckinTaskResponse getCheckinTaskById(String checkinTaskId) {
    return queryService.getCheckinTaskById(checkinTaskId);
  }

  public int backfillMissingCoordinates(String planId) {
    return coordinateService.backfillMissingCoordinates(planId);
  }

  public int forceRefillCoordinates(String planId) {
    return coordinateService.forceRefillCoordinates(planId);
  }

  public Long addCustomItem(String taskId, AddCustomItemRequest request, Long userId) {
    return itemCommandService.addCustomItem(taskId, request, userId);
  }

  public void editCustomItem(Long itemId, Long userId, EditCustomItemRequest request) {
    itemCommandService.editCustomItem(itemId, userId, request);
  }

  public void abandonCheckin(Long itemId, Long userId) {
    itemCommandService.abandonCheckin(itemId, userId);
  }

  public void updateItemCoordinates(Long itemId, Double latitude, Double longitude, Long userId) {
    itemCommandService.updateItemCoordinates(itemId, latitude, longitude, userId);
  }

  public void checkin(Long itemId, CheckinRequest request, Long userId) {
    executionService.checkin(itemId, request, userId);
  }

  public void undoCheckin(Long itemId, Long userId) {
    executionService.undoCheckin(itemId, userId);
  }

  public CheckinItemResponse getCheckinItemDetail(Long itemId, Long userId) {
    return queryService.getCheckinItemDetail(itemId, userId);
  }
}
