package com.ai.travel.e2e;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ai.travel.entity.CheckinMedia;
import com.ai.travel.mapper.CheckinMediaMapper;
import com.ai.travel.security.UserContext;
import com.jayway.jsonpath.JsonPath;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** E2E：媒体文件必须继承所属打卡项的用户隔离。 */
@Tag("e2e")
class MediaAccessE2ETest extends E2ETestBase {

  @Autowired private CheckinMediaMapper checkinMediaMapper;

  @Test
  @DisplayName("用户 B 不能读取用户 A 的媒体")
  void otherUser_cannotDownloadMedia() throws Exception {
    String planId = createTripPlan();
    Long itemId = startCheckinAndFirstItemId(planId);

    CheckinMedia media = new CheckinMedia();
    media.setCheckinItemId(itemId);
    media.setMediaType("IMAGE");
    media.setFilePath("checkin/not-needed.jpg");
    media.setFileSize(1);
    media.setIsHistory(false);
    media.setCreatedAt(LocalDateTime.now());
    checkinMediaMapper.insert(media);

    UserContext.setUserId(2L);
    String response = mockMvc.perform(get("/api/media/" + media.getId()))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsString();

    assertThat(JsonPath.parse(response).read("$.errorCode", String.class))
        .isEqualTo("FORBIDDEN");
  }
}
