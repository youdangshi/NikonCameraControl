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
import android.hardware.usb.UsbRequest;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * 手机 Type-C / OTG 原生 USB Host / PTP 插件。
 *
 * 参考 CameraSyncPro 的 USB 通道处理方式：
 *   - 使用 UsbManager 枚举设备
 *   - Android 12+ 使用 MUTABLE PendingIntent 申请权限
 *   - Android 13+ 注册动态广播时显式指定 RECEIVER_EXPORTED
 *   - 找到 Bulk in/out 端点后用 UsbRequest.queue()/requestWait() 收发
 *     （部分小米/红米机型用 bulkTransfer 读写相机 PTP 端点会直接返回 -1，
 *      改用 UsbRequest 异步队列后命令通道才稳定）
 *   - 提供设备列表与连接状态事件，方便 App 显示真实诊断
 *
 * JS API：
 *   listDevices()      列出当前所有 USB 设备
 *   connect()          连接 Nikon VID=0x04B0
 *   request({data,dataOut,timeoutMs,transactionId})  一次完成写命令 + 读响应
 *   resetUsb()         释放并重新占用接口，用于清掉相机侧陈旧 PTP 会话
 *   write({ data })    发送 base64 字节
 *   disconnect()       断开
 *   事件 data          收到 base64 数据
 *   事件 state          connected / disconnected / error
 *   事件 usb_devices   设备列表变化（插拔）
 */
@CapacitorPlugin(name = "UsbPtp")
public class UsbPtpPlugin extends Plugin {

  private static final String TAG = "NiniUsbPtp";
  private static final int NIKON_VID = 0x04B0;
  private static final int IN_CHUNK_BYTES = 16384;
  private static final String ACTION_USB_PERMISSION = "com.nikon.camera.control.USB_PERMISSION";

  private UsbManager usbManager;
  private UsbDevice device;
  private UsbDeviceConnection connection;
  private UsbInterface iface;
  private UsbEndpoint inEp;
  private UsbEndpoint outEp;
  private UsbRequest inRequest;
  private UsbRequest outRequest;
  private ByteBuffer pendingInBuffer;
  private ByteBuffer pendingOutBuffer;
  private volatile boolean useRequestMode = false;
  private volatile boolean running = false;
  private Thread readerThread;
  private BroadcastReceiver permissionReceiver;
  private BroadcastReceiver deviceReceiver;
  private PendingIntent permissionIntent;
  private final ConcurrentLinkedQueue<byte[]> readQueue = new ConcurrentLinkedQueue<>();
  private final Object ioLock = new Object();
  private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();

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

    if (connection != null && running && device != null) {
      JSObject obj = new JSObject();
      obj.put("connected", true);
      obj.put("vendor", String.format("0x%04X", device.getVendorId()));
      obj.put("product", String.format("0x%04X", device.getProductId()));
      obj.put("device", device.getDeviceName());
      call.resolve(obj);
      return;
    }

