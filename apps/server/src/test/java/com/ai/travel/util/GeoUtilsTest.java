package com.ai.travel.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/** GeoUtils 工具类单元测试。 */
class GeoUtilsTest {

  @Test
  @DisplayName("两点间距离计算 - 北京天安门到故宫约 1.5km")
  void distance_beijingCenter_toForbiddenCity() {
    int distance = GeoUtils.calculateDistance(39.9042, 116.4074, 39.9163, 116.3972);
    assertThat(distance).isBetween(1500, 1700);
  }

  @Test
  @DisplayName("相同坐标距离为 0")
  void distance_samePoint_returnsZero() {
    assertThat(GeoUtils.calculateDistance(39.9, 116.4, 39.9, 116.4)).isEqualTo(0);
  }

  @Test
  @DisplayName("距离计算具有对称性")
  void distance_isSymmetric() {
    int d1 = GeoUtils.calculateDistance(39.9, 116.4, 40.0, 116.5);
    int d2 = GeoUtils.calculateDistance(40.0, 116.5, 39.9, 116.4);
    assertThat(d1).isCloseTo(d2, within(1));
  }

  @Test
  @DisplayName("判断是否在打卡范围内 - 范围内返回 true")
  void isWithinProximity_inside_returnsTrue() {
    assertThat(GeoUtils.isWithinProximity(39.9042, 116.4074, 39.9045, 116.4078, 200)).isTrue();
  }

  @Test
  @DisplayName("判断是否在打卡范围内 - 范围外返回 false")
  void isWithinProximity_outside_returnsFalse() {
    assertThat(GeoUtils.isWithinProximity(39.9042, 116.4074, 39.9163, 116.3972, 200)).isFalse();
  }

