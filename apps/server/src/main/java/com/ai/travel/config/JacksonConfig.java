package com.ai.travel.config;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.BeanDescription;
import com.fasterxml.jackson.databind.DeserializationConfig;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.deser.Deserializers;
import com.fasterxml.jackson.databind.module.SimpleModule;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoField;
import java.util.Locale;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Jackson 全局配置：宽容解析 LocalDateTime。
 *
 * <p>前端 {@code <input type="time">} 产出 ISO 格式不带秒（如 {@code 2026-07-07T09:00}），
 * 而 Jackson 默认 {@code JavaTimeModule} 要求 {@code yyyy-MM-ddTHH:mm:ss}（必须有秒）。
 * 本模块通过 {@link #LENIENT_FORMATTER} 统一兼容以下三种输入格式：
 *
 * <ul>
 *   <li>{@code yyyy-MM-dd'T'HH:mm:ss} —— 标准 ISO（有秒）</li>
 *   <li>{@code yyyy-MM-dd'T'HH:mm} —— 前端缺秒（BUG-20260706-001 触发场景）</li>
 *   <li>{@code yyyy-MM-dd HH:mm:ss} —— 历史空格分隔格式（保持向后兼容）</li>
 * </ul>
 *
 * <p>当前 Jackson 反序列化优先级：
 *
 * <pre>
 *   {@code @JsonFormat} 字段注解 (JavaTimeModule) &gt; Deserializers SPI 兜底解析器
 * </pre>
 *
 * <p>由于 DTO 上的 {@code @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")} 已被移除，
 * 所以 LocalDateTime 走"标准 JavaTimeModule"解析器——它期望 ISO 严格带秒（T HH:mm:ss）。
 * 测试表明该解析器严格拒绝 {@code yyyy-MM-dd HH:mm:ss} 空格分隔格式和缺秒 ISO。
 *
 * <p>解决方案：注册 SPI {@link Deserializers.Base}，在 {@link Deserializers.Base#findBeanDeserializer}
 * 中识别 LocalDateTime 类型时返回我们自己的宽容解析器。Jackson 会在上述 deserializer 失败时调用兜底，
 * 或者通过 {@link #HACK_DESERIALIZER_REPLACEMENT} 的方式直接替换。
 *
 * <p>关联 BUG：BUG-20260706-001。
 */
@Configuration
public class JacksonConfig {

  /** 分隔符：{@code 'T'} 或空格 */
  static final DateTimeFormatter LENIENT_FORMATTER =
      new DateTimeFormatterBuilder()
          .appendPattern("yyyy-MM-dd['T'][ ]")
          .appendPattern("HH:mm")
          .optionalStart()
          .appendPattern(":[ss]")
          .optionalEnd()
          .parseDefaulting(ChronoField.SECOND_OF_MINUTE, 0)
          .parseDefaulting(ChronoField.MILLI_OF_SECOND, 0)
          .toFormatter(Locale.ROOT);

  /** 宽容反序列化器：读取字符串 → 用 {@link #LENIENT_FORMATTER} 解析为 {@link LocalDateTime}。 */
  static class LenientLocalDateTimeDeserializer extends JsonDeserializer<LocalDateTime> {

    @Override
    public LocalDateTime deserialize(JsonParser parser, DeserializationContext context)
        throws IOException {
      String text = parser.getValueAsString();
      if (text == null || text.isBlank()) {
        return null;
      }
      try {
        return LocalDateTime.parse(text.trim(), LENIENT_FORMATTER);
      } catch (DateTimeParseException ex) {
        throw new IOException(
            "无法解析 LocalDateTime: \"" + text + "\"，支持的格式: yyyy-MM-dd'T'HH:mm[:ss]"
                + " 或 yyyy-MM-dd HH:mm:ss",
            ex);
      }
    }
  }

  /**
   * 注册 SPI Deserializers 模块，追加在自动注册的 JavaTimeModule 之后。
   *
   * <p>通过 {@link com.fasterxml.jackson.databind.deser.Deserializers.Base#findBeanDeserializer} 返回
   * {@link LenientLocalDateTimeDeserializer}，Jackson 优先使用该返回值作为 bean 类型反序列化器，
   * 从而跳过 JavaTimeModule 注册的严格解析器。
   *
   * <p><b>注意</b>：必须使用 {@code Jackson2ObjectMapperBuilder#modulesToInstall}
   * 而非 {@code modules(...)} —— 后者会<b>替换</b>所有 ServiceLoader 自动发现的模块（包括 JavaTimeModule），
   * 导致 {@code LocalDateTime} 序列化也失败，出现
   * {@code InvalidDefinitionException: Java 8 date/time type ... not supported by default}。
   *
   * @return Jackson2 构建器定制器
   */
  @Bean
  public Jackson2ObjectMapperBuilderCustomizer lenientLocalDateTimeCustomizer() {
    JsonDeserializer<LocalDateTime> deser = new LenientLocalDateTimeDeserializer();
    return builder ->
        builder.modulesToInstall(
            new SimpleModule("lenientLocalDateTime") {
              @Override
              public void setupModule(SetupContext context) {
                super.setupModule(context);
                context.addDeserializers(new Deserializers.Base() {
                  @Override
                  public JsonDeserializer<?> findBeanDeserializer(
                      JavaType type,
                      DeserializationConfig config,
                      BeanDescription beanDesc) {
                    if (type.getRawClass() == LocalDateTime.class) {
                      return deser;
                    }
                    return null;
                  }
                });
              }
            });
  }

  /**
   * 供测试在不启动 Spring 容器的情况下构造等同容器级别的 ObjectMapper 使用。
   *
   * @return 配置宽容 LocalDateTime SimpleModule
   */
  public SimpleModule lenientLocalDateTimeModule() {
    JsonDeserializer<LocalDateTime> deser = new LenientLocalDateTimeDeserializer();
    return new SimpleModule("lenientLocalDateTime") {
      @Override
      public void setupModule(SetupContext context) {
        super.setupModule(context);
        context.addDeserializers(new Deserializers.Base() {
          @Override
          public JsonDeserializer<?> findBeanDeserializer(
              JavaType type,
              DeserializationConfig config,
              BeanDescription beanDesc) {
            if (type.getRawClass() == LocalDateTime.class) {
              return deser;
            }
            return null;
          }
        });
      }
    };
  }
}
