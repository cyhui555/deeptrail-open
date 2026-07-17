package com.ai.travel.service;

import com.ai.travel.dto.response.ItineraryResponse;

/**
 * 小红书行程生成结果，包含 AI 返回的行程和解析后的笔记内容。
 *
 * <p>笔记内容用于后续审计持久化到 {@code itinerary_task.parsed_content}。
 */
public record XiaohongshuResult(ItineraryResponse response, String parsedContent) {
}
