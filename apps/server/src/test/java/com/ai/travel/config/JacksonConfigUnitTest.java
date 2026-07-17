package com.ai.travel.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 直接验证 {@link JacksonConfig#lenientLocalDateTimeModule()} 在本地 ObjectMapper 上的行为。
 *
 * <p>不启动 Spring 容器、不经过 MockMvc——排除环境干扰，直接验证 mapper 是否正确反序列化。
 */
class JacksonConfigUnitTest {

  record Holder(LocalDateTime value) {}

  /** 与 JacksonConfig 容器装配等价的构造。 */
  private static ObjectMapper buildMapper() {
    return new ObjectMapper()
        .registerModule(new JavaTimeModule())
        .registerModule(new JacksonConfig().lenientLocalDateTimeModule());
  }

  @Test
  @DisplayName("纯 mapper：yyyy-MM-ddTHH:mm（无秒，BUG-20260706-001 场景）应解析成功")
  void isoNoSeconds_patchesToZero() throws Exception {
    Holder r = buildMapper().readValue("{\"value\":\"2026-07-07T09:00\"}", Holder.class);
    assertThat(r.value).isEqualTo(LocalDateTime.of(2026, 7, 7, 9, 0, 0));
    System.out.println("DEBUG isoNoSeconds OK -> " + r.value);
  }

  @Test
  @DisplayName("纯 mapper：yyyy-MM-ddTHH:mm:ss（有秒 ISO）应解析成功")
  void isoWithSeconds() throws Exception {
    Holder r = buildMapper().readValue("{\"value\":\"2026-07-07T09:00:30\"}", Holder.class);
    assertThat(r.value).isEqualTo(LocalDateTime.of(2026, 7, 7, 9, 0, 30));
    System.out.println("DEBUG isoWithSeconds OK -> " + r.value);
  }

  @Test
  @DisplayName("纯 mapper：yyyy-MM-dd HH:mm:ss（空格旧格式）应解析成功")
  void spaceSeparated() throws Exception {
    Holder r = buildMapper().readValue("{\"value\":\"2026-07-07 09:00:45\"}", Holder.class);
    assertThat(r.value).isEqualTo(LocalDateTime.of(2026, 7, 7, 9, 0, 45));
    System.out.println("DEBUG spaceSeparated OK -> " + r.value);
  }

  @Test
  @DisplayName("纯 mapper：空格无秒（向后兼容）应解析成功且秒为 0")
  void spaceNoSeconds() throws Exception {
    Holder r = buildMapper().readValue("{\"value\":\"2026-07-07 09:00\"}", Holder.class);
    assertThat(r.value).isEqualTo(LocalDateTime.of(2026, 7, 7, 9, 0, 0));
    System.out.println("DEBUG spaceNoSeconds OK -> " + r.value);
  }

  @Test
  @DisplayName("纯 mapper：null 值应解析为 null")
  void nullValue() throws Exception {
    Holder r = buildMapper().readValue("{\"value\":null}", Holder.class);
    assertThat(r.value).isNull();
    System.out.println("DEBUG nullValue OK -> null");
  }

  @Test
  @DisplayName("纯 mapper：空字符串应解析为 null")
  void emptyValue() throws Exception {
    Holder r = buildMapper().readValue("{\"value\":\"\"}", Holder.class);
    assertThat(r.value).isNull();
    System.out.println("DEBUG emptyValue OK -> null");
  }

  @Test
  @DisplayName("纯 mapper：非法字符串应抛出反序列化异常（JsonMappingException 包装 IOException）")
  void garbageThrows() {
    assertThatThrownBy(() ->
        buildMapper().readValue("{\"value\":\"not-a-date\"}", Holder.class))
        .isInstanceOf(JsonMappingException.class)
        .hasMessageContaining("not-a-date");
    System.out.println("DEBUG garbageThrows OK");
  }
}
