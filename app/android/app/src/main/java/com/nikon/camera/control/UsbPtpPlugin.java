package com.nikon.camera.control;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;

/**
 * 手机 Type-C / OTG 原生 USB Host / PTP 插件。
 *
 * 参考 CameraSyncPro 的 USB 通道处理方式：
 *   - 使用 UsbManager 枚举设备
 *   - Android 12+ 使用 MUTABLE PendingIntent 申请权限
 *   - Android 13+ 注册动态广播时显式指定 RECEIVER_EXPORTED
 *   - 找到 Bulk in/out 端点后直接读写
 *   - 提供设备列表与连接状态事件，方便 App 显示真实诊断
 *
 * JS API：
 *   listDevices()      列出当前所有 USB 设备
 *   connect()          连接 Nikon VID=0x04B0
 *   write({ data })    发送 base64 字节
 *   disconnect()       断开
 *   事件 data          收到 base64 数据
 *   事件 state          connected / disconnected / error
 *   事件 usb_devices   设备列表变化（插拔）
 */
@CapacitorPlugin(name = "UsbPtp")
public class UsbPtpPlugin extends Plugin {

  private static final int NIKON_VID = 0x04B0;
  private static final String ACTION_USB_PERMISSION = "com.nikon.camera.control.USB_PERMISSION";

  private UsbManager usbManager;
  private UsbDevice device;
  private UsbDeviceConnection connection;
  private UsbInterface iface;
  private UsbEndpoint inEp;
  private UsbEndpoint outEp;
  private volatile boolean running = false;
  private Thread readerThread;
  private BroadcastReceiver permissionReceiver;
  private BroadcastReceiver deviceReceiver;
  private PendingIntent permissionIntent;

  @PluginMethod
  public void listDevices(PluginCall call) {
    JSObject result = new JSObject();
    JSArray list = new JSArray();
    UsbManager manager = getUsbManager();
    HashMap<String, UsbDevice> all = manager == null ? new HashMap<>() : manager.getDeviceList();
    boolean hasNikon = false;
    for (UsbDevice d : all.values()) {
      JSObject item = new JSObject();
      item.put("vendor", String.format("0x%04X", d.getVendorId()));
      item.put("product", String.format("0x%04X", d.getProductId()));
      item.put("name", d.getDeviceName());
      item.put("isNikon", d.getVendorId() == NIKON_VID);
      item.put("hasPermission", manager != null && d.getVendorId() == NIKON_VID && manager.hasPermission(d));
      list.put(item);
      if (d.getVendorId() == NIKON_VID) hasNikon = true;
    }
    result.put("devices", list);
    result.put("hasNikon", hasNikon);
    result.put("usbHostSupported", manager != null);
    call.resolve(result);
    emitDevices();
  }

  @PluginMethod
  public void connect(PluginCall call) {
    usbManager = getUsbManager();
    if (usbManager == null) {
      call.reject("这台手机不支持 USB Host / OTG，无法通过 Type-C 控制相机");
      return;
    }

    startDeviceMonitoring();
    UsbDevice found = null;
    for (UsbDevice d : usbManager.getDeviceList().values()) {
      if (d.getVendorId() == NIKON_VID) {
        found = d;
        break;
      }
    }

    if (found == null) {
      String message = "未检测到 Nikon 相机。\n\n请检查：\n"
          + "1. 使用支持数据传输的 Type-C OTG 线，不能是纯充电线。\n"
          + "2. 相机已开机，USB 模式设为 MTP / PTP。\n"
          + "3. 手机支持 USB Host（多数安卓手机支持 OTG）。\n"
          + "4. 先拔掉再重新插一次线。";
      JSObject err = new JSObject();
      err.put("message", message);
      err.put("code", "usb_device_missing");
      emit("usb_ptp_response", err);
      call.reject(message);
      return;
    }
    device = found;

    if (!usbManager.hasPermission(device)) {
      requestPermission(call);
    } else {
      openDevice(call);
    }
  }

