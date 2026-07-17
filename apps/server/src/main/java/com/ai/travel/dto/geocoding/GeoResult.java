package com.ai.travel.dto.geocoding;

import lombok.Builder;
import lombok.Data;

/**
 * 地理编码结果。
 *
 * <p>统一各 Provider 返回的坐标数据结构。
 */
@Data
@Builder
public class GeoResult {

  /** 纬度。 */
  private Double latitude;

  /** 经度。 */
  private Double longitude;

  /** 匹配级别，如"兴趣点"、"村庄"等。 */
  private String level;

  /** 数据来源 provider 标识（gaode / nominatim）。 */
  private String provider;

  /** 反向地理编码得到的省（如"山东省"），用于同城校验。 */
  private String province;

  /** 反向地理编码得到的市（如"青岛市"），用于同城校验。 */
  private String city;

  /** 反向地理编码得到的区（如"市南区"），用于同城校验。 */
  private String district;

  /**
   * 经 GeocodingServiceImpl 同城校验后标记该结果是否在期望目的地内。
   *
   * <p>null = 未做校验（无 destination 传入），true = 校验通过，false = 校验失败。
   */
  private Boolean destinationSatisfied;

  /**
   * 判断结果是否有效。
   *
   * @return true 如果坐标非空、非 (0,0)、且在合法范围内
   */
  public boolean isValid() {
    return latitude != null && longitude != null
        && latitude != 0.0 && longitude != 0.0
        && latitude >= -90 && latitude <= 90
        && longitude >= -180 && longitude <= 180;
  }
}
