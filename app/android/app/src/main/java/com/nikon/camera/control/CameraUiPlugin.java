package com.nikon.camera.control;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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
}
