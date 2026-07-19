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

  /**
   * 构建坐标解析线程池。
   *
   * <p>外部 Provider 仍由全局令牌桶限制 QPS；这里仅把单次行程内的独立 POI 请求并发化，
   * 避免串行超时超过 Web 请求预算。固定 4 线程和有界队列防止重复刷新耗尽进程线程。
   *
   * @return 坐标解析执行器
   */
  @Bean("geocodingTaskExecutor")
  public TaskExecutor geocodingTaskExecutor() {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(4);
    executor.setMaxPoolSize(4);
    executor.setQueueCapacity(32);
    executor.setThreadNamePrefix("geocoding-");
    executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
    executor.setWaitForTasksToCompleteOnShutdown(true);
    executor.setAwaitTerminationSeconds(30);
    executor.initialize();
    return executor;
  }
}
