import { NextResponse } from 'next/server';
import { createAndroidAssetLinksFromEnvironment } from '@/lib/androidAppVerification.mjs';

export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  const assetLinks = createAndroidAssetLinksFromEnvironment();

  if (!assetLinks) {
    // 未配置或非法配置必须失败关闭，不能发布空关系或猜测签名身份。
    return NextResponse.json(
      { error: 'Not Found' },
      {
        status: 404,
        headers: {
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  }

  return NextResponse.json(assetLinks, {
    headers: {
      'Cache-Control': 'public, max-age=300, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
