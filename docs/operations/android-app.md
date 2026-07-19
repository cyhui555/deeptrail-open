# Android App 基础切片

## 当前边界

Android 首期复用现有 H5/PWA 与同源认证，只补齐稳定应用身份、受浏览器安装条件约束的用户入口、Digital Asset Links 和确定性就绪检查。当前不构建 iOS，不增加推送、支付、原生地图、完整离线或新的业务页面。

另外提供包名为 `com.deeptrail.app.debug` 的“旅迹测试版”WebView APK。它只用于当前 H5 的安装与基础流程验收：URL 在远程构建时注入，使用临时 debug 签名，release 变体被禁用。HTTP 兼容仅存在于 debug 变体，不能作为正式 App 发布。

## 运行配置

正式站点在 `/etc/deeptrail/web.env` 配置：

- `DEEPTRAIL_ANDROID_PACKAGE_ID`：长期稳定的 Android application ID。
- `DEEPTRAIL_ANDROID_CERT_SHA256`：用于签署 Android 安装物的证书 SHA-256 指纹；指纹不是私钥，但变更会影响站点关联。

签名私钥及口令不得写入 Web 环境、Git、日志或本手册。两项配置缺失或格式非法时，`/.well-known/assetlinks.json` 返回 404，避免形成错误信任关系。

## 就绪检查

先通过进程环境提供受信任 HTTPS Origin、application ID 和证书指纹，再从仓库根目录执行：

```powershell
$env:DEEPTRAIL_PUBLIC_ORIGIN = 'https://<正式域名>'
$env:DEEPTRAIL_ANDROID_PACKAGE_ID = 'com.deeptrail.app'
$env:DEEPTRAIL_ANDROID_CERT_SHA256 = '<32 字节 SHA-256 指纹>'
pnpm android:check
pnpm android:test
pnpm android:test:runtime # 需先完成 pnpm build
```

检查只读取配置与仓库内 PWA 资源，不连接站点、不生成签名、不构建 APK/AAB。正式 TWA 打包必须在 HTTPS、Digital Asset Links、Android 工具链与签名归属确认后单独验收。
