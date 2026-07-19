import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { inspectAndroidReadiness } from './readiness.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const manifestPath = resolve(repositoryRoot, 'apps/web/public/manifest.json');
const serviceWorkerPath = resolve(repositoryRoot, 'apps/web/public/sw.js');
const rootLayoutPath = resolve(repositoryRoot, 'apps/web/src/app/layout.tsx');

async function fileExists(path) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const rootLayout = await readFile(rootLayoutPath, 'utf8');
  const result = inspectAndroidReadiness({
    publicOrigin: process.env.DEEPTRAIL_PUBLIC_ORIGIN,
    packageId: process.env.DEEPTRAIL_ANDROID_PACKAGE_ID,
    certificateSha256: process.env.DEEPTRAIL_ANDROID_CERT_SHA256,
    manifest,
    serviceWorkerExists: await fileExists(serviceWorkerPath),
    manifestLinkPresent: rootLayout.includes('rel="manifest" href="/manifest.json"'),
  });

  if (!result.ok) {
    console.error('Android App 就绪检查失败：');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log('Android App 基础配置就绪');
  console.log(`Origin: ${result.normalized.publicOrigin}`);
  console.log(`Application ID: ${result.normalized.packageId}`);
  console.log('Digital Asset Links: valid');
}

main().catch((error) => {
  console.error(`Android App 就绪检查异常：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