    startDeviceMonitoring();
    readQueue.clear();
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
    int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      pendingFlags |= PendingIntent.FLAG_MUTABLE;
    }
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
      openConnection(device);
      JSObject obj = new JSObject();
      obj.put("connected", true);
      obj.put("vendor", String.format("0x%04X", device.getVendorId()));
      obj.put("product", String.format("0x%04X", device.getProductId()));
      obj.put("device", device.getDeviceName());
      obj.put("transferMode", useRequestMode ? "usb-request" : "bulk-transfer");
      call.resolve(obj);
      emitState("connected", null, null);
    } catch (Exception e) {
      Log.e(TAG, "USB connect failed", e);
      cleanUp();
      call.reject(e.getMessage() == null ? ("USB 连接失败：" + safeMessage(e)) : e.getMessage());
    }
  }

  /**
   * 打开设备、占用 PTP 接口、抓 Bulk 端点并建立传输通道。
   * 失败时抛异常，由调用方决定是 reject 还是重试。
   */
  private void openConnection(UsbDevice target) throws Exception {
    releaseConnection();
    if (target == null) throw new IllegalStateException("未检测到 Nikon 相机");

    connection = usbManager.openDevice(target);
    if (connection == null) {
      throw new IllegalStateException("无法打开 USB 设备，请重新插拔线材，并确认相机没有连接电脑/其它设备");
    }

    UsbInterface chosen = selectInterface(target, true);
    if (chosen == null) {
      releaseConnection();
      throw new IllegalStateException("相机没有 USB 接口，请确认 USB 模式为 MTP/PTP");
    }

    boolean claimed = connection.claimInterface(chosen, true);
    if (!claimed) {
      // 部分机型第一次强制占用会失败，退一步用普通占用再试一次。
      claimed = connection.claimInterface(chosen, false);
    }
    if (!claimed) {
      releaseConnection();
      throw new IllegalStateException("无法占用相机 USB 接口，请拔掉其它软件/设备后重试");
    }
    iface = chosen;

    for (int i = 0; i < iface.getEndpointCount(); i++) {
      UsbEndpoint ep = iface.getEndpoint(i);
      if (ep.getDirection() == UsbConstants.USB_DIR_IN && ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK) inEp = ep;
      if (ep.getDirection() == UsbConstants.USB_DIR_OUT && ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK) outEp = ep;
    }
    if (inEp == null || outEp == null) {
      releaseConnection();
      throw new IllegalStateException("相机未提供 Bulk 数据端点，当前可能是 MTP 模式，请切换为 PTP 模式");
    }

    clearEndpointHalt(inEp);
    clearEndpointHalt(outEp);
    readQueue.clear();
    prepareRequests();

    running = true;
    Log.i(TAG, "USB device opened: iface=" + chosen.getId()
        + " in=0x" + Integer.toHexString(inEp.getAddress())
        + " out=0x" + Integer.toHexString(outEp.getAddress())
        + " mode=" + (useRequestMode ? "usb-request" : "bulk-transfer"));
  }

  /**
   * 建立 UsbRequest 通道。小米等机型上 bulkTransfer 对相机端点会直接返回 -1，
   * 因此优先走 UsbRequest.queue()/requestWait()。
   */
  private void prepareRequests() {
    useRequestMode = false;
    closeRequests();
    try {
      UsbRequest in = new UsbRequest();
      UsbRequest out = new UsbRequest();
      if (!in.initialize(connection, inEp) || !out.initialize(connection, outEp)) {
        try { in.close(); } catch (Exception ignored) {}
        try { out.close(); } catch (Exception ignored) {}
        Log.w(TAG, "UsbRequest initialize 失败，回退 bulkTransfer");
        return;
      }
      inRequest = in;
      outRequest = out;
      useRequestMode = true;
    } catch (Exception e) {
      Log.w(TAG, "UsbRequest 初始化异常，回退 bulkTransfer", e);
      closeRequests();
      useRequestMode = false;
    }
  }

  private void closeRequests() {
    if (inRequest != null) {
      try { inRequest.close(); } catch (Exception ignored) {}
      inRequest = null;
    }
    if (outRequest != null) {
      try { outRequest.close(); } catch (Exception ignored) {}
      outRequest = null;
    }
  }

  /**
   * 完整释放并重新占用相机接口，用于清掉相机侧残留的 PTP 会话。
   */
  @PluginMethod
  public void resetUsb(PluginCall call) {
    if (usbManager == null) usbManager = getUsbManager();
    final UsbDevice target = device;
    ioExecutor.execute(() -> {
      synchronized (ioLock) {
        try {
          if (usbManager == null) {
            call.reject("这台手机不支持 USB Host / OTG");
            return;
          }
          if (target != null && !usbManager.hasPermission(target)) {
            call.reject("USB 权限已失效，请重新插拔相机数据线");
            return;
          }
          Log.i(TAG, "resetUsb: 释放接口并重新建立 PTP 通道");
          openConnection(target);
          JSObject obj = new JSObject();
          obj.put("connected", true);
          obj.put("transferMode", useRequestMode ? "usb-request" : "bulk-transfer");
          call.resolve(obj);
        } catch (Exception e) {
          Log.e(TAG, "resetUsb failed", e);
          releaseConnection();
          call.reject("USB 重置失败：" + safeMessage(e));
        }
      }
    });
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
            readQueue.add(chunk);
          } else if (n == 0) {
            continue;
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
  public void read(PluginCall call) {
    StringBuilder sb = new StringBuilder();
    byte[] chunk;
    while ((chunk = readQueue.poll()) != null) {
      sb.append(Base64.encodeToString(chunk, Base64.NO_WRAP));
    }
    JSObject result = new JSObject();
    result.put("data", sb.toString());
    call.resolve(result);
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
      int offset = 0;
      while (offset < bytes.length) {
        int written = connection.bulkTransfer(outEp, bytes, offset, bytes.length - offset, 3000);
        if (written <= 0) {
          call.reject("USB 写入失败，请重新插拔线材");
          return;
        }
        offset += written;
      }
      call.resolve(new JSObject().put("written", bytes.length));
    } catch (Exception e) {
      call.reject("USB 写入失败：" + safeMessage(e));
    }
  }

  /**
   * Serialize one complete USB PTP transaction in the native layer.
   * A single executor performs write + read, so Android never sees overlapping
   * bulk transfers on the same camera interface.
   */
  @PluginMethod
  public void request(PluginCall call) {
    String data = call.getString("data");
    String dataOut = call.getString("dataOut");
    Integer timeoutValue = call.getInt("timeoutMs", 8000);
    Integer expectedTxValue = call.getInt("transactionId", 0);
    final int timeoutMs = timeoutValue == null ? 8000 : Math.max(500, timeoutValue);
    final int expectedTx = expectedTxValue == null ? 0 : expectedTxValue;

    if (data == null || data.length() == 0 || connection == null || inEp == null || outEp == null || !running) {
      call.reject("USB 未连接");
      return;
    }

    ioExecutor.execute(() -> {
      try {
        byte[] command = Base64.decode(data, Base64.NO_WRAP);
        byte[] extra = dataOut == null || dataOut.length() == 0
            ? null
            : Base64.decode(dataOut, Base64.NO_WRAP);
        ByteArrayOutputStream responseBytes = new ByteArrayOutputStream();
        boolean complete = false;

        synchronized (ioLock) {
          if (connection == null || inEp == null || outEp == null || !running) {
            call.reject("USB 未连接");
            return;
          }

          Log.d(TAG, "USB request start expectedTx=" + expectedTx
              + " commandBytes=" + command.length + " dataOutBytes=" + (extra == null ? 0 : extra.length));
          if (useRequestMode && inRequest != null && outRequest != null) {
            complete = requestModeExchange(command, extra, timeoutMs, expectedTx, responseBytes);
          } else {
            writeAll(command, timeoutMs);
            if (extra != null && extra.length > 0) writeAll(extra, timeoutMs);
            complete = legacyExchange(timeoutMs, expectedTx, responseBytes);
          }
        }

        JSObject result = new JSObject();
        result.put("data", Base64.encodeToString(responseBytes.toByteArray(), Base64.NO_WRAP));
        result.put("complete", complete);
        Log.d(TAG, "USB request done complete=" + complete + " responseBytes=" + responseBytes.size());
        call.resolve(result);
      } catch (Exception e) {
        Log.e(TAG, "USB request failed", e);
        call.reject("USB PTP 传输失败：" + safeMessage(e));
      }
    });
  }

  /**
   * 写一块数据。UsbRequest 模式下必须等这条 OUT 请求真正完成再继续，
   * 否则在同一端点上同时挂着 IN/OUT 请求时，这台机型读回来的数据会全是 0。
   */
  private void writeAll(byte[] bytes, int timeoutMs) throws Exception {
    int offset = 0;
    while (offset < bytes.length) {
      int length = bytes.length - offset;
      if (!useRequestMode || outRequest == null) {
        int written = connection.bulkTransfer(outEp, bytes, offset, length, Math.max(500, timeoutMs));
        if (written <= 0) throw new IllegalStateException("USB 写入端点在重试后仍不可用，请重新插拔相机数据线");
        offset += written;
        continue;
      }

      ByteBuffer buffer = ByteBuffer.allocateDirect(length);
      buffer.put(bytes, offset, length);
      buffer.flip();
      // 保持强引用：native 层直接用这个直接缓冲的内存地址，被回收就会写出垃圾。
      pendingOutBuffer = buffer;
      boolean queued = false;
      try {
        queued = outRequest.queue(buffer, length);
      } catch (Exception e) {
        Log.w(TAG, "UsbRequest 写排队异常：" + e);
      }
      if (!queued) {
        pendingOutBuffer = null;
        int written = connection.bulkTransfer(outEp, bytes, offset, length, Math.max(500, timeoutMs));
        if (written <= 0) throw new IllegalStateException("USB 写入端点在重试后仍不可用，请重新插拔相机数据线");
        offset += written;
        continue;
      }

      UsbRequest done = awaitOutCompletion(Math.max(500, timeoutMs));
      pendingOutBuffer = null;
      if (done == null) {
        throw new IllegalStateException("USB 命令发送超时，请重新插拔相机数据线后重试");
      }
      Log.d(TAG, "USB 命令已发出 " + length + " 字节");
      offset += length;
    }
  }

  /** 只等 OUT 请求完成，忽略其它端点的完成事件（此刻 IN 尚未挂上）。 */
  private UsbRequest awaitOutCompletion(int timeoutMs) {
    long deadline = System.currentTimeMillis() + Math.max(1, timeoutMs);
    while (true) {
      long left = deadline - System.currentTimeMillis();
      if (left <= 0) return null;
      UsbRequest done;
      try {
        done = connection.requestWait(left);
      } catch (Exception e) {
        Log.w(TAG, "requestWait(写) 失败：" + e);
        return null;
      }
      if (done == null) return null;
      if (done == outRequest) return done;
      Log.d(TAG, "忽略非写入端点完成事件");
    }
  }

  /**
   * 准备好一个挂起的 IN 请求。必须在写命令之前调用：
   * 相机收到命令后会立刻回包，主机侧没有待完成的 IN 传输时部分机型会直接丢包。
   */
  private void armInRequest() throws Exception {
    if (pendingInBuffer != null) return;
    ByteBuffer buffer = ByteBuffer.allocateDirect(IN_CHUNK_BYTES);
    if (inRequest == null || !inRequest.queue(buffer, IN_CHUNK_BYTES)) {
      throw new IllegalStateException("USB 读取请求排队失败，请重新插拔相机数据线");
    }
    pendingInBuffer = buffer;
  }

  /** 把已完成的 IN 请求里的数据取出来，返回本次读到的字节数。 */
  private int drainPendingIn(ByteArrayOutputStream sink) {
    ByteBuffer buffer = pendingInBuffer;
    pendingInBuffer = null;
    if (buffer == null) return 0;
    int size = buffer.position();
    if (size <= 0) return 0;
    byte[] chunk = new byte[size];
    buffer.flip();
    buffer.get(chunk);
    sink.write(chunk, 0, chunk.length);
    Log.d(TAG, "USB 收到 " + size + " 字节，开头=" + toHex(chunk, 24));
    return size;
  }

  /** 丢掉已经挂在队列上、但属于上一次会话的数据。 */
  private int drainPendingDiscard() {
    ByteBuffer buffer = pendingInBuffer;
    pendingInBuffer = null;
    if (buffer == null) return 0;
    int size = buffer.position();
    if (size <= 0) return 0;
    byte[] chunk = new byte[size];
    buffer.flip();
    buffer.get(chunk);
    Log.d(TAG, "丢弃陈旧 USB 数据 " + size + " 字节，开头=" + toHex(chunk, 24));
    return size;
  }

  private static String toHex(byte[] bytes, int limit) {
    StringBuilder sb = new StringBuilder();
    int count = Math.min(bytes.length, limit);
    for (int i = 0; i < count; i++) {
      if (i > 0) sb.append(' ');
      sb.append(String.format("%02X", bytes[i]));
    }
    if (bytes.length > count) sb.append(" ...");
    return sb.toString();
  }

  /**
   * 相机端会保留上一次主机遗留在 IN 端点里的响应，直接开会话会被这些陈旧包顶掉。
   * 这里在正式握手前把它们全部读走丢掉。
   */
  @PluginMethod
  public void drainInput(PluginCall call) {
    Integer idleValue = call.getInt("idleMs", 250);
    final int idleMs = idleValue == null ? 250 : Math.max(50, idleValue);
    final int hardLimitMs = 4000;
    if (connection == null || !running) {
      call.resolve(new JSObject().put("drained", 0));
      return;
    }
    ioExecutor.execute(() -> {
      int drained = 0;
      synchronized (ioLock) {
        long hardDeadline = System.currentTimeMillis() + hardLimitMs;
        try {
          if (useRequestMode && inRequest != null) {
            while (System.currentTimeMillis() < hardDeadline) {
              if (pendingInBuffer == null) armInRequest();
              UsbRequest done;
              try {
                done = connection.requestWait(idleMs);
              } catch (Exception e) {
                break;
              }
              if (done == null) break;
              if (done == inRequest) {
                int size = drainPendingDiscard();
                if (size <= 0) break;
                drained += size;
              }
            }
          }
        } catch (Exception e) {
          Log.w(TAG, "drainInput 失败：" + e);
        }
        cancelPendingIn();
      }
      Log.i(TAG, "drainInput 完成，丢弃 " + drained + " 字节");
      JSObject res = new JSObject();
      res.put("drained", drained);
      call.resolve(res);
    });
  }

  /**
   * 判断缓冲区里是否已经出现本次事务的 Response 容器。
   * 容器可能和前面的 Data/Event 容器一起到一个包里，所以按长度逐个切。
   */
  private static boolean hasResponseFor(byte[] bytes, int expectedTx) {
    int offset = 0;
    while (offset + 12 <= bytes.length) {
      int length = readU32LE(bytes, offset);
      if (length < 12 || offset + length > bytes.length) return false;
      int type = readU16LE(bytes, offset + 4);
      int tx = readU32LE(bytes, offset + 8);
      if (type == 3 && (expectedTx == 0 || tx == expectedTx)) return true;
      offset += length;
    }
    return false;
  }

  /**
   * UsbRequest 模式下的一次完整事务：先挂 IN，再写命令，然后等响应。
   * 写和读共用同一条 requestWait() 队列，完成的请求在这里统一分派。
   */
  private boolean requestModeExchange(byte[] command, byte[] extra, int timeoutMs, int expectedTx,
                                      ByteArrayOutputStream responseBytes) throws Exception {
    long deadline = System.currentTimeMillis() + Math.max(500, timeoutMs);
    // 先把命令完整发出去并确认发送完成，再挂 IN 请求等响应。
    writeAll(command, timeoutMs);
    if (extra != null && extra.length > 0) writeAll(extra, timeoutMs);
    armInRequest();

    boolean complete = false;
    while (!complete) {
      long left = deadline - System.currentTimeMillis();
      if (left <= 0) {
        Log.w(TAG, "USB 请求超时（" + timeoutMs + "ms）");
        cancelPendingIn();
        break;
      }
      if (pendingInBuffer == null) armInRequest();

      UsbRequest done;
      try {
        done = connection.requestWait(left);
      } catch (Exception e) {
        Log.w(TAG, "requestWait 失败：" + e);
        cancelPendingIn();
        break;
      }
      if (done == null) {
        Log.w(TAG, "requestWait 超时");
        cancelPendingIn();
        break;
      }
      if (done == inRequest) {
        drainPendingIn(responseBytes);
        complete = hasResponseFor(responseBytes.toByteArray(), expectedTx);
      } else {
        Log.d(TAG, "忽略非读取端点完成事件");
      }
    }
    return complete;
  }

  private void cancelPendingIn() {
    if (pendingInBuffer == null) return;
    pendingInBuffer = null;
    try { if (inRequest != null) inRequest.cancel(); } catch (Exception ignored) {}
  }

  /** 非 UsbRequest 模式（回退 bulkTransfer）下的收发循环。 */
  private boolean legacyExchange(int timeoutMs, int expectedTx, ByteArrayOutputStream responseBytes) {
    long deadline = System.currentTimeMillis() + timeoutMs;
    while (System.currentTimeMillis() < deadline) {
      int remaining = (int) Math.max(1L, deadline - System.currentTimeMillis());
      byte[] header = readExact(12, remaining);
      if (header == null) break;

      int length = readU32LE(header, 0);
      if (length < 12 || length > 64 * 1024 * 1024) {
        throw new IllegalStateException("非法 USB PTP 容器长度: " + length);
      }
      responseBytes.write(header, 0, header.length);

      if (length > 12) {
        remaining = (int) Math.max(1L, deadline - System.currentTimeMillis());
        byte[] payload = readExact(length - 12, remaining);
        if (payload == null) break;
        responseBytes.write(payload, 0, payload.length);
      }

      int type = readU16LE(header, 4);
      int responseTx = readU32LE(header, 8);
      Log.d(TAG, "USB container type=" + type + " tx=" + responseTx + " bytes=" + length);
      if (type == 3 && (expectedTx == 0 || responseTx == expectedTx)) return true;
    }
    return false;
  }

  /** 非 UsbRequest 模式下的同步读取。 */
  private byte[] readExact(int total, int timeoutMs) {
    if (total <= 0) return new byte[0];
    byte[] out = new byte[total];
    int offset = 0;
    long deadline = System.currentTimeMillis() + Math.max(1, timeoutMs);
    while (offset < total) {
      long left = deadline - System.currentTimeMillis();
      if (left <= 0) {
        Log.w(TAG, "USB read timeout at " + offset + "/" + total);
        return null;
      }
      int wanted = Math.min(16384, total - offset);
      byte[] packet = new byte[wanted];
      int read = connection.bulkTransfer(inEp, packet, 0, wanted, (int) Math.min(Integer.MAX_VALUE, left));
      if (read <= 0) {
        Log.w(TAG, "USB bulk read 返回 " + read + " at " + offset + "/" + total);
        return null;
      }
      System.arraycopy(packet, 0, out, offset, read);
      offset += read;
    }
    return out;
  }

  private static int readU16LE(byte[] bytes, int offset) {
    return (bytes[offset] & 0xff) | ((bytes[offset + 1] & 0xff) << 8);
  }

  private static int readU32LE(byte[] bytes, int offset) {
    return (bytes[offset] & 0xff)
        | ((bytes[offset + 1] & 0xff) << 8)
        | ((bytes[offset + 2] & 0xff) << 16)
        | ((bytes[offset + 3] & 0xff) << 24);
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
    releaseConnection();
  }

  /** 释放接口与连接，保留 device 引用以便重新打开。 */
  private void releaseConnection() {
    running = false;
    closeRequests();
    pendingInBuffer = null;
    pendingOutBuffer = null;
    useRequestMode = false;
    try {
      if (iface != null && connection != null) connection.releaseInterface(iface);
    } catch (Exception ignored) {}
    try {
      if (connection != null) connection.close();
    } catch (Exception ignored) {}
    iface = null;
    connection = null;
    readQueue.clear();
    inEp = null;
    outEp = null;
  }

  @Override
  protected void handleOnDestroy() {
    stopDeviceMonitoring();
    cleanUp();
    ioExecutor.shutdownNow();
    super.handleOnDestroy();
  }

  private UsbInterface selectInterface(UsbDevice target, boolean requireBulkPair) {
    UsbInterface fallback = null;
    for (int i = 0; i < target.getInterfaceCount(); i++) {
      UsbInterface candidate = target.getInterface(i);
      if (candidate.getInterfaceClass() == UsbConstants.USB_CLASS_STILL_IMAGE
          && candidate.getInterfaceSubclass() == 1
          && candidate.getInterfaceProtocol() == 1
          && (!requireBulkPair || hasBulkPair(candidate))) {
        return candidate;
      }
      if (fallback == null
          && candidate.getInterfaceClass() == UsbConstants.USB_CLASS_VENDOR_SPEC
          && (!requireBulkPair || hasBulkPair(candidate))) {
        fallback = candidate;
      }
      if (!requireBulkPair && fallback == null) fallback = candidate;
    }
    if (fallback != null) return fallback;
    return target.getInterfaceCount() > 0 ? target.getInterface(0) : null;
  }

  private boolean hasBulkPair(UsbInterface candidate) {
    boolean hasIn = false;
    boolean hasOut = false;
    for (int i = 0; i < candidate.getEndpointCount(); i++) {
      UsbEndpoint endpoint = candidate.getEndpoint(i);
      if (endpoint.getType() != UsbConstants.USB_ENDPOINT_XFER_BULK) continue;
      if (endpoint.getDirection() == UsbConstants.USB_DIR_IN) hasIn = true;
      if (endpoint.getDirection() == UsbConstants.USB_DIR_OUT) hasOut = true;
    }
    return hasIn && hasOut;
  }

  private void clearEndpointHalt(UsbEndpoint endpoint) {
    if (connection == null || endpoint == null) return;
    try {
      int result = connection.controlTransfer(
          0x02, // Host -> device, endpoint recipient
          0x01, // CLEAR_FEATURE
          0x0000,
          endpoint.getAddress(),
          null,
          0,
          1000
      );
      Log.d(TAG, "clearEndpointHalt address=0x" + Integer.toHexString(endpoint.getAddress()) + " result=" + result);
    } catch (Exception e) {
      Log.w(TAG, "clearEndpointHalt failed address=0x" + Integer.toHexString(endpoint.getAddress()), e);
    }
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
