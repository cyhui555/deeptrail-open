package com.ai.travel.service.geocoding;

import com.ai.travel.dto.geocoding.GeoRequest;
import com.ai.travel.dto.geocoding.GeoResult;

/**
 * 地理编码 Provider 接口。
 *
 * <p>每个实现类对应一个地图服务商（高德、Nominatim 等），
 * 通过 {@link #getOrder()} 决定调用优先级，数值越小优先级越高。
 */
public interface GeocodingProvider extends Comparable<GeocodingProvider> {

  /**
   * 执行地理编码。
   *
   * @param request 地理编码请求（名称 + 可选地区/地址）
   * @return 有效结果；无法解析时返回 null
   * @throws GeocodingException API 调用失败 / 限流 / 格式异常
   */
  GeoResult geocode(GeoRequest request) throws GeocodingException;

  /**
   * Provider 标识。
   *
   * @return 如 "gaode" / "nominatim"
   */
  String getProviderName();

  /**
   * 判断当前 Provider 是否可用（已配置 Key、网络可达等）。
   *
   * @return true 如果可调用
   */
  boolean isAvailable();

  /**
   * 调用顺序（越小越优先）。
   *
   * @return 优先级数值
   */
  int getOrder();

  /** 按 {@link #getOrder()} 排序，用于 {@code resolveProviderOrder()} 中的 {@code .sorted()} 调用。 */
  @Override
  default int compareTo(GeocodingProvider other) {
    return Integer.compare(this.getOrder(), other.getOrder());
  }
}