  private UsbManager getUsbManager() {
    return (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
  }

  private void startDeviceMonitoring() {
    if (deviceReceiver != null) return;
    deviceReceiver = new BroadcastReceiver() {
      @Override
      public void onReceive(Context context, Intent intent) {
        emitDevices();
        emitState("device_changed", null, null);
      }
    };
    IntentFilter filter = new IntentFilter();
    filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);
    filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
    registerSafeReceiver(deviceReceiver, filter);
  }

  private void requestPermission(PluginCall call) {
    Intent intent = new Intent(ACTION_USB_PERMISSION);
    intent.setPackage(getContext().getPackageName());
    int pendingFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
        ? PendingIntent.FLAG_MUTABLE
        : 0;
    permissionIntent = PendingIntent.getBroadcast(getContext(), 0, intent, pendingFlags);

    permissionReceiver = new BroadcastReceiver() {
      @Override
      public void onReceive(Context context, Intent intent) {
        if (!ACTION_USB_PERMISSION.equals(intent.getAction()) || device == null) return;
        boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
        unregisterSafeReceiver(permissionReceiver);
        permissionReceiver = null;
        if (!granted) {
          JSObject err = new JSObject();
          err.put("code", "usb_permission_denied");
          err.put("message", "没有允许 USB 权限，无法读取相机");
          emit("usb_ptp_response", err);
          call.reject("用户没有允许 USB 权限，请重新连接相机并在弹窗中选择允许");
          return;
        }
        openDevice(call);
      }
    };
    IntentFilter filter = new IntentFilter(ACTION_USB_PERMISSION);
    try {
      registerSafeReceiver(permissionReceiver, filter);
      usbManager.requestPermission(device, permissionIntent);
    } catch (Exception e) {
      unregisterSafeReceiver(permissionReceiver);
      permissionReceiver = null;
      call.reject("申请 USB 权限失败：" + safeMessage(e));
    }
  }

