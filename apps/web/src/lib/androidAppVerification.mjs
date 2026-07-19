const PACKAGE_ID_PATTERN = /^(?:[a-z][a-z0-9_]*\.)+[a-z][a-z0-9_]*$/;
const CERTIFICATE_SHA256_PATTERN = /^[0-9A-F]{64}$/;

export const ANDROID_HANDLE_ALL_URLS_RELATION = 'delegate_permission/common.handle_all_urls';

/**
 * Android application ID 会成为长期发布身份，因此只接受可预测的小写 Java 包名格式。
 */
export function normalizeAndroidPackageId(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (normalized.length > 255 || !PACKAGE_ID_PATTERN.test(normalized)) return null;
  return normalized;
}

/**
 * keytool 常输出冒号分隔指纹；统一为 Digital Asset Links 使用的大写冒号格式。
 */
export function normalizeCertificateSha256(value) {
  if (typeof value !== 'string') return null;
  const compact = value.trim().replaceAll(':', '').replaceAll('-', '').toUpperCase();
  if (!CERTIFICATE_SHA256_PATTERN.test(compact)) return null;
  return compact.match(/.{2}/g)?.join(':') ?? null;
}

/**
 * 只有包名和签名指纹同时有效才建立信任关系，避免半配置状态误授权其他应用。
 */
export function createAndroidAssetLinks({ packageId, certificateSha256 }) {
  const normalizedPackageId = normalizeAndroidPackageId(packageId);
  const normalizedCertificateSha256 = normalizeCertificateSha256(certificateSha256);
  if (!normalizedPackageId || !normalizedCertificateSha256) return null;

  return [
    {
      relation: [ANDROID_HANDLE_ALL_URLS_RELATION],
      target: {
        namespace: 'android_app',
        package_name: normalizedPackageId,
        sha256_cert_fingerprints: [normalizedCertificateSha256],
      },
    },
  ];
}

export function createAndroidAssetLinksFromEnvironment(environment = process.env) {
  return createAndroidAssetLinks({
    packageId: environment.DEEPTRAIL_ANDROID_PACKAGE_ID,
    certificateSha256: environment.DEEPTRAIL_ANDROID_CERT_SHA256,
  });
}
