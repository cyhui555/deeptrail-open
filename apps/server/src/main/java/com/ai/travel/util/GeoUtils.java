package com.ai.travel.util;

/**
 * 地理工具类。
 *
 * <p>提供 Haversine 距离计算、坐标校验、精度校验等常用地理计算方法。
 */
public final class GeoUtils {

  /** 地球半径（米）。 */
  private static final double EARTH_RADIUS_METERS = 6371000.0;

  /** 地理围栏默认半径（米）。 */
  public static final double DEFAULT_PROXIMITY_METERS = 200.0;

  /** 轨迹记录最小距离（米）。 */
  public static final double TRACK_MIN_DISTANCE_METERS = 5.0;

  /** GPS 精度阈值（米），超过此值的定位点丢弃。 */
  public static final double TRACK_MAX_ACCURACY_METERS = 50.0;

  private GeoUtils() {
    // 工具类不可实例化
  }

  /**
   * 使用 Haversine 公式计算两点间距离。
   *
   * @param lat1 第一点纬度（度）
   * @param lng1 第一点经度（度）
   * @param lat2 第二点纬度（度）
   * @param lng2 第二点经度（度）
   * @return 两点间距离（米）
   * @throws IllegalArgumentException 如果坐标值非法
   */
  public static int calculateDistance(double lat1, double lng1, double lat2, double lng2) {
    if (!isValidCoordinate(lat1, lng1) || !isValidCoordinate(lat2, lng2)) {
      throw new IllegalArgumentException("非法坐标值");
    }
    final double deltaLat = Math.toRadians(lat2 - lat1);
    final double deltaLng = Math.toRadians(lng2 - lng1);
    double a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2)
        + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
        * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (int) Math.round(EARTH_RADIUS_METERS * c);
  }

  /**
   * 校验坐标是否在有效范围内。
   *
   * @param lat 纬度
   * @param lng 经度
   * @return true 如果坐标有效
   */
  public static boolean isValidCoordinate(Double lat, Double lng) {
    if (lat == null || lng == null) {
      return false;
    }
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  /**
   * 校验 GPS 精度是否满足要求。
   *
   * @param accuracy GPS 精度（米）
   * @return true 如果精度满足要求（≤ 50m）
   */
  public static boolean isAccurateEnough(Double accuracy) {
    if (accuracy == null) {
      return false;
    }
    return accuracy <= TRACK_MAX_ACCURACY_METERS;
  }

  /**
   * 判断两点距离是否在地理围栏范围内。
   *
   * @param lat1 第一点纬度
   * @param lng1 第一点经度
   * @param lat2 第二点纬度
   * @param lng2 第二点经度
   * @param proximityMeters 地理围栏半径（米）
   * @return true 如果在围栏范围内
   */
  public static boolean isWithinProximity(double lat1, double lng1,
                                           double lat2, double lng2,
                                           double proximityMeters) {
    return calculateDistance(lat1, lng1, lat2, lng2) <= proximityMeters;
  }

  /**
   * 校验 POI 经纬度是否在期望目的地所属的省/市行政区划内。
   *
   * <p>校验分两层：
   * <ol>
   *   <li><b>城市字段匹配</b>：result 中 province/city/district 任一字段包含于 destination、
   *       或 destination 包含于这些字段（双向包含），即视为同城。
   *       例：destination="青岛"，result.city="青岛市" → "青岛市".contains("青岛") → true。</li>
   *   <li><b>距离兜底</b>：字段为空或不匹配时，退化为 Haversine 距离校验，
   *       若 POI 坐标与 destination 中心点坐标距离在 maxDistanceMeters 内视为同城。</li>
   * </ol>
   *
   * @param poiLat            POI 纬度
   * @param lng               POI 经度
   * @param province          反向地理编码省字段（可为 null）
   * @param city              反向地理编码市字段（可为 null）
   * @param district          反向地理编码区字段（可为 null）
   * @param destination       期望目的地字符串（如 "青岛"、"伊犁哈萨克自治州"）
   * @param destinationLat    期望目的地中心纬度（用于距离兜底，可为 null）
   * @param destinationLng    期望目的地中心经度（用于距离兜底，可为 null）
   * @param maxDistanceMeters 最大允许距离（米）
   * @return true 如果在同城范围内
   */
  public static boolean isWithinDestination(double poiLat, double lng,
                                             String province, String city, String district,
                                             String destination,
                                             Double destinationLat, Double destinationLng,
                                             long maxDistanceMeters) {
    if (!isValidCoordinate(poiLat, lng)) {
      return false;
    }
    // 无 destination 时无法校验 —— 通过
    if (destination == null || destination.isBlank()) {
      return true;
    }
    // 第一层：精确行政区匹配；宏观旅游区域按所属省级范围校验。
    if (isAdministrativeMatch(province, city, district, destination)
        || isMacroRegionAdministrativeMatch(province, city, district, destination)) {
      return true;
    }
    // 第二层：距离兜底（需要 destination 中心点）
    if (isValidCoordinate(destinationLat, destinationLng)) {
      double distance = calculateDistance(poiLat, lng, destinationLat, destinationLng);
      return distance <= maxDistanceMeters;
    }
    // 两层都不满足 → 丢弃
    return false;
  }

  /**
   * 已知旅游城市/区域名称列表（与 {@link #findDestinationCenter} 的 case 标签保持同步）。
   */
  private static final java.util.List<String> KNOWN_CITY_NAMES = java.util.List.of(
      // 山东半岛
      "青岛", "济南", "烟台", "威海", "潍坊", "泰安",
      // 西南
      "重庆", "成都", "川西", "川北", "甘孜", "阿坝",
      // 东部
      "北京", "上海", "南京", "杭州", "苏州",
      // 西北
      "乌鲁木齐", "伊犁", "西安", "兰州",
      // 浙江
      "千岛湖", "淳安",
      // 华南
      "广州", "深圳", "昆明", "三亚", "香港", "澳门",
      // 西藏 + 北疆
      "西藏", "拉萨", "北疆", "喀纳斯", "禾木",
      // 常见自治州
      "伊犁州", "甘孜州", "阿坝州"
  );

  /**
   * 在自由文本中查找首个匹配的知名旅游城市/区域名称。
   *
   * <p>用于从 AI 生成的 summary 或用户输入的备注中解析目的地，
   * 仅匹配 {@link #KNOWN_CITY_NAMES} 中的标准名（不含"市/区"后缀），
   * 避免误匹配短词（如"北京西路"仅匹配"北京"）。
   *
   * @param text 自由文本，可为 null
   * @return 首个匹配的城市名，或 null
   */
  public static String findFirstMatchingCity(String text) {
    if (text == null || text.isBlank()) {
      return null;
    }
    for (String city : KNOWN_CITY_NAMES) {
      if (text.contains(city)) {
        return city;
      }
    }
    return null;
  }

  /**
   * 根据 destination 查找粗略城市/区域中心点。
   *
   * <p>用于距离兜底：当行政区字段匹配失败时，通过中心点做 Haversine 距离校验。
   * 覆盖中国常见旅游城市/区域（中文、拼音、英文表达）。
   *
   * <p>返回值约定：[lat, lng]（WGS84）。
   * 覆盖高发场景（青岛、济南、重庆、成都、伊犁、西安、珠三角、长三角、北京、上海、
   * 川西、川北、西藏、新疆北疆等）；未命中返回 null（调用方应直接通过，避免过度拦截）。
   *
   * @param destination 用户输入或 AI 推断的目的地字符串（如"青岛"、"Beijing"、"川西"、"Xian"）
   * @return [lat, lng] 中心点，或 null（未识别的目的地，不拦截由调用方决定）
   */
  public static double[] findDestinationCenter(String destination) {
    if (destination == null || destination.isBlank()) {
      return null;
    }
    // switch 表达式处理最常见的旅游目的地
    return switch (destination.trim()) {
      // 山东半岛
      case "青岛", "青岛市", "Qingdao" -> new double[]{36.07, 120.35};
      case "济南", "济南市", "Jinan" -> new double[]{36.65, 117.12};
      case "烟台", "烟台市", "Yantai", "威海", "威海市", "Weihai" -> new double[]{36.70, 121.27};
      case "潍坊", "潍坊市", "Weifang", "泰安", "泰安市", "Taian" -> new double[]{36.43, 119.67};

      // 西南
      case "重庆", "重庆市", "Chongqing" -> new double[]{29.56, 106.55};
      case "成都", "成都市", "Chengdu" -> new double[]{30.57, 104.07};
      case "川西", "川西高原", "Western Sichuan", "甘孜", "甘孜州", "阿坝", "阿坝州" ->
          new double[]{30.05, 101.96};  // 折多山/康定附近（用户高频目的地）
      case "川北", "Northern Sichuan" -> new double[]{31.47, 105.87};

      // 东部
      case "北京", "北京市", "Beijing" -> new double[]{39.90, 116.40};
      case "上海", "上海市", "Shanghai" -> new double[]{31.23, 121.47};
      case "南京", "南京市", "Nanjing" -> new double[]{32.06, 118.80};
      case "杭州", "杭州市", "Hangzhou" -> new double[]{30.27, 120.15};
      case "苏州", "苏州市", "Suzhou" -> new double[]{31.30, 120.62};

      // 西北
      case "乌鲁木齐", "乌鲁木齐市", "Urumqi" -> new double[]{43.80, 87.60};
      case "伊犁", "伊犁州", "伊犁哈萨克自治州", "Ili", "Yili" -> new double[]{43.92, 81.32};
      case "西安", "西安市", "Xian", "Xi'an" -> new double[]{34.26, 108.93};
      case "兰州", "兰州市", "Lanzhou" -> new double[]{36.06, 103.83};

      // 浙江（千岛湖是杭州市下辖的淳安县内景区，AI 常直接用"千岛湖"作 destination）
      case "千岛湖", "千岛湖景区", "千岛湖镇", "淳安", "淳安县",
          "Qiandao Lake", "Chun'an" -> new double[]{29.60, 119.02};

      // 华南
      case "广州", "广州市", "Guangzhou" -> new double[]{23.13, 113.26};
      case "深圳", "深圳市", "Shenzhen" -> new double[]{22.54, 114.06};
      case "昆明", "昆明市", "Kunming" -> new double[]{25.04, 102.73};
      case "三亚", "三亚市", "Sanya" -> new double[]{18.25, 109.50};
      case "香港", "香港特别行政区", "Hong Kong" -> new double[]{22.32, 114.17};
      case "澳门", "Macao", "Macau" -> new double[]{22.20, 113.55};

      // 西藏
      case "西藏", "拉萨", "拉萨市", "Tibet", "Lhasa" -> new double[]{29.65, 91.10};

      // 北疆
      case "北疆", "Northern Xinjiang", "喀纳斯", "禾木" -> new double[]{48.08, 87.0};

      default -> null;
    };
  }

  /**
   * 判断结果中省/市/区字段与期望目的地是否存在包含关系。
   *
   * <p>覆盖常见表达方式：
   * <ul>
   *   <li>"青岛" vs "青岛市"（destination 被包含在 result.city）</li>
   *   <li>"伊犁哈萨克自治州" vs "伊犁州"（模糊包含）</li>
   *   <li>"新疆维吾尔自治区" vs "新疆"（province 含 destination 关键词）</li>
   * </ul>
   *
   * @param province 省字段
   * @param city     市字段
   * @param district 区字段
   * @param destination 期望目的地
   * @return true 如果任一方向包含匹配成功
   */
  public static boolean isAdministrativeMatch(String province, String city, String district,
                                        String destination) {
    if (destination == null || destination.isBlank()) {
      return true;
    }
    // 全部字段为空则表示无法通过行政区字段校验，跳过（避免过度拦截）
    if (isAllBlank(province, city, district)) {
      return true;
    }
    String dest = destination.trim();
    for (String field : new String[]{province, city, district}) {
      if (field == null || field.isBlank()) {
        continue;
      }
      String f = field.trim();
      // 互相包含即算匹配
      if (f.contains(dest) || dest.contains(f)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 判断“川西、川北、西藏、北疆”等宏观旅游区域与 Provider 行政区字段是否相容。
   *
   * <p>宏观区域不能使用单一中心点加城市级 100km 阈值：川西路线常同时覆盖成都、
   * 都江堰、阿坝和甘孜。这里仅放宽到明确的省级行政区，仍会拒绝杭州、重庆等跨省脏坐标。
   */
  public static boolean isMacroRegionAdministrativeMatch(String province, String city,
                                                           String district, String destination) {
    if (destination == null || destination.isBlank()) {
      return false;
    }
    String expectedProvince = switch (destination.trim()) {
      case "川西", "川西高原", "Western Sichuan", "川北", "Northern Sichuan" -> "四川";
      case "西藏", "Tibet" -> "西藏";
      case "北疆", "Northern Xinjiang" -> "新疆";
      default -> null;
    };
    if (expectedProvince == null) {
      return false;
    }
    for (String field : new String[]{province, city, district}) {
      if (field != null && field.contains(expectedProvince)) {
        return true;
      }
    }
    return false;
  }

  private static boolean isAllBlank(String... values) {
    for (String v : values) {
      if (v != null && !v.isBlank()) {
        return false;
      }
    }
    return true;
  }
}
