package com.willflood.jobs;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.view.View;
import android.webkit.JsResult;
import android.webkit.MimeTypeMap;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import androidx.annotation.NonNull;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String ENTRY_URL = ORIGIN + "/assets/index.html";
    private static final int PICK_FILE = 4101;
    private static final int SAVE_EXPORT = 4102;
    private static final int MAX_REQUEST_CHARACTERS = 280 * 1024;
    // Keep I/O ordered across activity recreation too. An old activity finishing a copy must
    // settle before the replacement activity restores the same durable export metadata.
    private static final ExecutorService EXPORT_IO = Executors.newSingleThreadExecutor();
    private final ExecutorService io = EXPORT_IO;
    private WebView webView;
    private ExportStore exports;
    private ValueCallback<Uri[]> fileCallback;
    private PendingSave pendingSave;
    private boolean printActive;
    private boolean destroyed;
    private boolean resumed;
    private boolean saveResultInProgress;
    private boolean saveResultHandled;
    private boolean recoveryDismissed;
    private boolean interruptedChunksNotice;
    private boolean recoveredWithoutName;
    private AlertDialog recoveryDialog;
    private AlertDialog noticeDialog;
    private AlertDialog exitDialog;
    private OnBackInvokedCallback backCallback;

    private static final class PendingSave {
        final ExportStore.Session session;
        final Reply reply;
        boolean cancelled;
        PendingSave(ExportStore.Session session, Reply reply) {
            this.session = session;
            this.reply = reply;
        }
    }

    private final class Reply {
        final Object id;
        final JavaScriptReplyProxy proxy;
        boolean sent;
        Reply(Object id, JavaScriptReplyProxy proxy) { this.id = id; this.proxy = proxy; }
        void success(JSONObject value) { send(true, value, null); }
        void failure(String message) { send(false, null, message); }
        private void send(boolean ok, JSONObject value, String error) {
            runOnUiThread(() -> {
                if (sent || destroyed) return;
                sent = true;
                JSONObject response = new JSONObject();
                try {
                    response.put("id", id);
                    response.put("ok", ok);
                    if (ok) response.put("result", value == null ? new JSONObject() : value);
                    else response.put("error", error);
                    proxy.postMessage(response.toString());
                } catch (JSONException | IllegalStateException ignored) {
                    // The owning page may have closed. Never log customer data or request payloads.
                }
            });
        }
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(getColor(R.color.jobs_background));
        setContentView(frame);
        ViewCompat.setOnApplyWindowInsetsListener(frame, (view, insets) -> {
            Insets safe = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            return insets;
        });
        ViewCompat.requestApplyInsets(frame);
        exports = new ExportStore(getCacheDir(), getFilesDir());
        io.execute(() -> {
            ExportStore.Recovery recovery = exports.restore();
            runOnUiThread(() -> {
                if (destroyed) return;
                interruptedChunksNotice = recovery.interruptedChunks;
                recoveredWithoutName = recovery.recoveredWithoutName;
                if (recovery.session != null && pendingSave == null
                        && !saveResultInProgress && !saveResultHandled) {
                    pendingSave = new PendingSave(recovery.session, null);
                }
                scheduleRecoveryNotice();
            });
        });

        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            showUnavailable(frame);
            return;
        }

        webView = new WebView(this);
        frame.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        configureWebView();
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        webView.loadUrl(ENTRY_URL);
        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = this::handleBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
    }

    private void showUnavailable(FrameLayout frame) {
        TextView notice = new TextView(this);
        notice.setText("Jobs needs a current Android System WebView. Update Android System WebView or Google Chrome in the Play Store, then reopen Jobs. Your saved app data is kept.");
        notice.setTextSize(18);
        int padding = (int) (24 * getResources().getDisplayMetrics().density);
        notice.setPadding(padding, padding, padding, padding);
        frame.addView(notice);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // The document picker supplies temporary content URI grants.
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        webView.setBackgroundColor(Color.WHITE);
        WebViewAssetLoader.AssetsPathHandler assets = new WebViewAssetLoader.AssetsPathHandler(this);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", path -> assets.handle("web/" + path))
                .build();
        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (!isLocal(request.getUrl()) || !"GET".equals(request.getMethod())) return denied();
                WebResourceResponse response = loader.shouldInterceptRequest(request.getUrl());
                if (response == null || response.getData() == null) return denied();
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-store");
                headers.put("X-Content-Type-Options", "nosniff");
                headers.put("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'; worker-src 'none'");
                response.setResponseHeaders(headers);
                return response;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (isLocal(request.getUrl())) return false;
                if (request.isForMainFrame() && request.hasGesture()) openExternal(request.getUrl());
                return true;
            }
        });
        webView.setWebChromeClient(new JobsChromeClient());
        webView.setDownloadListener((url, userAgent, disposition, mime, length) ->
                Toast.makeText(this, "Use the Jobs export button to save this file.", Toast.LENGTH_LONG).show());
        WebViewCompat.addWebMessageListener(webView, "JobsNative", Collections.singleton(ORIGIN),
                (view, message, sourceOrigin, isMainFrame, proxy) -> {
                    if (!isMainFrame || !isOrigin(sourceOrigin)) return;
                    receive(message, proxy);
                });
    }

    private static boolean isOrigin(Uri uri) {
        return uri != null && "https".equals(uri.getScheme())
                && "appassets.androidplatform.net".equals(uri.getHost())
                && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getUserInfo() == null;
    }

    private static boolean isLocal(Uri uri) {
        if (!isOrigin(uri)) return false;
        String path = uri.getPath();
        if (path == null || !path.startsWith("/assets/")) return false;
        for (String part : path.split("/")) if (part.equals("..") || part.equals(".")) return false;
        return true;
    }

    private static WebResourceResponse denied() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                Collections.singletonMap("Cache-Control", "no-store"),
                new ByteArrayInputStream("Resource unavailable".getBytes(StandardCharsets.UTF_8)));
    }

    private void openExternal(Uri uri) {
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null) {
            Toast.makeText(this, "This link cannot be opened by Jobs.", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "No browser is available to open this link.", Toast.LENGTH_LONG).show();
        }
    }

    private void receive(WebMessageCompat message, JavaScriptReplyProxy proxy) {
        if (message.getType() != WebMessageCompat.TYPE_STRING) return;
        String data = message.getData();
        if (data == null || data.length() > MAX_REQUEST_CHARACTERS) return;
        final JSONObject request;
        final Reply reply;
        try {
            request = new JSONObject(data);
            Object id = request.get("id");
            if (!(id instanceof String || id instanceof Number) || id.toString().length() > 128) return;
            reply = new Reply(id, proxy);
        } catch (JSONException error) {
            return;
        }
        try {
            switch (request.getString("type")) {
                case "info":
                    reply.success(json("versionName", BuildConfig.VERSION_NAME,
                            "versionCode", BuildConfig.VERSION_CODE,
                            "applicationId", BuildConfig.APPLICATION_ID,
                            "buildId", BuildConfig.BUILD_ID));
                    break;
                case "exportStart": {
                    String name = request.getString("name");
                    String mime = request.getString("mime");
                    long bytes = request.getLong("bytes");
                    io.execute(() -> {
                        try {
                            ExportStore.Session session = exports.start(name, mime, bytes);
                            reply.success(json("token", session.token));
                        } catch (ExportStore.ExportException error) { reply.failure(error.getMessage()); }
                    });
                    break;
                }
                case "exportChunk": {
                    String token = request.getString("token");
                    String chunk = request.getString("data");
                    io.execute(() -> {
                        try { reply.success(json("bytesWritten", exports.append(token, chunk))); }
                        catch (ExportStore.ExportException error) { reply.failure(error.getMessage()); }
                    });
                    break;
                }
                case "exportFinish": {
                    String token = request.getString("token");
                    if (pendingSave != null || fileCallback != null || printActive) {
                        reply.failure("Finish the current Android dialog before saving another file.");
                        break;
                    }
                    io.execute(() -> {
                        try {
                            ExportStore.Session session = exports.prepare(token);
                            runOnUiThread(() -> showSavePicker(session, reply));
                        } catch (ExportStore.ExportException error) { reply.failure(error.getMessage()); }
                    });
                    break;
                }
                case "exportShare": {
                    String token = request.getString("token");
                    if (pendingSave != null || fileCallback != null || printActive) {
                        reply.failure("Finish the current Android dialog before sharing another file.");
                        break;
                    }
                    io.execute(() -> {
                        try {
                            ExportStore.Session session = exports.prepare(token);
                            if (!"application/pdf".equals(session.mime)) {
                                reply.failure("Only certificate PDF files can be shared through this action.");
                                return;
                            }
                            File file = exports.shareFile(session);
                            runOnUiThread(() -> sharePdf(session, file, reply));
                        } catch (ExportStore.ExportException error) { reply.failure(error.getMessage()); }
                    });
                    break;
                }
                case "exportCancel": {
                    String token = request.getString("token");
                    if (pendingSave != null && pendingSave.session.token.equals(token)) {
                        PendingSave cancelled = pendingSave;
                        cancelled.cancelled = true;
                        if (cancelled.reply != null) cancelled.reply.success(json("status", "cancelled"));
                    }
                    io.execute(() -> {
                        exports.discard(token);
                        reply.success(json("status", "cancelled"));
                    });
                    break;
                }
                case "print":
                    startPrint(request.optString("jobName", "Jobs report"), reply);
                    break;
                default:
                    reply.failure("This Android action is not supported.");
            }
        } catch (JSONException error) {
            reply.failure("The Android request is missing required information.");
        }
    }

    private void showSavePicker(ExportStore.Session session, Reply reply) {
        if (destroyed) return; // onDestroy has already queued ExportStore.close after existing I/O.
        if (pendingSave != null || fileCallback != null || printActive) {
            if (reply != null) reply.failure("Finish the current Android dialog before saving another file.");
            else showNotice("Export kept", "Finish the current Android dialog, then reopen Jobs to save your prepared export.");
            return;
        }
        pendingSave = new PendingSave(session, reply);
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(session.mime)
                .putExtra(Intent.EXTRA_TITLE, session.name);
        try {
            startActivityForResult(intent, SAVE_EXPORT);
        } catch (ActivityNotFoundException | SecurityException error) {
            String explanation = "Android's file picker is unavailable. Enable a document storage app and try again.";
            if (reply != null) {
                pendingSave = null;
                reply.failure(explanation);
            } else {
                recoveryDismissed = true;
                showNotice("Export kept", explanation + " Your prepared export remains on this device. Reopen Jobs to try again.");
            }
        }
    }

    private void sharePdf(ExportStore.Session session, File file, Reply reply) {
        if (destroyed) return; // Durable prepared export is recoverable after recreation.
        try {
            Uri uri = FileProvider.getUriForFile(this, BuildConfig.APPLICATION_ID + ".files", file);
            Intent send = new Intent(Intent.ACTION_SEND)
                    .setType("application/pdf")
                    .putExtra(Intent.EXTRA_STREAM, uri)
                    .putExtra(Intent.EXTRA_SUBJECT, session.name)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            send.setClipData(ClipData.newRawUri(session.name, uri));
            if (send.resolveActivity(getPackageManager()) == null) {
                showSavePicker(session, reply);
                return;
            }
            Intent chooser = Intent.createChooser(send, "Share certificate PDF")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(chooser);
            io.execute(() -> {
                exports.discard(session.token);
                // The share sheet opened. This does not claim delivery; cancelling it
                // never starts another download or another sharing operation.
                reply.success(json("status", "shared", "name", session.name, "bytes", session.expectedBytes));
            });
        } catch (ActivityNotFoundException | SecurityException error) {
            // No share handler: offer Android's ordinary save picker using the same
            // complete staged PDF, without transferring or generating it a second time.
            showSavePicker(session, reply);
        } catch (IllegalArgumentException error) {
            reply.failure("Android could not open this PDF for sharing. Save it to a folder instead.");
        }
    }

    private void startPrint(String requestedName, Reply reply) {
        if (printActive || pendingSave != null || fileCallback != null) {
            reply.failure("Finish the current Android dialog before printing.");
            return;
        }
        PrintManager manager = (PrintManager) getSystemService(PRINT_SERVICE);
        if (manager == null) { reply.failure("Android printing is unavailable on this device."); return; }
        String name = requestedName.replaceAll("[\\x00-\\x1f\\x7f]", " ").trim();
        if (name.isEmpty()) name = "Jobs report";
        if (name.length() > 120) name = name.substring(0, 120);
        try {
            PrintDocumentAdapter delegate = webView.createPrintDocumentAdapter(name);
            printActive = true;
            PrintDocumentAdapter adapter = new PrintDocumentAdapter() {
                @Override public void onStart() { delegate.onStart(); }
                @Override
                public void onLayout(PrintAttributes oldAttributes, PrintAttributes newAttributes,
                                     CancellationSignal cancellation, LayoutResultCallback callback, Bundle extras) {
                    delegate.onLayout(oldAttributes, newAttributes, cancellation, callback, extras);
                }
                @Override
                public void onWrite(PageRange[] pages, ParcelFileDescriptor destination,
                                    CancellationSignal cancellation, WriteResultCallback callback) {
                    delegate.onWrite(pages, destination, cancellation, callback);
                }
                @Override
                public void onFinish() {
                    try { delegate.onFinish(); }
                    finally {
                        printActive = false;
                        // This confirms the print UI has finished, not that a physical printer succeeded.
                        reply.success(json("status", "finished"));
                    }
                }
            };
            manager.print(name, adapter, new PrintAttributes.Builder()
                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
        } catch (RuntimeException error) {
            printActive = false;
            reply.failure("The print dialog could not be opened. Try again after reopening the report.");
        }
    }

    private final class JobsChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = null;
            if (pendingSave != null || printActive || !isLocal(Uri.parse(view.getUrl() == null ? "" : view.getUrl()))) {
                callback.onReceiveValue(null);
                return true;
            }
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);
            Set<String> accepted = acceptedTypes(params.getAcceptTypes());
            intent.setType(accepted.size() == 1 ? accepted.iterator().next() : "*/*");
            if (!accepted.contains("*/*")) intent.putExtra(Intent.EXTRA_MIME_TYPES, accepted.toArray(new String[0]));
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            fileCallback = callback;
            try { startActivityForResult(intent, PICK_FILE); }
            catch (ActivityNotFoundException | SecurityException error) {
                fileCallback = null;
                callback.onReceiveValue(null);
                Toast.makeText(MainActivity.this, "Android's file picker is unavailable.", Toast.LENGTH_LONG).show();
            }
            return true;
        }

        @Override
        public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
            if (!isLocal(Uri.parse(url))) { result.cancel(); return true; }
            new AlertDialog.Builder(MainActivity.this).setTitle("Jobs").setMessage(message)
                    .setPositiveButton(android.R.string.ok, (dialog, which) -> result.confirm())
                    .setOnCancelListener(dialog -> result.cancel()).show();
            return true;
        }

        @Override
        public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
            if (!isLocal(Uri.parse(url))) { result.cancel(); return true; }
            new AlertDialog.Builder(MainActivity.this).setTitle("Jobs").setMessage(message)
                    .setPositiveButton(android.R.string.ok, (dialog, which) -> result.confirm())
                    .setNegativeButton(android.R.string.cancel, (dialog, which) -> result.cancel())
                    .setOnCancelListener(dialog -> result.cancel()).show();
            return true;
        }

        @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
    }

    private static Set<String> acceptedTypes(String[] requested) {
        Set<String> types = new LinkedHashSet<>();
        for (String entry : requested) {
            if (entry == null) continue;
            for (String part : entry.split(",")) {
                String type = part.trim().toLowerCase(Locale.ROOT);
                if (type.startsWith(".")) {
                    type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(type.substring(1));
                    if (type == null) continue;
                }
                if (type.matches("[a-z0-9!#$&^_.+*-]+/[a-z0-9!#$&^_.+*-]+")) types.add(type);
            }
        }
        if (types.contains("application/json")) {
            types.add("text/plain");
            types.add("application/octet-stream");
        }
        if (types.contains("application/zip")) {
            types.add("application/x-zip-compressed");
            types.add("application/octet-stream");
        }
        if (types.isEmpty()) types.add("*/*");
        return types;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_FILE) {
            ValueCallback<Uri[]> callback = fileCallback;
            fileCallback = null;
            if (callback == null) {
                showNotice("Choose the file again", "Jobs restarted while the Android file picker was open. Your saved jobs are kept. Open Import again to select the file.");
                return;
            }
            List<Uri> selected = new ArrayList<>();
            if (resultCode == RESULT_OK && data != null) {
                ClipData clips = data.getClipData();
                if (clips != null) {
                    for (int index = 0; index < clips.getItemCount(); index++) {
                        Uri uri = clips.getItemAt(index).getUri();
                        if (uri != null && "content".equals(uri.getScheme())) selected.add(uri);
                    }
                } else if (data.getData() != null && "content".equals(data.getData().getScheme())) {
                    selected.add(data.getData());
                }
            }
            callback.onReceiveValue(selected.isEmpty() ? null : selected.toArray(new Uri[0]));
        } else if (requestCode == SAVE_EXPORT) {
            PendingSave save = pendingSave;
            pendingSave = null;
            saveResultInProgress = true;
            saveResultHandled = true;
            final Uri destination = data == null ? null : data.getData();
            // restore() is queued first on the same executor. Even when Android recreates this
            // activity before delivering the picker result, the completed payload is available.
            io.execute(() -> {
                ExportStore.Session session = save == null ? exports.preparedSession() : save.session;
                Reply reply = save == null ? null : save.reply;
                if (session == null) {
                    runOnUiThread(() -> {
                        saveResultInProgress = false;
                        showNotice("Export interrupted", "Jobs could not recover the prepared export. Your saved jobs are kept. Export again; an empty file may remain at the location selected in Android.");
                    });
                    return;
                }
                if ((save != null && save.cancelled) || resultCode != RESULT_OK || destination == null) {
                    if (reply == null && (save == null || !save.cancelled)) {
                        // A recovered export may be the only copy of an unsaved rescue snapshot.
                        // Leaving Android's picker is not consent to discard that durable copy.
                        runOnUiThread(() -> {
                            saveResultInProgress = false;
                            pendingSave = new PendingSave(session, null);
                            recoveryDismissed = true;
                            showNotice("Export kept", "The save was cancelled. Your prepared export is still on this device. Leave and reopen Jobs to save it later or explicitly discard it.");
                        });
                        return;
                    }
                    exports.discard(session.token);
                    runOnUiThread(() -> {
                        saveResultInProgress = false;
                        if (reply != null) reply.success(json("status", "cancelled"));
                        else showNotice("Export cancelled", "No export was completed. Your saved jobs remain in Jobs.");
                    });
                    return;
                }
                try {
                    if (!"content".equals(destination.getScheme())) {
                        throw new ExportStore.ExportException("Android returned an unsupported save location. Choose another location.");
                    }
                    exports.copyTo(session, getContentResolver(), destination);
                    runOnUiThread(() -> {
                        saveResultInProgress = false;
                        if (reply != null) reply.success(json("status", "saved", "name", session.name,
                                "bytes", session.expectedBytes));
                        else showNotice("Export saved", "Your recovered export has been saved to the location you selected in Android.");
                    });
                } catch (ExportStore.ExportException error) {
                    runOnUiThread(() -> {
                        saveResultInProgress = false;
                        if (reply != null) reply.failure(error.getMessage());
                        else {
                            pendingSave = new PendingSave(session, null);
                            recoveryDismissed = true;
                            showNotice("Export kept for retry", error.getMessage()
                                    + " Your prepared export is retained. Reopen Jobs to save another copy. An incomplete file may remain at the selected location.");
                        }
                    });
                }
            });
        }
    }

    private void scheduleRecoveryNotice() {
        getWindow().getDecorView().postDelayed(() -> {
            if (destroyed || !resumed || saveResultInProgress || recoveryDismissed
                    || (recoveryDialog != null && recoveryDialog.isShowing())
                    || (noticeDialog != null && noticeDialog.isShowing())) return;
            if (pendingSave != null && pendingSave.reply == null && !pendingSave.cancelled) {
                PendingSave recovery = pendingSave;
                String detail = recoveredWithoutName
                        ? "Jobs recovered a prepared export after an interruption, but its original filename was unavailable. Save it as a backup, or discard this prepared copy. Your saved jobs are still in Jobs."
                        : "Android interrupted the previous save. Your prepared export is kept on this device. Save another copy, keep it for later, or discard this prepared export. Your saved jobs are still in Jobs.";
                recoveryDialog = new AlertDialog.Builder(this).setTitle("Recover your export")
                        .setMessage(detail)
                        .setPositiveButton("Save copy", (dialog, which) -> {
                            pendingSave = null;
                            recoveryDismissed = false;
                            showSavePicker(recovery.session, null);
                        })
                        .setNeutralButton("Later", (dialog, which) -> {
                            recoveryDismissed = true;
                            Toast.makeText(this, "Export kept. Reopen Jobs to save or discard it.", Toast.LENGTH_LONG).show();
                        })
                        .setNegativeButton("Discard export", (dialog, which) -> {
                            pendingSave = null;
                            io.execute(() -> exports.discard(recovery.session.token));
                        })
                        .setOnCancelListener(dialog -> recoveryDismissed = true).show();
            } else if (interruptedChunksNotice) {
                interruptedChunksNotice = false;
                showNotice("Export interrupted", "An export was interrupted before its file was complete. The incomplete temporary copy was removed. Your saved jobs are kept; export again when you are ready.");
            }
        }, 600);
    }

    private void showNotice(String title, String message) {
        if (destroyed || isFinishing()) return;
        noticeDialog = new AlertDialog.Builder(this).setTitle(title).setMessage(message)
                .setPositiveButton(android.R.string.ok, null).show();
    }

    private void handleBack() {
        if (exitDialog != null && exitDialog.isShowing()) return;
        if (webView == null) { confirmExit(); return; }
        webView.evaluateJavascript("(function(){try{return typeof window.__jobsAndroidBack==='function' && window.__jobsAndroidBack()===true;}catch(_){return false;}})()",
                value -> { if (!"true".equals(value) && !destroyed) confirmExit(); });
    }

    private void confirmExit() {
        if (destroyed || isFinishing() || (exitDialog != null && exitDialog.isShowing())) return;
        exitDialog = new AlertDialog.Builder(this).setTitle("Close Jobs?")
                .setMessage("Check that your latest changes are saved before closing the app.")
                .setPositiveButton("Close", (dialog, which) -> finish())
                .setNegativeButton("Keep working", null).show();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() { handleBack(); }

    @Override
    public void onConfigurationChanged(@NonNull Configuration configuration) {
        super.onConfigurationChanged(configuration);
        if (webView != null) ViewCompat.requestApplyInsets(webView.getRootView());
    }

    @Override protected void onPause() { resumed = false; if (webView != null) webView.onPause(); super.onPause(); }
    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        recoveryDismissed = false;
        if (webView != null) webView.onResume();
        scheduleRecoveryNotice();
    }

    @Override
    protected void onDestroy() {
        destroyed = true;
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        }
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        if (exitDialog != null) exitDialog.dismiss();
        if (recoveryDialog != null) recoveryDialog.dismiss();
        if (noticeDialog != null) noticeDialog.dismiss();
        if (webView != null) { webView.stopLoading(); webView.destroy(); webView = null; }
        if (exports != null) io.execute(exports::close);
        super.onDestroy();
    }

    private static JSONObject json(Object... pairs) {
        JSONObject result = new JSONObject();
        try {
            for (int index = 0; index < pairs.length; index += 2) {
                result.put((String) pairs[index], pairs[index + 1]);
            }
        } catch (JSONException impossible) { throw new IllegalArgumentException("Invalid native result", impossible); }
        return result;
    }
}
