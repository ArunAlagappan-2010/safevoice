package app.safevoice;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.net.HttpURLConnection;
import java.net.URL;

/**
 * SafeVoice for Android: a full-screen window onto the SafeVoice server running on
 * the counsellor's laptop (default: the laptop's own Wi-Fi hotspot address).
 *
 * What the app adds over the browser:
 *  - It keeps talking to the school Wi-Fi even when that Wi-Fi has no internet
 *    and the phone would rather use mobile data (Android otherwise routes around it).
 *  - If the server can't be reached it shows the last copy of SafeVoice it saw, so
 *    a student can still write a report (it is sent when the connection is back),
 *    or a local screen with the helplines and the Wi-Fi steps.
 *  - Quick exit closes the app and removes it from the recent-apps list, and the
 *    recent-apps preview never shows what was on screen.
 */
public class MainActivity extends Activity {
    static final String DEFAULT_SERVER = "http://192.168.137.1:3000/";
    static final String OFFLINE_PAGE = "file:///android_asset/offline.html";

    private WebView web;
    private SharedPreferences prefs;
    private ConnectivityManager cm;
    private ConnectivityManager.NetworkCallback wifiCallback;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private boolean triedCache;
    private boolean showingOffline;
    private Thread prober;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = getSharedPreferences("safevoice", MODE_PRIVATE);
        if (Build.VERSION.SDK_INT >= 33) setRecentsScreenshotEnabled(false);

        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setUserAgentString(s.getUserAgentString() + " SafeVoiceApp/1.0");
        web.addJavascriptInterface(new Bridge(), "SafeVoiceApp");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new Client());

        bindToWifi();
        load();
    }

    String server() {
        return prefs.getString("server", DEFAULT_SERVER);
    }

    void load() {
        triedCache = false;
        showingOffline = false;
        web.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
        web.loadUrl(server());
    }

    void showOffline() {
        showingOffline = true;
        web.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
        web.loadUrl(OFFLINE_PAGE);
        startProbing();
    }

    /** While the offline screen is up, check every few seconds whether the server is back. */
    void startProbing() {
        if (prober != null && prober.isAlive()) return;
        prober = new Thread(() -> {
            while (showingOffline) {
                if (reachable()) { ui.post(this::load); return; }
                try { Thread.sleep(3000); } catch (InterruptedException e) { return; }
            }
        });
        prober.setDaemon(true);
        prober.start();
    }

    boolean reachable() {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(server() + "api/info").openConnection();
            c.setConnectTimeout(2500);
            c.setReadTimeout(2500);
            return c.getResponseCode() == 200;
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /**
     * A hotspot with no internet is "unvalidated", so Android sends app traffic over
     * mobile data instead and the laptop can't be reached. Pin this app to Wi-Fi
     * whenever Wi-Fi is up.
     */
    void bindToWifi() {
        if (Build.VERSION.SDK_INT < 23) return;
        cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        NetworkRequest req = new NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build();
        wifiCallback = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network n) {
                cm.bindProcessToNetwork(n);
                ui.post(() -> { if (showingOffline) load(); });
            }
            @Override public void onLost(Network n) {
                cm.bindProcessToNetwork(null);
            }
        };
        try { cm.registerNetworkCallback(req, wifiCallback); } catch (Exception ignored) { }
    }

    class Client extends WebViewClient {
        @Override
        @SuppressWarnings("deprecation")
        public void onReceivedError(WebView view, int code, String desc, String url) {
            // Only called for the main page. First try the copy we saw last time.
            if (url != null && url.startsWith("file:")) return;
            if (!triedCache) {
                triedCache = true;
                view.getSettings().setCacheMode(WebSettings.LOAD_CACHE_ONLY);
                view.loadUrl(server());
            } else {
                showOffline();
            }
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            // Back to normal so reports and replies always go to the live server.
            view.getSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            Uri u = Uri.parse(url);
            String scheme = u.getScheme() == null ? "" : u.getScheme();
            if (scheme.equals("tel")) {
                startActivity(new Intent(Intent.ACTION_DIAL, u));
                return true;
            }
            if (scheme.equals("file") || url.startsWith(server())) return false;
            Uri home = Uri.parse(server());
            if (home.getHost() != null && home.getHost().equals(u.getHost())) return false;
            try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
            return true;
        }
    }

    /** Called from JavaScript as window.SafeVoiceApp. */
    class Bridge {
        @JavascriptInterface public String server() { return MainActivity.this.server(); }

        @JavascriptInterface public void retry() { ui.post(MainActivity.this::load); }

        @JavascriptInterface public void setServer(String address) {
            String a = address == null ? "" : address.trim();
            if (a.isEmpty()) a = DEFAULT_SERVER;
            if (!a.startsWith("http://") && !a.startsWith("https://")) a = "http://" + a;
            if (!a.endsWith("/")) a = a + "/";
            if (Uri.parse(a).getHost() == null) return;
            prefs.edit().putString("server", a).apply();
            ui.post(MainActivity.this::load);
        }

        @JavascriptInterface public void exit() {
            ui.post(() -> {
                web.clearHistory();
                finishAndRemoveTask();
            });
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        showingOffline = false;
        if (cm != null && wifiCallback != null) {
            try { cm.unregisterNetworkCallback(wifiCallback); } catch (Exception ignored) { }
        }
        web.destroy();
        super.onDestroy();
    }
}
