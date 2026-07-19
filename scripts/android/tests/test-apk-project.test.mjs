import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

async function read(relativePath) {
  return readFile(resolve(repositoryRoot, relativePath), 'utf8');
}

test('测试 APK 固定 debug 身份并禁用 release 变体', async () => {
  const buildFile = await read('apps/android/app/build.gradle');
  assert.match(buildFile, /applicationId 'com\.deeptrail\.app'/);
  assert.match(buildFile, /applicationIdSuffix '\.debug'/);
  assert.match(buildFile, /withBuildType\('release'\)/);
  assert.match(buildFile, /variantBuilder\.enable = false/);
  assert.doesNotMatch(buildFile, /https?:\/\/\d{1,3}(?:\.\d{1,3}){3}/);
});

test('WebView 不建立 JavaScript 桥且保持文件、混合内容和跨域边界', async () => {
  const activity = await read('apps/android/app/src/main/java/com/deeptrail/app/MainActivity.java');
  assert.match(activity, /setAllowFileAccess\(false\)/);
  assert.match(activity, /setAllowContentAccess\(false\)/);
  assert.match(activity, /MIXED_CONTENT_NEVER_ALLOW/);
  assert.match(activity, /isSameOrigin\(target\)/);
  assert.doesNotMatch(activity, /addJavascriptInterface/);
  assert.doesNotMatch(activity, /proceed\(\)/);
});

test('远程构建仅产出 debug APK 且 Action 固定完整 SHA', async () => {
  const workflow = await read('.github/workflows/android-test-apk.yml');
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.match(workflow, /lintDebug assembleDebug/);
  assert.match(workflow, /apksigner" verify --verbose/);
  assert.match(workflow, /test "\$application_id" = "com\.deeptrail\.app\.debug"/);
  assert.match(workflow, /signatureVerified=true/);
  assert.doesNotMatch(workflow, /assembleRelease|bundleRelease|contents: write/);
  const actionRefs = [...workflow.matchAll(/uses:\s+[^@\s]+@([^\s#]+)/g)].map((match) => match[1]);
  assert.ok(actionRefs.length >= 4);
  for (const ref of actionRefs) assert.match(ref, /^[0-9a-f]{40}$/);
});
