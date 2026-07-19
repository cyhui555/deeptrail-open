import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANDROID_HANDLE_ALL_URLS_RELATION,
  createAndroidAssetLinks,
  normalizeCertificateSha256,
} from '../../../apps/web/src/lib/androidAppVerification.mjs';
import { inspectAndroidReadiness } from '../readiness.mjs';

const validFingerprint = Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, '0')).join(':');
const validManifest = {
  id: '/',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
};

test('合法 Android 身份只生成 handle_all_urls 关系', () => {
  const assetLinks = createAndroidAssetLinks({
    packageId: 'com.deeptrail.app',
    certificateSha256: validFingerprint,
  });

  assert.deepEqual(assetLinks, [{
    relation: [ANDROID_HANDLE_ALL_URLS_RELATION],
    target: {
      namespace: 'android_app',
      package_name: 'com.deeptrail.app',
      sha256_cert_fingerprints: [validFingerprint.toUpperCase()],
    },
  }]);
});

test('非法或不完整身份不会生成站点信任关系', () => {
  assert.equal(createAndroidAssetLinks({
    packageId: 'DeepTrail',
    certificateSha256: validFingerprint,
  }), null);
  assert.equal(createAndroidAssetLinks({
    packageId: 'com.deeptrail.app',
    certificateSha256: 'AA:BB',
  }), null);
});

test('证书指纹接受紧凑格式并归一为冒号格式', () => {
  const compact = validFingerprint.replaceAll(':', '');
  assert.equal(normalizeCertificateSha256(compact), validFingerprint.toUpperCase());
});

test('完整基础配置通过 Android 就绪检查', () => {
  const result = inspectAndroidReadiness({
    publicOrigin: 'https://app.deeptrail.example.com',
    packageId: 'com.deeptrail.app',
    certificateSha256: validFingerprint,
    manifest: validManifest,
    serviceWorkerExists: true,
    manifestLinkPresent: true,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('明文 Origin 与不稳定 Manifest 被失败关闭', () => {
  const result = inspectAndroidReadiness({
    publicOrigin: 'http://app.deeptrail.example.com/path',
    packageId: 'com.deeptrail.app',
    certificateSha256: validFingerprint,
    manifest: { ...validManifest, id: undefined },
    serviceWorkerExists: true,
    manifestLinkPresent: true,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /HTTPS Origin/);
  assert.match(result.errors.join('\n'), /id、start_url 和 scope/);
});
