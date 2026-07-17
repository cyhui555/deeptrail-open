package com.ai.travel.service;

import com.ai.travel.dto.geocoding.GeoRequest;
import com.ai.travel.dto.geocoding.GeoResult;
import java.util.Map;

/**
 * 地理编码服务。
 *
 * <p>将中文地址/POI 名称解析为经纬度坐标。内部按 Provider 优先级
 * 依次尝试，支持本地缓存和自动降级。
 */
public interface GeocodingService {

  /**
   * 地理编码。按主 Provider → fallback Provider 顺序尝试，
   * 直到获取有效结果。全部失败时返回 null（降级为静默无坐标）。
   *
   * @param request 地理编码请求
   * @return 坐标结果，或 null（全部 Provider 失败 / 未启用 / 无 Key）
   */
  GeoResult geocode(GeoRequest request);

  /**
   * 批量地理编码（预留，当前串行调用）。
   *
   * @param requests key=标识（仅用于返回映射），value=请求
   * @return key → result 映射（无法解析的 key 对应 null）
   */
  Map<String, GeoResult> batchGeocode(Map<String, GeoRequest> requests);
}
