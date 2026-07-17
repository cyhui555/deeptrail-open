package com.ai.travel.entity;

import com.ai.travel.enums.UserRole;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;
import lombok.Data;

/** 用户实体，对应 user 表。 */
@Data
@TableName("user")
@Schema(description = "用户信息")
public class User {

  /** 用户 ID，自增主键。 */
  @TableId(type = IdType.AUTO)
  @Schema(description = "用户 ID", example = "1")
  private Long id;

  /** 用户名，唯一。 */
  @Schema(description = "用户名", example = "traveler01")
  private String username;

  /** BCrypt 哈希后的密码。 */
  @Schema(description = "BCrypt 哈希密码", accessMode = Schema.AccessMode.WRITE_ONLY)
  private String password;

  /** 手机号，可选。 */
  @Schema(description = "手机号", example = "1*********0")
  private String phone;

  /** 微信 openid，用于微信登录绑定。 */
  @Schema(description = "微信 OpenID")
  private String wechatOpenId;

  /** 微信 unionid，用于跨应用统一标识。 */
  @Schema(description = "微信 UnionID")
  private String wechatUnionId;

  /** 用户角色，后台接口只允许 ADMIN。 */
  @Schema(description = "用户角色", example = "USER")
  private UserRole role;

  /** 账号是否可用；停用后登录和已有会话均会失效。 */
  @Schema(description = "账号是否启用", example = "true")
  private Boolean enabled;

  /** 分配该账号的管理员用户 ID；历史用户可能为空。 */
  @Schema(description = "账号分配人用户 ID", example = "1")
  private Long createdByUserId;

  /** 注册时间，自动填充。 */
  @Schema(description = "注册时间")
  private LocalDateTime createdAt;
}
