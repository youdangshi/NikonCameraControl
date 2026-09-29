package com.nikon.camera.control;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

  private File pendingInstallFile;

  @PluginMethod
  public void getAppInfo(PluginCall call) {
    try {
      PackageInfo info = getContext().getPackageManager()
          .getPackageInfo(getContext().getPackageName(), 0);
      JSObject result = new JSObject();
      result.put("versionName", info.versionName);
      result.put("versionCode", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
          ? info.getLongVersionCode()
          : info.versionCode);
      call.resolve(result);
    } catch (Exception error) {
      call.reject(error.getMessage() != null ? error.getMessage() : "Cannot read app info");
    }
  }

  @PluginMethod
  public void checkForUpdate(PluginCall call) {
    String owner = call.getString("owner", "youdangshi");
    String repo = call.getString("repo", "NikonCameraControl");
    new Thread(() -> {
      try {
        PackageInfo info = getContext().getPackageManager()
            .getPackageInfo(getContext().getPackageName(), 0);
        String currentVersion = info.versionName == null ? "0.0.0" : info.versionName;
        String endpoint = "https://api.github.com/repos/" + owner + "/" + repo + "/releases/latest";
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(20000);
        connection.setRequestProperty("Accept", "application/vnd.github+json");
        connection.setRequestProperty("User-Agent", "Nini-Android-Updater");
        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) {
          throw new Exception("GitHub release request failed: HTTP " + status);
        }
        String body = readText(connection.getInputStream());
        JSONObject release = new JSONObject(body);
        String tag = release.optString("tag_name", "").replaceFirst("^v", "");
        String latestVersion = tag.isEmpty() ? currentVersion : tag;
        JSONArray assets = release.optJSONArray("assets");
        JSONObject apkAsset = null;
        if (assets != null) {
          for (int index = 0; index < assets.length(); index++) {
            JSONObject asset = assets.optJSONObject(index);
            if (asset == null) continue;
            String name = asset.optString("name", "");
            if (name.toLowerCase().endsWith(".apk")) {
              apkAsset = asset;
              break;
            }
          }
        }
        JSObject result = new JSObject();
        result.put("currentVersion", currentVersion);
        result.put("latestVersion", latestVersion);
        result.put("updateAvailable", compareVersions(latestVersion, currentVersion) > 0
            && apkAsset != null);
        result.put("releaseName", release.optString("name", latestVersion));
        result.put("releaseUrl", release.optString("html_url", ""));
        result.put("notes", release.optString("body", ""));
        if (apkAsset != null) {
          result.put("assetUrl", apkAsset.optString("browser_download_url", ""));
          result.put("assetName", apkAsset.optString("name", "Nini-update.apk"));
          result.put("digest", apkAsset.optString("digest", ""));
          result.put("size", apkAsset.optLong("size", 0));
        }
        resolveOnUi(call, result);
      } catch (Exception error) {
        rejectOnUi(call, error.getMessage() != null ? error.getMessage() : "Update check failed");
      }
    }, "NiniUpdateCheck").start();
  }

  @PluginMethod
  public void downloadAndInstall(PluginCall call) {
    String url = call.getString("url");
    String fileName = call.getString("fileName", "Nini-update.apk");
    String expectedDigest = call.getString("digest", "");
    if (url == null || !url.startsWith("https://github.com/")) {
      call.reject("A valid GitHub APK URL is required");
      return;
    }
    new Thread(() -> {
      try {
        File directory = new File(getContext().getCacheDir(), "updates");
        if (!directory.exists() && !directory.mkdirs()) {
          throw new Exception("Cannot create update directory");
        }
        File target = new File(directory, sanitizeFileName(fileName));
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(20000);
        connection.setReadTimeout(60000);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("User-Agent", "Nini-Android-Updater");
        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) {
          throw new Exception("APK download failed: HTTP " + status);
        }
        try (InputStream input = connection.getInputStream();
             FileOutputStream output = new FileOutputStream(target)) {
          byte[] buffer = new byte[32768];
          int count;
          while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        }
        String actualDigest = "sha256:" + sha256(target);
        if (expectedDigest != null && expectedDigest.startsWith("sha256:")
            && !expectedDigest.equalsIgnoreCase(actualDigest)) {
          target.delete();
          throw new Exception("APK SHA256 verification failed");
        }
        pendingInstallFile = target;
        getActivity().runOnUiThread(() -> {
          if (needsInstallPermission()) {
            openInstallPermissionSettings();
            JSObject result = new JSObject();
            result.put("needsPermission", true);
            result.put("filePath", target.getAbsolutePath());
            result.put("digest", actualDigest);
            call.resolve(result);
          } else {
            installApk(target);
            JSObject result = new JSObject();
            result.put("needsPermission", false);
            result.put("filePath", target.getAbsolutePath());
            result.put("digest", actualDigest);
            call.resolve(result);
          }
        });
      } catch (Exception error) {
        rejectOnUi(call, error.getMessage() != null ? error.getMessage() : "APK download failed");
      }
    }, "NiniUpdateDownload").start();
  }

  @Override
  public void handleOnResume() {
    super.handleOnResume();
    if (pendingInstallFile != null && pendingInstallFile.exists() && !needsInstallPermission()) {
      installApk(pendingInstallFile);
      pendingInstallFile = null;
    }
  }

  private boolean needsInstallPermission() {
    return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
        && !getContext().getPackageManager().canRequestPackageInstalls();
  }

  private void openInstallPermissionSettings() {
    Intent intent = new Intent(
        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
        Uri.parse("package:" + getContext().getPackageName()));
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    getContext().startActivity(intent);
  }

  private void installApk(File apk) {
    Uri uri = FileProvider.getUriForFile(
        getContext(),
        getContext().getPackageName() + ".fileprovider",
        apk);
    Intent intent = new Intent(Intent.ACTION_VIEW);
    intent.setDataAndType(uri, "application/vnd.android.package-archive");
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    getContext().startActivity(intent);
  }

  private static int compareVersions(String left, String right) {
    String[] a = left.split("[^0-9]+");
    String[] b = right.split("[^0-9]+");
    int length = Math.max(a.length, b.length);
    for (int index = 0; index < length; index++) {
      int av = index < a.length && !a[index].isEmpty() ? Integer.parseInt(a[index]) : 0;
      int bv = index < b.length && !b[index].isEmpty() ? Integer.parseInt(b[index]) : 0;
      if (av != bv) return Integer.compare(av, bv);
    }
    return 0;
  }

  private static String sanitizeFileName(String value) {
    return value.replaceAll("[^A-Za-z0-9._-]", "_");
  }

  private static String readText(InputStream input) throws Exception {
    try (InputStream stream = input) {
      byte[] buffer = new byte[8192];
      StringBuilder builder = new StringBuilder();
      int count;
      while ((count = stream.read(buffer)) != -1) {
        builder.append(new String(buffer, 0, count, java.nio.charset.StandardCharsets.UTF_8));
      }
      return builder.toString();
    }
  }

  private static String sha256(File file) throws Exception {
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    try (FileInputStream input = new FileInputStream(file)) {
      byte[] buffer = new byte[32768];
      int count;
      while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
    }
    StringBuilder builder = new StringBuilder();
    for (byte value : digest.digest()) builder.append(String.format("%02x", value));
    return builder.toString();
  }

  private void resolveOnUi(PluginCall call, JSObject result) {
    getActivity().runOnUiThread(() -> call.resolve(result));
  }

  private void rejectOnUi(PluginCall call, String message) {
    getActivity().runOnUiThread(() -> call.reject(message));
  }
}
