package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ai.travel.dto.request.TrackPointUploadRequest;
import com.ai.travel.dto.request.TrackPointUploadRequest.TrackPointDto;
import com.ai.travel.entity.TrackPoint;
import com.ai.travel.entity.TripPlan;
import com.ai.travel.exception.ForbiddenException;
import com.ai.travel.mapper.TrackPointMapper;
import com.ai.travel.mapper.TripPlanMapper;
import com.ai.travel.security.UserContext;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** TrackService 单元测试。 */
@ExtendWith(MockitoExtension.class)
class TrackServiceTest {

  @Mock private TrackPointMapper trackPointMapper;
  @Mock private TripPlanMapper tripPlanMapper;

  private TrackService trackService;

  @BeforeEach
  void setUp() {
    UserContext.setUserId(1L);
    trackService = new TrackService(trackPointMapper, tripPlanMapper);
  }

  @AfterEach
  void tearDown() {
    UserContext.clear();
  }

  @Test
  @DisplayName("批量上传轨迹点应逐条插入")
  void batchSavePoints_persistsEachPoint() {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setUserId(1L);
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);

    TrackPointDto p = new TrackPointDto();
    p.setLatitude(39.9042);
    p.setLongitude(116.4074);
    p.setAccuracy(5.0);
    p.setRecordedAt("2026-07-01T10:00:00");
    TrackPointUploadRequest req = new TrackPointUploadRequest();
    req.setPoints(List.of(p));

    when(trackPointMapper.insert((com.ai.travel.entity.TrackPoint) any())).thenReturn(1);

    int count = trackService.batchSavePoints("plan-1", req.getPoints(), 1L);

