package com.ai.travel.service;

import cn.hutool.core.util.StrUtil;
import cn.hutool.http.HttpRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 小红书内容抓取服务。
 *
 * <p>按优先级依次尝试：window.__INITIAL_STATE__ JSON → __NEXT_DATA__ JSON
 * → meta description → HTML 标签剥离。仅允许小红书域名。
 */
@Component
@Slf4j
public class XiaohongshuContentFetcher {

  private static final Set<String> SUPPORTED_DOMAINS =
      Set.of("xiaohongshu.com", "xhslink.com");

  private static final Pattern META_DESC_PATTERN =
      Pattern.compile("<meta[^>]*name=\"description\"[^>]*content=\"([^\"]*)\"",
          Pattern.CASE_INSENSITIVE);
  private static final Pattern TITLE_PATTERN =
      Pattern.compile("<title>([^<]*)</title>", Pattern.CASE_INSENSITIVE);

  private static final Pattern INIT_STATE_PREFIX =
      Pattern.compile("window\\.__INITIAL_STATE__\\s*=\\s*");

  private static final Pattern NEXT_DATA_PATTERN =
      Pattern.compile(
          "<script[^>]*id=\"__NEXT_DATA__\"[^>]*type=\"application/json\"[^>]*>"
              + "([\\s\\S]*?)</script>",
          Pattern.CASE_INSENSITIVE);

  private final ObjectMapper objectMapper = new ObjectMapper();

  /**
   * 抓取小红书笔记正文文本。
   *
   * @param url 小红书笔记链接
   * @return 提取的纯文本（标题 + 正文），最长 5000 字符
   * @throws RuntimeException 当网络请求失败、域名不支持或内容为空时抛出
   */
  public String fetchContent(String url) {
    try {
      validateUrl(url);
      String cleanUrl = url.trim();
      String finalUrl = cleanUrl.startsWith("http://") ? "https://" + cleanUrl.substring(7) : cleanUrl;
      String html = doFetch(finalUrl);
      if (StrUtil.isBlank(html)) {
        throw new RuntimeException("页面内容为空");
      }

      String body = null;
      String title = null;

      // Priority 1: window.__INITIAL_STATE__
      String initJson = extractInitStateJson(html);
      if (initJson != null) {
        body = findFieldInJson(initJson, "desc");
        title = findFieldInJson(initJson, "title");
        if (StrUtil.isBlank(title)) {
          title = findFieldInJson(initJson, "displayTitle");
        }
        if (StrUtil.isNotBlank(body)) {
          log.debug("Xiaohongshu content from __INITIAL_STATE__, length={}", body.length());
        }
      }

      // Priority 2: __NEXT_DATA__
      if (StrUtil.isBlank(body)) {
        body = extractFromNextData(html);
        if (StrUtil.isNotBlank(body)) {
          log.debug("Xiaohongshu content from __NEXT_DATA__, length={}", body.length());
        }
      }

      // Priority 3: meta description
      if (StrUtil.isBlank(body)) {
        body = extractMetaDescription(html);
        if (StrUtil.isNotBlank(body)) {
          log.debug("Xiaohongshu content from meta description, length={}", body.length());
        }
      }

      // Priority 4: HTML strip
      if (StrUtil.isBlank(body)) {
        body = stripHtml(html);
        log.debug("Xiaohongshu content fallback to HTML strip");
      }

      if (StrUtil.isBlank(title)) {
        title = extractTitle(html);
      }

      if (!isMeaningfulContent(body)) {
        throw new RuntimeException("页面有效内容不足，可能是错误页面或非标准笔记页");
      }

      StringBuilder result = new StringBuilder();
      if (StrUtil.isNotBlank(title)) {
        result.append("标题：").append(title).append("\n");
      }
      result.append("内容：").append(body);

      return StrUtil.maxLength(result.toString(), 5000);
    } catch (Exception e) {
      log.warn("抓取小红书内容失败: url={}, error={}", url, e.getMessage());
      String message = e.getMessage() != null ? e.getMessage() : "未知错误";
      throw new RuntimeException("无法获取小红书内容: " + message, e);
    }
  }

