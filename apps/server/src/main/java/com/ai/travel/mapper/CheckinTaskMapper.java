package com.ai.travel.mapper;

import com.ai.travel.entity.CheckinTask;
import com.ai.travel.mapper.projection.TripPlanProgressProjection;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** checkin_task 表 Mapper。 */
@Mapper
public interface CheckinTaskMapper extends BaseMapper<CheckinTask> {

  /**
   * 一次聚合多个行程的打卡进度，避免列表页按行程逐条查询。
   *
   * @param planIds 当前用户分页结果中的行程 ID
   * @return 有打卡任务的行程进度；没有任务的行程不返回记录
   */
  @Select({
      "<script>",
      "SELECT plan_id AS planId,",
      "COALESCE(SUM(total_poi), 0) AS totalPoi,",
      "COALESCE(SUM(completed_poi), 0) AS completedPoi",
      "FROM checkin_task",
      "WHERE plan_id IN",
      "<foreach collection='planIds' item='planId' open='(' separator=',' close=')'>",
      "#{planId}",
      "</foreach>",
      "GROUP BY plan_id",
      "</script>"
  })
  List<TripPlanProgressProjection> summarizeProgressByPlanIds(
      @Param("planIds") List<String> planIds);

  /**
   * 原子递增已完成 POI 数，并在达到总数时同步完成任务。
   *
   * <p>该更新只允许在打卡项条件更新成功后调用，避免并发请求重复计数或覆盖彼此的增量。
   */
  @Update("""
      UPDATE checkin_task
      SET completed_poi = COALESCE(completed_poi, 0) + 1,
          status = CASE
              WHEN COALESCE(completed_poi, 0) + 1 >= total_poi THEN 'COMPLETED'
              ELSE status
          END,
          completed_at = CASE
              WHEN COALESCE(completed_poi, 0) + 1 >= total_poi THEN #{completedAt}
              ELSE completed_at
          END
      WHERE id = #{taskId}
      """)
  int incrementCompletedPoi(
      @Param("taskId") String taskId,
      @Param("completedAt") java.time.LocalDateTime completedAt);
}
