package com.ai.travel.service.geocoding;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ai.travel.config.AppGeocodingProperties;
import com.ai.travel.dto.geocoding.GeoRequest;
import com.ai.travel.dto.geocoding.GeoResult;
import com.ai.travel.entity.GeocodingCache;
import com.ai.travel.mapper.GeocodingCacheMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * {@link GeocodingServiceImpl} 同城校验逻辑的单元测试。
 *
 * <p>通过 Mock 高德返回不同的 province/city 字段，验证 GeocodingServiceImpl 是否按设计接受或拒绝。
 */
@ExtendWith(MockitoExtension.class)
class GeocodingServiceImplTest {

  @Mock
  private AppGeocodingProperties properties;

  @Mock
  private GaodeGeocodingProvider gaodeProvider;

  @Mock
  private NominatimGeocodingProvider nominatimProvider;

  @Mock
  private GeocodingCacheMapper geocodingCacheMapper;

  private GeocodingServiceImpl service;

  @BeforeEach
  void setUp() {
    lenient().when(properties.isEnabled()).thenReturn(true);
    lenient().when(properties.isCacheEnabled()).thenReturn(false);
    lenient().when(properties.isCityValidationEnabled()).thenReturn(true);
    lenient().when(properties.getCityMaxDistanceMeters()).thenReturn(100_000L);
    lenient().when(properties.getProvider()).thenReturn("gaode");
    lenient().when(properties.getCacheExpireMinutes()).thenReturn(10080L);
    lenient().when(gaodeProvider.isAvailable()).thenReturn(true);
    lenient().when(gaodeProvider.getProviderName()).thenReturn("gaode");
    lenient().when(gaodeProvider.getOrder()).thenReturn(1);
    lenient().when(nominatimProvider.isAvailable()).thenReturn(true);
    lenient().when(nominatimProvider.getProviderName()).thenReturn("nominatim");
    lenient().when(nominatimProvider.getOrder()).thenReturn(2);
    // DB 缓存默认返回 null（模拟缓存未命中），让主流程继续走 Provider 调用
    lenient().when(geocodingCacheMapper.selectOne(any())).thenReturn(null);
    service = new GeocodingServiceImpl(properties, List.of(gaodeProvider), geocodingCacheMapper);
  }

  @Nested
  @DisplayName("同城校验通过场景")
  class Accept {

    @Test
    @DisplayName("高德返回青岛 — destination=青岛 → 应接受并返回结果")
    void accept_same_city_qingdao() throws Exception {
      GeoResult qingdao = GeoResult.builder()
          .latitude(36.08).longitude(120.35)
          .province("山东省").city("青岛市").district("市南区")
          .provider("gaode").build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(qingdao);

      GeoResult result = service.geocode(GeoRequest.builder()
          .name("大学路/漫画街").address("市南区大学路").destination("青岛").build());

      assertThat(result).isNotNull();
      assertThat(result.getLatitude()).isEqualTo(36.08);
      assertThat(result.getLongitude()).isEqualTo(120.35);
      assertThat(result.getDestinationSatisfied()).isTrue();
    }

    @Test
    @DisplayName("高德返回伊犁 — destination=伊犁哈萨克自治州 → 应接受")
    void accept_yili() throws Exception {
      GeoResult yili = GeoResult.builder()
          .latitude(43.92).longitude(81.32)
          .province("新疆维吾尔自治区").city("伊犁哈萨克自治州").district("伊宁市")
          .provider("gaode").build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(yili);

      GeoResult result = service.geocode(GeoRequest.builder()
          .name("伊宁城市海景").destination("伊犁哈萨克自治州").build());

      assertThat(result).isNotNull();
      assertThat(result.getDestinationSatisfied()).isTrue();
    }

    @Test
    @DisplayName("目的地简称 — destination='伊犁' vs city='伊犁哈萨克自治州'（city 包含 dest）")
    void accept_abbrev_destination() throws Exception {
      GeoResult yili = GeoResult.builder()
          .latitude(43.92).longitude(81.32)
          .province("新疆维吾尔自治区").city("伊犁哈萨克自治州").district(null)
          .provider("gaode").build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(yili);

      GeoResult result = service.geocode(GeoRequest.builder()
          .name("解忧公主园").destination("伊犁").build());

      assertThat(result).isNotNull();
    }

