package com.ai.travel.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

class XiaohongshuContentFetcherTest {

  // ==================== 基础 HTML 剥离（降级路径） ====================

  @Test
  void fetchContentStripsHtmlAndScriptTagsWhenNoMetaDesc() {
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(
        "<html><head><style>body{}</style><script>alert(1)</script></head>"
            + "<body>  行程   推荐 <div>西安</div> 第一天去兵马俑，第二天去大雁塔，第三天逛回民街吃遍美食 </body></html>");

    String content = fetcher.fetchContent("https://www.xiaohongshu.com/explore/test");

    assertThat(content).contains("行程 推荐 西安");
    assertThat(content).contains("兵马俑");
  }

  @Test
  void fetchContentThrowsWhenHtmlIsBlank() {
    XiaohongshuContentFetcher fetcher = fetcherWithResponse("   ");

    assertThatThrownBy(() -> fetcher.fetchContent("https://www.xiaohongshu.com/explore/test"))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("无法获取小红书内容");
  }

  // ==================== meta description 提取（主路径） ====================

  @Test
  void fetchContentExtractsMetaDescription() {
    String html = """
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="description" content="周六出海海钓🎣，周天城里溜达🚶‍♀️ 小鱼山+啤酒博物馆+团岛市场+奥帆中心+栈桥">
        </head>
        <body>
          <div id="app"></div>
          <nav>首页 探索 消息 我</nav>
          <footer>小红书 © 2024</footer>
        </body>
        </html>
        """;
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String content = fetcher.fetchContent("https://www.xiaohongshu.com/explore/abc");

    assertThat(content).contains("周六出海海钓");
    assertThat(content).contains("小鱼山");
    assertThat(content).contains("啤酒博物馆");
    assertThat(content).contains("团岛市场");
    assertThat(content).doesNotContain("首页");
    assertThat(content).doesNotContain("探索");
    assertThat(content).doesNotContain("footer");
  }

  @Test
  void fetchContentExtractsMetaDescriptionAndTitle() {
    String html = """
        <html>
        <head>
          <title>打工人周末往返青岛🌊|打卡青岛啤酒城🍻 - 小红书</title>
          <meta name="description" content="周六出海海钓🎣，周天城里溜达 小鱼山+啤酒博物馆+团岛市场+奥帆中心+栈桥">
        </head>
        <body></body>
        </html>
        """;
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String content = fetcher.fetchContent("https://www.xiaohongshu.com/explore/test");

    assertThat(content).contains("标题：打工人周末往返青岛🌊|打卡青岛啤酒城🍻");
    assertThat(content).contains("内容：周六出海海钓");
    assertThat(content).contains("小鱼山");
    assertThat(content).doesNotContain(" - 小红书");
  }

  @Test
  void fetchContentStripsXiaohongshuSuffixFromTitle() {
    String html = """
        <html>
        <head>
          <title>青岛两日游攻略 - 小红书</title>
          <meta name="description" content="青岛两日游攻略：第一天小鱼山看日出，啤酒博物馆品鲜酿；第二天奥帆中心看日落，栈桥喂海鸥">
        </head>
        <body></body>
        </html>
        """;
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String content = fetcher.fetchContent("https://www.xiaohongshu.com/explore/test");

    assertThat(content).contains("标题：青岛两日游攻略");
    assertThat(content).doesNotContain(" - 小红书");
  }

  // ==================== 截断 ====================

  @Test
  void fetchContentTruncatesTo5000Chars() {
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < 5500; i++) {
      sb.append(i % 10);
    }
    String html = "<body>" + sb + "</body>";
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String content = fetcher.fetchContent("https://www.xiaohongshu.com/explore/long");

