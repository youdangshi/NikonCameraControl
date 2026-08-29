package com.nikon.camera.control;

import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/**
 * 自研 Capacitor TCP Socket 插件。
 *
 * 作用：让 WebView 里的 JS 能建立原生 TCP 连接，直连相机的 PTP/IP 端口（192.168.1.1:15740），
 * 这是「手机直连相机」无线遥控的唯一可行路径（浏览器无 raw socket）。
 *
 * 提供 API：
 *   - connect({ host, port })         建立连接，8 秒超时
 *   - write({ data })                发送字节（data 为 base64 字符串）
 *   - disconnect()                   关闭连接
 *   - addListener('data', cb)        收到字节（base64）事件
 *   - addListener('state', cb)       连接/断开/错误事件
 */
@CapacitorPlugin(name = "TcpSocket")
public class TcpSocketPlugin extends Plugin {

  private Socket socket;
  private InputStream input;
  private OutputStream output;
  private Thread readerThread;
  private volatile boolean running = false;

  @PluginMethod
  public void connect(PluginCall call) {
    String host = call.getString("host");
    Integer port = call.getInt("port");
    if (host == null || host.trim().isEmpty() || port == null) {
      call.reject("host 和 port 必填");
      return;
    }

    // 先关掉旧连接
    closeQuietly();

    running = true;
    new Thread(() -> {
      try {
        Socket s = new Socket();
        s.connect(new InetSocketAddress(host, port), 8000);
        s.setTcpNoDelay(true);
        socket = s;
        input = s.getInputStream();
        output = s.getOutputStream();
        emitState("connected", host, port);
        call.resolve(new JSObject().put("connected", true));
        startReader();
      } catch (IOException e) {
        running = false;
        emitState("error", host, port);
        call.reject(e.getMessage() != null ? e.getMessage() : "连接失败");
      }
    }).start();
  }

  @PluginMethod
  public void write(PluginCall call) {
    String data = call.getString("data");
    if (data == null) {
      call.reject("data 必填（base64）");
      return;
    }
    OutputStream out = output;
    if (out == null) {
      call.reject("连接未建立");
      return;
    }
    try {
      byte[] bytes = Base64.decode(data, Base64.NO_WRAP);
      out.write(bytes);
      out.flush();
      call.resolve();
    } catch (IOException e) {
      call.reject("发送失败: " + e.getMessage());
    }
  }

  @PluginMethod
  public void disconnect(PluginCall call) {
    closeQuietly();
    emitState("disconnected", null, null);
    call.resolve();
  }

  private void startReader() {
    readerThread = new Thread(() -> {
      byte[] buf = new byte[8192];
      try {
        while (running) {
          int n = input.read(buf);
          if (n < 0) break;
          if (n == 0) continue;
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
      } catch (IOException ignored) {
        // 连接被关闭或出错
      } finally {
        running = false;
      }
    });
    readerThread.setDaemon(true);
    readerThread.start();
  }

  private void emitState(String state, String host, Integer port) {
    JSObject obj = new JSObject();
    obj.put("state", state);
    if (host != null) obj.put("host", host);
    if (port != null) obj.put("port", port);
    notifyListeners("state", obj);
  }

  private void closeQuietly() {
    running = false;
    try {
      if (input != null) input.close();
    } catch (IOException ignored) {}
    try {
      if (output != null) output.close();
    } catch (IOException ignored) {}
    try {
      if (socket != null) socket.close();
    } catch (IOException ignored) {}
    input = null;
    output = null;
    socket = null;
  }
}
