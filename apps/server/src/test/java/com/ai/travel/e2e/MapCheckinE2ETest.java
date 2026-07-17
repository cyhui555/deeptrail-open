package com.ai.travel.e2e;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ai.travel.security.UserContext;
import com.jayway.jsonpath.DocumentContext;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/**
 * E2E: 打卡点地图坐标修正（07-02-map-checkin）。
 * 创建清单 → 开始打卡 → 修正坐标 → 验证展示坐标 → 错误场景。
 *
 * <p>注意：GlobalExceptionHandler 统一返回 HTTP 200，错误码在 body 的 errorCode 字段中。
 */
@Tag("e2e")
class MapCheckinE2ETest extends E2ETestBase {

  @Test
  @DisplayName("修正坐标后 displayLat/displayLng 应返回修正值，isCoordinateCorrected=true")
  void updateCoordinates_displayReflectsCorrectedValues() throws Exception {
    String planId = createTripPlan();
    Long itemId = startCheckinAndFirstItemId(planId);

    // 修正坐标（afterCompletion 会清除 UserContext，需重新设置）
    UserContext.setUserId(1L);
    String updateResp = mockMvc.perform(put("/api/itineraries/checkin/items/" + itemId + "/coordinates")
            .contentType("application/json")
            .content("{\"lat\":30.5728,\"lng\":104.0668}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    DocumentContext updateCtx = JsonPath.parse(updateResp);
    assertThat(updateCtx.read("$.success", Boolean.class)).isTrue();

    // 查询打卡任务详情，验证展示坐标
    UserContext.setUserId(1L);
    String tasksResp = mockMvc.perform(get("/api/trips/" + planId + "/checkin"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    DocumentContext tasksCtx = JsonPath.parse(tasksResp);
    assertThat(tasksCtx.read("$.data[0].items[0].displayLat", Double.class)).isEqualTo(30.5728);
    assertThat(tasksCtx.read("$.data[0].items[0].displayLng", Double.class)).isEqualTo(104.0668);
    assertThat(tasksCtx.read("$.data[0].items[0].isCoordinateCorrected", Boolean.class)).isTrue();
  }

  @Test
  @DisplayName("未修正时 displayLat/displayLng 应等于 poiLat/poiLng，isCoordinateCorrected=false")
  void getCheckinItemDetail_notCorrected_displayEqualsPoi() throws Exception {
    String planId = createTripPlan();
    Long itemId = startCheckinAndFirstItemId(planId);

    // 未修正，直接查询
    UserContext.setUserId(1L);
    String tasksResp = mockMvc.perform(get("/api/trips/" + planId + "/checkin"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    DocumentContext tasksCtx = JsonPath.parse(tasksResp);
    // 创建清单时 POI 坐标为 lat=30.67, lng=104.06
    assertThat(tasksCtx.read("$.data[0].items[0].displayLat", Double.class)).isEqualTo(30.67);
    assertThat(tasksCtx.read("$.data[0].items[0].displayLng", Double.class)).isEqualTo(104.06);
    assertThat(tasksCtx.read("$.data[0].items[0].isCoordinateCorrected", Boolean.class)).isFalse();
  }

  @Test
  @DisplayName("修正坐标 — 纬度超出范围应返回 errorCode=VALIDATION_FAILED")
  void updateCoordinates_invalidLat_returnsValidationError() throws Exception {
    String planId = createTripPlan();
    Long itemId = startCheckinAndFirstItemId(planId);

    UserContext.setUserId(1L);
    String resp = mockMvc.perform(put("/api/itineraries/checkin/items/" + itemId + "/coordinates")
            .contentType("application/json")
            .content("{\"lat\":999.0,\"lng\":104.0668}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    DocumentContext ctx = JsonPath.parse(resp);
    assertThat(ctx.read("$.success", Boolean.class)).isFalse();
    assertThat(ctx.read("$.errorCode", String.class)).isEqualTo("VALIDATION_FAILED");
  }

  @Test
  @DisplayName("修正坐标 — 经度超出范围应返回 errorCode=VALIDATION_FAILED")
  void updateCoordinates_invalidLng_returnsValidationError() throws Exception {
    String planId = createTripPlan();
    Long itemId = startCheckinAndFirstItemId(planId);

    UserContext.setUserId(1L);
    String resp = mockMvc.perform(put("/api/itineraries/checkin/items/" + itemId + "/coordinates")
            .contentType("application/json")
            .content("{\"lat\":30.5,\"lng\":200.0}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    DocumentContext ctx = JsonPath.parse(resp);
    assertThat(ctx.read("$.success", Boolean.class)).isFalse();
    assertThat(ctx.read("$.errorCode", String.class)).isEqualTo("VALIDATION_FAILED");
  }

  @Test
  @DisplayName("修正坐标 — 不存在的打卡项应返回 errorCode=CHECKIN_ITEM_NOT_FOUND")
  void updateCoordinates_itemNotFound_returnsNotFound() throws Exception {
    createTripPlan();

    UserContext.setUserId(1L);
    String resp = mockMvc.perform(put("/api/itineraries/checkin/items/999999/coordinates")
            .contentType("application/json")
            .content("{\"lat\":30.5,\"lng\":104.0}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    DocumentContext ctx = JsonPath.parse(resp);
    assertThat(ctx.read("$.success", Boolean.class)).isFalse();
    assertThat(ctx.read("$.errorCode", String.class)).isEqualTo("CHECKIN_ITEM_NOT_FOUND");
  }

  @Test
  @DisplayName("修正坐标 — 缺少 lat 字段应返回 errorCode=VALIDATION_FAILED")
  void updateCoordinates_missingLat_returnsValidationError() throws Exception {
    String planId = createTripPlan();
    Long itemId = startCheckinAndFirstItemId(planId);

    UserContext.setUserId(1L);
    String resp = mockMvc.perform(put("/api/itineraries/checkin/items/" + itemId + "/coordinates")
            .contentType("application/json")
            .content("{\"lng\":104.0668}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    DocumentContext ctx = JsonPath.parse(resp);
    assertThat(ctx.read("$.success", Boolean.class)).isFalse();
    assertThat(ctx.read("$.errorCode", String.class)).isEqualTo("VALIDATION_FAILED");
  }

  @Test
  @DisplayName("修正坐标 — 多次修正应以最后一次为准")
  void updateCoordinates_multipleUpdates_lastWins() throws Exception {
    String planId = createTripPlan();
    Long itemId = startCheckinAndFirstItemId(planId);

    // 第一次修正
    UserContext.setUserId(1L);
    mockMvc.perform(put("/api/itineraries/checkin/items/" + itemId + "/coordinates")
            .contentType("application/json")
            .content("{\"lat\":30.1111,\"lng\":104.1111}"))
        .andExpect(status().isOk());

    // 第二次修正
    UserContext.setUserId(1L);
    mockMvc.perform(put("/api/itineraries/checkin/items/" + itemId + "/coordinates")
            .contentType("application/json")
            .content("{\"lat\":30.9999,\"lng\":104.9999}"))
        .andExpect(status().isOk());

    // 验证最终坐标
    UserContext.setUserId(1L);
    String tasksResp = mockMvc.perform(get("/api/trips/" + planId + "/checkin"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    DocumentContext tasksCtx = JsonPath.parse(tasksResp);
    assertThat(tasksCtx.read("$.data[0].items[0].displayLat", Double.class)).isEqualTo(30.9999);
    assertThat(tasksCtx.read("$.data[0].items[0].displayLng", Double.class)).isEqualTo(104.9999);
    assertThat(tasksCtx.read("$.data[0].items[0].isCoordinateCorrected", Boolean.class)).isTrue();
  }
}