    /**
     * 距离兜底通过场景（BUG-20260706-002 核心修复）：
     * destination="川西"，高德返回四川省甘孜州康定市折多山（字符串不互相包含），
     * 但坐标距川西中心点（30.05, 101.96）< 100km → 应通过。
     */
    @Test
    @DisplayName("距离兜底通过 — destination=川西，result=四川省甘孜州康定（字段不匹配但坐标在范围内）")
    void accept_distance_fallback_chuanxi() throws Exception {
      // 折多山坐标（距川西中心点 ~50km）
      GeoResult zheduoshan = GeoResult.builder()
          .latitude(30.029795).longitude(101.996442)
          .province("四川省").city("甘孜藏族自治州").district("康定市")
          .provider("gaode").build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(zheduoshan);

      GeoResult result = service.geocode(GeoRequest.builder()
          .name("折多山").destination("川西").build());

      assertThat(result).isNotNull();
      assertThat(result.getDestinationSatisfied()).isTrue();
    }

    @Test
    @DisplayName("宏观区域通过 — destination=川西，应接受四川阿坝和成都节点")
    void accept_sichuan_nodes_for_chuanxi() throws Exception {
      GeoResult balangshan = GeoResult.builder()
          .latitude(30.894599).longitude(102.984353)
          .province("四川省").city("阿坝藏族羌族自治州").district("汶川县")
          .provider("gaode").build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(balangshan);

      GeoResult result = service.geocode(GeoRequest.builder()
          .name("巴朗山垭口观景台").destination("川西").build());

      assertThat(result).isNotNull();
      assertThat(result.getDestinationSatisfied()).isTrue();
    }

    /**
     * 距离兜底通过场景：destination="Beijing"，高德返回北京市东城区（字符串不互相包含），
     * 但坐标距北京中心点 < 100km → 应通过。
     */
    @Test
    @DisplayName("距离兜底通过 — destination=Beijing，result=北京市东城区（字段不匹配但坐标在范围内）")
    void accept_distance_fallback_beijing() throws Exception {
      GeoResult beijing = GeoResult.builder()
          .latitude(39.903182).longitude(116.397755)
          .province("北京市").city("北京市").district("东城区")
          .provider("gaode").build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(beijing);

      GeoResult result = service.geocode(GeoRequest.builder()
          .name("天安门广场").destination("Beijing").build());

      assertThat(result).isNotNull();
      assertThat(result.getDestinationSatisfied()).isTrue();
    }
  }

  @Nested
  @DisplayName("同城校验拒绝场景（对应青岛行程报错的 bug）")
  class Reject {

    @Test
    @DisplayName("高德返回重庆沙坪坝 — destination=青岛 → 应拒绝并返回 null")
    void reject_chongqing_for_qingdao() throws Exception {
      GeoResult chongqing = GeoResult.builder()
          .latitude(29.55).longitude(106.59)
          .province("重庆市").city("重庆市").district("沙坪坝区")
          .provider("gaode").build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(chongqing);

      GeoResult result = service.geocode(GeoRequest.builder()
          .name("大学路").address("重庆市沙坪坝区").destination("青岛").build());

      assertThat(result).isNull();
    }

    @Test
    @DisplayName("高德返回安徽合肥 — destination=青岛 → 应拒绝")
    void reject_hefei_for_qingdao() throws Exception {
      GeoResult hefei = GeoResult.builder()
          .latitude(30.96).longitude(118.82)
          .province("安徽省").city("合肥市").district(null)
          .provider("gaode").build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(hefei);

      GeoResult result = service.geocode(GeoRequest.builder()
          .name("码头附近小馆").destination("青岛").build());

      assertThat(result).isNull();
    }

