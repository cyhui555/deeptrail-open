package com.ai.travel.service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

/** 根据文件头校验媒体内容，防止仅修改扩展名绕过上传白名单。 */
@Component
public class MediaContentValidator {

  private static final int HEADER_SIZE = 64;
  private static final byte[] JPEG_SIGNATURE = {(byte) 0xff, (byte) 0xd8, (byte) 0xff};
  private static final byte[] PNG_SIGNATURE = {
      (byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
  };
  private static final Set<String> HEIC_BRANDS = Set.of(
      "heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1",
      "avif", "avis");

  /**
   * 校验上传文件的真实格式是否与扩展名兼容。
   *
   * @param file 上传文件
   * @param extension 已规范化为小写的扩展名
   */
  public void validate(MultipartFile file, String extension) {
    if (file == null || file.isEmpty()) {
      throw new IllegalArgumentException("文件不能为空");
    }

    byte[] header = readHeader(file);
    boolean valid = switch (extension.toLowerCase(Locale.ROOT)) {
      case "jpg", "jpeg" -> startsWith(header, JPEG_SIGNATURE);
      case "png" -> startsWith(header, PNG_SIGNATURE);
      case "webp" -> hasAscii(header, 0, "RIFF") && hasAscii(header, 8, "WEBP");
      case "heic" -> hasIsoBrand(header, HEIC_BRANDS);
      case "mp4", "m4v" -> isIsoMedia(header) && !hasIsoBrand(header, HEIC_BRANDS);
      case "mov" -> isQuickTimeOrIsoVideo(header);
      default -> false;
    };
    if (!valid) {
      throw new IllegalArgumentException("文件内容与扩展名不匹配");
    }
  }

  private byte[] readHeader(MultipartFile file) {
    try (InputStream input = file.getInputStream()) {
      return input.readNBytes(HEADER_SIZE);
    } catch (IOException exception) {
      throw new IllegalArgumentException("无法读取上传文件", exception);
    }
  }

  private boolean isQuickTimeOrIsoVideo(byte[] header) {
    return (isIsoMedia(header) && !hasIsoBrand(header, HEIC_BRANDS))
        || hasAscii(header, 4, "moov");
  }

  private boolean isIsoMedia(byte[] header) {
    return hasAscii(header, 4, "ftyp");
  }

  private boolean hasIsoBrand(byte[] header, Set<String> brands) {
    if (!isIsoMedia(header)) {
      return false;
    }
    // ISO BMFF 的 major brand 与 compatible brands 均按 4 字节排列。
    for (int offset = 8; offset + 4 <= header.length; offset += 4) {
      String brand = new String(header, offset, 4, StandardCharsets.US_ASCII);
      if (brands.contains(brand)) {
        return true;
      }
    }
    return false;
  }

  private boolean startsWith(byte[] content, byte[] signature) {
    if (content.length < signature.length) {
      return false;
    }
    for (int index = 0; index < signature.length; index++) {
      if (content[index] != signature[index]) {
        return false;
      }
    }
    return true;
  }

  private boolean hasAscii(byte[] content, int offset, String expected) {
    byte[] signature = expected.getBytes(StandardCharsets.US_ASCII);
    if (offset < 0 || offset + signature.length > content.length) {
      return false;
    }
    for (int index = 0; index < signature.length; index++) {
      if (content[offset + index] != signature[index]) {
        return false;
      }
    }
    return true;
  }
}
