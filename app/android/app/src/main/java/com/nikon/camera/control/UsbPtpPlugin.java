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

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;

/**
 * 原生 USB Host / OTG 插件。
 *
 * 手机通过 Type-C OTG 线连接 Nikon 相机，并建立 PTP over USB 的 Bulk 通道。
 * JS 端 API：
 *   connect({})         枚举 VID=0x04B0 的 Nikon 设备并申请权限
 *   write({ data })     发送 base64 字节到 OUT 端点
 *   disconnect()        释放接口并断开
 *   事件 data            收到 base64 字节
 *   事件 state           connected / disconnected / error
 *
 * 首次连接时系统会弹 USB 授权窗口，请点击允许。
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
  private PendingIntent permissionIntent;

  @PluginMethod
  public void connect(PluginCall call) {
    usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
    if (usbManager == null) {
      call.reject("设备不支持 USB Host");
      return;
    }

    UsbDevice found = null;
    HashMap<String, UsbDevice> devices = usbManager.getDeviceList();
    for (UsbDevice d : devices.values()) {
      if (d.getVendorId() == NIKON_VID) {
        found = d;
        break;
      }
    }

    if (found == null) {
      call.reject("未检测到 Nikon 相机。请确认：\n1. 相机已开机\n2. Type-C OTG 线已连接\n3. 相机 USB 模式为 MTP/PTP");
      return;
    }
    device = found;

    if (!usbManager.hasPermission(device)) {
      requestPermission(call);
      return;
    }

    openDevice(call);
  }

  private void requestPermission(PluginCall call) {
    Intent intent = new Intent(ACTION_USB_PERMISSION);
    intent.setPackage(getContext().getPackageName());
    int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
    permissionIntent = PendingIntent.getBroadcast(getContext(), 0, intent, flags);

    permissionReceiver = new BroadcastReceiver() {
      @Override
      public void onReceive(Context context, Intent intent) {
        if (ACTION_USB_PERMISSION.equals(intent.getAction()) && device != null) {
          boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
          if (!granted) {
            call.reject("用户未允许 USB 访问，请重新连接相机并在弹窗中点击允许");
            return;
          }
          try { getContext().unregisterReceiver(permissionReceiver); } catch (Exception ignored) {}
          openDevice(call);
        }
      }
    };
    getContext().registerReceiver(permissionReceiver, new IntentFilter(ACTION_USB_PERMISSION));
    usbManager.requestPermission(device, permissionIntent);
  }

  private void openDevice(PluginCall call) {
    try {
      connection = usbManager.openDevice(device);
      if (connection == null) {
        call.reject("无法打开 USB 设备，请重新插拔或允许 USB 权限");
        return;
      }

      int interfaceIndex = -1;
      UsbInterface chosen = null;
      for (int i = 0; i < device.getInterfaceCount(); i++) {
        UsbInterface u = device.getInterface(i);
        if (u.getInterfaceClass() == UsbConstants.USB_CLASS_VENDOR_SPEC
            || u.getInterfaceClass() == UsbConstants.USB_CLASS_STILL_IMAGE) {
          chosen = u;
          interfaceIndex = i;
          break;
        }
      }
      if (chosen == null && device.getInterfaceCount() > 0) {
        chosen = device.getInterface(0);
        interfaceIndex = 0;
      }
      if (chosen == null) {
        cleanUp();
        call.reject("相机没有可用的 USB 接口");
        return;
      }

      if (!connection.claimInterface(chosen, true)) {
        cleanUp();
        call.reject("无法占用相机 USB 接口，请关闭其它占用程序后重试");
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
        call.reject("相机未提供 Bulk 端点");
        return;
      }

      running = true;
      startReader();
      emitState("connected", null, null);
      JSObject obj = new JSObject();
      obj.put("connected", true);
      obj.put("vendor", "0x" + Integer.toHexString(device.getVendorId()));
      obj.put("product", "0x" + Integer.toHexString(device.getProductId()));
      call.resolve(obj);
    } catch (Exception e) {
      cleanUp();
      call.reject("USB 连接失败: " + (e.getMessage() == null ? "未知错误" : e.getMessage()));
    }
  }

  private void startReader() {
    readerThread = new Thread(() -> {
      byte[] buf = new byte[16384];
      while (running && connection != null) {
        try {
          int n = connection.bulkTransfer(inEp, buf, buf.length, 800);
          if (n > 0) {
            byte[] chunk = new byte[n];
            System.arraycopy(buf, 0, chunk, 0, n);
            final String b64 = Base64.encodeToString(chunk, Base64.NO_WRAP);
            getBridge().getActivity().runOnUiThread(() -> {
              JSObject obj = new JSObject();
              obj.put("data", b64);
              obj.put("len", n);
              notifyListeners("data", obj);
            });
          }
        } catch (Exception ignored) {}
      }
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
      int written = connection.bulkTransfer(outEp, bytes, bytes.length, 2000);
      if (written < 0) {
        call.reject("USB 写入失败");
      } else {
        call.resolve(new JSObject().put("written", written));
      }
    } catch (Exception e) {
      call.reject("USB 写入失败: " + e.getMessage());
    }
  }

  @PluginMethod
  public void disconnect(PluginCall call) {
    cleanUp();
    emitState("disconnected", null, null);
    call.resolve();
  }

  private void cleanUp() {
    running = false;
    try { if (iface != null && connection != null) connection.releaseInterface(iface); } catch (Exception ignored) {}
    try { if (connection != null) connection.close(); } catch (Exception ignored) {}
    iface = null;
    connection = null;
    inEp = null;
    outEp = null;
  }

  private void emitState(String state, String host, Integer port) {
    JSObject obj = new JSObject();
    obj.put("state", state);
    if (host != null) obj.put("host", host);
    if (port != null) obj.put("port", port);
    notifyListeners("state", obj);
  }
}