    @Test
    @DisplayName("高德返回陕西宝鸡 — destination=青岛 → 应拒绝")
    void reject_baoji_for_qingdao() throws Exception {
      GeoResult baoji = GeoResult.builder()
          .latitude(34.38).longitude(107.15)
          .province("陕西省").city("宝鸡市").district(null)
          .provider("gaode").build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(baoji);

      GeoResult result = service.geocode(GeoRequest.builder()
          .name("中山路沿线小吃").destination("青岛").build());

      assertThat(result).isNull();
    }

    /**
     * 距离兜底也拒绝的场景：
     * destination="青岛"，result=重庆沙坪坝（字符串不匹配 + 距离超 500km）
     * 字段匹配失败，距离兜底计算 1500km > 100km → 应拒绝。
     */
    @Test
    @DisplayName("距离兜底也拒绝 — destination=青岛，result=重庆沙坪坝（距离远超阈值）")
    void reject_distance_fallback_chongqing_for_qingdao() throws Exception {
      GeoResult chongqing = GeoResult.builder()
          .latitude(29.55).longitude(106.59)
          .province("重庆市").city("重庆市").district("沙坪坝区")
          .provider("gaode").build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(chongqing);

      GeoResult result = service.geocode(GeoRequest.builder()
          .name("大学路").address("重庆市沙坪坝区").destination("青岛").build());

      assertThat(result).isNull();
    }

    @Test
    @DisplayName("宏观区域仍拒绝跨省 — destination=川西，不接受杭州坐标")
    void reject_hangzhou_for_chuanxi() throws Exception {
      GeoResult hangzhou = GeoResult.builder()
          .latitude(30.234708).longitude(120.432413)
          .province("浙江省").city("杭州市").district("萧山区")
          .provider("gaode").build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(hangzhou);

      GeoResult result = service.geocode(GeoRequest.builder()
          .name("杭州萧山国际机场").destination("川西").build());

      assertThat(result).isNull();
    }
  }

  @Nested
  @DisplayName("边界情况")
  class EdgeCases {

    @Test
    @DisplayName("destination 为 null — 不做校验，应接受结果")
    void null_destination_skips_validation() throws Exception {
      GeoResult any = GeoResult.builder()
          .latitude(29.55).longitude(106.59)
          .province("重庆市").city("重庆市").district(null)
          .provider("gaode").build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(any);

      GeoResult result = service.geocode(GeoRequest.builder()
          .name("解放碑").build());

      assertThat(result).isNotNull();
    }

    @Test
    @DisplayName("province/city/district 全为 null — 校验跳过，应接受结果")
    void no_admin_fields_skips_validation() throws Exception {
      GeoResult noAdmin = GeoResult.builder()
          .latitude(36.08).longitude(120.35)
          .province(null).city(null).district(null)
          .provider("gaode").build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(noAdmin);

      GeoResult result = service.geocode(GeoRequest.builder()
          .name("小鱼山").destination("青岛").build());

      assertThat(result).isNotNull();
    }

    @Test
    @DisplayName("cityValidationEnabled=false — 不触发校验，应接受任何结果")
    void disabled_validation_always_accepts() throws Exception {
      when(properties.isCityValidationEnabled()).thenReturn(false);
      GeocodingServiceImpl service2 = new GeocodingServiceImpl(properties, List.of(gaodeProvider), geocodingCacheMapper);
      GeoResult wrongCity = GeoResult.builder()
          .latitude(29.55).longitude(106.59)
          .province("重庆市").city("重庆市").district(null)
          .provider("gaode").build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(wrongCity);

      GeoResult result = service2.geocode(GeoRequest.builder()
          .name("大学路").destination("青岛").build());

      assertThat(result).isNotNull();
    }
  }

  @Nested
  @DisplayName("DB 缓存策略（v0.7.0 新增）")
  class DbCache {

