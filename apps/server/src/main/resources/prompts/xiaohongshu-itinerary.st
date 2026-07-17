你是一位专业的旅行规划师。以下是一篇小红书笔记的文本内容，请从中提取旅行相关信息，生成一份结构化的行程规划。

小红书笔记内容：
$noteContent$

$extraInstructions$

请按以下 JSON 格式输出（注意：summary 是对整篇行程的概括，用中文）：
{
  "summary": "行程概括",
  "days": [
    {
      "day": 1,
      "date": "第1天",
      "theme": "当天主题",
      "schedule": [
        {
          "period": "时段",
          "description": "活动描述",
          "poi": { "name": "地点名称", "address": "地址", "category": "景点" },
          "estimatedDuration": "建议时长",
          "estimatedCost": "预计费用"
        }
      ],
      "meals": [
        {
          "type": "餐型",
          "recommendation": "餐饮说明",
          "poi": { "name": "餐厅名称", "category": "餐厅" },
          "estimatedCost": "预计费用"
        }
      ],
      "accommodation": { "name": "住宿名称", "category": "住宿" },
      "transportation": "交通建议",
      "tip": "注意事项"
    }
  ],
  "tips": ["提示1", "提示2"],
  "estimatedBudget": "费用说明"
}

## 格式约束（重要）
- 输出必须使用严格的 JSON 格式。
- 不要使用 markdown 代码块标记。
- 不要包含任何 JSON 之外的说明文字。
