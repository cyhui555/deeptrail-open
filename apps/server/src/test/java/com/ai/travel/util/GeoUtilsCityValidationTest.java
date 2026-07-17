package com.ai.travel.util;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * {@link GeoUtils#isAdministrativeMatch(String, String, String, String)} 的单元测试。
 *
 * <p>覆盖三种典型的城市表达方式和几种边界场景。
 */
class GeoUtilsCityValidationTest {

  @Nested
  @DisplayName("isAdministrativeMatch — 普通匹配")
  class NormalMatch {

    @Test
    @DisplayName("青岛 vs 青岛市 — 互相包含，应匹配")
    void qingdao_vs_qingdao_shi() {
      assertThat(GeoUtils.isAdministrativeMatch("山东省", "青岛市", "市南区", "青岛")).isTrue();
    }

    @Test
    @DisplayName("伊犁哈萨克自治州 vs '伊犁' — 市字段包含目的地，应匹配")
    void yili_vs_yili_prefecture() {
      assertThat(GeoUtils.isAdministrativeMatch("新疆维吾尔自治区",
          "伊犁哈萨克自治州", "伊宁市", "伊犁")).isTrue();
    }

    @Test
    @DisplayName("重庆市 vs '重庆' — 应匹配")
    void chongqing_vs_chongqing() {
      assertThat(GeoUtils.isAdministrativeMatch("重庆市", "重庆市", "渝中区", "重庆")).isTrue();
    }

    @Test
    @DisplayName("省字段包含目的地 — '新疆维吾尔自治区' vs '新疆'")
    void xinjiang_province_match() {
      assertThat(GeoUtils.isAdministrativeMatch("新疆维吾尔自治区",
          null, null, "新疆")).isTrue();
    }

    @Test
    @DisplayName("重庆市 vs '青岛' — 不匹配")
    void chongqing_vs_qingdao_should_not_match() {
      // 这是真实 bug 场景：重庆的"大学路"被返回时，destination=青岛 应被拒绝
      assertThat(GeoUtils.isAdministrativeMatch("重庆市", "重庆市", "沙坪坝区", "青岛")).isFalse();
    }

    @Test
    @DisplayName("云南 vs '青岛' — 不匹配")
    void yunnan_vs_qingdao_should_not_match() {
      // 午餐 poi "码头附近小馆" 被反查到合肥后又被改到云南
      assertThat(GeoUtils.isAdministrativeMatch("云南省", "昆明市", null, "青岛")).isFalse();
    }
  }

  @Nested
  @DisplayName("isAdministrativeMatch — 边界情况")
  class EdgeCases {

    @Test
    @DisplayName("destination 为 null — 应视为匹配（无约束）")
    void null_destination_always_matches() {
      assertThat(GeoUtils.isAdministrativeMatch("重庆市", "重庆市", "渝中区", null)).isTrue();
    }

    @Test
    @DisplayName("destination 为空字符串 — 应视为匹配")
    void blank_destination_always_matches() {
      assertThat(GeoUtils.isAdministrativeMatch("重庆市", null, null, "  ")).isTrue();
    }

    @Test
    @DisplayName("全部省市区字段为 null — 应视为无约束通过")
    void all_fields_null_no_match() {
      // 无法判断时不应过度拦截
      assertThat(GeoUtils.isAdministrativeMatch(null, null, null, "青岛")).isTrue();
    }
  }

  @Nested
  @DisplayName("isAdministrativeMatch — 反向包含")
  class ReverseMatch {

    @Test
    @DisplayName("destination='青岛' vs province=null,city=null,district=null — 无字段则放行")
    void no_field_pass_through() {
      assertThat(GeoUtils.isAdministrativeMatch(null, null, null, "青岛")).isTrue();
    }

    @Test
    @DisplayName("destination='重庆市'（省级） vs province='重庆市' — 反向包含，应匹配")
    void chongqing_municipality_reverse() {
      assertThat(GeoUtils.isAdministrativeMatch("重庆市", "重庆市", null, "重庆市")).isTrue();
    }

    @Test
    @DisplayName("destination='青岛'（无市字） vs city='青岛市'(result) — 反向包含，应匹配")
    void city_contains_destination_abbrev() {
      // 实际最常见场景：用户输入"青岛"，高德返回"青岛市"
      assertThat(GeoUtils.isAdministrativeMatch("山东省",
          "青岛市", "市北区", "青岛")).isTrue();
    }

    @Test
    @DisplayName("destination='伊犁哈萨克自治州' vs city='伊犁哈萨克自治州' — 完全相等，应匹配")
    void exact_match_destination_city() {
      assertThat(GeoUtils.isAdministrativeMatch("新疆维吾尔自治区",
          "伊犁哈萨克自治州", "伊宁市", "伊犁哈萨克自治州")).isTrue();
    }
  }
}
