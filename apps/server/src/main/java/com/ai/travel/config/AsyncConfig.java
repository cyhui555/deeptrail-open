package com.ai.travel.config;

import java.util.concurrent.ThreadPoolExecutor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/** 线程池与定时调度配置。 */
@Configuration
@EnableAsync
@EnableScheduling
public class AsyncConfig {

  /**
   * 构建异步任务线程池。
   *
   * <p>核心 4 线程、最大 16 线程、队列容量 100，拒绝策略为调用方执行，
   * 并在关闭时等待进行中任务完成最多 60 秒。
   *
   * @return 异步任务执行器
   */
  @Bean("aiTaskExecutor")
  public TaskExecutor aiTaskExecutor() {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(4);
    executor.setMaxPoolSize(16);
    executor.setQueueCapacity(100);
    executor.setThreadNamePrefix("ai-task-");
    executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
    executor.setWaitForTasksToCompleteOnShutdown(true);
    executor.setAwaitTerminationSeconds(60);
    executor.initialize();
    return executor;
  }
}