  private void registerSafeReceiver(BroadcastReceiver receiver, IntentFilter filter) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      getContext().registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
    } else {
      getContext().registerReceiver(receiver, filter);
    }
  }

  private void unregisterSafeReceiver(BroadcastReceiver receiver) {
    if (receiver == null) return;
    try { getContext().unregisterReceiver(receiver); } catch (IllegalArgumentException ignored) {}
  }

  private void openDevice(PluginCall call) {
    try {
      connection = usbManager.openDevice(device);
      if (connection == null) {
        call.reject("无法打开 USB 设备，请重新插拔线材，并确认相机没有连接电脑/其它设备");
        return;
      }

      UsbInterface chosen = null;
      for (int i = 0; i < device.getInterfaceCount(); i++) {
        UsbInterface u = device.getInterface(i);
        if (u.getInterfaceClass() == UsbConstants.USB_CLASS_VENDOR_SPEC
            || u.getInterfaceClass() == UsbConstants.USB_CLASS_STILL_IMAGE) {
          chosen = u;
          break;
        }
      }
      if (chosen == null && device.getInterfaceCount() > 0) chosen = device.getInterface(0);
      if (chosen == null) {
        cleanUp();
        call.reject("相机没有 USB 接口，请确认 USB 模式为 MTP/PTP");
        return;
      }

      if (!connection.claimInterface(chosen, true)) {
        cleanUp();
        call.reject("无法占用相机 USB 接口，请拔掉其它软件/设备后重试");
        return;
      }
      iface = chosen;

      for (int i = 0; i < iface.getEndpointCount(); i++) {
        UsbEndpoint ep = iface.getEndpoint(i);
        if (ep.getDirection() == UsbConstants.USB_DIR_IN && ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK) inEp = ep;
        if (ep.getDirection() == UsbConstants.USB_DIR_OUT && ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK) outEp = ep;
      }
      if (inEp == null || outEp == null) {
        cleanUp();
        call.reject("相机未提供 Bulk 数据端点，当前可能是 MTP 模式，请切换为 PTP 模式");
        return;
      }

      running = true;
      startReader();
      JSObject obj = new JSObject();
      obj.put("connected", true);
      obj.put("vendor", String.format("0x%04X", device.getVendorId()));
      obj.put("product", String.format("0x%04X", device.getProductId()));
      obj.put("device", device.getDeviceName());
      call.resolve(obj);
      emitState("connected", null, null);
    } catch (Exception e) {
      cleanUp();
      call.reject("USB 连接失败：" + safeMessage(e));
    }
  }

  private void startReader() {
    readerThread = new Thread(() -> {
      byte[] buf = new byte[16384];
      while (running && connection != null) {
        try {
          int n = connection.bulkTransfer(inEp, buf, buf.length, 3000);
          if (n > 0) {
            byte[] chunk = new byte[n];
            System.arraycopy(buf, 0, chunk, 0, n);
            final String b64 = Base64.encodeToString(chunk, Base64.NO_WRAP);
            runOnUiThread(() -> {
              JSObject data = new JSObject();
              data.put("data", b64);
              data.put("len", n);
              notifyListeners("data", data);
            });
          } else if (n < 0) {
            break;
          }
        } catch (Exception ignored) {}
      }
      running = false;
      emitState("disconnected", null, null);
    });
    readerThread.setDaemon(true);
    readerThread.start();
  }

  @PluginMethod
  public void write(PluginCall call) {
    String data = call.getString("data");
    if (data == null || connection == null || outEp == null) {
      call.reject("USB 未连接");
      return;
    }
    try {
      byte[] bytes = Base64.decode(data, Base64.NO_WRAP);
      int written = connection.bulkTransfer(outEp, bytes, bytes.length, 3000);
      if (written < 0) {
        call.reject("USB 写入失败，请重新插拔线材");
      } else {
        call.resolve(new JSObject().put("written", written));
      }
    } catch (Exception e) {
      call.reject("USB 写入失败：" + safeMessage(e));
    }
  }

  @PluginMethod
  public void disconnect(PluginCall call) {
    stopDeviceMonitoring();
    cleanUp();
    emitState("disconnected", null, null);
    call.resolve();
  }

  private void emitState(String state, String host, Integer port) {
    JSObject obj = new JSObject();
    obj.put("state", state);
    if (host != null) obj.put("host", host);
    if (port != null) obj.put("port", port);
    runOnUiThread(() -> notifyListeners("state", obj));
  }

  private void emit(String event, JSObject obj) {
    runOnUiThread(() -> notifyListeners(event, obj));
  }

  private void emitDevices() {
    JSObject result = new JSObject();
    JSArray list = new JSArray();
    HashMap<String, UsbDevice> all = usbManager == null ? new HashMap<>() : usbManager.getDeviceList();
    for (UsbDevice d : all.values()) {
      JSObject item = new JSObject();
      item.put("vendor", String.format("0x%04X", d.getVendorId()));
      item.put("product", String.format("0x%04X", d.getProductId()));
      item.put("name", d.getDeviceName());
      item.put("isNikon", d.getVendorId() == NIKON_VID);
      list.put(item);
    }
    result.put("devices", list);
    emit("usb_devices", result);
  }

  private void stopDeviceMonitoring() {
    if (deviceReceiver != null) {
      unregisterSafeReceiver(deviceReceiver);
      deviceReceiver = null;
    }
    if (permissionReceiver != null) {
      unregisterSafeReceiver(permissionReceiver);
      permissionReceiver = null;
    }
  }

  private void cleanUp() {
    running = false;
    try {
      if (iface != null && connection != null) connection.releaseInterface(iface);
    } catch (Exception ignored) {}
    try {
      if (connection != null) connection.close();
    } catch (Exception ignored) {}
    iface = null;
    connection = null;
    inEp = null;
    outEp = null;
  }

  private void runOnUiThread(Runnable action) {
    if (getActivity() != null) {
      getActivity().runOnUiThread(action);
    } else {
      action.run();
    }
  }

  private static String safeMessage(Throwable t) {
    return t == null ? "未知错误" : (t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage());
  }
}