    @Test
    @DisplayName("DB 命中且未过期 — 不调 provider，直接返回")
    void db_cache_hit_returns_cached_and_skips_provider() {
      // 准备缓存条目（未过期）
      GeocodingCache cachedEntity = GeocodingCache.builder()
          .cacheKey("小鱼山|青岛||")
          .name("小鱼山")
          .latitude(36.06).longitude(120.33)
          .level("兴趣点").provider("gaode")
          .province("山东省").city("青岛市").district("市南区")
          .expireAt(java.time.LocalDateTime.now().plusDays(7))
          .build();
      when(geocodingCacheMapper.selectOne(any())).thenReturn(cachedEntity);

      GeoResult result = service.geocode(GeoRequest.builder()
          .name("小鱼山").destination("青岛").build());

      assertThat(result).isNotNull();
      assertThat(result.getLatitude()).isEqualTo(36.06);
      assertThat(result.getLongitude()).isEqualTo(120.33);
      // provider 字段应标记为 "cache"
      assertThat(result.getProvider()).isEqualTo("cache");
      // 验证高德 provider 未被调用（DB 命中跳过）
      verify(gaodeProvider, never()).geocode(any());
    }

    @Test
    @DisplayName("DB 命中但已过期 — 应调 provider 并覆盖缓存")
    void db_cache_expired_calls_provider() throws Exception {
      // 缓存条目已过期
      GeocodingCache expiredEntity = GeocodingCache.builder()
          .cacheKey("小鱼山|青岛||")
          .name("小鱼山")
          .latitude(36.06).longitude(120.33)
          .level("兴趣点").provider("gaode")
          .province("山东省").city("青岛市").district("市南区")
          .expireAt(java.time.LocalDateTime.now().minusDays(1))
          .build();
      when(geocodingCacheMapper.selectOne(any())).thenReturn(expiredEntity);

      GeoResult fromProvider = GeoResult.builder()
          .latitude(36.061).longitude(120.331)
          .level("兴趣点").provider("gaode")
          .province("山东省").city("青岛市").district("市南区")
          .build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(fromProvider);

      GeoResult result = service.geocode(GeoRequest.builder()
          .name("小鱼山").destination("青岛").build());

      assertThat(result).isNotNull();
      // 返回的是 provider 的实时值,非缓存
      assertThat(result.getLatitude()).isEqualTo(36.061);
      // provider 被调用了一次
      verify(gaodeProvider, times(1)).geocode(any());
    }

    @Test
    @DisplayName("DB 未命中 — 调 provider 并写库")
    void db_cache_miss_calls_provider_and_inserts() throws Exception {
      when(geocodingCacheMapper.selectOne(any())).thenReturn(null);

      GeoResult fromProvider = GeoResult.builder()
          .latitude(36.08).longitude(120.35)
          .level("兴趣点").provider("gaode")
          .province("山东省").city("青岛市").district("市南区")
          .build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(fromProvider);

      GeoResult result = service.geocode(GeoRequest.builder()
          .name("大学路/漫画街").address("市南区大学路").destination("青岛").build());

      assertThat(result).isNotNull();
      assertThat(result.getLatitude()).isEqualTo(36.08);
      // 验证入库调用
      verify(geocodingCacheMapper, times(1)).insert(any(GeocodingCache.class));
    }

    @Test
    @DisplayName("DB 读写抛异常 — 不影响主流程,降级为调 provider")
    void db_exception_falls_back_to_provider() throws Exception {
      when(geocodingCacheMapper.selectOne(any())).thenThrow(new RuntimeException("DB down"));

      GeoResult fromProvider = GeoResult.builder()
          .latitude(36.08).longitude(120.35)
          .level("兴趣点").provider("gaode")
          .province("山东省").city("青岛市").district(null)
          .build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(fromProvider);

      GeoResult result = service.geocode(GeoRequest.builder()
          .name("大学路").destination("青岛").build());

      assertThat(result).isNotNull();
      assertThat(result.getLatitude()).isEqualTo(36.08);
    }
  }

  @Nested
  @DisplayName("cacheKey 隔离与缓存校验兜底")
  class CacheKeyIsolation {

    @Test
    @DisplayName("同名 POI 不同 destination — cacheKey 不同，不共享缓存")
    void cache_key_differs_by_destination_to_avoid_cross_contamination() {
      // "大学路"在青岛 vs 重庆 → cacheKey 必须不同，避免跨目的地缓存污染
      String keyQingdao = service.buildCacheKey(GeoRequest.builder()
          .name("大学路").destination("青岛").build());
      String keyChongqing = service.buildCacheKey(GeoRequest.builder()
          .name("大学路").destination("重庆").build());

      assertThat(keyQingdao).contains("青岛");
      assertThat(keyChongqing).contains("重庆");
      assertThat(keyQingdao).isNotEqualTo(keyChongqing);
    }

