package com.ai.travel.mapper;

import com.ai.travel.entity.User;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 用户表 MyBatis Mapper。
 *
 * <p>基于 MyBatis Plus BaseMapper 提供基础 CRUD 能力。
 */
@Mapper
public interface UserMapper extends BaseMapper<User> {

  /**
   * 按用户名筛选后台用户列表；密码与第三方身份字段不进入查询结果。
   *
   * @param keyword 规范化后的用户名关键字，空字符串表示全部
   * @param limit 每页数量
   * @param offset 起始偏移
   * @return 当前页用户
   */
  @Select("""
      SELECT id, username, role, enabled, created_by_user_id, created_at
      FROM user
      WHERE (#{keyword} = '' OR username LIKE '%' || #{keyword} || '%')
      ORDER BY CASE role WHEN 'ADMIN' THEN 0 ELSE 1 END, created_at DESC, id DESC
      LIMIT #{limit} OFFSET #{offset}
      """)
  List<User> selectAdminPage(@Param("keyword") String keyword,
                             @Param("limit") int limit,
                             @Param("offset") int offset);

  /** 返回符合后台用户名筛选条件的总数。 */
  @Select("""
      SELECT COUNT(*)
      FROM user
      WHERE (#{keyword} = '' OR username LIKE '%' || #{keyword} || '%')
      """)
  long countAdminUsers(@Param("keyword") String keyword);
}
