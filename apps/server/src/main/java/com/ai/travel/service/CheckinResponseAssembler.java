package com.ai.travel.service;

import cn.hutool.core.util.StrUtil;
import com.ai.travel.dto.response.CheckinItemResponse;
import com.ai.travel.dto.response.CheckinTaskResponse;
import com.ai.travel.entity.CheckinItem;
import com.ai.travel.entity.CheckinMedia;
import com.ai.travel.entity.CheckinTask;
import com.ai.travel.mapper.CheckinMediaMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** 将签到实体转换为 API 响应，集中维护展示字段和媒体过滤规则。 */
@Component
@RequiredArgsConstructor
public class CheckinResponseAssembler {

  private final CheckinMediaMapper checkinMediaMapper;

  /** 批量组装任务、打卡项和媒体，保证媒体查询次数不随打卡项数量增长。 */
  public List<CheckinTaskResponse> toTaskResponses(
      List<CheckinTask> tasks, List<CheckinItem> items) {
    Map<String, List<CheckinItem>> itemsByTaskId = items.stream()
        .collect(Collectors.groupingBy(CheckinItem::getCheckinTaskId));
    Map<Long, List<CheckinMedia>> mediaByItemId = loadMedia(items);
    return tasks.stream()
        .map(task -> toTaskResponse(
            task,
            itemsByTaskId.getOrDefault(task.getId(), List.of()),
            mediaByItemId))
        .toList();
  }

  /** 组装任务响应及其签到项。 */
  public CheckinTaskResponse toTaskResponse(CheckinTask task, List<CheckinItem> items) {
    return toTaskResponse(task, items, loadMedia(items));
  }

  private CheckinTaskResponse toTaskResponse(
      CheckinTask task,
      List<CheckinItem> items,
      Map<Long, List<CheckinMedia>> mediaByItemId) {
    CheckinTaskResponse response = new CheckinTaskResponse();
    response.setId(task.getId());
    response.setDayNumber(task.getDayNumber());
    response.setItineraryDate(task.getItineraryDate());
    response.setStatus(task.getStatus());
    response.setTotalPoi(task.getTotalPoi());
    response.setCompletedPoi(task.getCompletedPoi());
    response.setMealsJson(task.getMealsJson());
    response.setAccommodationJson(task.getAccommodationJson());
    response.setTransportation(task.getTransportation());
    response.setTip(task.getTip());
    response.setTheme(task.getTheme());
    response.setItems(items.stream()
        .map(item -> toItemResponse(
            item, mediaByItemId.getOrDefault(item.getId(), List.of())))
        .toList());
    return response;
  }

  /** 组装签到项响应，并只加载当前有效媒体。 */
  public CheckinItemResponse toItemResponse(CheckinItem item) {
    return toItemResponse(item, loadMedia(item.getId()));
  }

  private CheckinItemResponse toItemResponse(CheckinItem item, List<CheckinMedia> media) {
    CheckinItemResponse response = new CheckinItemResponse();
    response.setId(item.getId());
    response.setPoiName(item.getPoiName());
    response.setPoiAddress(item.getPoiAddress());
    response.setPoiLat(item.getPoiLat());
    response.setPoiLng(item.getPoiLng());
    response.setCheckinLat(item.getCheckinLat());
    response.setCheckinLng(item.getCheckinLng());
    response.setDistanceMeters(item.getDistanceMeters());
    response.setSource(item.getSource());
    response.setNote(item.getNote());
    response.setStatus(item.getStatus());
    response.setCheckedInAt(item.getCheckedInAt());
    response.setPeriod(item.getPeriod());
    response.setDescription(item.getDescription());
    response.setEstimatedVisitTime(item.getEstimatedVisitTime());
    response.setOpeningHours(item.getOpeningHours());
    response.setAdmissionFee(item.getAdmissionFee());
    response.setEstimatedCost(item.getEstimatedCost());
    response.setRating(item.getRating());
    response.setCategory(item.getCategory());
    response.setPhone(item.getPhone());
    response.setIsCustom(item.getIsCustom());
    response.setDisplayLat(item.getCorrectedLat() != null
        ? item.getCorrectedLat() : item.getPoiLat());
    response.setDisplayLng(item.getCorrectedLng() != null
        ? item.getCorrectedLng() : item.getPoiLng());
    response.setIsCoordinateCorrected(
        item.getCorrectedLat() != null && item.getCorrectedLng() != null);
    response.setTransportToNext(item.getTransportToNext());
    response.setMedia(media.stream().map(this::toMediaItemDto).toList());
    return response;
  }

  private List<CheckinMedia> loadMedia(Long itemId) {
    LambdaQueryWrapper<CheckinMedia> wrapper = new LambdaQueryWrapper<>();
    wrapper.eq(CheckinMedia::getCheckinItemId, itemId)
        .eq(CheckinMedia::getIsHistory, false);
    return checkinMediaMapper.selectList(wrapper);
  }

  private Map<Long, List<CheckinMedia>> loadMedia(List<CheckinItem> items) {
    if (items.isEmpty()) {
      return Collections.emptyMap();
    }
    List<Long> itemIds = items.stream().map(CheckinItem::getId).toList();
    LambdaQueryWrapper<CheckinMedia> wrapper = new LambdaQueryWrapper<>();
    wrapper.in(CheckinMedia::getCheckinItemId, itemIds)
        .eq(CheckinMedia::getIsHistory, false);
    return checkinMediaMapper.selectList(wrapper).stream()
        .collect(Collectors.groupingBy(CheckinMedia::getCheckinItemId));
  }

  private CheckinItemResponse.MediaItemDto toMediaItemDto(CheckinMedia media) {
    CheckinItemResponse.MediaItemDto dto = new CheckinItemResponse.MediaItemDto();
    dto.setId(media.getId());
    dto.setMediaType(media.getMediaType());
    dto.setUrl("/api/media/" + media.getId());
    if (StrUtil.isNotBlank(media.getThumbnailPath())) {
      dto.setThumbnailUrl("/api/media/thumbnail/" + media.getId());
    }
    return dto;
  }
}
