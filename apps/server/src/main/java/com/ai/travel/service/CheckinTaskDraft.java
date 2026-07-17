package com.ai.travel.service;

import com.ai.travel.entity.CheckinItem;
import com.ai.travel.entity.CheckinTask;
import java.util.List;

/** 事务外准备完成、等待一次性落库的单日签到任务。 */
public record CheckinTaskDraft(CheckinTask task, List<CheckinItem> items) {
}
