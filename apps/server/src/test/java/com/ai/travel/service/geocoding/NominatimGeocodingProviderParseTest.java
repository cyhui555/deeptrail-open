package com.ai.travel.service.geocoding;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ai.travel.config.AppGeocodingProperties;
import com.ai.travel.dto.geocoding.GeoResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 直接测试 {@link NominatimGeocodingProvider#parseResponse(String)} 的地址字段解析逻辑。
 */
class NominatimGeocodingProviderParseTest {

  private NominatimGeocodingProvider provider;

  @BeforeEach
  void setUp() {
    AppGeocodingProperties props = new AppGeocodingProperties();
    provider = new NominatimGeocodingProvider(props, new ObjectMapper());
  }

  @Test
  @DisplayName("解析中国 POI 的 address 结构 — state/city/district")
  void parse_china_poi() throws Exception {
    // 真实 Nominatim 返回结构：address.state=省, address.city=市, address.district=区
    String nominatimJson = "[{"
        + "\"lat\":\"36.082419\",\"lon\":\"120.355643\",\"type\":\"attraction\","
        + "\"address\":{"
        + "  \"tourism\":\"大学路\","
        + "  \"state\":\"山东省\",\"city\":\"青岛市\",\"district\":\"市南区\","
        + "  \"country\":\"中国\",\"country_code\":\"cn\""
        + "}}]";

    GeoResult result = provider.parseResponse(nominatimJson);

    assertThat(result).isNotNull();
    assertThat(result.getLatitude()).isEqualTo(36.082419);
    assertThat(result.getLongitude()).isEqualTo(120.355643);
    assertThat(result.getProvince()).isEqualTo("山东省");
    assertThat(result.getCity()).isEqualTo("青岛市");
    assertThat(result.getDistrict()).isEqualTo("市南区");
  }

  @Test
  @DisplayName("state 缺失时回退到 province 字段")
  void parse_state_null_falls_back_to_province() throws Exception {
    String nominatimJson = "[{"
        + "\"lat\":\"36.082419\",\"lon\":\"120.355643\",\"type\":\"attraction\","
        + "\"address\":{"
        + "  \"province\":\"山东省\",\"city\":\"青岛市\""
        + "}}]";

    GeoResult result = provider.parseResponse(nominatimJson);

    assertThat(result).isNotNull();
    assertThat(result.getProvince()).isEqualTo("山东省");
    assertThat(result.getCity()).isEqualTo("青岛市");
  }

  @Test
  @DisplayName("city 缺失时回退到 county 字段")
  void parse_city_missing_falls_back_to_county() throws Exception {
    String nominatimJson = "[{"
        + "\"lat\":\"36.08\",\"lon\":\"120.35\",\"type\":\"attraction\","
        + "\"address\":{"
        + "  \"state\":\"山东省\",\"county\":\"蓬莱区\""
        + "}}]";

    GeoResult result = provider.parseResponse(nominatimJson);

    assertThat(result).isNotNull();
    // city 缺失时回退到 county
    assertThat(result.getCity()).isEqualTo("蓬莱区");
  }

  @Test
  @DisplayName("district 缺失时回退到 suburb 字段")
  void parse_district_missing_falls_back_to_suburb() throws Exception {
    String nominatimJson = "[{"
        + "\"lat\":\"36.08\",\"lon\":\"120.35\",\"type\":\"attraction\","
        + "\"address\":{"
        + "  \"state\":\"山东省\",\"city\":\"青岛市\",\"suburb\":\"市南区\""
        + "}}]";

    GeoResult result = provider.parseResponse(nominatimJson);

    assertThat(result).isNotNull();
    assertThat(result.getDistrict()).isEqualTo("市南区");
  }

  @Test
  @DisplayName("空数组应返回 null")
  void parse_empty_array_returns_null() throws Exception {
    String nominatimJson = "[]";

    GeoResult result = provider.parseResponse(nominatimJson);

    assertThat(result).isNull();
  }

  @Test
  @DisplayName("address 字段全部缺失时 — 返回结果但省市区为 null")
  void parse_missing_all_admin_fields() throws Exception {
    String nominatimJson = "[{"
        + "\"lat\":\"36.08\",\"lon\":\"120.35\",\"type\":\"attraction\""
        + "}]";

    GeoResult result = provider.parseResponse(nominatimJson);

    assertThat(result).isNotNull();
    assertThat(result.getProvince()).isNull();
    assertThat(result.getCity()).isNull();
    assertThat(result.getDistrict()).isNull();
    // 校验器应跳过 — 此时不能丢弃
    assertThat(result.getLatitude()).isEqualTo(36.08);
  }

  @Test
  @DisplayName("非法经纬度应降级为 null 坐标")
  void parse_invalid_coordinates_returns_null_coordinates() throws Exception {
    GeoResult result = provider.parseResponse(
        "[{\"lat\":\"invalid\",\"lon\":\"invalid\",\"type\":\"attraction\"}]");

    assertThat(result).isNotNull();
    assertThat(result.getLatitude()).isNull();
    assertThat(result.getLongitude()).isNull();
  }

  @Test
  @DisplayName("非法 JSON 应包装为 GeocodingException")
  void parse_malformed_json_throws_geocoding_exception() {
    assertThatThrownBy(() -> provider.parseResponse("not-json"))
        .isInstanceOf(GeocodingException.class)
        .hasMessageContaining("Nominatim parse error");
  }

  @Test
  @DisplayName("Nominatim provider 元数据保持稳定")
  void provider_metadata_is_stable() {
    assertThat(provider.getProviderName()).isEqualTo("nominatim");
    assertThat(provider.isAvailable()).isTrue();
    assertThat(provider.getOrder()).isEqualTo(2);
  }
}