    @Test
    @DisplayName("缓存命中但 destination 不匹配 — 拒绝缓存，继续反查")
    void cache_hit_rejected_when_destination_mismatches() throws Exception {
      // 缓存中有一条 destination=重庆 的 大学路
      GeocodingCache chongqingCache = GeocodingCache.builder()
          .cacheKey("大学路|重庆||")
          .name("大学路")
          .latitude(29.55).longitude(106.59)
          .level("兴趣点").provider("gaode")
          .province("重庆市").city("重庆市").district("沙坪坝区")
          .destination("重庆")
          .expireAt(java.time.LocalDateTime.now().plusDays(7))
          .build();
      when(geocodingCacheMapper.selectOne(any())).thenReturn(chongqingCache);

      // 模拟 provider 返回青岛的结果（缓存拒绝后应该走这里）
      GeoResult qingdaoFromProvider = GeoResult.builder()
          .latitude(36.08).longitude(120.35)
          .level("兴趣点").provider("gaode")
          .province("山东省").city("青岛市").district("市南区")
          .build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(qingdaoFromProvider);

      // 新查询 destination=青岛 → 缓存条目 destination=重庆 不匹配 → 拒绝缓存 → 调 provider
      GeoResult result = service.geocode(GeoRequest.builder()
          .name("大学路").destination("青岛").build());

      assertThat(result).isNotNull();
      // 返回的是 provider 实时反查的青岛坐标，不是缓存的重庆坐标
      assertThat(result.getLatitude()).isEqualTo(36.08);
      assertThat(result.getLongitude()).isEqualTo(120.35);
      // provider 被调用一次（缓存被拒绝）
      verify(gaodeProvider, times(1)).geocode(any());
    }

    @Test
    @DisplayName("缓存命中且 destination 匹配 — 直接返回缓存，不调 provider")
    void cache_hit_accepted_when_destination_matches() {
      // 缓存中有一条 destination=青岛 的 小鱼山
      GeocodingCache matchedCache = GeocodingCache.builder()
          .cacheKey("小鱼山|青岛||")
          .name("小鱼山")
          .latitude(36.06).longitude(120.33)
          .level("兴趣点").provider("gaode")
          .province("山东省").city("青岛市").district("市南区")
          .destination("青岛")
          .expireAt(java.time.LocalDateTime.now().plusDays(7))
          .build();
      when(geocodingCacheMapper.selectOne(any())).thenReturn(matchedCache);

      // 相同 destination=青岛 再查一次 → 命中缓存，不调 provider
      GeoResult result = service.geocode(GeoRequest.builder()
          .name("小鱼山").destination("青岛").build());

      assertThat(result).isNotNull();
      assertThat(result.getLatitude()).isEqualTo(36.06);
      assertThat(result.getProvider()).isEqualTo("cache");
      verify(gaodeProvider, never()).geocode(any());
    }
  }

  @Nested
  @DisplayName("Provider 路由（resolveProviderOrder）")
  class ProviderRouting {

    @Test
    @DisplayName("provider=gaode — 仅使用高德，Nominatim 不参与")
    void providerMode_gaode_onlyUsesGaode() throws Exception {
      when(properties.getProvider()).thenReturn("gaode");
      GeocodingServiceImpl svc = new GeocodingServiceImpl(properties,
          List.of(gaodeProvider, nominatimProvider), geocodingCacheMapper);

      GeoResult qingdao = GeoResult.builder()
          .latitude(36.08).longitude(120.35)
          .province("山东省").city("青岛市").district("市南区")
          .provider("gaode").build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(qingdao);

      GeoResult result = svc.geocode(GeoRequest.builder()
          .name("大学路").destination("青岛").build());

      assertThat(result).isNotNull();
      // 验证 Nominatim 未被调用（gaode 模式不参与）
      verify(nominatimProvider, never()).geocode(any());
    }

