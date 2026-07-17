package com.ai.travel.dto.geocoding;

import lombok.Builder;
import lombok.Data;

/**
 * 地理编码请求。
 *
 * <p>将 POI 名称（可选结合地区/地址）解析为经纬度坐标。
 */
@Data
@Builder
public class GeoRequest {

  /** POI 名称（必填），如"那拉提草原游客中心"。 */
  private final String name;

  /** 地区限定（可选），如"新疆维吾尔自治区"或"伊犁哈萨克自治州"。 */
  private final String region;

  /** 补充地址（可选），如"独库公路中段"。 */
  private final String address;

  /**
   * 期望目的地，用于同城校验。
   *
   * <p>优先使用 plan.destination（如"青岛"/"伊犁哈萨克自治州"）；
   * 校验器会比较 result 中省/市字段是否与该目的地匹配，超出合理距离时丢弃结果。
   */
  private final String destination;
}
