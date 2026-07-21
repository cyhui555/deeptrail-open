package com.ai.travel.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ai.travel.dto.response.NodeRevisionResponse;
import com.ai.travel.dto.response.PageResult;
import com.ai.travel.dto.response.TaskStatusResponse;
import com.ai.travel.dto.response.TaskSummaryResponse;
import com.ai.travel.enums.TaskStatus;
import com.ai.travel.enums.TaskType;
import com.ai.travel.service.ItineraryTaskService;
import com.ai.travel.service.TaskStatusStreamService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class TaskControllerTest {

  @Mock
  private ItineraryTaskService taskService;

  @Mock
  private TaskStatusStreamService taskStatusStreamService;

  private final ObjectMapper objectMapper = new ObjectMapper();

  private MockMvc mockMvc;

  @BeforeEach
  void setUp() {
    mockMvc = MockMvcBuilders
        .standaloneSetup(new TaskController(taskService, taskStatusStreamService))
        .build();
  }

  @Test
  void listTasksReturnsSummaryList() throws Exception {
    TaskSummaryResponse response = new TaskSummaryResponse();
    response.setTaskId("task-1");
    response.setType(TaskType.GENERATE);
    response.setStatus(TaskStatus.PENDING);
    response.setSubmittedAt(LocalDateTime.of(2026, 6, 30, 9, 0));
    PageResult<TaskSummaryResponse> pageResult = new PageResult<>(List.of(response), 1, 1, 10, 1);
    when(taskService.listTasks(isNull(), isNull(), eq(1), eq(10))).thenReturn(pageResult);

    mockMvc.perform(get("/api/itineraries/tasks"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.records[0].taskId").value("task-1"))
        .andExpect(jsonPath("$.data.records[0].status").value("PENDING"))
        .andExpect(jsonPath("$.data.total").value(1));

    verify(taskService).listTasks(isNull(), isNull(), eq(1), eq(10));
  }

  @Test
  void listTasksCanFilterByStatusAndType() throws Exception {
    PageResult<TaskSummaryResponse> empty = new PageResult<>(List.of(), 0, 1, 10, 0);
    when(taskService.listTasks(
        eq(TaskStatus.PROCESSING), eq(TaskType.OPTIMIZE), eq(1), eq(10))).thenReturn(empty);

    mockMvc.perform(get("/api/itineraries/tasks")
            .param("status", "PROCESSING")
            .param("type", "OPTIMIZE"))
        .andExpect(status().isOk());

    verify(taskService).listTasks(
        eq(TaskStatus.PROCESSING), eq(TaskType.OPTIMIZE), eq(1), eq(10));
  }

  @Test
  void getStatusReturnsTaskDetail() throws Exception {
    TaskStatusResponse response = new TaskStatusResponse();
    response.setTaskId("task-1");
    response.setType(TaskType.GENERATE);
    response.setStatus(TaskStatus.COMPLETED);
    when(taskService.getStatus("task-1")).thenReturn(response);

    mockMvc.perform(get("/api/itineraries/tasks/task-1"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.taskId").value("task-1"))
        .andExpect(jsonPath("$.data.status").value("COMPLETED"));
  }

  @Test
  void cancelReturnsOk() throws Exception {
    mockMvc.perform(delete("/api/itineraries/tasks/task-1"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true));

    verify(taskService).cancel("task-1");
  }

  // ========== 节点修正端到端测试 ==========

  @Test
  void listNodeRevisionsReturnsList() throws Exception {
    NodeRevisionResponse rev = NodeRevisionResponse.builder()
        .id(1L).dayIndex(1).itemIndex(0).transportMode("WALK")
        .transportDuration(10).transportCorrected(true).build();
    when(taskService.listNodeRevisions("task-1")).thenReturn(List.of(rev));

    mockMvc.perform(get("/api/itineraries/tasks/task-1/node-revisions"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data[0].dayIndex").value(1))
        .andExpect(jsonPath("$.data[0].transportCorrected").value(true));
  }

  @Test
  void saveNodeRevisionReturnsOk() throws Exception {
    NodeRevisionResponse rev = NodeRevisionResponse.builder()
        .id(1L).dayIndex(1).itemIndex(0).transportMode("WALK")
        .transportDuration(10).transportCorrected(true).build();
    when(taskService.saveNodeRevision(eq("task-1"), any())).thenReturn(rev);

    String body = """
        {"dayIndex":1,"itemIndex":0,"transportMode":"WALK","transportDuration":10}
        """;

    mockMvc.perform(put("/api/itineraries/tasks/task-1/node-revisions")
            .contentType("application/json")
            .content(body))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.transportCorrected").value(true));
  }

  @Test
  void deleteNodeRevisionReturnsOk() throws Exception {
    mockMvc.perform(delete("/api/itineraries/tasks/task-1/node-revisions/1/0"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.success").value(true));

    verify(taskService).deleteNodeRevision("task-1", 1, 0);
  }
}
