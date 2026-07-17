import type { ItineraryResponse } from '@/types';

interface Props {
  data: ItineraryResponse;
}

export function ItineraryDisplay({ data }: Props) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
        <h3 className="font-semibold text-blue-900">行程概览</h3>
        <p className="mt-1 text-sm text-blue-800">{data.summary}</p>
      </div>

      {data.estimatedBudget && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4">
          <h3 className="font-semibold text-green-900">预算估算</h3>
          <p className="mt-1 text-sm text-green-800">{data.estimatedBudget}</p>
        </div>
      )}

      {data.days && data.days.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">每日行程</h3>
          {data.days.map((day) => (
            <div key={day.day} className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-900">
                  第 {day.day} 天{day.date ? `（${day.date}）` : ''}
                </h4>
                {day.theme && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                    {day.theme}
                  </span>
                )}
              </div>

              {day.schedule && day.schedule.length > 0 && (
                <div className="space-y-2 mb-3">
                  {day.schedule.map((item, i) => (
                    <div key={i} className="flex gap-3 text-sm">
                      <span className="text-gray-500 w-16 shrink-0">{item.period}</span>
                      <div>
                        <p className="text-gray-800">{item.description}</p>
                        {item.poi && (
                          <p className="text-xs text-gray-500">
                            {item.poi.name}
                            {item.poi.address && ` · ${item.poi.address}`}
                            {item.poi.admissionFee && ` · ${item.poi.admissionFee}`}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {day.meals && day.meals.length > 0 && (
                <div className="border-t pt-3 mt-3 space-y-1">
                  {day.meals.map((meal, i) => (
                    <p key={i} className="text-sm text-gray-700">
                      <span className="font-medium">{meal.type}</span>:{' '}
                      {meal.recommendation}
                      {meal.estimatedCost && (
                        <span className="text-gray-500">（{meal.estimatedCost}）</span>
                      )}
                    </p>
                  ))}
                </div>
              )}

              {day.tip && (
                <p className="text-xs text-amber-700 mt-2">小贴士：{day.tip}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {data.tips && data.tips.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
          <h3 className="font-semibold text-amber-900">出行提示</h3>
          <ul className="mt-2 space-y-1">
            {data.tips.map((tip, i) => (
              <li key={i} className="text-sm text-amber-800 flex gap-2">
                <span className="shrink-0">•</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
