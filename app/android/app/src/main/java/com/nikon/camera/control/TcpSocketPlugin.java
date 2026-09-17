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
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 自研 Capacitor TCP Socket 插件。
 *
 * PTP/IP 需要两条独立 TCP 连接：command 负责命令/响应，event 负责异步事件。
 * channel 参数用于区分两条连接，未传时默认 command，保持兼容。
 *
 * API：
 *   connect({ host, port, channel })
 *   write({ data, channel })
 *   disconnect({ channel })        // 不传 channel 时关闭全部
 *   addListener('data', cb)        // 事件包含 data / len / channel
 *   addListener('state', cb)       // 事件包含 state / channel / host / port
 */
@CapacitorPlugin(name = "TcpSocket")
public class TcpSocketPlugin extends Plugin {

  private static final String DEFAULT_CHANNEL = "command";

  private static final class Channel {
    final String name;
    volatile Socket socket;
    volatile InputStream input;
    volatile OutputStream output;
    volatile Thread readerThread;
    volatile boolean running;
    volatile boolean closed;

    Channel(String name) {
      this.name = name;
    }
  }

  private final Map<String, Channel> channels = new ConcurrentHashMap<>();

  @PluginMethod
  public void connect(PluginCall call) {
    String host = call.getString("host");
    Integer port = call.getInt("port");
    String channelName = normalizeChannel(call.getString("channel"));
    if (host == null || host.trim().isEmpty() || port == null) {
      call.reject("host 和 port 必填");
      return;
    }

    closeChannel(channelName);
    Channel channel = new Channel(channelName);
    channels.put(channelName, channel);

    new Thread(() -> {
      try {
        Socket socket = new Socket();
        socket.connect(new InetSocketAddress(host, port), 8000);
        socket.setTcpNoDelay(true);
        socket.setKeepAlive(true);

        if (channel.closed) {
          closeSocket(socket);
          return;
        }

        channel.socket = socket;
        channel.input = socket.getInputStream();
        channel.output = socket.getOutputStream();
        channel.running = true;

        emitState(channelName, "connected", host, port);
        call.resolve(new JSObject().put("connected", true).put("channel", channelName));
        startReader(channel);
      } catch (IOException e) {
        channel.running = false;
        channels.remove(channelName, channel);
        emitState(channelName, "error", host, port);
        call.reject(e.getMessage() != null ? e.getMessage() : "连接失败");
      }
    }, "TcpSocket-" + channelName).start();
  }

  @PluginMethod
  public void write(PluginCall call) {
    String data = call.getString("data");
    String channelName = normalizeChannel(call.getString("channel"));
    Channel channel = channels.get(channelName);
    if (data == null) {
      call.reject("data 必填（base64）");
      return;
    }
    if (channel == null || channel.output == null) {
      call.reject(channelName + " 通道未连接");
      return;
    }

    try {
      byte[] bytes = Base64.decode(data, Base64.NO_WRAP);
      synchronized (channel) {
        channel.output.write(bytes);
        channel.output.flush();
      }
      call.resolve();
    } catch (IOException e) {
      call.reject("发送失败: " + e.getMessage());
    }
  }

  @PluginMethod
  public void disconnect(PluginCall call) {
    String requested = call.getString("channel");
    if (requested == null || requested.trim().isEmpty()) {
      for (String name : channels.keySet()) closeChannel(name);
    } else {
      closeChannel(normalizeChannel(requested));
    }
    call.resolve();
  }

  private void startReader(Channel channel) {
    channel.readerThread = new Thread(() -> {
      byte[] buffer = new byte[8192];
      try {
        while (channel.running && channel.input != null) {
          int count = channel.input.read(buffer);
          if (count < 0) break;
          if (count == 0) continue;

          byte[] chunk = new byte[count];
          System.arraycopy(buffer, 0, chunk, 0, count);
          final String encoded = Base64.encodeToString(chunk, Base64.NO_WRAP);
          runOnUiThread(() -> {
            JSObject event = new JSObject();
            event.put("data", encoded);
            event.put("len", chunk.length);
            event.put("channel", channel.name);
            notifyListeners("data", event);
          });
        }
      } catch (IOException ignored) {
        // Socket closed locally or by the camera.
      } finally {
        channel.running = false;
        if (!channel.closed) emitState(channel.name, "disconnected", null, null);
      }
    }, "TcpReader-" + channel.name);
    channel.readerThread.setDaemon(true);
    channel.readerThread.start();
  }

  private void closeChannel(String name) {
    Channel channel = channels.remove(name);
    if (channel == null) return;
    channel.closed = true;
    channel.running = false;
    closeSocket(channel.socket);
    channel.input = null;
    channel.output = null;
    channel.socket = null;
    emitState(name, "disconnected", null, null);
  }

  private void closeSocket(Socket socket) {
    if (socket == null) return;
    try { socket.close(); } catch (IOException ignored) {}
  }

  private void emitState(String channelName, String state, String host, Integer port) {
    JSObject event = new JSObject();
    event.put("state", state);
    event.put("channel", channelName);
    if (host != null) event.put("host", host);
    if (port != null) event.put("port", port);
    runOnUiThread(() -> notifyListeners("state", event));
  }

  private void runOnUiThread(Runnable action) {
    if (getActivity() != null) {
      getActivity().runOnUiThread(action);
    } else {
      action.run();
    }
  }

  private static String normalizeChannel(String value) {
    return value == null || value.trim().isEmpty() ? DEFAULT_CHANNEL : value.trim();
  }
}
