package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ai.travel.dto.geocoding.GeoRequest;
import com.ai.travel.dto.geocoding.GeoResult;
import com.ai.travel.entity.CheckinItem;
import com.ai.travel.entity.CheckinTask;
import com.ai.travel.entity.ItineraryTask;
import com.ai.travel.entity.TripPlan;
import com.ai.travel.mapper.CheckinItemMapper;
import com.ai.travel.mapper.CheckinTaskMapper;
import com.ai.travel.mapper.ItineraryTaskMapper;
import com.ai.travel.mapper.TripPlanMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** 跨城行程坐标回填规则测试。 */
@ExtendWith(MockitoExtension.class)
class CheckinCoordinateServiceTest {

  @Mock private CheckinTaskMapper checkinTaskMapper;
  @Mock private CheckinItemMapper checkinItemMapper;
  @Mock private TripPlanMapper tripPlanMapper;
  @Mock private GeocodingService geocodingService;
  @Mock private ItineraryTaskMapper itineraryTaskMapper;

  private CheckinCoordinateService service;

  @BeforeEach
  void setUp() {
    service = new CheckinCoordinateService(
        checkinTaskMapper,
        checkinItemMapper,
        tripPlanMapper,
        geocodingService,
        itineraryTaskMapper,
        new ObjectMapper());
  }

  @Test
  @DisplayName("目的地校验失败后，明确包含出发地的机场应按出发地重试")
  void resolveCoordinatesRetriesExplicitDepartureNode() {
    TripPlan plan = new TripPlan();
    plan.setDestination("川西");
    plan.setActiveTaskId("task-1");
    ItineraryTask task = new ItineraryTask();
    task.setId("task-1");
    task.setRequestJson("{\"departureLocation\":\"杭州\"}");
    when(itineraryTaskMapper.selectById("task-1")).thenReturn(task);
    when(geocodingService.geocode(any(GeoRequest.class)))
        .thenReturn(null)
        .thenReturn(GeoResult.builder()
            .latitude(30.234708)
            .longitude(120.432413)
            .provider("gaode")
            .build());

    Double[] coordinates = service.resolveCoordinates(
        plan, "杭州萧山国际机场", "杭州市萧山区空港大道");

    assertThat(coordinates).containsExactly(30.234708, 120.432413);
    ArgumentCaptor<GeoRequest> requestCaptor = ArgumentCaptor.forClass(GeoRequest.class);
    verify(geocodingService, org.mockito.Mockito.times(2)).geocode(requestCaptor.capture());
    List<GeoRequest> requests = requestCaptor.getAllValues();
    assertThat(requests).extracting(GeoRequest::getDestination)
        .containsExactly("川西", "杭州");
  }

  @Test
  @DisplayName("地点未提及出发地时不得放宽到出发地坐标")
  void resolveCoordinatesDoesNotRetryUnrelatedNode() {
    TripPlan plan = new TripPlan();
    plan.setDestination("川西");
    plan.setActiveTaskId("task-1");
    ItineraryTask task = new ItineraryTask();
    task.setId("task-1");
    task.setRequestJson("{\"departureLocation\":\"杭州\"}");
    when(itineraryTaskMapper.selectById("task-1")).thenReturn(task);
    when(geocodingService.geocode(any(GeoRequest.class))).thenReturn(null);

    Double[] coordinates = service.resolveCoordinates(plan, "四姑娘山", "四川省小金县");

    assertThat(coordinates).isNull();
    verify(geocodingService).geocode(any(GeoRequest.class));
  }

  @Test
  @DisplayName("BUG-20260719-001: 9 个坐标仅 3 个重查成功时保留其余旧值并并发解析")
  void forceRefillPartialSuccessPreservesExistingCoordinates() throws Exception {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setDestination("青岛");
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);
    CheckinTask task = new CheckinTask();
    task.setId("checkin-task-1");
    when(checkinTaskMapper.selectList(any())).thenReturn(List.of(task));

    List<CheckinItem> items = java.util.stream.IntStream.rangeClosed(1, 9)
        .mapToObj(index -> {
          CheckinItem item = new CheckinItem();
          item.setId((long) index);
          item.setCheckinTaskId(task.getId());
          item.setPoiName("POI-" + index);
          item.setPoiLat(36.0 + index / 100.0);
          item.setPoiLng(120.0 + index / 100.0);
          return item;
        })
        .toList();
    when(checkinItemMapper.selectList(any())).thenReturn(items);
    when(checkinItemMapper.updateById(any(CheckinItem.class))).thenReturn(1);

    CountDownLatch fourLookupsStarted = new CountDownLatch(4);
    CountDownLatch releaseLookups = new CountDownLatch(1);
    AtomicInteger lookupSequence = new AtomicInteger();
    AtomicInteger activeLookups = new AtomicInteger();
    AtomicInteger maxActiveLookups = new AtomicInteger();
    when(geocodingService.geocode(any(GeoRequest.class))).thenAnswer(invocation -> {
      int sequence = lookupSequence.incrementAndGet();
      int active = activeLookups.incrementAndGet();
      maxActiveLookups.accumulateAndGet(active, Math::max);
      fourLookupsStarted.countDown();
      try {
        if (!releaseLookups.await(5, TimeUnit.SECONDS)) {
          throw new AssertionError("坐标解析并发闸门未释放");
        }
        return sequence <= 3
            ? GeoResult.builder()
                .latitude(36.5 + sequence / 100.0)
                .longitude(120.5 + sequence / 100.0)
                .provider("gaode")
                .build()
            : null;
      } finally {
        activeLookups.decrementAndGet();
      }
    });

    ExecutorService executor = Executors.newFixedThreadPool(4);
    try {
      CheckinCoordinateService parallelService = new CheckinCoordinateService(
          checkinTaskMapper, checkinItemMapper, tripPlanMapper, geocodingService,
          itineraryTaskMapper, new ObjectMapper(), executor);
      CompletableFuture<Integer> resultFuture = CompletableFuture.supplyAsync(
          () -> parallelService.forceRefillCoordinates("plan-1"));

      assertThat(fourLookupsStarted.await(5, TimeUnit.SECONDS)).isTrue();
      releaseLookups.countDown();
      assertThat(resultFuture.get(10, TimeUnit.SECONDS)).isEqualTo(3);
    } finally {
      releaseLookups.countDown();
      executor.shutdownNow();
    }

    assertThat(maxActiveLookups.get()).isGreaterThanOrEqualTo(4);
    verify(checkinItemMapper, org.mockito.Mockito.times(3)).updateById(any(CheckinItem.class));
    assertThat(items).allSatisfy(item -> {
      assertThat(item.getPoiLat()).isNotNull();
      assertThat(item.getPoiLng()).isNotNull();
    });
  }
}
