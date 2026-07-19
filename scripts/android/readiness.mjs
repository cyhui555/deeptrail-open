import {
  createAndroidAssetLinks,
  normalizeAndroidPackageId,
  normalizeCertificateSha256,
} from '../../apps/web/src/lib/androidAppVerification.mjs';

function normalizePublicOrigin(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;

  try {
    const origin = new URL(value.trim());
    if (origin.protocol !== 'https:'
        || origin.username
        || origin.password
        || origin.pathname !== '/'
        || origin.search
        || origin.hash) {
      return null;
    }
    return origin.origin;
  } catch {
    return null;
  }
}

function hasRequiredIcon(manifest, size) {
  return Array.isArray(manifest.icons) && manifest.icons.some((icon) => {
    if (!icon || icon.type !== 'image/png' || typeof icon.sizes !== 'string') return false;
    return icon.sizes.split(/\s+/).includes(`${size}x${size}`);
  });
}

/**
 * 检查范围只覆盖首个 Android 切片的确定性前置条件，不连接网络、签名或目标环境。
 */
export function inspectAndroidReadiness({
  publicOrigin,
  packageId,
  certificateSha256,
  manifest,
  serviceWorkerExists,
  manifestLinkPresent,
}) {
  const errors = [];
  const normalizedOrigin = normalizePublicOrigin(publicOrigin);
  const normalizedPackageId = normalizeAndroidPackageId(packageId);
  const normalizedCertificateSha256 = normalizeCertificateSha256(certificateSha256);

  if (!normalizedOrigin) {
    errors.push('DEEPTRAIL_PUBLIC_ORIGIN 必须是无凭据、路径、查询或片段的 HTTPS Origin');
  }
  if (!normalizedPackageId) {
    errors.push('DEEPTRAIL_ANDROID_PACKAGE_ID 必须是至少两段的小写 Android application ID');
  }
  if (!normalizedCertificateSha256) {
    errors.push('DEEPTRAIL_ANDROID_CERT_SHA256 必须是 32 字节 SHA-256 证书指纹');
  }
  if (!manifest || manifest.id !== '/' || manifest.start_url !== '/' || manifest.scope !== '/') {
    errors.push('PWA Manifest 的 id、start_url 和 scope 必须固定为 /');
  }
  if (manifest?.display !== 'standalone') {
    errors.push('PWA Manifest 的 display 必须是 standalone');
  }
  if (!hasRequiredIcon(manifest, 192) || !hasRequiredIcon(manifest, 512)) {
    errors.push('PWA Manifest 必须包含 PNG 192x192 与 512x512 图标');
  }
  if (!serviceWorkerExists) {
    errors.push('PWA 必须保留 /sw.js');
  }
  if (!manifestLinkPresent) {
    errors.push('根布局必须公开 /manifest.json');
  }

  return {
    ok: errors.length === 0,
    errors,
    normalized: {
      publicOrigin: normalizedOrigin,
      packageId: normalizedPackageId,
      certificateSha256: normalizedCertificateSha256,
    },
    assetLinks: createAndroidAssetLinks({ packageId, certificateSha256 }),
  };
}
