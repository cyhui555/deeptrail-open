package com.ai.travel.e2e;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ai.travel.entity.CheckinItem;
import com.ai.travel.mapper.CheckinItemMapper;
import com.ai.travel.security.UserContext;
import com.jayway.jsonpath.DocumentContext;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * E2E: 自定义行程点编辑（07-04-custom-item-edit）。
 *
 * <p>创建清单 → 添加自定义行程点 → 编辑自定义行程点 → 验证 DB + 展示。
 *
 * <p>注意：GlobalExceptionHandler 统一返回 HTTP 200，错误码在 body 的 errorCode 字段中。
 */
@Tag("e2e")
class EditCustomItemE2ETest extends E2ETestBase {

  @Autowired
  private CheckinItemMapper checkinItemMapper;

  /**
   * 开始打卡并添加自定义行程点，返回新增的 itemId。
   *
   * <p>打卡任务必须先通过 startCheckin 创建（否则 GET /checkin 返回空列表）。
   */
  private Long addCustomItem(String planId) throws Exception {
    // 开始打卡（幂等：已存在则跳过）
    UserContext.setUserId(1L);
    mockMvc.perform(post("/api/trips/" + planId + "/checkin/start")
            .contentType("application/json")
            .content("{}"))
        .andExpect(status().isOk());

    // 获取第一个打卡任务 ID
    UserContext.setUserId(1L);
    String tasksResp = mockMvc.perform(get("/api/trips/" + planId + "/checkin"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    String taskId = JsonPath.read(tasksResp, "$.data[0].id").toString();

    // 添加自定义行程点（含初始坐标 30.67, 104.06）
    String body = "{\"name\":\"自定义咖啡馆\",\"period\":\"下午\",\"description\":\"初始描述\","
        + "\"estimatedCost\":\"约50元\",\"address\":\"人民南路一段1号\","
        + "\"lat\":30.67,\"lng\":104.06}";
    String resp = mockMvc.perform(
            post("/api/itineraries/checkin/trips/" + planId + "/checkin/" + taskId + "/custom-item")
                .contentType("application/json")
                .content(body))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    // SQLite 主键返回 Integer，统一转为 Long
    Number id = JsonPath.read(resp, "$.data");
    return id.longValue();
  }

  @Test
  @DisplayName("编辑自定义行程点 — PENDING 自定义项成功更新，DB 落库")
  void editCustomItem_success_pendingCustomItem_returns200_andDbUpdated() throws Exception {
    String planId = createTripPlan();
    Long itemId = addCustomItem(planId);

    UserContext.setUserId(1L);
    String resp = mockMvc.perform(put("/api/itineraries/checkin/items/" + itemId)
            .contentType("application/json")
            .content("{\"name\":\"改后的咖啡馆\",\"period\":\"晚上\",\"description\":\"新描述\","
                + "\"estimatedCost\":\"约80元\",\"address\":\"人民南路二段88号\","
                + "\"lat\":30.5728,\"lng\":104.0668}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    DocumentContext ctx = JsonPath.parse(resp);
    assertThat(ctx.read("$.success", Boolean.class)).isTrue();

    // DB 验证
    CheckinItem updated = checkinItemMapper.selectById(itemId);
    assertThat(updated.getPoiName()).isEqualTo("改后的咖啡馆");
    assertThat(updated.getPeriod()).isEqualTo("晚上");
    assertThat(updated.getDescription()).isEqualTo("新描述");
    assertThat(updated.getEstimatedCost()).isEqualTo("约80元");
    assertThat(updated.getPoiAddress()).isEqualTo("人民南路二段88号");
    assertThat(updated.getPoiLat()).isEqualTo(30.5728);
    assertThat(updated.getPoiLng()).isEqualTo(104.0668);
  }

  @Test
  @DisplayName("编辑自定义行程点 — 仅改 name，lat/lng 为 null，应保留原坐标")
  void editCustomItem_onlyNameChange_coordinatesUnchanged() throws Exception {
    String planId = createTripPlan();
    Long itemId = addCustomItem(planId);

    UserContext.setUserId(1L);
    String resp = mockMvc.perform(put("/api/itineraries/checkin/items/" + itemId)
            .contentType("application/json")
            .content("{\"name\":\"仅改名\"}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    DocumentContext ctx = JsonPath.parse(resp);
    assertThat(ctx.read("$.success", Boolean.class)).isTrue();

    CheckinItem updated = checkinItemMapper.selectById(itemId);
    assertThat(updated.getPoiName()).isEqualTo("仅改名");
    assertThat(updated.getPoiLat()).isEqualTo(30.67);
    assertThat(updated.getPoiLng()).isEqualTo(104.06);
  }

  @Test
  @DisplayName("编辑 AI 生成节点 — is_custom=false 应返回 errorCode=CUSTOM_ITEM_NOT_EDITABLE")
  void editCustomItem_aiNode_returns409() throws Exception {
    String planId = createTripPlan();
    Long itemId = startCheckinAndFirstItemId(planId);

    UserContext.setUserId(1L);
    String resp = mockMvc.perform(put("/api/itineraries/checkin/items/" + itemId)
            .contentType("application/json")
            .content("{\"name\":\"试图改 AI 节点\"}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    DocumentContext ctx = JsonPath.parse(resp);
    assertThat(ctx.read("$.success", Boolean.class)).isFalse();
    assertThat(ctx.read("$.errorCode", String.class)).isEqualTo("CUSTOM_ITEM_NOT_EDITABLE");
  }

  @Test
  @DisplayName("编辑已打卡的自定义项 — status=CHECKED_IN 应返回 errorCode=CUSTOM_ITEM_NOT_EDITABLE")
  void editCustomItem_checkedInCustomItem_returns409() throws Exception {
    String planId = createTripPlan();
    Long itemId = addCustomItem(planId);

    // 先打卡
    UserContext.setUserId(1L);
    mockMvc.perform(post("/api/itineraries/checkin/items/" + itemId)
            .contentType("application/json")
            .content("{\"lat\":30.67,\"lng\":104.06,\"accuracy\":10}"))
        .andExpect(status().isOk());

    // 再编辑
    UserContext.setUserId(1L);
    String resp = mockMvc.perform(put("/api/itineraries/checkin/items/" + itemId)
            .contentType("application/json")
            .content("{\"name\":\"试图改已打卡项\"}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    DocumentContext ctx = JsonPath.parse(resp);
    assertThat(ctx.read("$.success", Boolean.class)).isFalse();
    assertThat(ctx.read("$.errorCode", String.class)).isEqualTo("CUSTOM_ITEM_NOT_EDITABLE");
  }

  @Test
  @DisplayName("编辑已废弃的自定义项 — status=ABANDONED 应返回 errorCode=CUSTOM_ITEM_NOT_EDITABLE")
  void editCustomItem_abandonedCustomItem_returns409() throws Exception {
    String planId = createTripPlan();
    Long itemId = addCustomItem(planId);

    // 先废弃
    UserContext.setUserId(1L);
    mockMvc.perform(post("/api/itineraries/checkin/items/" + itemId + "/abandon")
            .contentType("application/json"))
        .andExpect(status().isOk());

    // 再编辑
    UserContext.setUserId(1L);
    String resp = mockMvc.perform(put("/api/itineraries/checkin/items/" + itemId)
            .contentType("application/json")
            .content("{\"name\":\"试图改已废弃项\"}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    DocumentContext ctx = JsonPath.parse(resp);
    assertThat(ctx.read("$.success", Boolean.class)).isFalse();
    assertThat(ctx.read("$.errorCode", String.class)).isEqualTo("CUSTOM_ITEM_NOT_EDITABLE");
  }

  @Test
  @DisplayName("编辑自定义行程点 — 名称空白应返回 errorCode=VALIDATION_FAILED")
  void editCustomItem_blankName_returns400() throws Exception {
    String planId = createTripPlan();
    Long itemId = addCustomItem(planId);

    UserContext.setUserId(1L);
    String resp = mockMvc.perform(put("/api/itineraries/checkin/items/" + itemId)
            .contentType("application/json")
            .content("{\"name\":\"  \"}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    DocumentContext ctx = JsonPath.parse(resp);
    assertThat(ctx.read("$.success", Boolean.class)).isFalse();
    assertThat(ctx.read("$.errorCode", String.class)).isEqualTo("VALIDATION_FAILED");
  }

  @Test
  @DisplayName("编辑自定义行程点 — period 不合法应返回 errorCode=VALIDATION_FAILED")
  void editCustomItem_invalidPeriod_returns400() throws Exception {
    String planId = createTripPlan();
    Long itemId = addCustomItem(planId);

    UserContext.setUserId(1L);
    String resp = mockMvc.perform(put("/api/itineraries/checkin/items/" + itemId)
            .contentType("application/json")
            .content("{\"name\":\"改名\",\"period\":\"凌晨\"}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    DocumentContext ctx = JsonPath.parse(resp);
    assertThat(ctx.read("$.success", Boolean.class)).isFalse();
    assertThat(ctx.read("$.errorCode", String.class)).isEqualTo("VALIDATION_FAILED");
  }

  @Test
  @DisplayName("编辑自定义行程点 — 仅填 lat 不填 lng 应返回 errorCode=VALIDATION_FAILED")
  void editCustomItem_latWithoutLng_returns400() throws Exception {
    String planId = createTripPlan();
    Long itemId = addCustomItem(planId);

    UserContext.setUserId(1L);
    String resp = mockMvc.perform(put("/api/itineraries/checkin/items/" + itemId)
            .contentType("application/json")
            .content("{\"name\":\"改名\",\"lat\":30.5}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    DocumentContext ctx = JsonPath.parse(resp);
    assertThat(ctx.read("$.success", Boolean.class)).isFalse();
    assertThat(ctx.read("$.errorCode", String.class)).isEqualTo("VALIDATION_FAILED");
  }

  @Test
  @DisplayName("编辑自定义行程点 — 经纬度超范围应返回 errorCode=VALIDATION_FAILED")
  void editCustomItem_latOutOfRange_returns400() throws Exception {
    String planId = createTripPlan();
    Long itemId = addCustomItem(planId);

    UserContext.setUserId(1L);
    String resp = mockMvc.perform(put("/api/itineraries/checkin/items/" + itemId)
            .contentType("application/json")
            .content("{\"name\":\"改名\",\"lat\":999.0,\"lng\":104.06}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    DocumentContext ctx = JsonPath.parse(resp);
    assertThat(ctx.read("$.success", Boolean.class)).isFalse();
    assertThat(ctx.read("$.errorCode", String.class)).isEqualTo("VALIDATION_FAILED");
  }

  @Test
  @DisplayName("编辑自定义行程点 — 坐标 (0, 0) 应返回 errorCode=VALIDATION_FAILED")
  void editCustomItem_zeroCoordinate_returns400() throws Exception {
    String planId = createTripPlan();
    Long itemId = addCustomItem(planId);

    UserContext.setUserId(1L);
    String resp = mockMvc.perform(put("/api/itineraries/checkin/items/" + itemId)
            .contentType("application/json")
            .content("{\"name\":\"改名\",\"lat\":0.0,\"lng\":0.0}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    DocumentContext ctx = JsonPath.parse(resp);
    assertThat(ctx.read("$.success", Boolean.class)).isFalse();
    assertThat(ctx.read("$.errorCode", String.class)).isEqualTo("VALIDATION_FAILED");
  }

  @Test
  @DisplayName("编辑自定义行程点 — 不存在的 itemId 应返回 errorCode=CHECKIN_ITEM_NOT_FOUND")
  void editCustomItem_notFound_returns404() throws Exception {
    createTripPlan();

    UserContext.setUserId(1L);
    String resp = mockMvc.perform(put("/api/itineraries/checkin/items/999999")
            .contentType("application/json")
            .content("{\"name\":\"改名\"}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    DocumentContext ctx = JsonPath.parse(resp);
    assertThat(ctx.read("$.success", Boolean.class)).isFalse();
    assertThat(ctx.read("$.errorCode", String.class)).isEqualTo("CHECKIN_ITEM_NOT_FOUND");
  }

  @Test
  @DisplayName("编辑自定义行程点 — 用户 B 编辑用户 A 的 item 应返回 errorCode=FORBIDDEN")
  void editCustomItem_otherUser_returns403() throws Exception {
    // 用户 A 创建清单并添加自定义行程点
    String planId = createTripPlan();
    Long itemId = addCustomItem(planId);

    // 用户 B 尝试编辑
    UserContext.setUserId(2L);
    String resp = mockMvc.perform(put("/api/itineraries/checkin/items/" + itemId)
            .contentType("application/json")
            .content("{\"name\":\"B 试图改 A 的项\"}"))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();
    DocumentContext ctx = JsonPath.parse(resp);
    assertThat(ctx.read("$.success", Boolean.class)).isFalse();
    assertThat(ctx.read("$.errorCode", String.class)).isEqualTo("FORBIDDEN");
  }
}
