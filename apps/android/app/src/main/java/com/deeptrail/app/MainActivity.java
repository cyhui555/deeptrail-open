package com.deeptrail.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final int LOCATION_PERMISSION_REQUEST = 1001;

    private final Uri appOrigin = Uri.parse(BuildConfig.DEEPTRAIL_TEST_URL);
    private WebView webView;
    private GeolocationPermissions.Callback pendingLocationCallback;
    private String pendingLocationOrigin;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(43, 101, 149));
        getWindow().setNavigationBarColor(Color.rgb(241, 231, 216));

        webView = new WebView(this);
        configureWebView(webView);
        setContentView(webView);

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(BuildConfig.DEEPTRAIL_TEST_URL);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView(WebView view) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSafeBrowsingEnabled(true);
        settings.setUserAgentString(settings.getUserAgentString() + " DeepTrailTestApp/0.1");

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(view, false);

        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView currentView, WebResourceRequest request) {
                return handleNavigation(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView currentView, String url) {
                return handleNavigation(Uri.parse(url));
            }

            @Override
            public void onPageFinished(WebView currentView, String url) {
                CookieManager.getInstance().flush();
            }
        });

        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(
                    String origin,
                    GeolocationPermissions.Callback callback
            ) {
                handleGeolocationPrompt(origin, callback);
            }

            @Override
            public void onGeolocationPermissionsHidePrompt() {
                clearPendingLocationRequest(false);
            }
        });
    }

    private boolean handleNavigation(Uri target) {
        if (isSameOrigin(target)) return false;

        String scheme = target.getScheme();
        if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) {
            return true;
        }

        try {
            startActivity(new Intent(Intent.ACTION_VIEW, target));
        } catch (ActivityNotFoundException ignored) {
            Toast.makeText(this, R.string.external_link_unavailable, Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    private boolean isSameOrigin(Uri target) {
        return equalsIgnoreCase(appOrigin.getScheme(), target.getScheme())
                && equalsIgnoreCase(appOrigin.getHost(), target.getHost())
                && normalizedPort(appOrigin) == normalizedPort(target);
    }

    private static boolean equalsIgnoreCase(String left, String right) {
        return left != null && right != null && left.equalsIgnoreCase(right);
    }

    private static int normalizedPort(Uri uri) {
        if (uri.getPort() != -1) return uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private void handleGeolocationPrompt(
            String origin,
            GeolocationPermissions.Callback callback
    ) {
        if (!isSameOrigin(Uri.parse(origin))) {
            callback.invoke(origin, false, false);
            return;
        }

        if (hasLocationPermission()) {
            callback.invoke(origin, true, false);
            return;
        }

        clearPendingLocationRequest(false);
        pendingLocationOrigin = origin;
        pendingLocationCallback = callback;
        requestPermissions(
                new String[]{
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                },
                LOCATION_PERMISSION_REQUEST
        );
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            String[] permissions,
            int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != LOCATION_PERMISSION_REQUEST || pendingLocationCallback == null) return;
        clearPendingLocationRequest(hasLocationPermission());
    }

    private void clearPendingLocationRequest(boolean allowed) {
        if (pendingLocationCallback != null && pendingLocationOrigin != null) {
            pendingLocationCallback.invoke(pendingLocationOrigin, allowed, false);
        }
        pendingLocationCallback = null;
        pendingLocationOrigin = null;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        clearPendingLocationRequest(false);
        webView.stopLoading();
        webView.setWebChromeClient(null);
        webView.setWebViewClient(null);
        webView.destroy();
        super.onDestroy();
    }
}
