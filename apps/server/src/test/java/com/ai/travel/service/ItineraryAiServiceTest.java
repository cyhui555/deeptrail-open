package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ai.travel.config.AppGeocodingProperties;
import com.ai.travel.dto.request.GenerateItineraryRequest;
import com.ai.travel.dto.request.OptimizeItineraryRequest;
import com.ai.travel.dto.request.XiaohongshuItineraryRequest;
import com.ai.travel.dto.response.DayPlan;
import com.ai.travel.dto.geocoding.GeoRequest;
import com.ai.travel.dto.geocoding.GeoResult;
import com.ai.travel.dto.response.ItineraryResponse;
import com.ai.travel.dto.response.MealItem;
import com.ai.travel.dto.response.OptimizeResponse;
import com.ai.travel.dto.response.PoiInfo;
import com.ai.travel.dto.response.ScheduleItem;
import com.ai.travel.entity.AiCallLog;
import com.ai.travel.entity.ItineraryRecord;
import com.ai.travel.enums.AiCallStatus;
import com.ai.travel.enums.TaskType;
import com.ai.travel.exception.AiResponseValidationException;
import com.ai.travel.exception.AiResponseValidationException.Reason;
import com.ai.travel.mapper.AiCallLogMapper;
import com.ai.travel.mapper.ItineraryRecordMapper;
import com.ai.travel.task.TaskExecutionContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.Answers;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.ChatClient.CallResponseSpec;
import org.springframework.ai.chat.client.ChatClient.ChatClientRequestSpec;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ItineraryAiServiceTest {

  private final ObjectMapper objectMapper = Jackson2ObjectMapperBuilder.json().build();

  @Mock
  private ChatClient.Builder chatClientBuilder;

  @Mock
  private ChatClient chatClient;

  @Mock
  private ChatClientRequestSpec requestSpec;

  @Mock
  private CallResponseSpec callResponseSpec;

  @Mock(answer = Answers.RETURNS_DEEP_STUBS)
  private ChatResponse chatResponse;

  @Mock
  private ItineraryRecordMapper itineraryRecordMapper;

  @Mock
  private AiCallLogMapper aiCallLogMapper;

  @Mock
  private XiaohongshuContentFetcher contentFetcher;

  @Mock
  private GeocodingService geocodingService;

  private final AppGeocodingProperties geocodingProperties = new AppGeocodingProperties();

  private ItineraryAiService itineraryAiService;
  private ItineraryPromptFactory promptFactory;
  private AiResponseParser responseParser;
  private PoiCoordinateEnricher coordinateEnricher;
  private TransportSegmentEnricher transportEnricher;

  @BeforeEach
  void setUp() throws Exception {
    // 默认启用 geocoding，覆盖所有 enrich 路径
    geocodingProperties.setEnabled(true);
    geocodingProperties.setProvider("nominatim");

    promptFactory = new ItineraryPromptFactory(
        promptResource("generate prompt"),
        promptResource("optimize prompt"),
        promptResource("xiaohongshu prompt"));
    responseParser = new AiResponseParser(objectMapper);
    coordinateEnricher = new PoiCoordinateEnricher(geocodingService, geocodingProperties);
    transportEnricher = new TransportSegmentEnricher();
    itineraryAiService = new ItineraryAiService(
        chatClientBuilder,
        promptResource("generate prompt"),
        promptResource("optimize prompt"),
        promptResource("xiaohongshu prompt"),
        objectMapper, responseParser,
        itineraryRecordMapper, aiCallLogMapper, contentFetcher,
        geocodingService, geocodingProperties);

    when(chatClientBuilder.build()).thenReturn(chatClient);
    when(chatClient.prompt(any(Prompt.class))).thenReturn(requestSpec);
    when(requestSpec.call()).thenReturn(callResponseSpec);
    when(callResponseSpec.chatResponse()).thenReturn(chatResponse);
    lenient().when(itineraryRecordMapper.insert(any(ItineraryRecord.class))).thenReturn(1);
    lenient().when(aiCallLogMapper.insert(any(AiCallLog.class))).thenReturn(1);
  }

  @Test
  void generateParsesResultAndPersistsRecord() {
    when(chatResponse.getResult().getOutput().getText()).thenReturn("""
        {"summary":"great trip","days":[{"day":1,"schedule":[]}],"tips":["take it easy"],"estimatedBudget":"3000"}
        """);

    GenerateItineraryRequest request = newGenerateRequest();
    ItineraryResponse response = itineraryAiService.generate(request, "task-1", null);

    assertThat(response.getSummary()).isEqualTo("great trip");
    ArgumentCaptor<ItineraryRecord> recordCaptor = ArgumentCaptor.forClass(ItineraryRecord.class);
    verify(itineraryRecordMapper).insert(recordCaptor.capture());
    assertThat(recordCaptor.getValue().getDepartureLocation()).isEqualTo("Beijing");
    assertThat(recordCaptor.getValue().getResultJson()).contains("great trip");

    ArgumentCaptor<AiCallLog> logCaptor = ArgumentCaptor.forClass(AiCallLog.class);
    verify(aiCallLogMapper).insert(logCaptor.capture());
    assertThat(logCaptor.getValue().getCallType()).isEqualTo(TaskType.GENERATE);
    assertThat(logCaptor.getValue().getResponseStatus()).isEqualTo(AiCallStatus.SUCCESS);
    assertThat(logCaptor.getValue().getDurationMs()).isNotNull();
    assertThat(logCaptor.getValue().getDurationMs()).isGreaterThanOrEqualTo(0);
  }

  @Test
  void generateRecordsTokenUsage() {
    when(chatResponse.getResult().getOutput().getText()).thenReturn("""
        {"summary":"great trip","days":[{"day":1,"schedule":[]}],"tips":[],"estimatedBudget":"3000"}
        """);
    when(chatResponse.getMetadata().getUsage().getTotalTokens()).thenReturn(150);

    itineraryAiService.generate(newGenerateRequest(), "task-1", null);

    ArgumentCaptor<AiCallLog> logCaptor = ArgumentCaptor.forClass(AiCallLog.class);
    verify(aiCallLogMapper).insert(logCaptor.capture());
    assertThat(logCaptor.getValue().getTokenUsed()).isEqualTo(150);
  }

  @Test
  void generateFallsBackWhenResponseIsInvalidJson() {
    when(chatResponse.getResult().getOutput().getText()).thenReturn("not-json");

    assertThatThrownBy(() -> itineraryAiService.generate(newGenerateRequest(), "task-1", null))
        .isInstanceOf(AiResponseValidationException.class)
        .hasMessageNotContaining("not-json")
        .extracting("reason")
        .isEqualTo(Reason.MALFORMED_JSON);
  }

  @Test
  void generateContinuesWhenRecordPersistenceFails() {
    when(chatResponse.getResult().getOutput().getText()).thenReturn("""
        {"summary":"great trip","days":[{"day":1,"schedule":[]}],"tips":[],"estimatedBudget":"3000"}
        """);
    when(itineraryRecordMapper.insert(any(ItineraryRecord.class)))
        .thenThrow(new RuntimeException("db unavailable"));

    ItineraryResponse response = itineraryAiService.generate(newGenerateRequest(), "task-1", null);

    assertThat(response.getSummary()).isEqualTo("great trip");
    verify(aiCallLogMapper).insert(any(AiCallLog.class));
  }

  @Test
  void generateContinuesWhenAiLogPersistenceFails() {
    when(chatResponse.getResult().getOutput().getText()).thenReturn("""
        {"summary":"great trip","days":[{"day":1,"schedule":[]}],"tips":[],"estimatedBudget":"3000"}
        """);
    when(aiCallLogMapper.insert(any(AiCallLog.class))).thenThrow(new RuntimeException("db unavailable"));

    ItineraryResponse response = itineraryAiService.generate(newGenerateRequest(), "task-1", null);

    assertThat(response.getSummary()).isEqualTo("great trip");
    verify(itineraryRecordMapper).insert(any(ItineraryRecord.class));
  }

  @Test
  void generateThrowsWhenAiCallFails() {
    when(requestSpec.call()).thenThrow(new RuntimeException("boom"));

    assertThatThrownBy(() -> itineraryAiService.generate(newGenerateRequest(), "task-1", null))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("AI service call failed");
  }

  @Test
  void optimizeParsesEmbeddedJson() {
    when(chatResponse.getResult().getOutput().getText()).thenReturn(
        "prefix {\"summary\":\"better\",\"days\":[{\"day\":1,\"schedule\":[]}],"
            + "\"changes\":[],\"reasoning\":\"ok\"} suffix");

    OptimizeResponse response = itineraryAiService.optimize(newOptimizeRequest(), "task-1", null);

    assertThat(response.getSummary()).isEqualTo("better");
    assertThat(response.getReasoning()).isEqualTo("ok");
  }

  @Test
  void optimizeFallsBackWhenResponseIsBlank() {
    when(chatResponse.getResult().getOutput().getText()).thenReturn("   ");

    assertThatThrownBy(() -> itineraryAiService.optimize(newOptimizeRequest(), "task-1", null))
        .isInstanceOf(AiResponseValidationException.class)
        .extracting("reason")
        .isEqualTo(Reason.EMPTY_RESPONSE);
  }

  @Test
  void optimizeThrowsWhenAiCallFails() {
    when(requestSpec.call()).thenThrow(new RuntimeException("boom"));

    assertThatThrownBy(() -> itineraryAiService.optimize(newOptimizeRequest(), "task-1", null))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("AI service call failed");
  }

  @Test
  void optimizeRecordsDuration() {
    when(chatResponse.getResult().getOutput().getText()).thenReturn(
        "{\"summary\":\"better\",\"days\":[{\"day\":1,\"schedule\":[]}],"
            + "\"changes\":[],\"reasoning\":\"ok\"}");

    itineraryAiService.optimize(newOptimizeRequest(), "task-1", null);

    ArgumentCaptor<AiCallLog> logCaptor = ArgumentCaptor.forClass(AiCallLog.class);
    verify(aiCallLogMapper).insert(logCaptor.capture());
    assertThat(logCaptor.getValue().getDurationMs()).isNotNull();
    assertThat(logCaptor.getValue().getDurationMs()).isGreaterThanOrEqualTo(0);
  }

  @Test
  void executeOptimizeDefersSuccessAuditUntilTaskCommit() {
    when(chatResponse.getResult().getOutput().getText()).thenReturn(
        "{\"summary\":\"better\",\"days\":[{\"day\":1,\"schedule\":[]}],"
            + "\"changes\":[],\"reasoning\":\"ok\"}");

    ItineraryAiService.TaskExecutionResult<OptimizeResponse> execution =
        itineraryAiService.executeOptimize(
            newOptimizeRequest(),
            "task-deferred",
            null,
            TaskExecutionContext.unbounded("task-deferred"));

    verify(aiCallLogMapper, never()).insert(any(AiCallLog.class));

    itineraryAiService.persistSuccess(execution);

    verify(aiCallLogMapper).insert(any(AiCallLog.class));
  }

  @Test
  void persistFailureWritesSafeFailedAuditWithoutRawResponse() {
    itineraryAiService.persistFailure(
        TaskType.GENERATE,
        new AiResponseValidationException(Reason.MALFORMED_JSON),
        42,
        "task-invalid-json",
        null);

    ArgumentCaptor<AiCallLog> logCaptor = ArgumentCaptor.forClass(AiCallLog.class);
    verify(aiCallLogMapper).insert(logCaptor.capture());
    AiCallLog logEntry = logCaptor.getValue();
    assertThat(logEntry.getResponseStatus()).isEqualTo(AiCallStatus.FAILED);
    assertThat(logEntry.getRequestSummary()).isEqualTo(
        "invalid_ai_response:malformed_json");
    assertThat(logEntry.getRequestSummary()).doesNotContain("invalid-json");
    assertThat(logEntry.getDurationMs()).isEqualTo(42);
  }

  @Test
  void generateFromXiaohongshuUsesContentFetcher() {
    when(contentFetcher.fetchContent("https://example.com/note")).thenReturn("note content");
    when(chatResponse.getResult().getOutput().getText()).thenReturn("""
        {"summary":"xiaohongshu trip","days":[{"day":1,"schedule":[]}],"tips":[],"estimatedBudget":"1000"}
        """);

    XiaohongshuItineraryRequest request = new XiaohongshuItineraryRequest();
    request.setUrl("https://example.com/note");

    XiaohongshuResult result = itineraryAiService.generateFromXiaohongshu(request, "task-1", null);

    assertThat(result.response().getSummary()).isEqualTo("xiaohongshu trip");
    assertThat(result.parsedContent()).isEqualTo("note content");
    verify(contentFetcher).fetchContent("https://example.com/note");
    verify(aiCallLogMapper).insert(any(AiCallLog.class));
  }

  @Test
  void generateFromXiaohongshuUsesDefaultExtraInstructionsForEmptyInput() {
    when(contentFetcher.fetchContent("https://example.com/note")).thenReturn("note content");
    when(chatResponse.getResult().getOutput().getText()).thenReturn("""
        {"summary":"xiaohongshu trip","days":[{"day":1,"schedule":[]}],"tips":[],"estimatedBudget":"1000"}
        """);

    XiaohongshuItineraryRequest request = new XiaohongshuItineraryRequest();
    request.setUrl("https://example.com/note");

    XiaohongshuResult result = itineraryAiService.generateFromXiaohongshu(request, "task-1", null);

    assertThat(result.response().getSummary()).isEqualTo("xiaohongshu trip");
  }

  @Test
  void generateFromXiaohongshuThrowsWhenAiCallFails() {
    when(contentFetcher.fetchContent("https://example.com/note")).thenReturn("note content");
    when(requestSpec.call()).thenThrow(new RuntimeException("boom"));

    XiaohongshuItineraryRequest request = new XiaohongshuItineraryRequest();
    request.setUrl("https://example.com/note");

    assertThatThrownBy(() -> itineraryAiService.generateFromXiaohongshu(request, "task-1", null))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("AI service call failed");
  }

  @Test
  void generateFromXiaohongshuUsesNoteContentDirectly() {
    when(chatResponse.getResult().getOutput().getText()).thenReturn("""
        {"summary":"note content trip","days":[{"day":1,"schedule":[]}],"tips":[],"estimatedBudget":"1500"}
        """);

    XiaohongshuItineraryRequest request = new XiaohongshuItineraryRequest();
    request.setNoteContent("周末青岛两日游，打卡啤酒城");

    XiaohongshuResult result = itineraryAiService.generateFromXiaohongshu(request, "task-1", null);

    assertThat(result.response().getSummary()).isEqualTo("note content trip");
    assertThat(result.parsedContent()).isEqualTo("周末青岛两日游，打卡啤酒城");
    verify(contentFetcher, org.mockito.Mockito.never()).fetchContent(any());
    verify(aiCallLogMapper).insert(any(AiCallLog.class));
  }

  @Test
  void generateFromXiaohongshuPrefersNoteContentOverUrl() {
    when(chatResponse.getResult().getOutput().getText()).thenReturn("""
        {"summary":"prefer note content","days":[{"day":1,"schedule":[]}],"tips":[],"estimatedBudget":"2000"}
        """);

    XiaohongshuItineraryRequest request = new XiaohongshuItineraryRequest();
    request.setUrl("https://example.com/note");
    request.setNoteContent("直接粘贴的笔记内容");

    XiaohongshuResult result = itineraryAiService.generateFromXiaohongshu(request, "task-1", null);

    assertThat(result.response().getSummary()).isEqualTo("prefer note content");
    verify(contentFetcher, org.mockito.Mockito.never()).fetchContent(any());
  }

  @Test
  void generateFromXiaohongshuThrowsWhenNoInputProvided() {
    XiaohongshuItineraryRequest request = new XiaohongshuItineraryRequest();

    assertThatThrownBy(() -> itineraryAiService.generateFromXiaohongshu(request, "task-1", null))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("请提供小红书笔记链接或直接粘贴笔记内容");
  }

  @Test
  void generateFromXiaohongshuFallsBackToUrlWhenNoteContentBlank() {
    when(contentFetcher.fetchContent("https://example.com/note")).thenReturn("fetched note");
    when(chatResponse.getResult().getOutput().getText()).thenReturn("""
        {"summary":"fallback url trip","days":[{"day":1,"schedule":[]}],"tips":[],"estimatedBudget":"800"}
        """);

    XiaohongshuItineraryRequest request = new XiaohongshuItineraryRequest();
    request.setUrl("https://example.com/note");
    request.setNoteContent("");

    XiaohongshuResult result = itineraryAiService.generateFromXiaohongshu(request, "task-1", null);

    assertThat(result.response().getSummary()).isEqualTo("fallback url trip");
    verify(contentFetcher).fetchContent("https://example.com/note");
  }

  @Test
  void buildGeneratePromptUsesDefaultsForOptionalFields() {
    GenerateItineraryRequest request = new GenerateItineraryRequest();
    request.setDepartureLocation("Beijing");
    request.setDepartureTime(LocalDateTime.of(2026, 7, 1, 9, 0));
    request.setDestination("Xi'an");
    request.setDays(3);
    request.setPeopleCount(2);

    Object prompt = promptFactory.buildGenerate(request);
    assertThat(prompt).isNotNull();
  }

  @Test
  void buildOptimizePromptUsesDefaultConstraintsWhenBlank() {
    OptimizeItineraryRequest request = new OptimizeItineraryRequest();
    request.setCurrentItinerary("day 1 itinerary");
    request.setOptimizationGoal("reduce budget");

    Object prompt = promptFactory.buildOptimize(request);
    assertThat(prompt).isNotNull();
  }

  @Test
  void buildExtraInstructionsReturnsDefaultWhenNoExtrasProvided() {
    XiaohongshuItineraryRequest request = new XiaohongshuItineraryRequest();
    request.setUrl("https://example.com/note");

    assertThat(promptFactory.buildExtraInstructions(request))
        .isEqualTo("请根据笔记内容自行推断出行参数。");
  }

  @Test
  void buildExtraInstructionsIncludesAllProvidedFields() {
    XiaohongshuItineraryRequest request = new XiaohongshuItineraryRequest();
    request.setUrl("https://example.com/note");
    request.setDays(3);
    request.setPeopleCount(2);
    request.setPreferences(List.of("culture", "food"));
    request.setSpecialRequirements("slow pace");

    assertThat(promptFactory.buildExtraInstructions(request))
        .isEqualTo("出行天数：3天。出行人数：2人。偏好：culture、food。特殊要求：slow pace。");
  }

  @Test
  void parseItineraryResponseFallsBackWhenBlank() {
    assertThatThrownBy(() -> responseParser.parseItinerary("   ", AiCallStatus.SUCCESS))
        .isInstanceOf(AiResponseValidationException.class)
        .extracting("reason")
        .isEqualTo(Reason.EMPTY_RESPONSE);
  }

  @Test
  void parseItineraryResponseUsesExtractedJsonWhenWrapped() {
    ItineraryResponse response = responseParser.parseItinerary(
        "prefix {\"summary\":\"wrapped\",\"days\":[{\"day\":1,\"schedule\":[]}],"
            + "\"tips\":[],\"estimatedBudget\":\"1000\"} suffix",
        AiCallStatus.SUCCESS);

    assertThat(response.getSummary()).isEqualTo("wrapped");
  }

  @Test
  void parseItineraryResponseFallsBackWhenEmbeddedJsonIsMalformed() {
    assertThatThrownBy(() -> responseParser.parseItinerary(
        "prefix {invalid-json} suffix", AiCallStatus.FAILED))
        .isInstanceOf(AiResponseValidationException.class)
        .hasMessageNotContaining("invalid-json")
        .extracting("reason")
        .isEqualTo(Reason.MALFORMED_JSON);
  }

  @Test
  void parseOptimizeResponseFallsBackWhenBlank() {
    assertThatThrownBy(() -> responseParser.parseOptimize("  ", AiCallStatus.SUCCESS))
        .isInstanceOf(AiResponseValidationException.class)
        .extracting("reason")
        .isEqualTo(Reason.EMPTY_RESPONSE);
  }

  @Test
  void parseOptimizeResponseUsesExtractedJsonWhenWrapped() {
    OptimizeResponse response = responseParser.parseOptimize(
        "prefix {\"summary\":\"better\",\"days\":[{\"day\":1,\"schedule\":[]}],"
            + "\"changes\":[],\"reasoning\":\"ok\"} suffix",
        AiCallStatus.SUCCESS);

    assertThat(response.getSummary()).isEqualTo("better");
    assertThat(response.getReasoning()).isEqualTo("ok");
  }

  @Test
  void parseOptimizeResponseFallsBackWhenEmbeddedJsonIsMalformed() {
    assertThatThrownBy(() -> responseParser.parseOptimize(
        "prefix {invalid-json} suffix", AiCallStatus.FAILED))
        .isInstanceOf(AiResponseValidationException.class)
        .hasMessageNotContaining("invalid-json")
        .extracting("reason")
        .isEqualTo(Reason.MALFORMED_JSON);
  }

  @Test
  void enrichTransportSegments_fillsMissingSegments() {
    // GIVEN: 两个 POI 都有坐标但未提供 transport_segments
    ItineraryResponse response = new ItineraryResponse();
    DayPlan day = new DayPlan();

    ScheduleItem item1 = new ScheduleItem();
    PoiInfo poi1 = new PoiInfo();
    poi1.setName("POI-A");
    poi1.setLatitude(30.67);
    poi1.setLongitude(104.06);
    item1.setPoi(poi1);

    ScheduleItem item2 = new ScheduleItem();
    PoiInfo poi2 = new PoiInfo();
    poi2.setName("POI-B");
    poi2.setLatitude(30.68);
    poi2.setLongitude(104.07);
    item2.setPoi(poi2);

    // item3 是最后一个，应有 transportSegments = null
    ScheduleItem item3 = new ScheduleItem();
    PoiInfo poi3 = new PoiInfo();
    poi3.setName("POI-C");
    poi3.setLatitude(30.69);
    poi3.setLongitude(104.08);
    item3.setPoi(poi3);

    day.setSchedule(List.of(item1, item2, item3));
    response.setDays(List.of(day));

    // WHEN
    transportEnricher.enrich(response);

    // THEN: item1/item2 应该有估算的交通段；item3 是最后一个应该为 null
    assertThat(item1.getTransportSegments()).isNotNull().hasSize(1);
    assertThat(item1.getTransportSegments().get(0).getMode()).isIn("WALK", "DRIVE");
    assertThat(item1.getTransportSegments().get(0).getDurationMin()).isGreaterThan(0);

    assertThat(item2.getTransportSegments()).isNotNull().hasSize(1);

    // 最后一个 POI 不应有 transport segment
    assertThat(item3.getTransportSegments()).isNull();
  }

  @Test
  void enrichTransportSegments_preservesAiOutput() {
    // GIVEN: AI 已经输出了 transport_segments
    ItineraryResponse response = new ItineraryResponse();
    DayPlan day = new DayPlan();

    ScheduleItem item1 = new ScheduleItem();
    PoiInfo poi1 = new PoiInfo();
    poi1.setName("X");
    poi1.setLatitude(30.67);
    poi1.setLongitude(104.06);
    item1.setPoi(poi1);
    ScheduleItem.TransportSegment seg = new ScheduleItem.TransportSegment();
    seg.setMode("SUBWAY");
    seg.setDurationMin(25);
    seg.setDescription("地铁25分钟");
    item1.setTransportSegments(List.of(seg));

    ScheduleItem item2 = new ScheduleItem();
    PoiInfo poi2 = new PoiInfo();
    poi2.setName("Y");
    poi2.setLatitude(30.68);
    poi2.setLongitude(104.07);
    item2.setPoi(poi2);

    day.setSchedule(List.of(item1, item2));
    response.setDays(List.of(day));

    // WHEN
    transportEnricher.enrich(response);

    // THEN: item1 的 AI 输出应该保留（不被覆盖）
    assertThat(item1.getTransportSegments().get(0).getMode()).isEqualTo("SUBWAY");
    assertThat(item1.getTransportSegments().get(0).getDurationMin()).isEqualTo(25);
  }

  @Test
  void enrichTransportSegments_skipsWhenCoordinatesMissing() {
    // GIVEN: POI 没有坐标
    ItineraryResponse response = new ItineraryResponse();
    DayPlan day = new DayPlan();

    ScheduleItem item1 = new ScheduleItem();
    PoiInfo poi1 = new PoiInfo();
    poi1.setName("NoCoord");
    item1.setPoi(poi1); // lat/lng 都为 null

    ScheduleItem item2 = new ScheduleItem();
    PoiInfo poi2 = new PoiInfo();
    poi2.setName("HasCoord");
    poi2.setLatitude(30.68);
    poi2.setLongitude(104.07);
    item2.setPoi(poi2);

    day.setSchedule(List.of(item1, item2));
    response.setDays(List.of(day));

    // WHEN
    transportEnricher.enrich(response);

    // THEN: 无法计算交通段，不应填充
    assertThat(item1.getTransportSegments()).isNull();
  }

  @Test
  void jackson_deserializes_snakeCaseTransportSegments() throws Exception {
    // 模拟 AI prompt 实际输出的 snake_case transport_segments
    String aiJson = """
        {
          "summary": "测试行程",
          "days": [{
            "day": 1,
            "schedule": [{
              "period": "上午",
              "poi": {"name": "P1", "latitude": 30.67, "longitude": 104.06},
              "transport_segments": [{"mode":"WALK","durationMin":8,"description":"步行约8分钟"}]
            }, {
              "period": "下午",
              "poi": {"name": "P2", "latitude": 30.68, "longitude": 104.07}
            }]
          }]
        }
        """;

    ItineraryResponse resp = objectMapper.readValue(aiJson, ItineraryResponse.class);

    ScheduleItem first = resp.getDays().get(0).getSchedule().get(0);
    assertThat(first.getTransportSegments())
        .as("snake_case transport_segments 必须正确反序列化为 transportSegments 字段")
        .isNotNull()
        .hasSize(1);
    assertThat(first.getTransportSegments().get(0).getMode()).isEqualTo("WALK");
    assertThat(first.getTransportSegments().get(0).getDurationMin()).isEqualTo(8);
    assertThat(first.getTransportSegments().get(0).getDescription()).isEqualTo("步行约8分钟");
  }

  @Test
  void jackson_serializes_transportSegments_asSnakeCase() throws Exception {
    // 验证序列化回 JSON 时使用 snake_case（保持一致）
    ItineraryResponse response = new ItineraryResponse();
    DayPlan day = new DayPlan();
    ScheduleItem item = new ScheduleItem();
    PoiInfo poi = new PoiInfo();
    poi.setName("P");
    poi.setLatitude(30.0);
    poi.setLongitude(104.0);
    item.setPoi(poi);
    ScheduleItem.TransportSegment seg = new ScheduleItem.TransportSegment();
    seg.setMode("DRIVE");
    seg.setDurationMin(15);
    seg.setDescription("车程15分钟");
    item.setTransportSegments(List.of(seg));
    day.setSchedule(List.of(item));
    response.setDays(List.of(day));

    String json = objectMapper.writeValueAsString(response);

    assertThat(json).contains("\"transport_segments\"");
    assertThat(json).doesNotContain("\"transportSegments\"");
  }

  // ==================== Geocoding 强制反查 (v0.7.0) ====================

  @Test
  void enrichPoiCoordinates_overridesAiFakeCoordinate_withGeocodedResult() {
    // GIVEN: AI 返回的假坐标（不在目的地范围内）但非 (0,0)
    GeoResult geocoded = GeoResult.builder()
        .latitude(36.08).longitude(120.35).level("兴趣点").provider("gaode")
        .province("山东省").city("青岛市").district("市南区")
        .destinationSatisfied(true).build();
    // destination 为青岛，同城校验会接受
    when(geocodingService.geocode(any(GeoRequest.class))).thenReturn(geocoded);

    ItineraryResponse response = new ItineraryResponse();
    DayPlan day = new DayPlan();
    ScheduleItem item = new ScheduleItem();
    PoiInfo poi = new PoiInfo();
    poi.setName("大学路");
    poi.setAddress("市南区大学路");
    // AI 输出了"看似有效但错误"的坐标 (99.9, 88.8, 明显不在中国)
    poi.setLatitude(99.9);
    poi.setLongitude(88.8);
    item.setPoi(poi);
    day.setSchedule(List.of(item));
    response.setDays(List.of(day));

    // WHEN: v0.7.0 强制反查会调用 geocode
    coordinateEnricher.enrich(response, "青岛行程", "青岛");

    // THEN: 坐标被高德结果覆盖（即使 AI 输出了"有效"坐标）
    assertThat(poi.getLatitude()).isEqualTo(36.08);
    assertThat(poi.getLongitude()).isEqualTo(120.35);
    verify(geocodingService, times(1)).geocode(any(GeoRequest.class));
  }

  @Test
  void enrichPoiCoordinates_forcesGeocode_evenWhenAiOutputsValidCoordinate() {
    // GIVEN: AI 偶然也输出了"真实"坐标（仍强制反查）
    GeoResult geocoded = GeoResult.builder()
        .latitude(36.081).longitude(120.351).level("兴趣点").provider("gaode")
        .province("山东省").city("青岛市").district("市南区")
        .destinationSatisfied(true).build();
    when(geocodingService.geocode(any(GeoRequest.class))).thenReturn(geocoded);

    ItineraryResponse response = new ItineraryResponse();
    DayPlan day = new DayPlan();
    ScheduleItem item = new ScheduleItem();
    PoiInfo poi = new PoiInfo();
    poi.setName("小鱼山");
    // AI 给出了青岛的正确坐标（但后端仍强制反查以统一数据源）
    poi.setLatitude(36.06);
    poi.setLongitude(120.33);
    item.setPoi(poi);
    day.setSchedule(List.of(item));
    response.setDays(List.of(day));

    coordinateEnricher.enrich(response, "青岛行程", "青岛");

    // THEN: 被高德最新结果覆盖（强制,不沿用 AI 原值）
    assertThat(poi.getLatitude()).isEqualTo(36.081);
    assertThat(poi.getLongitude()).isEqualTo(120.351);
  }

  @Test
  void enrichPoiCoordinates_fillsAccommodationAndMeals() {
    // GIVEN: schedule + meals + accommodation 三者都强制反查
    GeoResult qingdao = GeoResult.builder()
        .latitude(36.08).longitude(120.35).level("兴趣点").provider("gaode")
        .province("山东省").city("青岛市").district("市南区")
        .destinationSatisfied(true).build();
    when(geocodingService.geocode(any(GeoRequest.class))).thenReturn(qingdao);

    ItineraryResponse response = new ItineraryResponse();
    DayPlan day = new DayPlan();

    ScheduleItem item = new ScheduleItem();
    PoiInfo poiSchedule = new PoiInfo();
    poiSchedule.setName("大学路");
    item.setPoi(poiSchedule);

    MealItem meal = new MealItem();
    PoiInfo poiMeal = new PoiInfo();
    poiMeal.setName("船歌鱼水饺");
    meal.setPoi(poiMeal);

    PoiInfo poiAccommodation = new PoiInfo();
    poiAccommodation.setName("青岛海景花园大酒店");

    day.setSchedule(List.of(item));
    day.setMeals(List.of(meal));
    day.setAccommodation(poiAccommodation);
    response.setDays(List.of(day));

    coordinateEnricher.enrich(response, "青岛行程", "青岛");

    // THEN: 三者都被反查覆盖
    assertThat(poiSchedule.getLatitude()).isEqualTo(36.08);
    assertThat(poiMeal.getLatitude()).isEqualTo(36.08);
    assertThat(poiAccommodation.getLatitude()).isEqualTo(36.08);
    verify(geocodingService, times(3)).geocode(any(GeoRequest.class));
  }

  @Test
  void enrichPoiCoordinates_skipsGeocode_whenPoiNameIsBlank() {
    // GIVEN: POI 只有坐标没有名称（极端脏数据）
    ItineraryResponse response = new ItineraryResponse();
    DayPlan day = new DayPlan();
    ScheduleItem item = new ScheduleItem();
    PoiInfo poi = new PoiInfo();
    // name 为空
    poi.setLatitude(36.08);
    poi.setLongitude(120.35);
    item.setPoi(poi);
    day.setSchedule(List.of(item));
    response.setDays(List.of(day));

    coordinateEnricher.enrich(response, "青岛行程", "青岛");

    // THEN: geocoding 没被调用（因为 poi.getName() 为 blank）
    verify(geocodingService, times(0)).geocode(any(GeoRequest.class));
  }

  @Test
  void enrichPoiCoordinates_keepsAiOutput_whenGeocodingFails() {
    // GIVEN: 高德全部失败
    when(geocodingService.geocode(any(GeoRequest.class))).thenReturn(null);

    ItineraryResponse response = new ItineraryResponse();
    DayPlan day = new DayPlan();
    ScheduleItem item = new ScheduleItem();
    PoiInfo poi = new PoiInfo();
    poi.setName("大学路");
    poi.setAddress("市南区大学路");
    poi.setLatitude(36.06); // AI 原输出
    poi.setLongitude(120.33);
    item.setPoi(poi);
    day.setSchedule(List.of(item));
    response.setDays(List.of(day));

    coordinateEnricher.enrich(response, "青岛行程", "青岛");

    // THEN: 保留 AI 原输出,坐标不被覆盖
    assertThat(poi.getLatitude()).isEqualTo(36.06);
    assertThat(poi.getLongitude()).isEqualTo(120.33);
  }

  private static GenerateItineraryRequest newGenerateRequest() {
    GenerateItineraryRequest request = new GenerateItineraryRequest();
    request.setDepartureLocation("Beijing");
    request.setDepartureTime(LocalDateTime.of(2026, 7, 1, 9, 0));
    request.setDestination("Xi'an");
    request.setDays(3);
    request.setPeopleCount(2);
    request.setBudget("3000");
    request.setPreferences(List.of("culture", "food"));
    request.setSpecialRequirements("slow pace");
    return request;
  }

  private static OptimizeItineraryRequest newOptimizeRequest() {
    OptimizeItineraryRequest request = new OptimizeItineraryRequest();
    request.setCurrentItinerary("day 1 itinerary");
    request.setOptimizationGoal("reduce budget");
    request.setConstraints("no late nights");
    return request;
  }

  private static ByteArrayResource promptResource(String text) {
    return new ByteArrayResource(text.getBytes(StandardCharsets.UTF_8));
  }

  // ==================== callWithRetry 重试分支 ====================

  /**
   * 覆盖 {@link ItineraryAiService#callWithRetry} 的 IOException 重试路径：
   * 首次调用抛 RuntimeException(IOException) → 重试 → 第二次成功。
   */
  @Test
  void callWithRetry_retriesOnceOnIOException_andSucceeds() {
    // 首次抛 RuntimeException(IOException)，第二次返回 chatResponse
    when(chatResponse.getResult().getOutput().getText()).thenReturn(
        "{\"summary\":\"ok\",\"days\":[{\"day\":1,\"schedule\":[]}]}");
    when(callResponseSpec.chatResponse())
        .thenThrow(new RuntimeException(new java.io.IOException("Connection reset")))
        .thenReturn(chatResponse);
    when(requestSpec.call()).thenReturn(callResponseSpec);
    when(chatClient.prompt(any(Prompt.class))).thenReturn(requestSpec);
    when(chatClientBuilder.build()).thenReturn(chatClient);

    GenerateItineraryRequest req = newGenerateRequest();
    ItineraryResponse result = itineraryAiService.generate(req, "task-1", 1L);

    assertThat(result).isNotNull();
    // 验证 callResponseSpec.chatResponse() 被调用 2 次（首次失败 + 重试成功）
    verify(callResponseSpec, times(2)).chatResponse();
  }

  /**
   * 覆盖 {@link ItineraryAiService#callWithRetry} 的非 IO 异常快速失败路径：
   * 首次调用抛 RuntimeException(非 IOException) → 不重试，直接抛出。
   */
  @Test
  void callWithRetry_doesNotRetryOnNonIOException() {
    when(callResponseSpec.chatResponse())
        .thenThrow(new RuntimeException("Bad request: 400"));
    when(requestSpec.call()).thenReturn(callResponseSpec);
    when(chatClient.prompt(any(Prompt.class))).thenReturn(requestSpec);
    when(chatClientBuilder.build()).thenReturn(chatClient);

    assertThatThrownBy(() -> itineraryAiService.generate(newGenerateRequest(), "task-2", 1L))
        .isInstanceOf(RuntimeException.class);
    // 仅调用 1 次，不重试
    verify(callResponseSpec, times(1)).chatResponse();
  }

  /**
   * 覆盖 {@link ItineraryAiService#callWithRetry} 的重试也失败路径：
   * 两次都抛 RuntimeException(IOException) → 抛出 RuntimeException("AI service call failed after retry")。
   */
  @Test
  void callWithRetry_throwsAfterRetryFails() {
    when(callResponseSpec.chatResponse())
        .thenThrow(new RuntimeException(new java.io.IOException("Connection reset")));
    when(requestSpec.call()).thenReturn(callResponseSpec);
    when(chatClient.prompt(any(Prompt.class))).thenReturn(requestSpec);
    when(chatClientBuilder.build()).thenReturn(chatClient);

    assertThatThrownBy(() -> itineraryAiService.generate(newGenerateRequest(), "task-3", 1L))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("AI service call failed after retry");
    verify(callResponseSpec, times(2)).chatResponse();
  }

  // ===== generate 结果 days 为空时 CollUtil.isEmpty 分支 =====

  @Test
  void generate_emptyDaysResult_returnsResponseWithEmptyDays() {
    when(chatResponse.getResult().getOutput().getText()).thenReturn(
        "{\"summary\":\"empty days trip\",\"days\":[],\"tips\":[\"take it easy\"],\"estimatedBudget\":\"500\"}");

    assertThatThrownBy(() -> itineraryAiService.generate(
        newGenerateRequest(), "task-empty", null))
        .isInstanceOf(AiResponseValidationException.class)
        .extracting("reason")
        .isEqualTo(Reason.MISSING_DAYS);
  }

  // ===== optimize parseOptimizeResponse 返回空 optimize result（optimizedItinerary 无有效 days） =====

  @Test
  void optimize_innerCompensationWithNoValidDays_returnsOriginalOptimize() {
    // optimizedItinerary 字段含有字符串但不是有效 JSON（inner parse 失败，异常被 catch 跳过）
    // 注意: changes 字段需符合 ChangeItem 结构（对象数组），否则顶层 JSON 反序列化失败走 fallback
    when(chatResponse.getResult().getOutput().getText()).thenReturn(
        "{\"optimizedItinerary\":\"not a json string\","
        + "\"changes\":[{\"item\":\"栈桥\",\"from\":\"day1\",\"to\":\"day2\",\"reason\":\"调整顺序\"}],"
        + "\"reasoning\":\"try best\"}");

    assertThatThrownBy(() -> itineraryAiService.optimize(
        newOptimizeRequest(), "task-inner", null))
        .isInstanceOf(AiResponseValidationException.class)
        .extracting("reason")
        .isEqualTo(Reason.MISSING_DAYS);
  }

  @Test
  void optimize_innerCompensationWithBlankOptimizeItinerary_skipsInnerParse() {
    // optimizedItinerary 为空白 → 跳过 inner compensation（StrUtil.isNotBlank 分支）
    when(chatResponse.getResult().getOutput().getText()).thenReturn(
        "{\"optimizedItinerary\":\"\","
        + "\"changes\":[{\"item\":\"栈桥\",\"from\":\"day1\",\"to\":\"day2\",\"reason\":\"调整顺序\"}],"
        + "\"reasoning\":\"r1\"}");

    assertThatThrownBy(() -> itineraryAiService.optimize(
        newOptimizeRequest(), "task-blank-inner", null))
        .isInstanceOf(AiResponseValidationException.class)
        .extracting("reason")
        .isEqualTo(Reason.MISSING_DAYS);
  }

  @Test
  void optimize_innerCompensationWithValidDays_fillsFromInner() {
    // optimizedItinerary 是含有效 days 的 JSON 字符串 → 触发 inner compensation 成功路径
    // 顶层 days 为空 + optimizedItinerary 非空 → 进入 inner parse 分支
    when(chatResponse.getResult().getOutput().getText()).thenReturn(
        "{\"optimizedItinerary\":\"{\\\"summary\\\":\\\"青岛行程\\\","
        + "\\\"days\\\":[{\\\"day\\\":1,\\\"theme\\\":\\\"海岸游\\\","
        + "\\\"schedule\\\":[{\\\"period\\\":\\\"上午\\\",\\\"description\\\":\\\"游览栈桥\\\","
        + "\\\"poi\\\":{\\\"name\\\":\\\"栈桥\\\",\\\"latitude\\\":36.08,\\\"longitude\\\":120.35}}]}],"
        + "\\\"tips\\\":[\\\"带好防晒\\\"],\\\"estimatedBudget\\\":\\\"1000\\\"}\","
        + "\"changes\":[{\"item\":\"栈桥\",\"from\":\"day1\",\"to\":\"day2\",\"reason\":\"调整顺序\"}],"
        + "\"reasoning\":\"try best\"}");

    OptimizeResponse response = itineraryAiService.optimize(newOptimizeRequest(), "task-inner-ok", null);

    // inner compensation 成功：days/summary/tips/estimatedBudget 从 inner 填充
    assertThat(response.getDays()).hasSize(1);
    assertThat(response.getDays().get(0).getTheme()).isEqualTo("海岸游");
    assertThat(response.getSummary()).isEqualTo("青岛行程");
    assertThat(response.getReasoning()).isEqualTo("try best");
  }

  // ===== xiaohongshu with null noteContent =====

  @Test
  void generateFromXiaohongshu_nullNoteContentWithUrl_fetchesContent() {
    when(contentFetcher.fetchContent("https://example.com/note2")).thenReturn("fetched xhs content");
    when(chatResponse.getResult().getOutput().getText()).thenReturn(
        "{\"summary\":\"xhs null note trip\",\"days\":[{\"day\":1,\"schedule\":[]}],"
            + "\"tips\":[],\"estimatedBudget\":\"1200\"}");

    XiaohongshuItineraryRequest request = new XiaohongshuItineraryRequest();
    request.setUrl("https://example.com/note2");
    // noteContent 为 null（不是空白），应走 URL 抓取路径

    XiaohongshuResult result = itineraryAiService.generateFromXiaohongshu(request, "task-xhs-null", null);

    assertThat(result.response().getSummary()).isEqualTo("xhs null note trip");
    verify(contentFetcher).fetchContent("https://example.com/note2");
  }
}
