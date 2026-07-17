import http from 'node:http';

function textContent(body) {
  try {
    const payload = JSON.parse(body);
    return (payload.messages || [])
      .map((message) => {
        if (typeof message.content === 'string') {
          return message.content;
        }
        if (Array.isArray(message.content)) {
          return message.content.map((item) => item.text || '').join('\n');
        }
        return '';
      })
      .join('\n');
  } catch {
    return body;
  }
}

function poi(name, category, address, latitude, longitude) {
  return {
    name,
    category,
    address,
    latitude,
    longitude,
    estimatedVisitTime: category === '餐厅' ? '1小时' : '2小时',
    openingHours: '08:00-21:00',
    admissionFee: category === '景点' ? '免费' : '',
    phone: '',
    rating: '4.8星',
  };
}

function itinerary(prompt) {
  const daysMatch = prompt.match(/出行天数[：:]\s*(\d+)/);
  const destinationMatch = prompt.match(/目的地[：:]\s*([^\n]+)/);
  const dayCount = Math.min(Math.max(Number(daysMatch?.[1] || 3), 1), 10);
  const destination = destinationMatch?.[1]?.trim() || '测试目的地';
  const days = [];

  for (let index = 0; index < dayCount; index += 1) {
    const day = index + 1;
    const latitude = 30.25 + index * 0.01;
    const longitude = 120.15 + index * 0.01;
    days.push({
      day,
      date: `2026-08-${String(day).padStart(2, '0')}`,
      theme: `${destination}第${day}天城市漫游`,
      schedule: [
        {
          period: '上午',
          description: `游览${destination}历史街区，了解当地文化与城市故事。`,
          poi: poi(`${destination}历史街区${day}`, '景点', `${destination}中心区${day}号`, latitude, longitude),
          estimatedDuration: '2小时',
          estimatedCost: '免费',
          transport_segments: [
            { mode: 'WALK', durationMin: 12, description: '步行前往下一站' },
          ],
        },
        {
          period: '下午',
          description: `参观${destination}城市博物馆，体验代表性展览。`,
          poi: poi(
            `${destination}城市博物馆${day}`,
            '景点',
            `${destination}文化路${day}号`,
            latitude + 0.004,
            longitude + 0.004,
          ),
          estimatedDuration: '2小时',
          estimatedCost: '约50元',
          transport_segments: [
            { mode: 'WALK', durationMin: 15, description: '步行前往晚间活动' },
          ],
        },
        {
          period: '晚上',
          description: `漫步${destination}夜景步道，品尝本地特色小吃。`,
          poi: poi(
            `${destination}夜景步道${day}`,
            '景点',
            `${destination}滨河路${day}号`,
            latitude + 0.008,
            longitude + 0.008,
          ),
          estimatedDuration: '1.5小时',
          estimatedCost: '约80元',
        },
      ],
      meals: [
        {
          type: '午餐',
          recommendation: `${destination}特色午餐`,
          poi: poi(
            `${destination}风味餐厅${day}`,
            '餐厅',
            `${destination}美食街${day}号`,
            latitude + 0.002,
            longitude + 0.002,
          ),
          estimatedCost: '约60元/人',
        },
        {
          type: '晚餐',
          recommendation: `${destination}当地晚餐`,
          poi: poi(
            `${destination}夜市餐厅${day}`,
            '餐厅',
            `${destination}夜市${day}号`,
            latitude + 0.006,
            longitude + 0.006,
          ),
          estimatedCost: '约80元/人',
        },
      ],
      accommodation: {
        ...poi(
          `${destination}中心酒店`,
          '住宿',
          `${destination}中心大道1号`,
          latitude + 0.003,
          longitude + 0.003,
        ),
        estimatedCost: '约300元/晚',
      },
      transportation: '地铁与步行为主，同一区域内减少折返。',
      tip: '请预留休息时间，并根据天气调整户外安排。',
    });
  }

  return {
    summary: `${destination}${dayCount}日测试行程，兼顾历史文化、城市漫游与本地美食，节奏舒适且路线集中。`,
    days,
    tips: ['提前预约热门场馆', '携带雨具和舒适步行鞋', '出行前核对营业时间'],
    estimatedBudget: `预计每人${dayCount * 500}元左右`,
  };
}

function responseContent(prompt) {
  if (prompt.includes('旅程回顾') || prompt.includes('旅行总结') || prompt.includes('打卡完成率')) {
    return '这是一段充实而有节奏的旅程。你完成了主要打卡目标，也为下一次旅行留下了清晰回忆。';
  }

  const result = itinerary(prompt);
  if (prompt.includes('优化目标') || prompt.includes('当前行程')) {
    return JSON.stringify({
      ...result,
      changes: [],
      reasoning: '测试环境采用确定性优化结果，保持路线集中并降低往返。',
    });
  }
  return JSON.stringify(result);
}

/**
 * 启动 OpenAI-compatible 测试替身。
 *
 * <p>该服务只在 E2E 启动器进程内存在，不读取真实密钥，也不访问外部网络。
 */
export async function startMockAiServer(port = 18080) {
  const server = http.createServer((request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      const prompt = textContent(body);
      const content = responseContent(prompt);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        id: 'deeptrail-e2e-mock',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: 'deeptrail-e2e-mock',
        choices: [{
          index: 0,
          message: { role: 'assistant', content },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 50, total_tokens: 60 },
      }));
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  console.log(`AI 测试替身已就绪：http://127.0.0.1:${port}`);
  return server;
}
