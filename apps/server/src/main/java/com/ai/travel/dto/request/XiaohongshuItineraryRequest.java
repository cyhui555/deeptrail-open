package com.ai.travel.dto.request;

import jakarta.validation.constraints.NotBlank;
import java.util.List;
import lombok.Data;

/** 小红书链接生成行程请求体。AI 从笔记内容中提取出发地、目的地、天数等信息。 */
@Data
public class XiaohongshuItineraryRequest {

  /** 小红书笔记链接（与 noteContent 二选一，优先使用 noteContent） */
  private String url;

  /** 直接粘贴的笔记正文内容，优先级高于 url */
  private String noteContent;

  private Integer days;
  private Integer peopleCount;
  private List<String> preferences;
  private String specialRequirements;
}
