package com.ai.travel.dto.response;

import com.ai.travel.enums.UserRole;
import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 管理后台用户摘要，不暴露密码哈希或第三方身份字段。 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AdminUserResponse {

  private Long userId;
  private String username;
  private UserRole role;
  private boolean enabled;
  private Long createdByUserId;
  private LocalDateTime createdAt;
}
