package com.ai.travel.mapper;

import com.ai.travel.entity.CheckinItem;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/** checkin_item 表 Mapper。 */
@Mapper
public interface CheckinItemMapper extends BaseMapper<CheckinItem> {

  /**
   * 仅当打卡项仍为 PENDING 时完成状态跃迁。
   *
   * <p>条件更新是打卡计数只递增一次的数据库闸门，不能退化为“先查再无条件更新”。
   *
   * @param item 已完成坐标、来源、笔记和幂等键归一化的打卡项
   * @return 1 表示本请求赢得状态跃迁；0 表示已被其他请求处理
   */
  @Update("""
      UPDATE checkin_item
      SET checkin_lat = #{item.checkinLat},
          checkin_lng = #{item.checkinLng},
          distance_meters = #{item.distanceMeters},
          source = #{item.source},
          note = #{item.note},
          status = 'CHECKED_IN',
          checked_in_at = #{item.checkedInAt},
          checkin_idempotency_key = #{item.checkinIdempotencyKey}
      WHERE id = #{item.id}
        AND status = 'PENDING'
      """)
  int markCheckedInIfPending(@Param("item") CheckinItem item);

  /** 查询同一任务内占用指定幂等键的打卡项。 */
  @Select("""
      SELECT *
      FROM checkin_item
      WHERE checkin_task_id = #{taskId}
        AND checkin_idempotency_key = #{idempotencyKey}
      LIMIT 1
      """)
  CheckinItem selectByTaskAndIdempotencyKey(
      @Param("taskId") String taskId,
      @Param("idempotencyKey") String idempotencyKey);
}