    @Test
    @DisplayName("provider=nominatim — 仅使用 Nominatim，高德不参与")
    void providerMode_nominatim_onlyUsesNominatim() throws Exception {
      when(properties.getProvider()).thenReturn("nominatim");
      GeocodingServiceImpl svc = new GeocodingServiceImpl(properties,
          List.of(gaodeProvider, nominatimProvider), geocodingCacheMapper);

      GeoResult qingdao = GeoResult.builder()
          .latitude(36.08).longitude(120.35)
          .province("山东省").city("青岛市").district("市南区")
          .provider("nominatim").build();
      when(nominatimProvider.geocode(any(GeoRequest.class))).thenReturn(qingdao);

      GeoResult result = svc.geocode(GeoRequest.builder()
          .name("大学路").destination("青岛").build());

      assertThat(result).isNotNull();
      verify(gaodeProvider, never()).geocode(any());
    }

    @Test
    @DisplayName("provider=auto — 高德优先，高德失败时 fallback 到 Nominatim")
    void providerMode_auto_fallsBackToNominatim() throws Exception {
      when(properties.getProvider()).thenReturn("auto");
      GeocodingServiceImpl svc = new GeocodingServiceImpl(properties,
          List.of(gaodeProvider, nominatimProvider), geocodingCacheMapper);

      // 高德失败（抛异常）
      when(gaodeProvider.geocode(any(GeoRequest.class)))
          .thenThrow(new GeocodingException("Gaode API error: CUQPS_HAS_EXCEEDED_THE_LIMIT"));
      // Nominatim 成功
      GeoResult qingdao = GeoResult.builder()
          .latitude(36.08).longitude(120.35)
          .province("山东省").city("青岛市").district("市南区")
          .provider("nominatim").build();
      when(nominatimProvider.geocode(any(GeoRequest.class))).thenReturn(qingdao);

      GeoResult result = svc.geocode(GeoRequest.builder()
          .name("大学路").destination("青岛").build());

      assertThat(result).isNotNull();
      assertThat(result.getProvider()).isEqualTo("nominatim");
      // 两个 provider 都被调用（fallback 路径）
      verify(gaodeProvider, times(1)).geocode(any());
      verify(nominatimProvider, times(1)).geocode(any());
    }

    @Test
    @DisplayName("provider=auto — 高德成功时 Nominatim 不参与")
    void providerMode_auto_gaodeSucceeds_noFallback() throws Exception {
      when(properties.getProvider()).thenReturn("auto");
      GeocodingServiceImpl svc = new GeocodingServiceImpl(properties,
          List.of(gaodeProvider, nominatimProvider), geocodingCacheMapper);

      GeoResult qingdao = GeoResult.builder()
          .latitude(36.08).longitude(120.35)
          .province("山东省").city("青岛市").district("市南区")
          .provider("gaode").build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(qingdao);

      GeoResult result = svc.geocode(GeoRequest.builder()
          .name("大学路").destination("青岛").build());

      assertThat(result).isNotNull();
      verify(nominatimProvider, never()).geocode(any());
    }

    @Test
    @DisplayName("provider=gaode 但高德不可用 — 返回 null（无可用 provider）")
    void providerMode_gaodeUnavailable_returnsNull() {
      when(properties.getProvider()).thenReturn("gaode");
      when(gaodeProvider.isAvailable()).thenReturn(false);
      GeocodingServiceImpl svc = new GeocodingServiceImpl(properties,
          List.of(gaodeProvider, nominatimProvider), geocodingCacheMapper);

      GeoResult result = svc.geocode(GeoRequest.builder()
          .name("大学路").destination("青岛").build());

      assertThat(result).isNull();
    }
  }

  @Nested
  @DisplayName("batchGeocode 批量调用")
  class BatchGeocode {

