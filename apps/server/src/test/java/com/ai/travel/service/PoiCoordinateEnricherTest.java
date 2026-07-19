package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ai.travel.config.AppGeocodingProperties;
import com.ai.travel.dto.geocoding.GeoRequest;
import com.ai.travel.dto.geocoding.GeoResult;
import com.ai.travel.dto.response.DayPlan;
import com.ai.travel.dto.response.ItineraryResponse;
import com.ai.travel.dto.response.MealItem;
import com.ai.travel.dto.response.PoiInfo;
import com.ai.travel.dto.response.ScheduleItem;
import com.ai.travel.task.TaskExecutionCancelledException;
import com.ai.travel.task.TaskExecutionContext;
import com.ai.travel.task.TaskExecutionContext.CancellationReason;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** POI 坐标增强器测试。 */
class PoiCoordinateEnricherTest {

  private final GeocodingService geocodingService = mock(GeocodingService.class);
  private PoiCoordinateEnricher enricher;

  @BeforeEach
  void setUp() {
    AppGeocodingProperties properties = new AppGeocodingProperties();
    properties.setEnabled(true);
    properties.setProvider("nominatim");
    enricher = new PoiCoordinateEnricher(geocodingService, properties);
  }

  @Test
  void enrichOverridesAiCoordinateWithGeocodedResult() {
    when(geocodingService.geocode(any(GeoRequest.class))).thenReturn(qingdao(36.08, 120.35));
    PoiInfo poi = poi("大学路", 99.9, 88.8);
    poi.setAddress("市南区大学路");
    ItineraryResponse response = itineraryWithSchedule(poi);

    enricher.enrich(response, "青岛行程", "青岛");

    assertThat(poi.getLatitude()).isEqualTo(36.08);
    assertThat(poi.getLongitude()).isEqualTo(120.35);
    verify(geocodingService).geocode(any(GeoRequest.class));
  }

  @Test
  void enrichForcesGeocodeEvenWhenAiCoordinateLooksValid() {
    when(geocodingService.geocode(any(GeoRequest.class))).thenReturn(qingdao(36.081, 120.351));
    PoiInfo poi = poi("小鱼山", 36.06, 120.33);

    enricher.enrich(itineraryWithSchedule(poi), "青岛行程", "青岛");

    assertThat(poi.getLatitude()).isEqualTo(36.081);
    assertThat(poi.getLongitude()).isEqualTo(120.351);
  }

  @Test
  void enrichFillsScheduleMealsAndAccommodation() {
    when(geocodingService.geocode(any(GeoRequest.class))).thenReturn(qingdao(36.08, 120.35));
    PoiInfo schedulePoi = poi("大学路", null, null);
    PoiInfo mealPoi = poi("船歌鱼水饺", null, null);
    PoiInfo accommodation = poi("青岛海景花园大酒店", null, null);
    ScheduleItem item = new ScheduleItem();
    item.setPoi(schedulePoi);
    MealItem meal = new MealItem();
    meal.setPoi(mealPoi);
    DayPlan day = new DayPlan();
    day.setSchedule(List.of(item));
    day.setMeals(List.of(meal));
    day.setAccommodation(accommodation);
    ItineraryResponse response = new ItineraryResponse();
    response.setDays(List.of(day));

    enricher.enrich(response, "青岛行程", "青岛");

    assertThat(schedulePoi.getLatitude()).isEqualTo(36.08);
    assertThat(mealPoi.getLatitude()).isEqualTo(36.08);
    assertThat(accommodation.getLatitude()).isEqualTo(36.08);
    verify(geocodingService, times(3)).geocode(any(GeoRequest.class));
  }

  @Test
  void enrichContinuesWithLaterPoisAfterOneCoordinateMiss() {
    when(geocodingService.geocode(any(GeoRequest.class)))
        .thenReturn(null)
        .thenReturn(kunming());
    PoiInfo first = poi("翠湖公园", null, null);
    PoiInfo second = poi("云南大学", null, null);
    ScheduleItem firstItem = new ScheduleItem();
    firstItem.setPoi(first);
    ScheduleItem secondItem = new ScheduleItem();
    secondItem.setPoi(second);
    DayPlan day = new DayPlan();
    day.setSchedule(List.of(firstItem, secondItem));
    ItineraryResponse response = new ItineraryResponse();
    response.setDays(List.of(day));

    enricher.enrich(response, "昆明行程", "昆明");

    assertThat(first.getLatitude()).isNull();
    assertThat(second.getLatitude()).isEqualTo(25.04);
    assertThat(second.getLongitude()).isEqualTo(102.73);
    verify(geocodingService, times(2)).geocode(any(GeoRequest.class));
  }

  @Test
  void enrichSkipsPoiWithoutName() {
    PoiInfo poi = poi(null, 36.08, 120.35);

    enricher.enrich(itineraryWithSchedule(poi), "青岛行程", "青岛");

    verify(geocodingService, never()).geocode(any(GeoRequest.class));
  }

  @Test
  void enrichKeepsAiOutputWhenGeocodingFails() {
    when(geocodingService.geocode(any(GeoRequest.class))).thenReturn(null);
    PoiInfo poi = poi("大学路", 36.06, 120.33);

    enricher.enrich(itineraryWithSchedule(poi), "青岛行程", "青岛");

    assertThat(poi.getLatitude()).isEqualTo(36.06);
    assertThat(poi.getLongitude()).isEqualTo(120.33);
  }

  @Test
  void enrichStopsBeforeProviderCallWhenTaskIsCancelled() {
    TaskExecutionContext execution = TaskExecutionContext.unbounded("task-cancelled");
    execution.cancel(CancellationReason.USER_CANCELLED);

    assertThatThrownBy(() -> enricher.enrich(
        itineraryWithSchedule(poi("大学路", null, null)),
        "青岛行程",
        "青岛",
        execution))
        .isInstanceOf(TaskExecutionCancelledException.class);
    verify(geocodingService, never()).geocode(any(GeoRequest.class));
  }

  private static GeoResult qingdao(double latitude, double longitude) {
    return GeoResult.builder()
        .latitude(latitude)
        .longitude(longitude)
        .level("兴趣点")
        .provider("gaode")
        .province("山东省")
        .city("青岛市")
        .district("市南区")
        .destinationSatisfied(true)
        .build();
  }

  private static GeoResult kunming() {
    return GeoResult.builder()
        .latitude(25.04)
        .longitude(102.73)
        .level("兴趣点")
        .provider("gaode")
        .province("云南省")
        .city("昆明市")
        .district("五华区")
        .destinationSatisfied(true)
        .build();
  }

  private static PoiInfo poi(String name, Double latitude, Double longitude) {
    PoiInfo poi = new PoiInfo();
    poi.setName(name);
    poi.setLatitude(latitude);
    poi.setLongitude(longitude);
    return poi;
  }

  private static ItineraryResponse itineraryWithSchedule(PoiInfo poi) {
    ScheduleItem item = new ScheduleItem();
    item.setPoi(poi);
    DayPlan day = new DayPlan();
    day.setSchedule(List.of(item));
    ItineraryResponse response = new ItineraryResponse();
    response.setDays(List.of(day));
    return response;
  }
}