  /**
   * 发起 HTTP GET 请求，返回响应体字符串。抽取为独立方法便于测试覆盖。
   */
  String doFetch(String url) {
    return HttpRequest.get(url)
        .header("User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                + "Chrome/120.0.0.0 Safari/537.36")
        .header("Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .setFollowRedirects(true)
        .timeout(15000)
        .execute()
        .body();
  }

  /**
   * 校验 URL 域名是否在支持列表中。
   *
   * <p>仅支持 xiaohongshu.com 和 xhslink.com 域名及其子域名。
   * 其他平台（如微信公众号 mp.weixin.qq.com）的 HTML 结构不同，
   * 内容提取不可靠，应提示用户使用"粘贴笔记内容"方式。
   */
  void validateUrl(String url) {
    try {
      String trimmedUrl = url != null ? url.trim() : null;
      if (StrUtil.isBlank(trimmedUrl)) {
        throw new RuntimeException("URL 不能为空");
      }
      URI uri = new URI(trimmedUrl);
      String host = uri.getHost();
      if (host == null) {
        throw new RuntimeException("URL 格式无效，无法解析域名: " + url);
      }
      String hostLower = host.toLowerCase();
      boolean supported = SUPPORTED_DOMAINS.stream()
          .anyMatch(domain -> hostLower.equals(domain) || hostLower.endsWith("." + domain));
      if (!supported) {
        throw new RuntimeException(
            "不支持该链接平台（" + host + "），当前仅支持小红书链接（xiaohongshu.com / xhslink.com）。"
                + "如需从其他平台文章生成行程，请使用\"粘贴笔记内容\"方式手动粘贴文章正文。");
      }
    } catch (RuntimeException e) {
      throw e;
    } catch (Exception e) {
      throw new RuntimeException("URL 格式无效: " + url, e);
    }
  }

  // ==================== 内容提取方法 ====================

  /**
   * 从 HTML 中提取 window.__INITIAL_STATE__ 的 JSON 字符串。
   * 使用括号计数正确匹配嵌套 JSON，支持含转义字符的字符串。
   */
  String extractInitStateJson(String html) {
    Matcher m = INIT_STATE_PREFIX.matcher(html);
    if (!m.find()) {
      return null;
    }

    int start = m.end();
    int braceCount = 0;
    int end = -1;
    boolean inString = false;
    boolean escaped = false;

    for (int i = start; i < html.length(); i++) {
      char c = html.charAt(i);

      if (escaped) {
        escaped = false;
        continue;
      }
      if (c == '\\' && inString) {
        escaped = true;
        continue;
      }
      if (c == '"' && !escaped) {
        inString = !inString;
        continue;
      }
      if (inString) {
        continue;
      }
      if (c == '{') {
        braceCount++;
      } else if (c == '}') {
        braceCount--;
        if (braceCount == 0) {
          end = i + 1;
          break;
        }
      }
    }

    return end > 0 ? html.substring(start, end) : null;
  }

  String extractFromNextData(String html) {
    Matcher m = NEXT_DATA_PATTERN.matcher(html);
    if (!m.find()) {
      return null;
    }
    String json = m.group(1).trim();
    if (json.isEmpty()) {
      return null;
    }
    return findFieldInJson(json, "desc");
  }

  /**
   * 在 JSON 树中 BFS 搜索指定字段值（限深 20 层）。
   */
  String findFieldInJson(String json, String fieldName) {
    try {
      JsonNode root = objectMapper.readTree(json);
      Deque<JsonNode> queue = new ArrayDeque<>();
      queue.add(root);
      int maxDepth = 20;

      while (!queue.isEmpty() && maxDepth-- > 0) {
        int size = queue.size();
        for (int i = 0; i < size; i++) {
          JsonNode current = queue.poll();
          if (current == null) {
            continue;
          }
          if (current.isObject()) {
            JsonNode field = current.get(fieldName);
            if (field != null && field.isTextual() && StrUtil.isNotBlank(field.asText())) {
              return field.asText().trim();
            }
            current.fields().forEachRemaining(e -> queue.add(e.getValue()));
          } else if (current.isArray()) {
            for (JsonNode item : current) {
              queue.add(item);
            }
          }
        }
      }
    } catch (Exception e) {
      log.debug("Failed to extract field '{}' from JSON: {}", fieldName, e.getMessage());
    }
    return null;
  }

  private String extractMetaDescription(String html) {
    Matcher m = META_DESC_PATTERN.matcher(html);
    if (m.find()) {
      String content = m.group(1);
      if (StrUtil.isNotBlank(content)) {
        return content.trim();
      }
    }
    return null;
  }

  private String extractTitle(String html) {
    Matcher m = TITLE_PATTERN.matcher(html);
    if (m.find()) {
      String title = m.group(1).trim();
      if (title.endsWith(" - 小红书")) {
        title = title.substring(0, title.length() - 5);
      }
      return title;
    }
    return null;
  }

  private String stripHtml(String html) {
    return html.replaceAll("<script[^>]*?>[\\s\\S]*?</script>", "")
        .replaceAll("<style[^>]*?>[\\s\\S]*?</style>", "")
        .replaceAll("<[^>]+>", " ")
        .replaceAll("\\s+", " ")
        .trim();
  }

  private boolean isMeaningfulContent(String body) {
    if (StrUtil.isBlank(body)) {
      return false;
    }
    String compact = body.replaceAll("\\s+", "");
    if (compact.length() < 30) {
      return false;
    }
    String lower = compact.toLowerCase();
    return !lower.equals("found")
        && !lower.equals("found.")
        && !lower.equals("notfound")
        && !lower.equals("notfound.")
        && !lower.contains("页面不存在");
  }
}