    @Test
    @DisplayName("批量调用 — 每个 key 都调 geocode，返回 Map 包含所有结果")
    void batchGeocode_callsForEachEntry() throws Exception {
      GeoResult qingdao = GeoResult.builder()
          .latitude(36.08).longitude(120.35)
          .province("山东省").city("青岛市").district("市南区")
          .provider("gaode").build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(qingdao);

      Map<String, GeoResult> results = service.batchGeocode(Map.of(
          "poi1", GeoRequest.builder().name("大学路").destination("青岛").build(),
          "poi2", GeoRequest.builder().name("栈桥").destination("青岛").build()
      ));

      assertThat(results).hasSize(2);
      assertThat(results.get("poi1")).isNotNull();
      assertThat(results.get("poi2")).isNotNull();
      verify(gaodeProvider, times(2)).geocode(any());
    }
  }

  @Nested
  @DisplayName("Provider 熔断")
  class ProviderCircuitBreaker {

    @Test
    @DisplayName("48 个 POI 遇到同一 Provider 故障时只执行一次完整失败调用")
    void repeatedProviderFailure_opensCircuitForRemainingPois() throws Exception {
      when(properties.getProvider()).thenReturn("nominatim");
      when(properties.getCircuitBreakerFailureThreshold()).thenReturn(1);
      when(properties.getCircuitBreakerOpenSeconds()).thenReturn(60L);
      when(nominatimProvider.geocode(any(GeoRequest.class)))
          .thenThrow(new GeocodingException("connect timed out"));
      GeocodingServiceImpl circuitService = new GeocodingServiceImpl(
          properties, List.of(nominatimProvider), geocodingCacheMapper);

      for (int index = 0; index < 48; index++) {
        GeoResult result = circuitService.geocode(GeoRequest.builder()
            .name("POI-" + index)
            .destination("川西")
            .build());
        assertThat(result).isNull();
      }

      verify(nominatimProvider, times(1)).geocode(any(GeoRequest.class));
    }
  }

  @Nested
  @DisplayName("saveToCache 异常兜底")
  class SaveToCacheEdgeCases {

    @Test
    @DisplayName("saveToCache 抛异常 — 不阻断主流程，返回结果")
    void saveToCacheThrows_doesNotBlock() throws Exception {
      when(geocodingCacheMapper.insert(any(GeocodingCache.class)))
          .thenThrow(new RuntimeException("DB write failed"));

      GeoResult qingdao = GeoResult.builder()
          .latitude(36.08).longitude(120.35)
          .province("山东省").city("青岛市").district("市南区")
          .provider("gaode").build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(qingdao);

      GeoResult result = service.geocode(GeoRequest.builder()
          .name("大学路").destination("青岛").build());

      // 主流程正常返回，saveToCache 异常被吞掉
      assertThat(result).isNotNull();
      assertThat(result.getLatitude()).isEqualTo(36.08);
    }
  }

  @Nested
  @DisplayName("isWithinDestination 距离兜底边界")
  class DistanceFallbackEdge {

    @Test
    @DisplayName("result 有省市区但 lat/lng=null — 无法距离兜底，应拒绝")
    void resultWithAdminFieldsButNoLatLng_rejects() throws Exception {
      // 有省市区字段但 lat/lng 为 null → 无法做距离兜底 → 拒绝
      GeoResult noLatLng = GeoResult.builder()
          .latitude(null).longitude(null)
          .province("四川省").city("甘孜藏族自治州").district("康定市")
          .provider("gaode").build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(noLatLng);

      GeoResult result = service.geocode(GeoRequest.builder()
          .name("折多山").destination("川西").build());

      assertThat(result).isNull();
    }

    @Test
    @DisplayName("destination 未知（findDestinationCenter 返回 null）— 字段不匹配且无中心点 → 拒绝")
    void unknownDestination_rejects() throws Exception {
      GeoResult farAway = GeoResult.builder()
          .latitude(36.08).longitude(120.35)
          .province("山东省").city("青岛市").district("市南区")
          .provider("gaode").build();
      when(gaodeProvider.geocode(any(GeoRequest.class))).thenReturn(farAway);

      // destination="Mars" → findDestinationCenter 返回 null → 无法距离兜底 → 拒绝
      GeoResult result = service.geocode(GeoRequest.builder()
          .name("某POI").destination("Mars").build());

      assertThat(result).isNull();
    }
  }
}
