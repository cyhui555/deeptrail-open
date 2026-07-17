package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;

/** 小红书内容解析服务测试。 */
class XiaohongshuContentServiceTest {

  private final XiaohongshuContentFetcher contentFetcher = mock(XiaohongshuContentFetcher.class);
  private final XiaohongshuContentService service = new XiaohongshuContentService(contentFetcher);

  @Test
  void resolvePrefersDirectContentAndTruncatesIt() {
    String content = "x".repeat(5001);

    assertThat(service.resolve("https://example.com/note", content))
        .hasSize(5003)
        .endsWith("...");
  }

  @Test
  void resolveFetchesContentFromUrl() {
    when(contentFetcher.fetchContent("https://example.com/note")).thenReturn("note");

    assertThat(service.resolve("https://example.com/note", null)).isEqualTo("note");
    verify(contentFetcher).fetchContent("https://example.com/note");
  }

  @Test
  void resolveRejectsMissingInput() {
    assertThatThrownBy(() -> service.resolve(" ", null))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("链接或直接粘贴");
  }
}
