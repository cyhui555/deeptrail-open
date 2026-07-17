package com.ai.travel.service;

import cn.hutool.core.util.StrUtil;
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
      return StrUtil.maxLength(noteContent, MAX_CONTENT_LENGTH);
    }
    if (StrUtil.isNotBlank(url)) {
      return contentFetcher.fetchContent(url);
    }
    throw new IllegalArgumentException("请提供小红书笔记链接或直接粘贴笔记内容");
  }
}
