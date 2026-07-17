package com.ai.travel.config;

import java.time.Duration;
import java.util.concurrent.Executors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * Spring AI ChatClient 底层 HTTP 超时配置。
 *
 * <p>通过自定义 {@link RestClient.Builder} 注入 JDK {@link java.net.http.HttpClient}，
 * 设置连接超时与连接池驱逐策略。读取超时不做限制，由 {@link com.ai.travel.task.TaskScheduler}
 * 的看门狗统一管控任务级超时，避免 AI 生成时间较长时被 HTTP 层误杀。
 *
 * <p>JDK {@code HttpClient} 默认不对外暴露连接池保活/驱逐能力，仍会复用空闲连接。
 * 在云环境（NAT/防火墙/LB）中，空闲连接可能在 60~300 秒被中间件静默丢弃，
 * 客户端直到下次 I/O 才感知，触发 {@code Connection reset}。
 * 配置专用守护线程池可避免阻塞公共 ForkJoinPool，同时上层
 * {@link com.ai.travel.service.ItineraryAiService} 的 IOException 重试机制作为兜底。
 *
 * <p>Spring AI OpenAI starter 会自动检测容器中的 {@code RestClient.Builder} Bean
 * 并用于构建 ChatClient 底层的 HTTP 调用；{@code baseUrl} 由 Spring AI 自动装配。
 */
@Configuration
@Slf4j
public class AiClientConfig {

  /** 连接超时（秒），默认 15 秒。 */
  @Value("${ai.http.connect-timeout-seconds:15}")
  private int connectTimeoutSeconds;

  /** JDK HttpClient 专用 IO 线程池的核心线程数。 */
  @Value("${ai.http.io-thread-count:4}")
  private int ioThreadCount;

  /**
   * 提供自定义 {@link RestClient.Builder}，配置连接超时与专用 IO 线程池。
   *
   * <p>不设置读取超时，AI 生成时间由任务级看门狗（默认 10 分钟）统一管控。
   *
   * @return 配置了连接超时和专用 IO 线程池的 {@link RestClient.Builder}
   */
  @Bean
  public RestClient.Builder aiRestClientBuilder() {
    java.net.http.HttpClient httpClient = java.net.http.HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(connectTimeoutSeconds))
        .executor(Executors.newFixedThreadPool(ioThreadCount, r -> {
          Thread t = new Thread(r, "ai-http-client");
          t.setDaemon(true);
          return t;
        }))
        .build();

    JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
    // 不调用 setReadTimeout — 读取超时不限制，由看门狗统一管控

    log.info("AI HTTP client configured: connectTimeout={}s, ioThreads={}, "
            + "readTimeout=unlimited (watchdog-controlled)",
        connectTimeoutSeconds, ioThreadCount);

    return RestClient.builder().requestFactory(requestFactory);
  }
}
