package com.ai.travel.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 地理编码缓存实体，对应 geocoding_cache 表。
 *
 * <p>存储 POI 名称 + 地址 + 地区 → 经纬度反查结果。
 * {@link com.ai.travel.service.geocoding.GeocodingServiceImpl} 查询时
 * 命中本表且 {@link #expireAt} 未过期则直接返回，不调外部 API。
 *
 * <p>{@link #cacheKey} 格式与 {@code GeocodingServiceImpl.buildCacheKey} 一致：
 * {@code "name|region|address"}。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("geocoding_cache")
public class GeocodingCache {

  /** 主键 ID。 */
  @TableId(type = IdType.AUTO)
  private Long id;

  /** 缓存键（格式 "name|region|address"），唯一。 */
  private String cacheKey;

  /** POI 名称，如"那拉提草原游客中心"。 */
  private String name;

  /** 补充地址，如"独库公路中段"。 */
  private String address;

  /** 地区限定，如"伊犁哈萨克自治州"。 */
  private String region;

  /** 纬度。 */
  private Double latitude;

  /** 经度。 */
  private Double longitude;

  /** 匹配级别，如"兴趣点"、"村庄"。 */
  private String level;

  /** 数据来源 provider（gaode / nominatim）。 */
  private String provider;

  /** 地理编码反向得到的省，用于同城校验。 */
  private String province;

  /** 地理编码反向得到的市，用于同城校验。 */
  private String city;

  /** 地理编码反向得到的区，用于同城校验。 */
  private String district;

  /** 调用方传入的期望目的地，用于同城校验（可为空）。 */
  private String destination;

  /** 创建时间。 */
  private LocalDateTime createdAt;

  /** 过期时间（TTL 控制）；过期后数据视为无效，触发重新调用外部 API。 */
  private LocalDateTime expireAt;
}