    assertThat(count).isEqualTo(1);
    verify(trackPointMapper).insert((com.ai.travel.entity.TrackPoint) any());
  }

  @Test
  @DisplayName("accuracy > 50m 的点应被过滤")
  void batchSavePoints_filtersLowAccuracyPoints() {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setUserId(1L);
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);

    TrackPointDto good = new TrackPointDto();
    good.setLatitude(39.9042);
    good.setLongitude(116.4074);
    good.setAccuracy(10.0);
    good.setRecordedAt("2026-07-01T10:00:00");
    TrackPointDto bad = new TrackPointDto();
    bad.setLatitude(39.9042);
    bad.setLongitude(116.4074);
    bad.setAccuracy(60.0);
    bad.setRecordedAt("2026-07-01T10:00:00");
    TrackPointUploadRequest req = new TrackPointUploadRequest();
    req.setPoints(List.of(good, bad));

    when(trackPointMapper.insert((com.ai.travel.entity.TrackPoint) any())).thenReturn(1);

    int count = trackService.batchSavePoints("plan-1", req.getPoints(), 1L);

    assertThat(count).isEqualTo(1);
  }

  @Test
  @DisplayName("已持久化的客户端轨迹点 ID 应在应用层预查后跳过")
  void batchSavePoints_existingClientPointId_isSkipped() {
    TripPlan plan = ownedPlan("plan-1", 1L);
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);
    when(trackPointMapper.selectExistingClientPointIds("plan-1", List.of("point-1")))
        .thenReturn(List.of("point-1"));

    int count = trackService.batchSavePoints(
        "plan-1", List.of(point("point-1", "2026-07-01T10:00:00")), 1L);

    assertThat(count).isZero();
    verify(trackPointMapper, never()).insertIdempotently(any());
  }

  @Test
  @DisplayName("同一批次内重复客户端轨迹点 ID 应只插入一次")
  void batchSavePoints_duplicateClientPointIdInBatch_isInsertedOnce() {
    when(tripPlanMapper.selectById("plan-1")).thenReturn(ownedPlan("plan-1", 1L));
    when(trackPointMapper.selectExistingClientPointIds("plan-1", List.of("point-1")))
        .thenReturn(List.of());
    when(trackPointMapper.insertIdempotently(any())).thenReturn(1);

    int count = trackService.batchSavePoints(
        "plan-1",
        List.of(
            point("point-1", "2026-07-01T10:00:00"),
            point("point-1", "2026-07-01T10:00:01")),
        1L);

    assertThat(count).isEqualTo(1);
    verify(trackPointMapper, times(1)).insertIdempotently(any());
  }

  @Test
  @DisplayName("并发重复轨迹点由数据库裁决为零行写入时应成功返回")
  void batchSavePoints_concurrentDuplicate_isIgnored() {
    when(tripPlanMapper.selectById("plan-1")).thenReturn(ownedPlan("plan-1", 1L));
    when(trackPointMapper.selectExistingClientPointIds("plan-1", List.of("point-1")))
        .thenReturn(List.of());
    when(trackPointMapper.insertIdempotently(any())).thenReturn(0);

    int count = trackService.batchSavePoints(
        "plan-1", List.of(point("point-1", "2026-07-01T10:00:00")), 1L);

    assertThat(count).isZero();
    verify(trackPointMapper).insertIdempotently(any());
  }

  @Test
  @DisplayName("UTC Z 记录时间应按 UTC 持久化")
  void batchSavePoints_utcInstant_isPersistedAsUtc() {
    assertRecordedAtNormalized(
        "2026-07-01T10:00:00Z",
        LocalDateTime.of(2026, 7, 1, 10, 0));
  }

  @Test
  @DisplayName("带偏移量记录时间应归一为 UTC")
  void batchSavePoints_offsetDateTime_isNormalizedToUtc() {
    assertRecordedAtNormalized(
        "2026-07-01T10:00:00+08:00",
        LocalDateTime.of(2026, 7, 1, 2, 0));
  }

  @Test
  @DisplayName("旧无时区记录时间应按固定 UTC+08:00 归一为 UTC")
  void batchSavePoints_legacyLocalDateTime_isNormalizedFromUtc8() {
    assertRecordedAtNormalized(
        "2026-07-01T10:00:00",
        LocalDateTime.of(2026, 7, 1, 2, 0));
  }

  @Test
  @DisplayName("非法记录时间应抛出明确的参数异常")
  void batchSavePoints_invalidRecordedAt_throwsValidationError() {
    when(tripPlanMapper.selectById("plan-1")).thenReturn(ownedPlan("plan-1", 1L));
    when(trackPointMapper.selectExistingClientPointIds("plan-1", List.of("point-1")))
        .thenReturn(List.of());

    assertThatThrownBy(() -> trackService.batchSavePoints(
        "plan-1", List.of(point("point-1", "not-a-time")), 1L))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("recordedAt 格式无效")
        .hasMessageContaining("ISO 8601");

    verify(trackPointMapper, never()).insertIdempotently(any());
  }

  @Test
  @DisplayName("极端 offset 时间归一溢出时仍应抛出参数异常")
  void batchSavePoints_extremeOffsetDateTime_throwsValidationError() {
    when(tripPlanMapper.selectById("plan-1")).thenReturn(ownedPlan("plan-1", 1L));
    when(trackPointMapper.selectExistingClientPointIds("plan-1", List.of("point-1")))
        .thenReturn(List.of());

    assertThatThrownBy(() -> trackService.batchSavePoints(
        "plan-1",
        List.of(point("point-1", "+999999999-12-31T23:59:59-18:00")),
        1L))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("recordedAt 格式无效");

    verify(trackPointMapper, never()).insertIdempotently(any());
  }

  @Test
  @DisplayName("轨迹上传应在幂等预查前拒绝其他用户")
  void batchSavePoints_anotherUser_isRejectedBeforeDeduplication() {
    when(tripPlanMapper.selectById("plan-private"))
        .thenReturn(ownedPlan("plan-private", 2L));

    assertThatThrownBy(() -> trackService.batchSavePoints(
        "plan-private", List.of(point("point-1", "2026-07-01T10:00:00")), 1L))
        .isInstanceOf(ForbiddenException.class);

    verify(trackPointMapper, never()).selectExistingClientPointIds(any(), any());
    verify(trackPointMapper, never()).insertIdempotently(any());
  }

  @Test
  @DisplayName("空列表应返回 0")
  void batchSavePoints_emptyList_returnsZero() {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setUserId(1L);
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);

    int count = trackService.batchSavePoints("plan-1", List.of(), 1L);

    assertThat(count).isEqualTo(0);
    verify(trackPointMapper, never()).insert((com.ai.travel.entity.TrackPoint) any());
  }

  @Test
  @DisplayName("不存在的清单应抛出异常")
  void batchSavePoints_nonExistentPlan_throwsException() {
    when(tripPlanMapper.selectById("plan-999")).thenReturn(null);

    TrackPointDto p = new TrackPointDto();
    p.setLatitude(39.9042);
    p.setLongitude(116.4074);
    p.setAccuracy(5.0);
    p.setRecordedAt("2026-07-01T10:00:00");
    TrackPointUploadRequest req = new TrackPointUploadRequest();
    req.setPoints(List.of(p));

    assertThatThrownBy(() -> trackService.batchSavePoints("plan-999", req.getPoints(), 1L))
        .isInstanceOf(com.ai.travel.exception.PlanNotFoundException.class);
  }

  @Test
  @DisplayName("查询轨迹点应按时间排序返回")
  void getTrackPoints_returnsSortedList() {
    TripPlan plan = new TripPlan();
    plan.setId("plan-1");
    plan.setUserId(1L);
    when(tripPlanMapper.selectById("plan-1")).thenReturn(plan);
    List<com.ai.travel.entity.TrackPoint> points = List.of();
    when(trackPointMapper.selectList(any())).thenReturn(points);

    var result = trackService.getTrackPoints("plan-1", 1L);

    assertThat(result).isNotNull();
    verify(trackPointMapper).selectList(any());
  }

  @Test
  @DisplayName("查询轨迹点应拒绝其他用户")
  void getTrackPoints_rejectsAnotherUser() {
    TripPlan plan = new TripPlan();
    plan.setId("plan-private");
    plan.setUserId(2L);
    when(tripPlanMapper.selectById("plan-private")).thenReturn(plan);

    assertThatThrownBy(() -> trackService.getTrackPoints("plan-private", 1L))
        .isInstanceOf(ForbiddenException.class);

    verify(trackPointMapper, never()).selectList(any());
  }

  @Test
  @DisplayName("计算总距离 - 少于 2 个点应返回 0")
  void calculateTotalDistance_lessThan2Points_returnsZero() {
    when(trackPointMapper.selectList(any())).thenReturn(List.of());

    int distance = trackService.calculateTotalDistance("plan-1");

    assertThat(distance).isEqualTo(0);
  }

  @Test
  @DisplayName("计算总距离 - 多个点应返回累计距离")
  void calculateTotalDistance_multiplePoints_returnsTotalDistance() {
    com.ai.travel.entity.TrackPoint p1 = new com.ai.travel.entity.TrackPoint();
    p1.setLatitude(39.9042);
    p1.setLongitude(116.4074);
    p1.setRecordedAt(LocalDateTime.of(2026, 7, 1, 10, 0));
    com.ai.travel.entity.TrackPoint p2 = new com.ai.travel.entity.TrackPoint();
    p2.setLatitude(39.9163);
    p2.setLongitude(116.3972);
    p2.setRecordedAt(LocalDateTime.of(2026, 7, 1, 11, 0));
    when(trackPointMapper.selectList(any())).thenReturn(List.of(p1, p2));

    int distance = trackService.calculateTotalDistance("plan-1");

    assertThat(distance).isGreaterThan(0);
  }

  private TripPlan ownedPlan(String id, Long userId) {
    TripPlan plan = new TripPlan();
    plan.setId(id);
    plan.setUserId(userId);
    return plan;
  }

  private TrackPointDto point(String clientPointId, String recordedAt) {
    TrackPointDto point = new TrackPointDto();
    point.setClientPointId(clientPointId);
    point.setLatitude(39.9042);
    point.setLongitude(116.4074);
    point.setAccuracy(5.0);
    point.setRecordedAt(recordedAt);
    return point;
  }

  private void assertRecordedAtNormalized(String input, LocalDateTime expected) {
    when(tripPlanMapper.selectById("plan-1")).thenReturn(ownedPlan("plan-1", 1L));
    when(trackPointMapper.selectExistingClientPointIds("plan-1", List.of("point-1")))
        .thenReturn(List.of());
    when(trackPointMapper.insertIdempotently(any())).thenReturn(1);

    int count = trackService.batchSavePoints(
        "plan-1", List.of(point("point-1", input)), 1L);

    ArgumentCaptor<TrackPoint> captor = ArgumentCaptor.forClass(TrackPoint.class);
    verify(trackPointMapper).insertIdempotently(captor.capture());
    assertThat(count).isEqualTo(1);
    assertThat(captor.getValue().getRecordedAt()).isEqualTo(expected);
  }
}
