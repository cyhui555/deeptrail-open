package com.ai.travel.service;

import cn.hutool.core.util.StrUtil;
import java.net.URI;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/** 解析小红书行程输入，统一处理直接文本与 URL 抓取。 */
@Service
@RequiredArgsConstructor
public class XiaohongshuContentService {

  private static final int MAX_CONTENT_LENGTH = 5000;

  private final XiaohongshuContentFetcher contentFetcher;

  /** 获取供模型使用的笔记正文。 */
  public String resolve(String url, String noteContent) {
    if (StrUtil.isNotBlank(noteContent)) {
      String normalizedContent = noteContent.trim();
      // 前端可能仍把完整链接放进正文栏；服务端必须在模型调用前再次归一化，
      // 避免任何客户端把裸 URL 当作旅行正文并触发无依据生成。
      if (isAbsoluteHttpUrl(normalizedContent)) {
        return contentFetcher.fetchContent(normalizedContent);
      }
      return StrUtil.maxLength(normalizedContent, MAX_CONTENT_LENGTH);
    }
    if (StrUtil.isNotBlank(url)) {
      return contentFetcher.fetchContent(url.trim());
    }
    throw new IllegalArgumentException("请提供小红书笔记链接或直接粘贴笔记内容");
  }

  private boolean isAbsoluteHttpUrl(String value) {
    try {
      URI uri = URI.create(value);
      String scheme = uri.getScheme();
      return uri.getHost() != null
          && ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme));
    } catch (IllegalArgumentException exception) {
      return false;
    }
  }
}
