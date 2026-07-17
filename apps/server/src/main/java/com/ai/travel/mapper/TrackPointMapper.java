package com.ai.travel.mapper;

import com.ai.travel.entity.TrackPoint;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** track_point 表 Mapper。 */
@Mapper
public interface TrackPointMapper extends BaseMapper<TrackPoint> {

  /** 查询同一行程内已经持久化的客户端轨迹点 ID。 */
  @Select({
      "<script>",
      "SELECT client_point_id FROM track_point",
      "WHERE plan_id = #{planId}",
      "AND client_point_id IN",
      "<foreach collection='clientPointIds' item='clientPointId'",
      "open='(' separator=',' close=')'>",
      "#{clientPointId}",
      "</foreach>",
      "</script>"
  })
  List<String> selectExistingClientPointIds(
      @Param("planId") String planId,
      @Param("clientPointIds") List<String> clientPointIds);

  /**
   * 保存带客户端 ID 的轨迹点，并由数据库唯一约束兜底并发重复上传。
   *
   * @return 1 表示新插入，0 表示同一行程中该客户端 ID 已存在
   */
  @Insert("""
      INSERT INTO track_point (
          plan_id, client_point_id, latitude, longitude, accuracy,
          altitude, speed, recorded_at, created_at
      ) VALUES (
          #{point.planId}, #{point.clientPointId}, #{point.latitude}, #{point.longitude},
          #{point.accuracy}, #{point.altitude}, #{point.speed}, #{point.recordedAt},
          #{point.createdAt}
      )
      ON CONFLICT(plan_id, client_point_id) DO NOTHING
      """)
  int insertIdempotently(@Param("point") TrackPoint point);
}
