package com.nikon.camera.control;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Small UI bridge used by the live-view screen to hide the Android system bars.
 * Keeping this in a Capacitor plugin avoids a web-only fullscreen workaround.
 */
@CapacitorPlugin(name = "CameraUi")
public class CameraUiPlugin extends Plugin {

  @PluginMethod
  public void setLandscape(PluginCall call) {
    Activity activity = getActivity();
    if (activity == null) {
      call.reject("Activity is not available");
      return;
    }

    boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
    activity.runOnUiThread(() -> {
      activity.setRequestedOrientation(
          enabled
              ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
              : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
      );
      JSObject result = new JSObject();
      result.put("enabled", enabled);
      call.resolve(result);
    });
  }

  @PluginMethod
  public void setFullscreen(PluginCall call) {
    Activity activity = getActivity();
    if (activity == null) {
      call.reject("Activity is not available");
      return;
    }

    boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
    activity.runOnUiThread(() -> {
      Window window = activity.getWindow();
      WindowCompat.setDecorFitsSystemWindows(window, !enabled);
      WindowInsetsControllerCompat controller =
          WindowCompat.getInsetsController(window, window.getDecorView());

      if (enabled) {
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );
      } else {
        controller.show(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_DEFAULT
        );
      }

      JSObject result = new JSObject();
      result.put("enabled", enabled);
      call.resolve(result);
    });
  }

  @PluginMethod
  public void setKeepAwake(PluginCall call) {
    Activity activity = getActivity();
    if (activity == null) {
      call.reject("Activity is not available");
      return;
    }

    boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
    activity.runOnUiThread(() -> {
      Window window = activity.getWindow();
      if (enabled) {
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
      } else {
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
      }

      JSObject result = new JSObject();
      result.put("enabled", enabled);
      call.resolve(result);
    });
  }

  @PluginMethod
  public void saveToGallery(PluginCall call) {
    String dataUrl = call.getString("dataUrl");
    if (dataUrl == null || dataUrl.isEmpty()) {
      call.reject("Missing dataUrl");
      return;
    }
    String fileName = sanitizeFileName(call.getString("fileName", "Nini-media.bin"));
    String mimeType = call.getString("mimeType", mimeTypeFromName(fileName));

    new Thread(() -> {
      try {
        byte[] bytes = decodeDataUrl(dataUrl);
        if (bytes.length == 0) throw new Exception("Decoded file is empty");
        Uri uri = writeToMediaStore(bytes, fileName, mimeType);
        JSObject result = new JSObject();
        result.put("success", true);
        result.put("uri", uri.toString());
        result.put("fileName", fileName);
        result.put("mimeType", mimeType);
        result.put("size", bytes.length);
        resolveOnUi(call, result);
      } catch (Exception error) {
        rejectOnUi(call, error.getMessage() != null ? error.getMessage() : "Save failed");
      }
    }, "NiniMediaSave").start();
  }

  private byte[] decodeDataUrl(String dataUrl) {
    int comma = dataUrl.indexOf(',');
    String encoded = comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl;
    return Base64.decode(encoded, Base64.DEFAULT);
  }

  private Uri writeToMediaStore(byte[] bytes, String fileName, String mimeType) throws Exception {
    boolean isImage = mimeType.startsWith("image/");
    boolean isVideo = mimeType.startsWith("video/");
    ContentResolver resolver = getContext().getContentResolver();

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      Uri collection = isImage
          ? MediaStore.Images.Media.EXTERNAL_CONTENT_URI
          : isVideo
              ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI
              : MediaStore.Downloads.EXTERNAL_CONTENT_URI;
      ContentValues values = new ContentValues();
      values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
      values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
      values.put(MediaStore.MediaColumns.RELATIVE_PATH,
          isImage ? Environment.DIRECTORY_PICTURES + "/Nini"
              : isVideo ? Environment.DIRECTORY_MOVIES + "/Nini"
                  : Environment.DIRECTORY_DOWNLOADS + "/Nini");
      values.put(MediaStore.MediaColumns.IS_PENDING, 1);
      Uri uri = resolver.insert(collection, values);
      if (uri == null) throw new Exception("MediaStore insert failed");
      try (OutputStream output = resolver.openOutputStream(uri)) {
        if (output == null) throw new Exception("Cannot open MediaStore output");
        output.write(bytes);
      }
      values.clear();
      values.put(MediaStore.MediaColumns.IS_PENDING, 0);
      resolver.update(uri, values, null, null);
      return uri;
    }

    if (ContextCompat.checkSelfPermission(getContext(), android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
        != PackageManager.PERMISSION_GRANTED) {
      throw new Exception("Storage permission is required on this Android version");
    }
    File base = Environment.getExternalStoragePublicDirectory(
        isImage ? Environment.DIRECTORY_PICTURES
            : isVideo ? Environment.DIRECTORY_MOVIES
                : Environment.DIRECTORY_DOWNLOADS);
    File directory = new File(base, "Nini");
    if (!directory.exists() && !directory.mkdirs()) throw new Exception("Cannot create Nini directory");
    File target = new File(directory, fileName);
    try (FileOutputStream output = new FileOutputStream(target)) {
      output.write(bytes);
    }
    MediaScannerConnection.scanFile(
        getContext(), new String[]{target.getAbsolutePath()}, new String[]{mimeType}, null);
    return Uri.fromFile(target);
  }

  private static String sanitizeFileName(String value) {
    String name = value == null ? "Nini-media.bin" : value.trim();
    if (name.isEmpty()) name = "Nini-media.bin";
    return name.replaceAll("[\\\\/:*?\"<>|]", "_");
  }

  private static String mimeTypeFromName(String fileName) {
    String lower = fileName.toLowerCase();
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
    if (lower.endsWith(".mov")) return "video/quicktime";
    if (lower.endsWith(".mp4") || lower.endsWith(".m4v")) return "video/mp4";
    return "application/octet-stream";
  }

  private void resolveOnUi(PluginCall call, JSObject result) {
    Activity activity = getActivity();
    if (activity == null) {
      call.resolve(result);
      return;
    }
    activity.runOnUiThread(() -> call.resolve(result));
  }

  private void rejectOnUi(PluginCall call, String message) {
    Activity activity = getActivity();
    if (activity == null) {
      call.reject(message);
      return;
    }
    activity.runOnUiThread(() -> call.reject(message));
  }
}
