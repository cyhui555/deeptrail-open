package com.ai.travel.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;
import java.util.List;
import lombok.Data;

/** 打卡项详情响应。 */
@Data
@Schema(name = "CheckinItemResponse", description = "打卡项详情")
public class CheckinItemResponse {

  @Schema(description = "打卡项 ID")
  private Long id;

  @Schema(description = "POI 名称")
  private String poiName;

  @Schema(description = "POI 地址")
  private String poiAddress;

  @Schema(description = "POI 纬度")
  private Double poiLat;

  @Schema(description = "POI 经度")
  private Double poiLng;

  @Schema(description = "打卡时纬度")
  private Double checkinLat;

  @Schema(description = "打卡时经度")
  private Double checkinLng;

  @Schema(description = "与 POI 的距离（米）")
  private Integer distanceMeters;

  @Schema(description = "打卡来源：GPS / MANUAL")
  private String source;

  @Schema(description = "文字笔记")
  private String note;

  @Schema(description = "状态：PENDING / CHECKED_IN / ABANDONED")
  private String status;

  @Schema(description = "打卡时间")
  private LocalDateTime checkedInAt;

  @Schema(description = "媒体列表（仅 is_history=false）")
  private List<MediaItemDto> media;

  // ==================== 扩展字段（v0.4.0 新增，打卡页面内容增强） ====================

  @Schema(description = "时段：早上 / 上午 / 中午 / 下午 / 晚上 / 深夜")
  private String period;

  @Schema(description = "时段描述文本")
  private String description;

  @Schema(description = "预计游玩时长")
  private String estimatedVisitTime;

  @Schema(description = "开放时间")
  private String openingHours;

  @Schema(description = "门票")
  private String admissionFee;

  @Schema(description = "预计花费")
  private String estimatedCost;

  @Schema(description = "POI 评分")
  private String rating;

  @Schema(description = "POI 分类（如景点/餐厅/酒店）")
  private String category;

  @Schema(description = "POI 联系电话")
  private String phone;

  @Schema(description = "是否为用户自加行程点")
  private Boolean isCustom;

  // ==================== 扩展字段（v0.6.0 新增，地图坐标修正） ====================

  @Schema(description = "展示用纬度 = COALESCE(corrected_lat, poi_lat)", example = "30.5728")
  private Double displayLat;

  @Schema(description = "展示用经度 = COALESCE(corrected_lng, poi_lng)", example = "104.0668")
  private Double displayLng;

  @Schema(description = "是否经过用户坐标修正", example = "false")
  private Boolean isCoordinateCorrected;

  // ==================== 扩展字段（v0.7.0 新增，路线交通工具） ====================

  /**
   * 当前 POI → 下一 POI 的交通段 JSON 字符串。
   *
   * <p>格式: {@code {"mode":"WALK","durationMin":10,"description":"步行约10分钟"}}。
   * 最后一个 POI 或 AI 未输出交通时为 null。
   */
  @Schema(description = "当前 POI → 下一 POI 的交通段 JSON 字符串，最后一个 POI 为 null",
          example = "{\"mode\":\"WALK\",\"durationMin\":10,\"description\":\"步行约10分钟\"}")
  private String transportToNext;

  /** 媒体项数据。 */
  @Data
  @Schema(name = "MediaItemDto", description = "媒体项")
  public static class MediaItemDto {
    @Schema(description = "媒体 ID")
    private Long id;

    @Schema(description = "媒体类型：IMAGE / VIDEO")
    private String mediaType;

    @Schema(description = "文件访问 URL")
    private String url;

    @Schema(description = "缩略图 URL")
    private String thumbnailUrl;
  }
}
