package com.ai.travel.dto.response;

import lombok.Data;

/** 地点信息（POI），复用为景点、餐厅、住宿等统一结构。 */
@Data
public class PoiInfo {

  private String name;
  private String category;
  private String address;
  private Double latitude;
  private Double longitude;
  private String estimatedVisitTime;
  private String openingHours;
  private String admissionFee;
  private String phone;
  private String rating;
  private String estimatedCost;
}
