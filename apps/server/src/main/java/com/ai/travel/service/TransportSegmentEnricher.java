package com.ai.travel.service;

import cn.hutool.core.collection.CollUtil;
import com.ai.travel.dto.response.DayPlan;
import com.ai.travel.dto.response.ItineraryResponse;
import com.ai.travel.dto.response.OptimizeResponse;
import com.ai.travel.dto.response.ScheduleItem;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/** 根据相邻 POI 坐标补全 AI 未返回的交通段。 */
@Service
@Slf4j
public class TransportSegmentEnricher {

  /** 增强生成行程响应。 */
  public void enrich(ItineraryResponse response) {
    if (response == null || CollUtil.isEmpty(response.getDays())) {
      return;
    }
    int enriched = enrichDays(response.getDays());
    if (enriched > 0) {
      log.info("[TransportEnrich] enriched {} segment(s) by coordinate estimation", enriched);
    }
  }

  /** 增强优化行程响应。 */
  public void enrich(OptimizeResponse response) {
    if (response == null || CollUtil.isEmpty(response.getDays())) {
      return;
    }
    enrichDays(response.getDays());
  }

  private int enrichDays(List<DayPlan> days) {
    int enriched = 0;
    for (DayPlan day : days) {
      if (day == null || CollUtil.isEmpty(day.getSchedule())) {
        continue;
      }
      List<ScheduleItem> schedule = day.getSchedule();
      for (int index = 0; index < schedule.size() - 1; index++) {
        ScheduleItem item = schedule.get(index);
        if (item == null || CollUtil.isNotEmpty(item.getTransportSegments())) {
          continue;
        }
        if (enrichByDistance(item, schedule.get(index + 1))) {
          enriched++;
        }
      }
    }
    return enriched;
  }

  private boolean enrichByDistance(ScheduleItem item, ScheduleItem nextItem) {
    if (item.getPoi() == null || nextItem == null || nextItem.getPoi() == null) {
      return false;
    }
    Double lat1 = item.getPoi().getLatitude();
    Double lng1 = item.getPoi().getLongitude();
    Double lat2 = nextItem.getPoi().getLatitude();
    Double lng2 = nextItem.getPoi().getLongitude();
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) {
      return false;
    }
    double distance = haversineMeters(lat1, lng1, lat2, lng2);
    item.setTransportSegments(List.of(estimateTransport(distance, nextItem.getPoi().getName())));
    return true;
  }

  private ScheduleItem.TransportSegment estimateTransport(double distance, String nextPoiName) {
    ScheduleItem.TransportSegment segment = new ScheduleItem.TransportSegment();
    segment.setDescription(nextPoiName);
    if (distance <= 800) {
      segment.setMode("WALK");
      segment.setDurationMin(Math.max(5, (int) Math.ceil(distance / 80)));
    } else if (distance <= 100_000) {
      segment.setMode("DRIVE");
      segment.setDurationMin((int) Math.ceil(distance / 500) + 5);
    } else if (distance <= 1_500_000) {
      segment.setMode("TRAIN");
      segment.setDurationMin(Math.max(60, (int) (distance / 3000.0)));
    } else {
      segment.setMode("FLIGHT");
      segment.setDurationMin(90 + (int) (distance / 13000.0));
    }
    return segment;
  }

  private double haversineMeters(double lat1, double lng1, double lat2, double lng2) {
    final double earthRadiusMeters = 6_371_000;
    double latitudeDelta = Math.toRadians(lat2 - lat1);
    double longitudeDelta = Math.toRadians(lng2 - lng1);
    double value = Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2)
        + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
        * Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);
    return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }
}