  @Test
  @DisplayName("非法坐标（纬度超出范围）应抛出异常")
  void distance_invalidLat_throwsException() {
    assertThatThrownBy(() -> GeoUtils.calculateDistance(91.0, 0, 0, 0))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  @DisplayName("非法坐标（经度超出范围）应抛出异常")
  void distance_invalidLng_throwsException() {
    assertThatThrownBy(() -> GeoUtils.calculateDistance(0, 181.0, 0, 0))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  @DisplayName("isValidCoordinate - 有效坐标返回 true")
  void isValidCoordinate_valid_returnsTrue() {
    assertThat(GeoUtils.isValidCoordinate(39.9042, 116.4074)).isTrue();
  }

  @Test
  @DisplayName("isValidCoordinate - null 坐标返回 false")
  void isValidCoordinate_null_returnsFalse() {
    assertThat(GeoUtils.isValidCoordinate(null, 116.4074)).isFalse();
    assertThat(GeoUtils.isValidCoordinate(39.9042, null)).isFalse();
  }

  @Test
  @DisplayName("isValidCoordinate - 超出范围返回 false")
  void isValidCoordinate_outOfRange_returnsFalse() {
    assertThat(GeoUtils.isValidCoordinate(91.0, 116.4074)).isFalse();
    assertThat(GeoUtils.isValidCoordinate(39.9042, 181.0)).isFalse();
  }

  @Test
  @DisplayName("isAccurateEnough - 精度足够返回 true")
  void isAccurateEnough_goodAccuracy_returnsTrue() {
    assertThat(GeoUtils.isAccurateEnough(10.0)).isTrue();
    assertThat(GeoUtils.isAccurateEnough(50.0)).isTrue();
  }

  @Test
  @DisplayName("isAccurateEnough - 精度不足返回 false")
  void isAccurateEnough_poorAccuracy_returnsFalse() {
    assertThat(GeoUtils.isAccurateEnough(60.0)).isFalse();
    assertThat(GeoUtils.isAccurateEnough(null)).isFalse();
  }

  // ========== findDestinationCenter（BUG-20260706-002 新增） ==========

  @Test
  @DisplayName("findDestinationCenter - 中文目的地（青岛）返回非 null 中心点")
  void findDestinationCenter_chinese_qingdao() {
    double[] center = GeoUtils.findDestinationCenter("青岛");
    assertThat(center).isNotNull();
    assertThat(center).hasSize(2);
    assertThat(center[0]).isBetween(35.0, 37.0);
    assertThat(center[1]).isBetween(119.0, 122.0);
  }

  @Test
  @DisplayName("findDestinationCenter - 拼音目的地（Chengdu）返回成都坐标")
  void findDestinationCenter_pinyin_chengdu() {
    double[] center = GeoUtils.findDestinationCenter("Chengdu");
    assertThat(center).isNotNull();
    assertThat(center[0]).isBetween(29.0, 32.0);
    assertThat(center[1]).isBetween(103.0, 106.0);
  }

  @Test
  @DisplayName("findDestinationCenter - 川西地理概念返回甘孜附近坐标")
  void findDestinationCenter_chuanxi() {
    double[] center = GeoUtils.findDestinationCenter("川西");
    assertThat(center).isNotNull();
    assertThat(center[0]).isBetween(29.0, 32.0);
    assertThat(center[1]).isBetween(100.0, 103.0);
  }

  @Test
  @DisplayName("findDestinationCenter - 未知目的地返回 null（不抛异常）")
  void findDestinationCenter_unknown_returnsNull() {
    assertThat(GeoUtils.findDestinationCenter("Mars")).isNull();
    assertThat(GeoUtils.findDestinationCenter("  ")).isNull();
    assertThat(GeoUtils.findDestinationCenter(null)).isNull();
  }

  @Test
  @DisplayName("findDestinationCenter - 英文 Beijing/Shanghai 返回正确中心点")
  void findDestinationCenter_english_cities() {
    double[] beijing = GeoUtils.findDestinationCenter("Beijing");
    assertThat(beijing).isNotNull();
    assertThat(beijing[0]).isCloseTo(39.90, org.assertj.core.data.Offset.offset(0.5));
    assertThat(beijing[1]).isCloseTo(116.40, org.assertj.core.data.Offset.offset(0.5));

    double[] shanghai = GeoUtils.findDestinationCenter("Shanghai");
    assertThat(shanghai).isNotNull();
    assertThat(shanghai[0]).isCloseTo(31.23, org.assertj.core.data.Offset.offset(0.5));
    assertThat(shanghai[1]).isCloseTo(121.47, org.assertj.core.data.Offset.offset(0.5));
  }

  @Test
  @DisplayName("findDestinationCenter - 中文别名（深圳/广州/西安）命中对应分支")
  void findDestinationCenter_variousChineseAliases() {
    // 深圳/深圳市 → 珠三角
    double[] shenzhen1 = GeoUtils.findDestinationCenter("深圳");
    double[] shenzhen2 = GeoUtils.findDestinationCenter("深圳市");
    assertThat(shenzhen1).isNotNull();
    assertThat(shenzhen2).isNotNull();
    assertThat(shenzhen1[0]).isCloseTo(shenzhen2[0], org.assertj.core.data.Offset.offset(0.001));
    // 大珠三角
    assertThat(shenzhen1[0]).isBetween(22.0, 24.0);
    assertThat(shenzhen1[1]).isBetween(113.0, 115.0);

    // 广州
    double[] gz = GeoUtils.findDestinationCenter("广州市");
    assertThat(gz).isNotNull();
    assertThat(gz[0]).isBetween(22.5, 24.0);

    // 西安 / Xian
    double[] xian = GeoUtils.findDestinationCenter("西安");
    double[] xianEn = GeoUtils.findDestinationCenter("Xian");
    assertThat(xian).isNotNull();
    assertThat(xianEn).isNotNull();
    assertThat(xian[0]).isCloseTo(xianEn[0], org.assertj.core.data.Offset.offset(0.001));

    // 伊犁哈萨克自治州 / Ili
    double[] yili = GeoUtils.findDestinationCenter("伊犁哈萨克自治州");
    assertThat(yili).isNotNull();
    assertThat(yili[0]).isBetween(43.0, 44.5);
    assertThat(yili[1]).isBetween(80.0, 83.0);
  }

  @Test
  @DisplayName("findDestinationCenter - 川西周边别名（阿坝/甘孜/川北）命中对应分支")
  void findDestinationCenter_sichuanAliases() {
    double[] ganzi = GeoUtils.findDestinationCenter("甘孜州");
    double[] aba = GeoUtils.findDestinationCenter("阿坝");
    double[] chuanbei = GeoUtils.findDestinationCenter("川北");
    assertThat(ganzi).isNotNull();
    assertThat(aba).isNotNull();
    assertThat(chuanbei).isNotNull();
    // 阿坝/甘孜 → 与 "川西" 接近但可能不同
    assertThat(ganzi[0]).isBetween(28.0, 34.0);
    assertThat(aba[0]).isBetween(30.0, 34.0);
    // 川北 → 广元附近
    assertThat(chuanbei[0]).isBetween(30.5, 33.0);
  }

  @Test
  @DisplayName("findDestinationCenter - 小众目的地（三亚/拉萨/喀纳斯）命中对应分支")
  void findDestinationCenter_nicheDestinations() {
    double[] sanya = GeoUtils.findDestinationCenter("三亚");
    double[] lhasa = GeoUtils.findDestinationCenter("拉萨");
    double[] kanansi = GeoUtils.findDestinationCenter("喀纳斯");

    assertThat(sanya).isNotNull();
    assertThat(sanya[0]).isBetween(18.0, 19.0);

    assertThat(lhasa).isNotNull();
    assertThat(lhasa[0]).isBetween(29.0, 30.0);

    assertThat(kanansi).isNotNull();
    // 喀纳斯 → 北疆中心
    assertThat(kanansi[0]).isBetween(47.0, 49.0);
  }

  // ========== isWithinDestination 9 参数签名（距离兜底） ==========

  @Test
  @DisplayName("isWithinDestination - 字段匹配失败但坐标在距离内，应通过（distance fallback）")
  void isWithinDestination_distanceFallback_passes() {
    // 折多山 vs 川西：字段不匹配（四川省甘孜州 != 川西），但坐标仅 4km 内
    boolean accepted = GeoUtils.isWithinDestination(
        30.029795, 101.996442,     // 折多山
        "四川省", "甘孜藏族自治州", "康定市",
        "川西",
        30.05, 101.96,             // 川西中心点（与 findDestinationCenter 返回一致）
        100_000L);
    assertThat(accepted).isTrue();
  }

  @Test
  @DisplayName("isWithinDestination - 距离超出 maxDistanceMeters 应拒绝")
  void isWithinDestination_distanceBeyondThreshold_rejects() {
    // 重庆沙坪坝（29.55,106.59）vs 青岛中心（36.07,120.35）超过 1000km > 100km
    boolean accepted = GeoUtils.isWithinDestination(
        29.55, 106.59,
        "重庆市", "重庆市", "沙坪坝区",
        "青岛",
        36.07, 120.35,
        100_000L);
    assertThat(accepted).isFalse();
  }

  @Test
  @DisplayName("isWithinDestination - destination 为 null 直接通过")
  void isWithinDestination_nullDestination_passes() {
    boolean accepted = GeoUtils.isWithinDestination(
        30.0, 100.0,
        "四川省", "成都市", "武侯区",
        null, null, null, 100_000L);
    assertThat(accepted).isTrue();
  }

  @Test
  @DisplayName("isWithinDestination - province/city/district 全空 + 中心点非空时按距离判断")
  void isWithinDestination_noAdminFields_usesDistanceOnly() {
    // 字段全空：GeocodingServiceImpl 不会走到 isWithinDestination（由上游短路）
    // 但直接调 9 参数签名时，中心点非空 → 距离判断
    boolean accepted = GeoUtils.isWithinDestination(
        36.08, 120.35,
        null, null, null,
        "青岛",
        36.07, 120.35,
        10_000L);
    assertThat(accepted).isTrue();
  }

  @Test
  @DisplayName("isWithinDestination - 坐标非法返回 false（距离兜底不覆盖此路径）")
  void isWithinDestination_invalidCoordinate_returnsFalse() {
    assertThat(GeoUtils.isWithinDestination(
        91.0, 120.35, "山东省", "青岛市", "市南区",
        "青岛", 36.07, 120.35, 100_000L)).isFalse();
  }

  @Test
  @DisplayName("isWithinDestination - 字段匹配成功时直接通过（不依赖距离兜底）")
  void isWithinDestination_adminMatch_passesWithoutDistance() {
    // 字段匹配成功 → 直接返回 true，不计算距离
    boolean accepted = GeoUtils.isWithinDestination(
        36.08, 120.35,
        "山东省", "青岛市", "市南区",
        "青岛",
        null, null,  // 中心点 null 不影响
        100_000L);
    assertThat(accepted).isTrue();
  }

  @Test
  @DisplayName("isWithinDestination - 字段不匹配 + 中心点 null → 拒绝")
  void isWithinDestination_noAdminMatchAndNullCenter_rejects() {
    boolean accepted = GeoUtils.isWithinDestination(
        36.08, 120.35,
        "山东省", "青岛市", "市南区",
        "川西",  // 字段不匹配
        null, null,  // 中心点 null → 无法距离兜底
        100_000L);
    assertThat(accepted).isFalse();
  }

  // ========== isAdministrativeMatch 直接测试（覆盖 GeoUtils 267-295 行） ==========

  @Nested
  @DisplayName("isAdministrativeMatch — 行政区字段双向包含匹配")
  class AdministrativeMatch {

    @Test
    @DisplayName("destination 为 null → 直接返回 true")
    void nullDestination_returnsTrue() {
      assertThat(GeoUtils.isAdministrativeMatch("山东省", "青岛市", "市南区", null)).isTrue();
    }

    @Test
    @DisplayName("destination 为空白 → 直接返回 true")
    void blankDestination_returnsTrue() {
      assertThat(GeoUtils.isAdministrativeMatch("山东省", "青岛市", "市南区", "  ")).isTrue();
    }

    @Test
    @DisplayName("全部字段为空 → 返回 true（避免过度拦截）")
    void allFieldsBlank_returnsTrue() {
      assertThat(GeoUtils.isAdministrativeMatch(null, null, null, "青岛")).isTrue();
      assertThat(GeoUtils.isAdministrativeMatch("", "", "", "青岛")).isTrue();
    }

    @Test
    @DisplayName("city 包含 destination → 匹配")
    void cityContainsDestination_returnsTrue() {
      assertThat(GeoUtils.isAdministrativeMatch("山东省", "青岛市", null, "青岛")).isTrue();
    }

    @Test
    @DisplayName("destination 包含 province → 匹配")
    void destinationContainsProvince_returnsTrue() {
      assertThat(GeoUtils.isAdministrativeMatch("新疆", null, null, "新疆维吾尔自治区")).isTrue();
    }

    @Test
    @DisplayName("district 与 destination 互相包含 → 匹配")
    void districtMatchesDestination_returnsTrue() {
      assertThat(GeoUtils.isAdministrativeMatch("山东省", "青岛市", "市南区", "市南区")).isTrue();
    }

    @Test
    @DisplayName("双向都不包含 → 不匹配")
    void noMatch_returnsFalse() {
      assertThat(GeoUtils.isAdministrativeMatch("重庆市", "重庆市", "沙坪坝区", "青岛")).isFalse();
    }

    @Test
    @DisplayName("部分字段为 null，其余匹配 → 匹配")
    void partialNullFields_matchByOthers() {
      assertThat(GeoUtils.isAdministrativeMatch(null, "青岛市", null, "青岛")).isTrue();
    }

    @Test
    @DisplayName("部分字段为空白，其余匹配 → 匹配")
    void partialBlankFields_matchByOthers() {
      assertThat(GeoUtils.isAdministrativeMatch("", "青岛市", "", "青岛")).isTrue();
    }
  }

  @Nested
  @DisplayName("isMacroRegionAdministrativeMatch — 宏观旅游区域按省级范围校验")
  class MacroRegionAdministrativeMatch {

    @Test
    @DisplayName("川西应接受四川省内的阿坝与成都节点")
    void chuanxiAcceptsSichuanProvince() {
      assertThat(GeoUtils.isMacroRegionAdministrativeMatch(
          "四川省", "阿坝藏族羌族自治州", "小金县", "川西")).isTrue();
      assertThat(GeoUtils.isMacroRegionAdministrativeMatch(
          "四川省", "成都市", "都江堰市", "川西")).isTrue();
    }

    @Test
    @DisplayName("川西仍应拒绝浙江和重庆等跨省坐标")
    void chuanxiRejectsOtherProvinces() {
      assertThat(GeoUtils.isMacroRegionAdministrativeMatch(
          "浙江省", "杭州市", "萧山区", "川西")).isFalse();
      assertThat(GeoUtils.isMacroRegionAdministrativeMatch(
          "重庆市", "重庆市", "沙坪坝区", "川西")).isFalse();
    }
  }

  // ========== findDestinationCenter 别名全覆盖（BUG-20260706-002 修复） ==========

  @Nested
  @DisplayName("findDestinationCenter — 别名全覆盖")
  class FindDestinationCenterAliases {

    @Test
    @DisplayName("山东半岛别名 — 烟台/威海/潍坊/泰安")
    void shandongAliases() {
      assertThat(GeoUtils.findDestinationCenter("烟台")).isNotNull();
      assertThat(GeoUtils.findDestinationCenter("威海")).isNotNull();
      assertThat(GeoUtils.findDestinationCenter("潍坊市")).isNotNull();
      assertThat(GeoUtils.findDestinationCenter("泰安")).isNotNull();
    }

    @Test
    @DisplayName("东部城市别名 — 南京/苏州/杭州")
    void eastAliases() {
      assertThat(GeoUtils.findDestinationCenter("南京")).isNotNull();
      assertThat(GeoUtils.findDestinationCenter("苏州")).isNotNull();
      assertThat(GeoUtils.findDestinationCenter("杭州市")).isNotNull();
    }

    @Test
    @DisplayName("西北城市别名 — 乌鲁木齐/兰州")
    void northwestAliases() {
      assertThat(GeoUtils.findDestinationCenter("乌鲁木齐")).isNotNull();
      assertThat(GeoUtils.findDestinationCenter("兰州市")).isNotNull();
    }

    @Test
    @DisplayName("千岛湖别名 — 淳安/千岛湖镇")
    void qiandaoAliases() {
      assertThat(GeoUtils.findDestinationCenter("千岛湖")).isNotNull();
      assertThat(GeoUtils.findDestinationCenter("淳安")).isNotNull();
      assertThat(GeoUtils.findDestinationCenter("Qiandao Lake")).isNotNull();
    }

    @Test
    @DisplayName("华南城市别名 — 昆明/香港/澳门")
    void southChinaAliases() {
      assertThat(GeoUtils.findDestinationCenter("昆明")).isNotNull();
      assertThat(GeoUtils.findDestinationCenter("香港")).isNotNull();
      assertThat(GeoUtils.findDestinationCenter("澳门")).isNotNull();
    }

    @Test
    @DisplayName("西藏/北疆别名")
    void tibetAndNorthXinjiangAliases() {
      assertThat(GeoUtils.findDestinationCenter("西藏")).isNotNull();
      assertThat(GeoUtils.findDestinationCenter("拉萨")).isNotNull();
      assertThat(GeoUtils.findDestinationCenter("北疆")).isNotNull();
      assertThat(GeoUtils.findDestinationCenter("喀纳斯")).isNotNull();
    }

    @Test
    @DisplayName("伊犁别名 — 伊犁州/伊犁哈萨克自治州/Ili")
    void yiliAliases() {
      assertThat(GeoUtils.findDestinationCenter("伊犁州")).isNotNull();
      assertThat(GeoUtils.findDestinationCenter("伊犁哈萨克自治州")).isNotNull();
      assertThat(GeoUtils.findDestinationCenter("Ili")).isNotNull();
    }

    @Test
    @DisplayName("重庆/成都别名 — 重庆市/成都市")
    void chongqingChengduAliases() {
      assertThat(GeoUtils.findDestinationCenter("重庆市")).isNotNull();
      assertThat(GeoUtils.findDestinationCenter("成都市")).isNotNull();
    }

    @Test
    @DisplayName("空白/空字符串 — 返回 null")
    void blankDestination_returnsNull() {
      assertThat(GeoUtils.findDestinationCenter("")).isNull();
      assertThat(GeoUtils.findDestinationCenter("   ")).isNull();
    }

    @Test
    @DisplayName("山东半岛剩余别名 — 济南/Jinan/潍坊市/烟台市")
    void shandongRemainingAliases() {
      assertThat(GeoUtils.findDestinationCenter("济南")).isNotNull();
      assertThat(GeoUtils.findDestinationCenter("Jinan")).isNotNull();
      assertThat(GeoUtils.findDestinationCenter("潍坊市")).isNotNull();
      assertThat(GeoUtils.findDestinationCenter("烟台市")).isNotNull();
    }

    @Test
    @DisplayName("覆盖 isAdministrativeMatch continue/last-return-false 分支")
    void administrativeMatch_edgeBranches() {
      // isAllBlank=false, 所有字段都不包含 destination 也不被 destination 包含 → 走到最后 return false
      boolean matched = GeoUtils.isAdministrativeMatch("山东省", "青岛市", "市南区", "火星");
      assertThat(matched).isFalse();
      // province 字段为 null 则跳过该字段继续检查
      boolean matched2 = GeoUtils.isAdministrativeMatch(null, null, null, "青岛");
      // 三个字段全空走到 isAllBlank=true 短路返回 true
      assertThat(matched2).isTrue();
    }
  }
}
