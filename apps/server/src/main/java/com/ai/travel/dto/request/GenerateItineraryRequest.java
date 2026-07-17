package com.ai.travel.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDateTime;
import java.util.List;
import lombok.Data;

/** 生成行程请求体。 */
@Data
public class GenerateItineraryRequest {

  @NotBlank(message = "departureLocation must not be blank")
  private String departureLocation;

  /**
   * 出发时间。
   *
   * <p>解析由全局 {@link com.ai.travel.config.JacksonConfig} 接管，接受以下格式：
   * <ul>
   *   <li>{@code yyyy-MM-dd'T'HH:mm:ss}</li>
   *   <li>{@code yyyy-MM-dd'T'HH:mm}（前端 {@code <input type="time">} 产出，秒补 0）</li>
   *   <li>{@code yyyy-MM-dd HH:mm:ss}（历史兼容）</li>
   * </ul>
   *
   * <p>详见 BUG-20260706-001 修复。
   */
  @NotNull(message = "departureTime must not be null")
  private LocalDateTime departureTime;

  @NotBlank(message = "destination must not be blank")
  private String destination;

  @NotNull(message = "days must not be null")
  @Min(value = 1, message = "days must be >= 1")
  private Integer days;

  @NotNull(message = "peopleCount must not be null")
  @Min(value = 1, message = "peopleCount must be >= 1")
  private Integer peopleCount;

  private String budget;
  private List<String> preferences;
  private String specialRequirements;
}
