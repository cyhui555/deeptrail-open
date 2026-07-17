package com.ai.travel.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ai.travel.controller.ItineraryController;
import com.ai.travel.exception.GlobalExceptionHandler;
import com.ai.travel.security.UserContext;
import com.ai.travel.service.ItineraryTaskService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.time.LocalDateTime;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * 通过真实 {@link ItineraryController} + 容器级 {@link ObjectMapper} 端到端验证
 * {@link JacksonConfig} 宽容解析 LocalDateTime 行为。
 *
 * <p>覆盖 BUG-20260706-001 触发场景：前端 {@code <input type="time">} 产出 ISO 格式缺秒
 * {@code 2026-07-07T09:00}（历史严格解析会抛 DateTimeParseException）。
 *
 * <p>MockMvc 使用的 {@link ObjectMapper} 通过 {@code registerModule(JavaTimeModule)} 模拟容器自动装配；
 * 宽容反序列化器由 {@link JacksonConfig#lenientLocalDateTimeModule()} 提供，
 * 以类型级 {@code addDeserializer(LocalDateTime.class, ...)} 覆盖 JavaTimeModule 默认实现。
 */
@ExtendWith(MockitoExtension.class)
class JacksonConfigLenientTest {

  @Mock
  private ItineraryTaskService taskService;

  private MockMvc mockMvc;

  @BeforeEach
  void setUp() {
    // 构造容器级别 ObjectMapper：JavaTimeModule + JacksonConfig 的类型级覆盖
    ObjectMapper objectMapper = new ObjectMapper()
        .registerModule(new JavaTimeModule())
        .registerModule(new JacksonConfig().lenientLocalDateTimeModule());

    UserContext.setUserId(1L);
    mockMvc = MockMvcBuilders.standaloneSetup(new ItineraryController(taskService))
        .setControllerAdvice(new GlobalExceptionHandler())
        .setMessageConverters(new MappingJackson2HttpMessageConverter(objectMapper))
        .build();
  }

  @AfterEach
  void tearDown() {
    UserContext.clear();
  }

  /**
   * BUG-20260706-001 核心场景：前端 {@code <input type="time">} 产出 ISO 格式无秒应可解析。
   */
  @Test
  @DisplayName("BUG-20260706-001 核心场景：departureTime 用 yyyy-MM-ddTHH:mm 无秒格式应解析成功")
  void parseIsoWithoutSeconds_actualBugCase() throws Exception {
    when(taskService.submitGenerateTask(any())).thenReturn("task-bug-001");

    mockMvc.perform(post("/api/itineraries/generate")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"departureLocation":"北京","departureTime":"2026-07-07T09:00","destination":"西安","days":3,"peopleCount":2}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true))
        .andExpect(jsonPath("$.data.taskId").value("task-bug-001"));
  }

  @Test
  @DisplayName("departureTime 使用 yyyy-MM-ddTHH:mm:ss 标准格式（有秒）应解析成功")
  void parseIsoWithSeconds() throws Exception {
    when(taskService.submitGenerateTask(any())).thenReturn("task-with-sec");

    mockMvc.perform(post("/api/itineraries/generate")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"departureLocation":"北京","departureTime":"2026-07-07T09:00:30","destination":"西安","days":3,"peopleCount":2}
                """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true));
  }

  @Test
  @DisplayName("departureTime 使用 yyyy-MM-dd HH:mm:ss 空格格式（向后兼容）应解析成功")
  void parseSpaceSeparatedBackwardsCompat() throws Exception {
    when(taskService.submitGenerateTask(any())).thenReturn("task-compat");

    String body = mockMvc.perform(post("/api/itineraries/generate")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"departureLocation":"北京","departureTime":"2026-07-07 09:00:45","destination":"西安","days":3,"peopleCount":2}
                """))
        .andReturn().getResponse().getContentAsString();
    System.out.println("DEBUG_RESPONSE=" + body);
    org.junit.jupiter.api.Assertions.assertTrue(
        body.contains("true") && body.contains("task-compat"),
        "Expected success response with task-compat, got: " + body);
  }

  @Test
  @DisplayName("departureTime 使用非法日期字符串应返回业务错误（非 success）")
  void rejectGarbageDateValue() throws Exception {
    String body = mockMvc.perform(post("/api/itineraries/generate")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                {"departureLocation":"北京","departureTime":"not-a-date","destination":"西安","days":3,"peopleCount":2}
                """))
        .andReturn().getResponse().getContentAsString();
    System.out.println("DEBUG rejectGarbage body=" + body);
    org.junit.jupiter.api.Assertions.assertTrue(
        !body.contains("\"success\":true"),
        "垃圾日期字符串不应返回 success=true, got: " + body);
  }

  /** 验证纯 ObjectMapper 单元行为：缺秒时解析秒为 0。 */
  @Test
  @DisplayName("ObjectMapper 直接解析 LocalDateTime 缺秒应补零到 00 秒")
  void objectMapperDirectLenientParse() throws Exception {
    record Holder(LocalDateTime value) {}

    ObjectMapper objectMapper = new ObjectMapper()
        .registerModule(new JavaTimeModule())
        .registerModule(new JacksonConfig().lenientLocalDateTimeModule());

    Holder r = objectMapper.readValue("{\"value\":\"2026-07-07T09:00\"}", Holder.class);
    assertThat(r.value).isEqualTo(LocalDateTime.of(2026, 7, 7, 9, 0, 0));
  }
}
