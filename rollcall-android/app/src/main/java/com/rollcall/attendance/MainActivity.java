package com.rollcall.attendance;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {
    private static final String START_ORIGIN = "https://rollcallandroidhub.pages.dev";
    private static final String START_URL = START_ORIGIN + "/#home";
    private static final String OFFLINE_BASE_URL = "https://offline.rollcall.local/";
    private static final int PERMISSION_REQUEST_CODE = 1001;
    private static final String NOTIFICATION_CHANNEL_ID = "attendance_channel";
    private static final String NOTIFICATION_CHANNEL_NAME = "Attendance";
    private static final String[] REQUIRED_PERMISSIONS = new String[] {
            Manifest.permission.CAMERA,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
    };
    private static final String OFFLINE_HTML = "<!doctype html>\n"
            + "<html lang='en'>\n"
            + "<head>\n"
            + "  <meta charset='utf-8'/>\n"
            + "  <meta name='viewport' content='width=device-width, initial-scale=1'/>\n"
            + "  <title>Offline</title>\n"
            + "  <style>\n"
            + "    :root { color-scheme: light; }\n"
            + "    * { box-sizing: border-box; }\n"
            + "    body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6fb; color: #0f172a; }\n"
            + "    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 32px; }\n"
            + "    .card { width: 100%; max-width: 420px; background: #fff; border-radius: 20px; padding: 28px; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12); text-align: center; }\n"
            + "    .icon { width: 72px; height: 72px; margin: 0 auto 16px; border-radius: 18px; background: #eef2ff; display: grid; place-items: center; color: #4f46e5; font-size: 34px; }\n"
            + "    h1 { font-size: 20px; margin: 8px 0; }\n"
            + "    p { font-size: 14px; color: #475569; margin: 6px 0 18px; }\n"
            + "    button { width: 100%; border: none; background: #4f46e5; color: #fff; padding: 12px 16px; font-size: 14px; font-weight: 700; border-radius: 12px; cursor: pointer; }\n"
            + "    button:active { transform: scale(0.98); }\n"
            + "    .hint { margin-top: 12px; font-size: 12px; color: #94a3b8; }\n"
            + "  </style>\n"
            + "</head>\n"
            + "<body>\n"
            + "  <div class='wrap'>\n"
            + "    <div class='card'>\n"
            + "      <div class='icon'>!</div>\n"
            + "      <h1>You are offline</h1>\n"
            + "      <p>Please check your internet connection and try again.</p>\n"
            + "      <button id='retry'>Refresh</button>\n"
            + "      <div class='hint'>RollCall will reconnect automatically once you are online.</div>\n"
            + "    </div>\n"
            + "  </div>\n"
            + "  <script>\n"
            + "    const retry = document.getElementById('retry');\n"
            + "    retry.addEventListener('click', () => {\n"
            + "      if (window.AndroidDevice && typeof window.AndroidDevice.reloadApp === 'function') {\n"
            + "        window.AndroidDevice.reloadApp();\n"
            + "      } else {\n"
            + "        window.location.reload();\n"
            + "      }\n"
            + "    });\n"
            + "  </script>\n"
            + "</body>\n"
            + "</html>";

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private boolean showingOffline = false;

    private final ActivityResultLauncher<Intent> fileChooserLauncher =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
                if (filePathCallback == null) {
                    return;
                }

                Uri[] results = null;
                if (result.getResultCode() == Activity.RESULT_OK) {
                    Intent data = result.getData();
                    if (data != null) {
                        if (data.getClipData() != null) {
                            int count = data.getClipData().getItemCount();
                            results = new Uri[count];
                            for (int i = 0; i < count; i++) {
                                results[i] = data.getClipData().getItemAt(i).getUri();
                            }
                        } else if (data.getData() != null) {
                            results = new Uri[] { data.getData() };
                        }
                    }
                }

                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            });

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.web_view);
        requestMissingPermissions();
        createNotificationChannel();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " RollCallWebView");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                if (url != null && !url.startsWith(OFFLINE_BASE_URL)) {
                    showingOffline = false;
                }
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                handleMainFrameError(errorCode, failingUrl);
            }

            @Override
            public void onReceivedError(WebView view, android.webkit.WebResourceRequest request, android.webkit.WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    int code = error != null ? error.getErrorCode() : WebViewClient.ERROR_UNKNOWN;
                    String url = request.getUrl() != null ? request.getUrl().toString() : "";
                    handleMainFrameError(code, url);
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, android.webkit.WebResourceRequest request, android.webkit.WebResourceResponse errorResponse) {
                if (request != null && request.isForMainFrame() && errorResponse != null) {
                    int statusCode = errorResponse.getStatusCode();
                    if (statusCode == 404 || statusCode == 500 || statusCode == 503) {
                        handleMainFrameError(WebViewClient.ERROR_UNKNOWN, request.getUrl().toString());
                    }
                }
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;

                Intent intent = fileChooserParams.createIntent();
                try {
                    fileChooserLauncher.launch(intent);
                } catch (ActivityNotFoundException error) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                boolean granted = hasLocationPermission();
                callback.invoke(origin, granted, false);
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
                    return;
                }
                runOnUiThread(() -> {
                    if (hasCameraPermission()) {
                        request.grant(request.getResources());
                    } else {
                        request.deny();
                    }
                });
            }
        });

        webView.addJavascriptInterface(new DeviceBridge(), "AndroidDevice");
        webView.loadUrl(START_URL);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    private void requestMissingPermissions() {
        List<String> missing = new ArrayList<>();
        for (String permission : REQUIRED_PERMISSIONS) {
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                missing.add(permission);
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                missing.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        }

        if (!missing.isEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        }
    }

    private boolean hasCameraPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                NOTIFICATION_CHANNEL_NAME,
                NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("Attendance status notifications");
        manager.createNotificationChannel(channel);
    }

    private void postAttendanceNotification(String title, String message) {
        if (!hasNotificationPermission()) {
            return;
        }

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            return;
        }

        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                intent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                        ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
                        : PendingIntent.FLAG_UPDATE_CURRENT
        );

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
                : new Notification.Builder(this);

        Notification notification = builder
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(message)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .build();

        int notificationId = (int) (System.currentTimeMillis() & 0xfffffff);
        manager.notify(notificationId, notification);
    }

    private void handleMainFrameError(int errorCode, String failingUrl) {
        if (showingOffline) {
            return;
        }
        if (!isOfflineError(errorCode)) {
            return;
        }
        showingOffline = true;
        if (webView != null) {
            webView.loadDataWithBaseURL(OFFLINE_BASE_URL, OFFLINE_HTML, "text/html", "UTF-8", null);
        }
    }

    private boolean isOfflineError(int errorCode) {
        return errorCode == WebViewClient.ERROR_HOST_LOOKUP
                || errorCode == WebViewClient.ERROR_CONNECT
                || errorCode == WebViewClient.ERROR_TIMEOUT
                || errorCode == WebViewClient.ERROR_UNKNOWN;
    }

    private class DeviceBridge {
        @JavascriptInterface
        public String getDeviceId() {
            String id = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
            return id != null ? id : "";
        }

        @JavascriptInterface
        public void showNotification(String title, String message) {
            runOnUiThread(() -> postAttendanceNotification(title, message));
        }

        @JavascriptInterface
        public void reloadApp() {
            runOnUiThread(() -> {
                if (webView != null) {
                    webView.loadUrl(START_URL);
                }
            });
        }
    }
}
