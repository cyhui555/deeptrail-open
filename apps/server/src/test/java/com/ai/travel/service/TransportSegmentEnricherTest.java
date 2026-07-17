package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.ai.travel.dto.response.DayPlan;
import com.ai.travel.dto.response.ItineraryResponse;
import com.ai.travel.dto.response.PoiInfo;
import com.ai.travel.dto.response.ScheduleItem;
import java.util.List;
import org.junit.jupiter.api.Test;

/** 行程交通段增强器测试。 */
class TransportSegmentEnricherTest {

  private final TransportSegmentEnricher enricher = new TransportSegmentEnricher();

  @Test
  void enrichFillsMissingSegments() {
    ScheduleItem first = schedule("POI-A", 30.67, 104.06);
    ScheduleItem second = schedule("POI-B", 30.68, 104.07);
    ScheduleItem last = schedule("POI-C", 30.69, 104.08);
    ItineraryResponse response = itinerary(first, second, last);

    enricher.enrich(response);

    assertThat(first.getTransportSegments()).hasSize(1);
    assertThat(first.getTransportSegments().get(0).getMode()).isIn("WALK", "DRIVE");
    assertThat(first.getTransportSegments().get(0).getDurationMin()).isGreaterThan(0);
    assertThat(second.getTransportSegments()).hasSize(1);
    assertThat(last.getTransportSegments()).isNull();
  }

  @Test
  void enrichPreservesAiOutput() {
    ScheduleItem first = schedule("X", 30.67, 104.06);
    ScheduleItem.TransportSegment segment = new ScheduleItem.TransportSegment();
    segment.setMode("SUBWAY");
    segment.setDurationMin(25);
    segment.setDescription("地铁25分钟");
    first.setTransportSegments(List.of(segment));
    ItineraryResponse response = itinerary(first, schedule("Y", 30.68, 104.07));

    enricher.enrich(response);

    assertThat(first.getTransportSegments().get(0).getMode()).isEqualTo("SUBWAY");
    assertThat(first.getTransportSegments().get(0).getDurationMin()).isEqualTo(25);
  }

  @Test
  void enrichSkipsWhenCoordinatesMissing() {
    ScheduleItem first = schedule("NoCoord", null, null);
    ItineraryResponse response = itinerary(first, schedule("HasCoord", 30.68, 104.07));

    enricher.enrich(response);

    assertThat(first.getTransportSegments()).isNull();
  }

  private static ScheduleItem schedule(String name, Double latitude, Double longitude) {
    PoiInfo poi = new PoiInfo();
    poi.setName(name);
    poi.setLatitude(latitude);
    poi.setLongitude(longitude);
    ScheduleItem item = new ScheduleItem();
    item.setPoi(poi);
    return item;
  }

  private static ItineraryResponse itinerary(ScheduleItem... items) {
    DayPlan day = new DayPlan();
    day.setSchedule(List.of(items));
    ItineraryResponse response = new ItineraryResponse();
    response.setDays(List.of(day));
    return response;
  }
}
