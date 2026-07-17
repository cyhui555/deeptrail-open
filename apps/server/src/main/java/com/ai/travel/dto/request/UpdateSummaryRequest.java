package com.ai.travel.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** 保存编辑后的 AI 总结请求。 */
@Data
@Schema(name = "UpdateSummaryRequest", description = "保存编辑后的 AI 总结请求")
public class UpdateSummaryRequest {

  /** 编辑后的 AI 总结内容。 */
  @NotBlank(message = "总结内容不能为空")
  @Size(max = 5000, message = "总结最多 5000 字符")
  @Schema(description = "编辑后的总结内容", requiredMode = Schema.RequiredMode.REQUIRED)
  private String summary;
}