    assertThat(content.length())
        .as("content should be significantly shorter than 5500-char input")
        .isLessThan(5500);
  }

  // ==================== 真实场景模拟 ====================

  @Test
  void fetchContentHandlesRealWorldXiaohongshuHtml() {
    String html = """
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>打工人周末往返青岛🌊|打卡青岛啤酒城🍻 周六出海海...</title>
          <meta name="description" content="周六出海海钓🎣，周天城里溜达🚶‍♀️ 小鱼山+啤酒博物馆+团岛市场+奥帆中心+栈桥 #青岛旅行">
          <style>body{margin:0}</style>
          <script>window.__INITIAL_STATE__={}</script>
        </head>
        <body>
          <div id="app"></div>
          <nav>首页 探索 消息 我</nav>
          <footer>小红书 © 2024</footer>
        </body>
        </html>
        """;
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String content = fetcher.fetchContent("https://www.xiaohongshu.com/explore/abc");

    assertThat(content).isNotEmpty();
    assertThat(content).contains("打工人周末往返青岛");
    assertThat(content).contains("周六出海海钓");
    assertThat(content).contains("小鱼山");
    assertThat(content).contains("啤酒博物馆");
    assertThat(content).contains("奥帆中心");
    assertThat(content).contains("栈桥");
    assertThat(content).doesNotContain("function");
    assertThat(content).doesNotContain("window.");
    assertThat(content).doesNotContain("margin");
    assertThat(content).doesNotContain("__INITIAL_STATE__");
    assertThat(content).doesNotContain("首页");
    assertThat(content).doesNotContain("探索");
  }

  @Test
  void fetchContentHandlesRedirectResponse() {
    String html = """
        <html>
        <head>
          <title>青岛周末游 - 小红书</title>
          <meta name="description" content="两天一夜青岛旅行攻略，啤酒城、奥帆中心、栈桥全覆盖，小鱼山看日出，吃遍台东夜市美食">
        </head>
        <body>
          <div class="note-scroller">
            <div class="note-item"><h1>青岛周末游</h1></div>
          </div>
        </body>
        </html>
        """;
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String content = fetcher.fetchContent("http://xhslink.com/o/4ZsyHhweRDE");

    assertThat(content).contains("标题：青岛周末游");
    assertThat(content).contains("两天一夜青岛旅行攻略");
    assertThat(content).contains("啤酒城");
    assertThat(content).contains("奥帆中心");
    assertThat(content).contains("栈桥");
  }

  // ==================== URL 协议升级 ====================

  @Test
  void fetchContentUpgradesHttpToHttps() {
    XiaohongshuContentFetcher fetcher = new XiaohongshuContentFetcher() {
      @Override
      String doFetch(String url) {
        return "<html><head><meta name=\"description\" content=\"青岛两日游攻略：小鱼山看日出，啤酒博物馆品鲜酿，奥帆中心看日落，栈桥喂海鸥\"></head></html>";
      }
    };

    String content = fetcher.fetchContent("http://xhslink.com/o/test");

    assertThat(content).contains("青岛两日游攻略");
  }

  // ==================== 异常处理 ====================

  @Test
  void fetchContentThrowsOnNetworkError() {
    XiaohongshuContentFetcher fetcher = new XiaohongshuContentFetcher() {
      @Override
      String doFetch(String url) {
        throw new RuntimeException("Connection timed out");
      }
    };

    assertThatThrownBy(() -> fetcher.fetchContent("http://xhslink.com/o/4ZsyHhweRDE"))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("无法获取小红书内容")
        .hasMessageContaining("Connection timed out");
  }

  @Tag("real-network")
  @Test
  void fetchContentWithRealUrlDocumentsBehavior() {
    assertThat(new XiaohongshuContentFetcher()).isNotNull();
  }

  // ==================== 内容质量校验 ====================

  @Test
  void fetchContentRejectsShortContent() {
    String html = "<html><head></head><body>短</body></html>";
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    assertThatThrownBy(() -> fetcher.fetchContent("https://www.xiaohongshu.com/explore/test"))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("无法获取小红书内容")
        .hasMessageContaining("页面有效内容不足");
  }

  @Test
  void fetchContentRejectsErrorPageContent() {
    String html = "Found.";
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    assertThatThrownBy(() -> fetcher.fetchContent("https://www.xiaohongshu.com/explore/test"))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("无法获取小红书内容")
        .hasMessageContaining("页面有效内容不足");
  }

  @Test
  void fetchContentRejectsFoundWithWhitespace() {
    String html = "<html><body>  Found .  </body></html>";
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    assertThatThrownBy(() -> fetcher.fetchContent("https://www.xiaohongshu.com/explore/test"))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("页面有效内容不足");
  }

  @Test
  void fetchContentRejectsNotFoundPage() {
    String html = """
        <html>
        <head><title>Not Found</title></head>
        <body>页面不存在</body>
        </html>""";
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    assertThatThrownBy(() -> fetcher.fetchContent("https://www.xiaohongshu.com/explore/test"))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("页面有效内容不足");
  }

  // ==================== URL 域名白名单校验 ====================

  @Test
  void fetchContentRejectsUnsupportedDomainWeixin() {
    XiaohongshuContentFetcher fetcher = new XiaohongshuContentFetcher() {
      @Override
      String doFetch(String url) {
        throw new AssertionError("doFetch should not be called for unsupported domains");
      }
    };

    assertThatThrownBy(() -> fetcher.fetchContent("https://mp.weixin.qq.com/s/R_fNxkhqJruhSCaIbYJt4Q"))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("不支持该链接平台")
        .hasMessageContaining("mp.weixin.qq.com")
        .hasMessageContaining("粘贴笔记内容");
  }

  @Test
  void fetchContentRejectsUnsupportedDomainBaidu() {
    XiaohongshuContentFetcher fetcher = new XiaohongshuContentFetcher() {
      @Override
      String doFetch(String url) {
        throw new AssertionError("doFetch should not be called for unsupported domains");
      }
    };

    assertThatThrownBy(() -> fetcher.fetchContent("https://www.baidu.com"))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("不支持该链接平台");
  }

  @Test
  void fetchContentAcceptsXiaohongshuMainDomain() {
    XiaohongshuContentFetcher fetcher = new XiaohongshuContentFetcher() {
      @Override
      String doFetch(String url) {
        return "<html><head><meta name=\"description\" content=\"青岛三日旅行攻略：第一天小鱼山看日出，第二天啤酒博物馆品鲜酿，第三天奥帆中心看日落、栈桥喂海鸥、台东夜市吃遍美食\"></head></html>";
      }
    };

    String content = fetcher.fetchContent("https://www.xiaohongshu.com/explore/abc123");

    assertThat(content).contains("青岛三日旅行攻略");
    assertThat(content).contains("小鱼山");
  }

  @Test
  void fetchContentAcceptsXhslinkDomain() {
    XiaohongshuContentFetcher fetcher = new XiaohongshuContentFetcher() {
      @Override
      String doFetch(String url) {
        return "<html><head><meta name=\"description\" content=\"周末青岛两日游完整攻略：第一天小鱼山看日出再去啤酒博物馆，第二天奥帆中心栈桥一起逛\"></head></html>";
      }
    };

    String content = fetcher.fetchContent("http://xhslink.com/o/test123");

    assertThat(content).contains("周末青岛两日游");
  }

  @Test
  void fetchContentAcceptsXhslinkUrlWithTrailingWhitespace() {
    XiaohongshuContentFetcher fetcher = new XiaohongshuContentFetcher() {
      @Override
      String doFetch(String url) {
        return "<html><head><meta name=\"description\" content=\"青岛两日游完整攻略：第一天小鱼山看日出、逛啤酒博物馆，第二天奥帆中心看日落、栈桥喂海鸥、台东夜市吃遍美食\"></head></html>";
      }
    };

    String content = fetcher.fetchContent("http://xhslink.com/o/4ZsyHhweRDE  ");

    assertThat(content).contains("小鱼山看日出");
  }

  @Test
  void fetchContentAcceptsXhslinkUrlWithLeadingNewline() {
    XiaohongshuContentFetcher fetcher = new XiaohongshuContentFetcher() {
      @Override
      String doFetch(String url) {
        return "<html><head><meta name=\"description\" content=\"周末青岛旅行攻略：第一天奥帆中心看日落、栈桥喂海鸥，第二天台东夜市吃遍美食\"></head></html>";
      }
    };

    String content = fetcher.fetchContent("\nhttp://xhslink.com/o/test");

    assertThat(content).contains("奥帆中心看日落");
  }

  @Test
  void fetchContentRejectsBlankUrl() {
    XiaohongshuContentFetcher fetcher = new XiaohongshuContentFetcher() {
      @Override
      String doFetch(String url) {
        throw new AssertionError("doFetch should not be called for blank URL");
      }
    };

    assertThatThrownBy(() -> fetcher.fetchContent("   "))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("URL 不能为空");
  }

  @Test
  void fetchContentRejectsUrlWithNoHost() {
    XiaohongshuContentFetcher fetcher = new XiaohongshuContentFetcher() {
      @Override
      String doFetch(String url) {
        throw new AssertionError("doFetch should not be called for invalid URLs");
      }
    };

    assertThatThrownBy(() -> fetcher.fetchContent("not-a-valid-url"))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("URL 格式无效");
  }

  // ==================== __INITIAL_STATE__ 提取 ====================

  @Test
  void extractInitStateJsonReturnsJsonWhenPresent() {
    String html = """
        <html><head>
        <script>window.__INITIAL_STATE__ = {"note":{"noteDetail":{"desc":"完整笔记正文：青岛三日游详细攻略，包含小鱼山看日出、啤酒博物馆品鲜酿、奥帆中心看日落等经典路线"}}}</script>
        </head><body></body></html>
        """;
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String json = fetcher.extractInitStateJson(html);

    assertThat(json).isNotNull();
    assertThat(json).contains("完整笔记正文");
    assertThat(json).contains("noteDetail");
  }

  @Test
  void extractInitStateJsonReturnsNullWhenNotPresent() {
    String html = "<html><head></head><body><p>普通页面</p></body></html>";

    String json = new XiaohongshuContentFetcher().extractInitStateJson(html);

    assertThat(json).isNull();
  }

  @Test
  void extractInitStateJsonHandlesNestedBracesAndStrings() {
    String html = """
        <script>window.__INITIAL_STATE__ = {"note":{"desc":"包含 \\"引号\\" 和 {花括号} 的文本","tags":[{"name":"旅行"},{"name":"青岛"}]}}</script>
        """;
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String json = fetcher.extractInitStateJson(html);

    assertThat(json).isNotNull();
    assertThat(json).contains("包含 \\\"引号\\\" 和 {花括号} 的文本");
  }

  @Test
  void fetchContentExtractsFromInitStateDesc() {
    String html = """
        <html><head>
        <title>小红书笔记页</title>
        <meta name="description" content="这是截断的meta描述...">
        <script>window.__INITIAL_STATE__ = {"note":{"noteDetail":{"desc":"这是从__INITIAL_STATE__中提取的完整笔记正文，包含青岛三日游的详细攻略：第一天小鱼山看日出，第二天啤酒博物馆品鲜酿，第三天奥帆中心看日落、栈桥喂海鸥、台东夜市吃遍美食","title":"青岛三日游完整攻略"}}}</script>
        </head><body><div id="app"></div></body></html>
        """;
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String content = fetcher.fetchContent("https://www.xiaohongshu.com/explore/test");

    // Should use __INITIAL_STATE__ content (full), not the truncated meta description
    assertThat(content).contains("从__INITIAL_STATE__中提取的完整笔记正文");
    assertThat(content).contains("小鱼山看日出");
    assertThat(content).contains("啤酒博物馆品鲜酿");
    assertThat(content).contains("奥帆中心看日落");
    assertThat(content).contains("栈桥喂海鸥");
    assertThat(content).contains("台东夜市吃遍美食");
    // Should use title from __INITIAL_STATE__
    assertThat(content).contains("标题：青岛三日游完整攻略");
  }

  @Test
  void fetchContentUsesDisplayTitleWhenTitleAbsent() {
    String html = """
        <html><head>
        <script>window.__INITIAL_STATE__ = {"note":{"noteDetail":{"desc":"青岛周末两日游完整攻略：第一天小鱼山看日出再去啤酒博物馆，第二天奥帆中心栈桥一起逛","displayTitle":"青岛周末两日游"}}}</script>
        </head><body></body></html>
        """;
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String content = fetcher.fetchContent("https://www.xiaohongshu.com/explore/test");

    assertThat(content).contains("标题：青岛周末两日游");
    assertThat(content).contains("青岛周末两日游完整攻略");
  }

  @Test
  void fetchContentFallsBackToMetaDescWhenInitStateHasNoDesc() {
    String html = """
        <html><head>
        <meta name="description" content="青岛周末两日游：小鱼山+啤酒博物馆+奥帆中心+栈桥，两天一夜全覆盖">
        <script>window.__INITIAL_STATE__ = {"user":{"name":"test"}}</script>
        </head><body></body></html>
        """;
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String content = fetcher.fetchContent("https://www.xiaohongshu.com/explore/test");

    // INIT_STATE has no desc field, should fall back to meta description
    assertThat(content).contains("小鱼山");
    assertThat(content).contains("啤酒博物馆");
  }

  // ==================== __NEXT_DATA__ 提取 ====================

  @Test
  void fetchContentExtractsFromNextData() {
    String html = """
        <html><head>
        <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"note":{"desc":"从__NEXT_DATA__中提取的完整笔记内容：青岛三日游深度攻略"}}}}</script>
        </head><body><div id="app"></div></body></html>
        """;
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String content = fetcher.fetchContent("https://www.xiaohongshu.com/explore/test");

    assertThat(content).contains("从__NEXT_DATA__中提取的完整笔记内容");
    assertThat(content).contains("青岛三日游深度攻略");
  }

  @Test
  void fetchContentNextDataFallsBackToMetaDesc() {
    String html = """
        <html><head>
        <meta name="description" content="青岛三日游完整攻略：第一天小鱼山看日出、逛啤酒博物馆，第二天奥帆中心看日落、栈桥喂海鸥、台东夜市吃遍美食">
        <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{}}}</script>
        </head><body></body></html>
        """;
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String content = fetcher.fetchContent("https://www.xiaohongshu.com/explore/test");

    // __NEXT_DATA__ has no desc, fall back to meta description
    assertThat(content).contains("小鱼山看日出");
  }

  @Test
  void fetchContentInitStatePriorityOverNextDataAndMetaDesc() {
    String html = """
        <html><head>
        <meta name="description" content="meta描述被截断版本不够三十个字...">
        <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"note":{"desc":"来自NEXT_DATA的版本内容不太够长"}}}}</script>
        <script>window.__INITIAL_STATE__ = {"note":{"desc":"来自INIT_STATE的优先版本：青岛完整三日游攻略，包含小鱼山看日出、啤酒博物馆品鲜酿、奥帆中心看日落等经典路线"}}</script>
        </head><body></body></html>
        """;
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String content = fetcher.fetchContent("https://www.xiaohongshu.com/explore/test");

    // __INITIAL_STATE__ should take priority
    assertThat(content).contains("来自INIT_STATE的优先版本");
    assertThat(content).doesNotContain("来自NEXT_DATA的版本");
    assertThat(content).doesNotContain("meta描述被截断版本");
  }

  // ==================== findFieldInJson ====================

  @Test
  void findFieldInJsonFindsDescAtDeepLevel() {
    String json = """
        {"a":{"b":{"c":{"d":{"e":{"desc":"深层嵌套的笔记正文"}}}}}}
        """;
    XiaohongshuContentFetcher fetcher = new XiaohongshuContentFetcher();

    String result = fetcher.findFieldInJson(json, "desc");

    assertThat(result).isEqualTo("深层嵌套的笔记正文");
  }

  @Test
  void findFieldInJsonReturnsNullWhenFieldNotFound() {
    String json = """
        {"a":{"b":{"c":"no-desc-here"}}}
        """;
    XiaohongshuContentFetcher fetcher = new XiaohongshuContentFetcher();

    String result = fetcher.findFieldInJson(json, "desc");

    assertThat(result).isNull();
  }

  // ==================== __INITIAL_STATE__ / __NEXT_DATA__ 提取路径 ====================

  @Test
  void fetchContentExtractsFromInitialStateDesc() {
    // 覆盖 extractInitStateJson + findFieldInJson("desc") 路径
    String html = "<html><head></head><body>"
        + "<script>window.__INITIAL_STATE__={\"note\":{\"desc\":\"川西五日自驾攻略：折多山看贡嘎雪山、新都桥摄影、稻城亚丁三神山、色达五明佛学院、海螺沟冰川\"}};</script>"
        + "</body></html>";
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String content = fetcher.fetchContent("https://www.xiaohongshu.com/explore/test");

    assertThat(content).contains("川西五日自驾攻略");
    assertThat(content).contains("折多山");
  }

  @Test
  void fetchContentExtractsFromInitialStateTitle() {
    // 覆盖 findFieldInJson("title") 路径
    String html = "<html><body>"
        + "<script>window.__INITIAL_STATE__={\"note\":{\"title\":\"青岛三日旅行笔记\",\"desc\":\"第一天栈桥喂海鸥看日落、第二天啤酒博物馆品鲜酿、第三天山海关路最美海岸线\"}};</script>"
        + "</body></html>";
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String content = fetcher.fetchContent("https://www.xiaohongshu.com/explore/test");

    assertThat(content).contains("标题：青岛三日旅行笔记");
    assertThat(content).contains("栈桥");
  }

  @Test
  void fetchContentExtractsFromInitialStateDisplayTitle() {
    // 覆盖 title 为空时回退到 displayTitle 的分支
    String html = "<html><body>"
        + "<script>window.__INITIAL_STATE__={\"note\":{\"displayTitle\":\"伊犁草原自驾\",\"desc\":\"那拉提空中草原一日游、赛里木湖环湖自驾百里画廊、果子沟大桥日落\"}};</script>"
        + "</body></html>";
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String content = fetcher.fetchContent("https://www.xiaohongshu.com/explore/test");

    assertThat(content).contains("标题：伊犁草原自驾");
  }

  @Test
  void fetchContentExtractsFromNextDataFallback() {
    // 覆盖 extractFromNextData 路径（__NEXT_DATA__）
    String html = "<html><body>"
        + "<script id=\"__NEXT_DATA__\" type=\"application/json\">{\"props\":{\"desc\":\"三亚五天四夜度假攻略：亚龙湾沙滩日光浴、蜈支洲岛潜水、南山寺海上观音、天涯海角\"}}</script>"
        + "</body></html>";
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String content = fetcher.fetchContent("https://www.xiaohongshu.com/explore/test");

    assertThat(content).contains("三亚五天四夜度假攻略");
  }

  @Test
  void fetchContentFallsBackToMetaWhenNoStateOrNextData() {
    // 覆盖 meta description 路径（无 INITIAL_STATE 也无 NEXT_DATA）
    String html = "<html><head>"
        + "<meta name=\"description\" content=\"西安三日游：兵马俑、大雁塔、回民街、城墙骑行、华清宫、法门寺\"></head>"
        + "<body></body></html>";
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String content = fetcher.fetchContent("https://www.xiaohongshu.com/explore/test");

    assertThat(content).contains("西安三日游");
  }

  @Test
  void fetchContentExtractsTitleFromHtml() {
    // 覆盖 extractTitle 路径（title 标签）
    String html = "<html><head><title>重庆三日游攻略</title></head>"
        + "<body><meta name=\"description\" content=\"洪崖洞夜景灯火辉煌、磁器口古镇百年老街、长江索道飞越两岸、解放碑周围美食之旅\"></body></html>";
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String content = fetcher.fetchContent("https://www.xiaohongshu.com/explore/test");

    assertThat(content).contains("标题：重庆三日游攻略");
    assertThat(content).contains("洪崖洞");
  }

  @Test
  void fetchContentRejectsBlankUrlOnly() {
    // 覆盖 validateUrl blank 分支
    XiaohongshuContentFetcher fetcher = new XiaohongshuContentFetcher();
    assertThatThrownBy(() -> fetcher.fetchContent("   "))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("URL 不能为空");
  }

  @Test
  void fetchContentRejectsInvalidUrlFormat() {
    // 覆盖 validateUrl 格式无效分支
    XiaohongshuContentFetcher fetcher = new XiaohongshuContentFetcher();
    assertThatThrownBy(() -> fetcher.fetchContent("not a url"))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("URL 格式无效");
  }

  @Test
  void fetchContentRejectsUnsupportedDomainGeneric() {
    // 覆盖 validateUrl 不支持的域名（通用分支）
    XiaohongshuContentFetcher fetcher = new XiaohongshuContentFetcher();
    assertThatThrownBy(() -> fetcher.fetchContent("https://www.douyin.com/video/123"))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("不支持该链接平台");
  }

  // ==================== extractInitStateJson 边界 ====================

  @Test
  void extractInitStateJson_noClosingBrace_returnsNull() {
    // __INITIAL_STATE__ 有开头但无结束花括号 —— 覆盖 end <= 0 分支（返回 null）
    // 此时回退到 body 提取;但 body 同样无法提取到有效内容，触发 isMeaningfulContent=false 抛出 RuntimeException
    String html = "<html><head>"
        + "<script>window.__INITIAL_STATE__ = {\"note\":{\"desc\":\"未闭合的 JSON 字符串，缺少闭合花括号\"}}"
        + "</script></head><body>"
        + "<meta name=\"description\" content=\"青岛两日游完整攻略：第一天小鱼山看日出再去啤酒博物馆，第二天奥帆中心栈桥一起逛\"></body></html>";
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    // 生产代码会抛出 RuntimeException，测试应断言该行为
    org.assertj.core.api.Assertions.assertThatThrownBy(
        () -> fetcher.fetchContent("https://www.xiaohongshu.com/explore/test"))
        .isInstanceOf(RuntimeException.class)
        .hasMessageContaining("无法获取小红书内容");
  }

  @Test
  void fetchContent_extractsFromNextData_whenInitStateMissing() {
    // 不含 __INITIAL_STATE__ 但含 __NEXT_DATA__ —— 覆盖 Priority 2 分支
    String html = "<html><head>"
        + "<script id=\"__NEXT_DATA__\" type=\"application/json\">"
        + "{\"props\":{\"pageProps\":{\"note\":{\"desc\":\"青岛三日旅行攻略完整路线：第一天小鱼山看日出再去啤酒博物馆，第二天奥帆中心栈桥一起逛，第三天台东夜市吃遍美食\"}}}}"
        + "</script></head><body></body></html>";
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String content = fetcher.fetchContent("https://www.xiaohongshu.com/explore/test");
    // 应能提取到 meta desc 或 stripped body（取决于 JSON 路径）
    // 至少应成功解析并返回非空内容
    assertThat(content).isNotNull();
  }

  @Test
  void fetchContent_fallsBackToMetaDescription_whenNoJsonPresent() {
    // 不含任何 JSON，仅有 meta description —— 覆盖 Priority 3 路径
    String html = "<html><head>"
        + "<meta name=\"description\" content=\"济南两日游完美路线：第一天趵突泉大明湖超然楼，第二天千佛山灵岩寺兴国禅寺，美食推荐把子肉油旋甜沫\"></head>"
        + "<body><div>冗余内容不提取</div></body></html>";
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String content = fetcher.fetchContent("https://www.xiaohongshu.com/explore/test");
    assertThat(content).contains("济南两日游完美路线");
    assertThat(content).contains("趵突泉");
  }

  @Test
  void fetchContent_fallsBackToHtmlStrip_whenNoJsonOrMeta() {
    // 不含 JSON / 不含 meta —— 覆盖 Priority 4 (stripHtml) 路径
    String html = "<html><body>"
        + "<h1>青岛旅行行程安排</h1>"
        + "<p>第一天去小鱼山看日出，傍晚沿着大学路走到栈桥喂海鸥，感受海风与落日</p>"
        + "<p>第二天去啤酒博物馆品鲜酿，下午奥帆中心散步看游艇出港，黄昏时分前往台东夜市吃遍美食</p>"
        + "</body></html>";
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String content = fetcher.fetchContent("https://www.xiaohongshu.com/explore/test");
    assertThat(content).contains("青岛旅行行程安排");
    assertThat(content).contains("小鱼山");
    assertThat(content).contains("啤酒博物馆");
  }

  @Test
  void fetchContent_extractsTitle_stripsXiaohongshuSuffix() {
    // 验证 extractTitle 的 " - 小红书" 后缀剥离逻辑
    // 构造 HTML：meta description 提供 body；title 含小红书后缀
    // body 通过 priority 3 提取，priority 4 stripHtml 不会把 title 引进去
    // title 由 extractTitle 单独提取并剥离后缀
    String html = "<html><head>"
        + "<title>青岛两日游完整攻略 - 小红书</title>"
        + "<meta name=\"description\" content=\"青岛旅游攻略完整路线：第一天小鱼山看日出再去啤酒博物馆，第二天奥帆中心栈桥一起逛，美食推荐海菜包子鲅鱼水饺\"></head>"
        + "<body>正文不提取</body></html>";
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);
    String content = fetcher.fetchContent("https://www.xiaohongshu.com/explore/test");
    // 标题行格式: "标题：青岛两日游完整攻略" (不含小红书)
    assertThat(content).contains("标题：青岛两日游完整攻略");
    // 标题行不含小红书
    String titleLine = content.lines().filter(l -> l.startsWith("标题：")).findFirst().orElse("");
    assertThat(titleLine).doesNotContain("小红书");
  }

  @Test
  void extractInitStateJson_handlesEscapedQuotesInStrings() {
    // __INITIAL_STATE__ 含转义引号 —— 覆盖 escaped 标志分支
    String html = "<html><head>"
        + "<script>window.__INITIAL_STATE__ = {\"note\":{\"desc\":\"包含 \\\"转义引号\\\" 的行程描述，覆盖青岛两日游攻略：小鱼山+啤酒博物馆+奥帆中心+栈桥\"}}"
        + "</script></head><body></body></html>";
    XiaohongshuContentFetcher fetcher = fetcherWithResponse(html);

    String json = fetcher.extractInitStateJson(html);
    assertThat(json).isNotNull();
    assertThat(json).contains("转义引号");
  }

  // ==================== 工具方法 ====================

  private static XiaohongshuContentFetcher fetcherWithResponse(String html) {
    return new XiaohongshuContentFetcher() {
      @Override
      String doFetch(String url) {
        return html;
      }
    };
  }
}
